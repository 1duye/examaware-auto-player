// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 α-氯氰菊酯 <https://github.com/1duye>
// Watermark: 1duye/examaware-auto-player#WM-2026​​‌‌​​​‌​‌‌​​‌​​​‌‌‌​‌​‌​‌‌‌‌​​‌​‌‌​​‌​‌​‌‌‌‌‌​​​‌‌​​‌​‌​‌‌‌‌​​​​‌‌​​​​‌​‌‌​‌‌​‌​‌‌​​​​‌​‌‌‌​‌‌‌​‌‌​​​​‌​‌‌‌​​‌​​‌‌​​‌​‌​​‌​‌‌​‌​‌‌​​​​‌​‌‌‌​‌​‌​‌‌‌​‌​​​‌‌​‌‌‌‌​​‌​‌‌​‌​‌‌‌​​​​​‌‌​‌‌​​​‌‌​​​​‌​‌‌‌‌​​‌​‌‌​​‌​‌​‌‌‌​​‌​​‌‌‌‌‌​​​​‌‌​​‌​​​‌‌​​​​​​‌‌​​‌​​​‌‌​‌‌​
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { defineMainPlugin } from "@dsz-examaware/plugin-sdk";
import type { Disposable, MainPluginContext, PlayerSession } from "@dsz-examaware/plugin-sdk";
import { WATERMARK } from "../shared/watermark";

const BUILD = "20261102_v2_15";

/**
 * 服务地址命名空间由宿主按插件名拼接。
 * 注意：插件名不能含 "/"，否则宿主用它拼出的 `/settings/<插件名>:<页面id>` 会多一段路径，
 * 与宿主路由 `/settings/:page?` 不匹配，设置页会整块空白。故此处不带 npm 作用域前缀。
 */
const ROUTE_PREFIX = "/api/v1/examaware-auto-player";

/**
 * 本机 HTTP API 没有鉴权，而浏览器发起的跨源请求是「简单请求」时不会先握手：
 * 随便一个网页朝 127.0.0.1:<port> POST 一次，服务端就会真的执行——等于任意网站
 * 都能把教室拉进 kiosk 全屏。浏览器一定带 Origin / Sec-Fetch-Site，原生客户端
 * （ClassIsland 的 HttpClient、自家设置页走宿主网络层并带 x-auto-player-client）
 * 不带，所以按这两个头拒绝即可，不用改协议、不破坏已有对接。
 */
type RequestHeaders = Readonly<Record<string, string | string[]>>;

function readHeader(headers: RequestHeaders, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isBrowserRequest(headers: RequestHeaders): boolean {
  if (readHeader(headers, "x-auto-player-client").trim().toLowerCase() === "ui") return false;
  if (readHeader(headers, "origin")) return true;
  const site = readHeader(headers, "sec-fetch-site").trim().toLowerCase();
  if (site === "cross-site" || site === "same-site") return true;
  const contentType = readHeader(headers, "content-type").trim().toLowerCase();
  return Boolean(contentType) && !contentType.startsWith("application/json");
}

/** 只接受绝对路径的 .ea2 文件，避免把任意路径塞进播放器。 */
function normalizeEa2Path(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || !/\.ea2$/i.test(value) || !isAbsolute(value)) return null;
  return value;
}

export interface AutoPlayerSettings {
  enabled: boolean;
  advanceMinutes: number;
  exitDelaySeconds: number;
  /** 是否把 EA 当前的 HTTP API 地址写到发现文件，供 ClassIsland 端自动对齐端口。 */
  publishEndpoint: boolean;
}

const DEFAULT_SETTINGS: AutoPlayerSettings = {
  enabled: true,
  advanceMinutes: 5,
  exitDelaySeconds: 30,
  publishEndpoint: true
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
    publishEndpoint: value.publishEndpoint !== false
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
  private lastEndpointWriteAt = 0;

  constructor(private readonly ctx: MainPluginContext<AutoPlayerSettings>) {
    this.settings = normalizeSettings(ctx.initialSettings);
  }

  async init(): Promise<void> {
    const { ctx } = this;

    ctx.scope.add(
      ctx.api.settings.onChanged((settings) => {
        this.settings = normalizeSettings(settings);
        ctx.logger.info("settings changed", this.settings);
        void this.publishEndpoint(true);
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
    // 上报当前地址供 ClassIsland 自动发现；端口若被宿主顺延，下一轮上报会自动跟上。
    // 15 秒轮询、内容没变时最多 1 分钟写一次盘（以前是 5 秒无脑重写，纯属磨 SSD）。
    void this.publishEndpoint(true);
    this.publishTimer = setInterval(() => {
      void this.publishEndpoint();
    }, 15_000);
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
        handler: async ({ body, headers }) => {
          if (isBrowserRequest(headers)) {
            ctx.logger.warn("blocked browser-originated signal request");
            return { status: 403, body: { error: "browser requests are not allowed" } };
          }
          const ea2Path = normalizeEa2Path((body as { ea2Path?: unknown } | undefined)?.ea2Path);
          const futureOnly = (body as { futureOnly?: unknown } | undefined)?.futureOnly === true;
          if (!ea2Path) {
            return { status: 400, body: { error: "ea2Path must be an absolute .ea2 file" } };
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
        handler: async ({ headers }) => {
          if (isBrowserRequest(headers)) {
            return { status: 403, body: { error: "browser requests are not allowed" } };
          }
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
  private async publishEndpoint(force = false): Promise<void> {
    const { ctx } = this;
    if (!this.settings.publishEndpoint) return;
    try {
      const baseUrl = await ctx.api.http.baseUrl();
      const port = parsePort(baseUrl);
      if (!port) return;
      const changed = port !== this.publishedPort;
      // 端口没变就别反复重写同一个文件：ClassIsland 只要求 10 分钟内有更新，1 分钟一次足够
      if (!changed && !force && Date.now() - this.lastEndpointWriteAt < 60_000) return;
      const payload = {
        plugin: "examaware-auto-player",
        port,
        baseUrl,
        path: ROUTE_PREFIX,
        watermark: WATERMARK,
        updatedAt: new Date().toISOString()
      };
      const file = endpointFilePath();
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(payload, null, 2), "utf8");
      this.lastEndpointWriteAt = Date.now();
      if (changed) {
        this.publishedPort = port;
        ctx.logger.info("published http api endpoint", { port, file });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger.warn("publish endpoint failed", { message });
    }
  }

  private async statusSnapshot(): Promise<Record<string, unknown>> {
    // 关闭 / 析构过程中 snapshot() 可能抛，别让 /ping 整个 500——设置页会误报离线
    let session: unknown;
    try {
      session = this.currentSession ? await this.currentSession.snapshot() : undefined;
    } catch (error) {
      this.ctx.logger.warn("session snapshot failed", error);
      session = undefined;
    }
    return {
      ok: true,
      build: BUILD,
      apiVersion: 2,
      watermark: WATERMARK,
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
    let handle: ReturnType<typeof setTimeout>;
    handle = setTimeout(() => {
      // 触发过的句柄要摘掉，否则一个下午下来 timers 里全是死引用
      this.timers = this.timers.filter((timer) => timer !== handle);
      callback();
    }, Math.max(0, delay));
    this.timers.push(handle);
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
