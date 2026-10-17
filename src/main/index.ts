import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineMainPlugin } from "@dsz-examaware/plugin-sdk";
import type { Disposable, MainPluginContext, PlayerSession } from "@dsz-examaware/plugin-sdk";

const BUILD = "20261017_v2_14";

/**
 * 服务地址命名空间由宿主按插件名拼接。
 * 注意：插件名不能含 "/"，否则宿主用它拼出的 `/settings/<插件名>:<页面id>` 会多一段路径，
 * 与宿主路由 `/settings/:page?` 不匹配，设置页会整块空白。故此处不带 npm 作用域前缀。
 */
const ROUTE_PREFIX = "/api/v1/examaware-auto-player";

export interface AutoPlayerSettings {
  enabled: boolean;
  advanceMinutes: number;
  exitDelaySeconds: number;
  /** 是否把 EA 当前的 HTTP API 地址写到发现文件，供 ClassIsland 端自动对齐端口。 */
  publishEndpoint: boolean;
  /** 可选：把端口写回宿主配置（下次启动生效；宿主可能自己再改，默认关闭）。 */
  fixedPortEnabled: boolean;
  /** 可选：写回宿主配置的端口。 */
  fixedPort: number;
}

const DEFAULT_SETTINGS: AutoPlayerSettings = {
  enabled: true,
  advanceMinutes: 5,
  exitDelaySeconds: 30,
  publishEndpoint: true,
  fixedPortEnabled: false,
  fixedPort: 31235
};

/**
 * 端口发现文件：EA 每次启动都会把当前 HTTP API 地址写在这里，
 * ClassIsland 端推送前读一次，就不用两边手工对齐端口了。
 */
function endpointFilePath(): string {
  const base = process.env.APPDATA ?? process.env.HOME ?? ".";
  return join(base, "@dsz-examaware", "desktop", "auto-player-endpoint.json");
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Number.isFinite(value as number)
    ? Math.max(min, Math.min(max, Math.trunc(value as number)))
    : fallback;
}

function normalizeSettings(value: Partial<AutoPlayerSettings> = {}): AutoPlayerSettings {
  return {
    enabled: value.enabled !== false,
    advanceMinutes: clampInt(value.advanceMinutes, 0, 60, DEFAULT_SETTINGS.advanceMinutes),
    exitDelaySeconds: clampInt(value.exitDelaySeconds, 0, 300, DEFAULT_SETTINGS.exitDelaySeconds),
    publishEndpoint: value.publishEndpoint !== false,
    fixedPortEnabled: value.fixedPortEnabled === true,
    fixedPort: clampInt(value.fixedPort, 1024, 65535, DEFAULT_SETTINGS.fixedPort)
  };
}

/** 从 http://127.0.0.1:31235 里取出端口；取不到返回 0。 */
function parsePort(url: string): number {
  try {
    return Number(new URL(url).port) || 0;
  } catch {
    return 0;
  }
}

type AutoPlayerState = "idle" | "scheduled" | "opening" | "active" | "error";

interface CurrentTask {
  key: string;
  ea2Path: string;
  examName: string;
  examCount: number;
  subject: string;
  start: number;
  end: number;
  openAt: number;
  closeAt: number;
}

class AutoPlayerService {
  private settings: AutoPlayerSettings;
  private state: AutoPlayerState = "idle";
  private nextOpenAt: number | null = null;
  private currentTask: CurrentTask | null = null;
  private currentSession: PlayerSession | null = null;
  private pendingEa2Path: string | null = null;
  private lastEa2Path: string | null = null;
  private lastSignalKey: string | null = null;
  private lastSignalAt = 0;
  private lastSignalTime: string | null = null;
  private lastSignalResult: string | null = null;
  private lastError: string | null = null;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private routeDisposables: Disposable[] = [];
  private publishTimer: ReturnType<typeof setInterval> | undefined;
  private publishedPort = 0;

  constructor(private readonly ctx: MainPluginContext<AutoPlayerSettings>) {
    this.settings = normalizeSettings(ctx.initialSettings);
  }

  async init(): Promise<void> {
    const { ctx } = this;

    ctx.scope.add(
      ctx.api.settings.onChanged((settings) => {
        this.settings = normalizeSettings(settings);
        ctx.logger.info("settings changed", this.settings);
        void this.publishEndpoint();
        void this.syncFixedPortConfig();
      })
    );

    ctx.scope.add(
      ctx.api.player.onSessionChanged(({ session }) => {
        if (!this.currentSession || session.id !== this.currentSession.id) return;
        ctx.logger.info("player session changed", { id: session.id, state: session.state });
        if (session.state === "failed") {
          this.state = "error";
        } else if (session.state === "ready") {
          this.state = "active";
        } else if (session.state === "closed") {
          void this.onSessionClosed();
        }
      })
    );

    this.registerRoutes();
    // 上报当前地址供 ClassIsland 自动发现；端口若被宿主顺延，下一轮上报会自动跟上
    void this.publishEndpoint();
    void this.syncFixedPortConfig();
    this.publishTimer = setInterval(() => {
      void this.publishEndpoint();
    }, 5000);
    ctx.scope.defer(() => this.dispose());

    ctx.logger.info(`auto-player API v2 ready build=${BUILD}`, {
      baseUrl: await ctx.api.http.baseUrl(),
      routes: [`${ROUTE_PREFIX}/ping`, `${ROUTE_PREFIX}/signal`, `${ROUTE_PREFIX}/stop`],
      settings: this.settings
    });
  }

  private registerRoutes(): void {
    const { ctx } = this;

    // HTTP 服务重启后需要重新挂载路由，所以先释放上一轮注册的句柄
    for (const handle of this.routeDisposables) {
      try {
        void handle.dispose();
      } catch {
        /* ignore */
      }
    }
    this.routeDisposables = [];
    const add = (handle: Disposable): void => {
      this.routeDisposables.push(handle);
    };

    add(
      ctx.api.http.registerRoute({
        method: "GET",
        path: "/ping",
        summary: "Auto player status",
        requireAuth: false,
        handler: async () => ({ status: 200, body: await this.statusSnapshot() })
      })
    );

    add(
      ctx.api.http.registerRoute({
        method: "POST",
        path: "/signal",
        summary: "Schedule an ExamAware file",
        requireAuth: false,
        handler: async ({ body }) => {
          const ea2Path = (body as { ea2Path?: unknown } | undefined)?.ea2Path;
          const futureOnly = (body as { futureOnly?: unknown } | undefined)?.futureOnly === true;
          if (typeof ea2Path !== "string" || !ea2Path.trim()) {
            return { status: 400, body: { error: "missing ea2Path" } };
          }
          this.lastSignalTime = new Date().toISOString();
          this.lastEa2Path = ea2Path;
          if (!this.settings.enabled) {
            this.lastSignalResult = "disabled";
            ctx.logger.info("signal ignored (auto play disabled)", { ea2Path });
            return { status: 200, body: { ok: true, enabled: false } };
          }
          try {
            const result = await this.scheduleFromFile(ea2Path, { futureOnly });
            this.lastSignalResult = result.scheduled ? "scheduled" : "no-exam";
            this.lastError = null;
            return { status: 200, body: { ok: true, ...result } };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.lastSignalResult = "failed";
            this.lastError = message;
            ctx.logger.error("signal failed", { ea2Path, message });
            return { status: 422, body: { error: message } };
          }
        }
      })
    );

    // 手动停止：供设置页在误触发时立刻结束放映。
    add(
      ctx.api.http.registerRoute({
        method: "POST",
        path: "/stop",
        summary: "Stop the current session and clear the schedule",
        requireAuth: false,
        handler: async () => {
          this.pendingEa2Path = null;
          await this.stopCurrentSession();
          this.clearSchedule();
          ctx.logger.info("manual stop requested");
          return { status: 200, body: { ok: true, state: this.state } };
        }
      })
    );
  }

  private async scheduleFromFile(
    ea2Path: string,
    options: { futureOnly?: boolean } = {}
  ): Promise<{ scheduled: boolean; state: AutoPlayerState; deferred?: boolean; deduplicated?: boolean; openAt?: number; closeAt?: number }> {
    const { ctx } = this;
    const now = await ctx.api.time.now();

    if ((this.state === "opening" || this.state === "active") && this.currentTask && now < this.currentTask.closeAt) {
      this.pendingEa2Path = ea2Path;
      ctx.logger.info("signal deferred until current session closes", {
        key: this.currentTask.key,
        pendingEa2Path: ea2Path
      });
      return { scheduled: true, deferred: true, state: this.state };
    }

    const raw = await ctx.api.files.readText(ea2Path);
    let validation;
    try {
      validation = ctx.api.exams.validate(JSON.parse(raw.replace(/^\uFEFF/, "")), { overlap: "warning" });
    } catch {
      throw new Error("invalid ExamAware config JSON");
    }
    if (!validation.valid || !validation.config) {
      const details = validation.errors?.map((item: { message: string }) => item.message).join("; ");
      throw new Error(details || "invalid ExamAware config");
    }

    const advanceMs = this.settings.advanceMinutes * 60_000;
    const exitDelayMs = this.settings.exitDelaySeconds * 1_000;
    // 之前硬编码为 1 分钟，导致「已在考试中但剩余不足 1 分钟」的场次既不算 active 也不算 future，
    // 整场被跳过。改为 0：只要尚未结束就允许恢复。
    const minimumRemainingMs = 0;

    const exams = validation.config.examInfos
      .map((exam: { name: string; start: string; end: string }) => ({
        name: exam.name,
        start: Date.parse(exam.start),
        end: Date.parse(exam.end)
      }))
      .filter((exam: { start: number; end: number }) => Number.isFinite(exam.start) && Number.isFinite(exam.end));

    const active = exams
      .filter((exam: { start: number; end: number }) => !options.futureOnly && exam.start - advanceMs <= now && exam.end - now > minimumRemainingMs)
      .sort((a: { start: number }, b: { start: number }) => a.start - b.start);
    const future = exams
      .filter((exam: { start: number }) => exam.start > now)
      .sort((a: { start: number }, b: { start: number }) => a.start - b.start);

    const target = active[0] ?? future[0];
    if (!target) {
      this.clearSchedule();
      ctx.logger.info("no future or active exam", { ea2Path });
      return { scheduled: false, state: this.state };
    }

    const openAt = target.start - advanceMs;
    const closeAt = target.end + exitDelayMs;
    const key = `${ea2Path}|${target.start}|${target.end}`;

    if (this.currentTask?.key === key || (this.lastSignalKey === key && now - this.lastSignalAt < 5_000)) {
      return { scheduled: true, deduplicated: true, state: this.state, openAt, closeAt };
    }

    this.lastSignalKey = key;
    this.lastSignalAt = now;

    await this.stopCurrentSession();
    this.clearSchedule();
    this.lastEa2Path = ea2Path;
    this.currentTask = {
      key,
      ea2Path,
      examName: validation.config.examName ?? "",
      examCount: validation.config.examInfos.length,
      subject: target.name,
      start: target.start,
      end: target.end,
      openAt,
      closeAt
    };
    this.nextOpenAt = openAt;

    const openIn = openAt - now;
    const closeIn = closeAt - now;

    ctx.logger.info("exam scheduled", {
      key,
      subject: target.name,
      selectionMode: options.futureOnly ? "future-only" : "active-or-future",
      openInMs: openIn,
      closeInMs: closeIn,
      openAt,
      closeAt
    });

    if (openIn > 0) {
      this.state = "scheduled";
      this.addTimer(() => void this.openTask(), openIn);
    } else if (closeIn > 0) {
      void this.openTask();
    } else {
      this.clearSchedule();
      return { scheduled: false, state: this.state };
    }

    if (closeIn > 0) this.addTimer(() => void this.closeTask(), closeIn);

    return { scheduled: true, state: this.state, openAt, closeAt };
  }

  private async openTask(): Promise<void> {
    if (!this.currentTask || this.state === "opening" || this.state === "active") return;
    const { ctx } = this;
    const task = this.currentTask;
    this.state = "opening";
    this.nextOpenAt = null;

    try {
      const raw = await ctx.api.files.readText(task.ea2Path);
      const validation = ctx.api.exams.validate(JSON.parse(raw.replace(/^\uFEFF/, "")), {
        allowEmptyExamInfos: false,
        overlap: "warning"
      });
      if (!validation.valid || !validation.config) {
        const details = validation.errors?.map((item: { message: string }) => item.message).join("; ");
        throw new Error(details || "invalid ExamAware config");
      }

      const session = await ctx.api.player.startFromConfig(validation.config, {
        replaceExisting: true,
        waitForReady: true,
        readyTimeoutMs: 30_000,
        window: { fullscreen: true, kiosk: true, alwaysOnTop: true }
      });
      this.currentSession = session;

      const snapshot = await session.snapshot();
      if (!snapshot || snapshot.state !== "ready") {
        throw new Error(snapshot?.error?.message || `unexpected player state: ${snapshot?.state}`);
      }

      this.state = "active";
      this.lastError = null;
      ctx.logger.info("player ready", {
        sessionId: session.id,
        examName: snapshot.examName,
        examCount: snapshot.examCount,
        windowId: snapshot.windowId,
        key: task.key
      });
    } catch (error) {
      this.state = "error";
      this.lastError = error instanceof Error ? error.message : String(error);
      ctx.logger.error("player start failed", { key: task.key, message: this.lastError });
      try {
        await this.scheduleFromFile(task.ea2Path, { futureOnly: true });
      } catch (rescheduleError) {
        ctx.logger.error("next future exam reschedule failed", {
          ea2Path: task.ea2Path,
          message: rescheduleError instanceof Error ? rescheduleError.message : String(rescheduleError)
        });
      }
    }
  }

  private async closeTask(): Promise<void> {
    if (!this.currentTask) return;
    this.ctx.logger.info("closing player", { key: this.currentTask.key });
    await this.stopCurrentSession();
    await this.finishCurrentTask();
  }

  private async stopCurrentSession(): Promise<void> {
    const session = this.currentSession;
    this.currentSession = null;
    if (!session) return;
    try {
      await session.close();
    } catch (error) {
      this.ctx.logger.warn("player close failed", error);
    }
    try {
      await session.dispose();
    } catch (error) {
      this.ctx.logger.warn("player session dispose failed", error);
    }
  }

  private async onSessionClosed(): Promise<void> {
    if (this.state === "idle") return;
    this.currentSession = null;
    await this.finishCurrentTask();
  }

  /**
   * 结束当前场次并排下一场。
   * 之前 closeTask() 与 session closed 回调都会调用本方法，导致同一次关闭被处理两次、
   * 重复排程；这里用 in-flight 标志合并重入。
   */
  private finishing = false;

  private async finishCurrentTask(): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    try {
      const pending = this.pendingEa2Path;
      this.pendingEa2Path = null;
      this.clearSchedule();
      const resumePath = pending || this.lastEa2Path;
      if (!resumePath) return;
      await this.scheduleFromFile(resumePath, { futureOnly: !pending });
    } catch (error) {
      this.ctx.logger.error("next exam schedule failed", error);
    } finally {
      this.finishing = false;
    }
  }

  /**
   * 把「EA 当前 HTTP API 地址」写到固定位置，供 ClassIsland 端自动发现。
   *
   * 为什么不再硬钉端口：宿主在插件注册路由时会重启自己的 HTTP 服务，重启时旧监听器还没释放、
   * 端口被占用就顺延到下一个，并把顺延结果写回配置（一次启动能顺延好几格）。硬钉会和宿主
   * 自己的重启互相打架，还会让 EA 设置页报「端口被占用」。改成「EA 如实上报 + CI 自动跟随」
   * 之后，端口怎么飘都不会推错地方。
   */
  private async publishEndpoint(): Promise<void> {
    const { ctx } = this;
    if (!this.settings.publishEndpoint) return;
    try {
      const baseUrl = await ctx.api.http.baseUrl();
      const port = parsePort(baseUrl);
      if (!port) return;
      const payload = {
        plugin: "examaware-auto-player",
        port,
        baseUrl,
        path: ROUTE_PREFIX,
        updatedAt: new Date().toISOString()
      };
      const file = endpointFilePath();
      await writeFile(file, JSON.stringify(payload, null, 2), "utf8");
      if (this.publishedPort !== port) {
        this.publishedPort = port;
        ctx.logger.info("published http api endpoint", { port, file });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger.warn("publish endpoint failed", { message });
    }
  }

  /**
   * 可选：把端口写回宿主配置（只在下次启动生效，且宿主之后可能自己再改，默认关闭）。
   * 想试「固定端口」的用户可以打开它；正常使用建议依赖上面的端口上报。
   */
  private async syncFixedPortConfig(): Promise<void> {
    const { ctx } = this;
    if (!this.settings.fixedPortEnabled) return;
    const want = this.settings.fixedPort;
    try {
      const all = (await ctx.api.appSettings.all()) as { httpApi?: { port?: number } };
      const configured = Number(all?.httpApi?.port) || 0;
      if (configured === want) return;
      await ctx.api.appSettings.set("httpApi.port", want);
      ctx.logger.info("wrote fixed port into host config (next launch)", { from: configured, to: want });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger.warn("write fixed port failed", { want, message });
    }
  }

  private async statusSnapshot(): Promise<Record<string, unknown>> {
    const session = this.currentSession ? await this.currentSession.snapshot() : undefined;
    return {
      ok: true,
      build: BUILD,
      apiVersion: 2,
      enabled: this.settings.enabled,
      state: this.state,
      nextOpenAt: this.nextOpenAt,
      currentTask: this.currentTask,
      session: session ?? null,
      settings: this.settings,
      lastEa2Path: this.lastEa2Path,
      lastSignalTime: this.lastSignalTime,
      lastSignalResult: this.lastSignalResult,
      lastError: this.lastError,
      routes: ROUTE_PREFIX,
      time: new Date().toISOString()
    };
  }

  private addTimer(callback: () => void, delay: number): void {
    this.timers.push(setTimeout(callback, Math.max(0, delay)));
  }

  private clearSchedule(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers = [];
    this.state = "idle";
    this.nextOpenAt = null;
    this.currentTask = null;
  }

  private async dispose(): Promise<void> {
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      this.publishTimer = undefined;
    }
    for (const handle of this.routeDisposables) {
      try {
        void handle.dispose();
      } catch {
        /* ignore */
      }
    }
    this.routeDisposables = [];
    this.pendingEa2Path = null;
    await this.stopCurrentSession();
    this.clearSchedule();
    this.ctx.logger.info("auto-player disposed");
  }
}

export default defineMainPlugin<AutoPlayerSettings>({
  async activate(ctx) {
    const service = new AutoPlayerService(ctx);
    await service.init();
  },
  onError(error, ctx) {
    ctx.logger.error("auto-player lifecycle error", error);
  }
});
