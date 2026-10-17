"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { ipcMain, BrowserWindow, app } = require("electron");

const LOG_DIR = (() => {
  const p = path.dirname(app.getAppPath());
  const nm = path.basename(p);
  if (nm === "resources") return path.join(path.dirname(p), "logs", "exam2");
  if (nm === "packages") return path.join(path.dirname(p), "logs", "exam2");
  return path.join(p, "logs", "exam2");
})();

// 异步日志队列：避免高频 appendFileSync 阻塞主进程
const _logQueue = [];
let _logFlushing = false;
function flog(level, msg) {
  try {
    _logQueue.push(`[${new Date().toISOString().replace("T", " ").slice(0, 19)}] [${level}] ${msg}\n`);
    if (_logQueue.length > 500) _logQueue.shift(); // 防内存无限增长
    if (_logFlushing) return;
    _logFlushing = true;
    fs.mkdirSync(LOG_DIR, { recursive: true });
    setImmediate(() => {
      let batch;
      while ((batch = _logQueue.splice(0, 100)).length) {
        try {
          fs.appendFileSync(path.join(LOG_DIR, "auto-player.log"), batch.join(""), "utf-8");
        } catch {}
      }
      _logFlushing = false;
    });
  } catch {}
}

const MAX_BODY_BYTES = 1024 * 1024; // 1MB 上限，防止恶意大 body 吃满内存
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    let size = 0;
    let aborted = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        req.destroy();
        resolve({});
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

class Service {
  constructor(ctx) {
    this.ctx = ctx;
  }

  cfg = { listenPort: 31235, advanceMinutes: 5, exitDelaySeconds: 30 };
  srv = null;
  timers = [];

  state = "idle"; // idle | scheduled | active
  next = null; // nextOpenAt timestamp
  currentTask = null; // { key, ea2Path, start, end, openAt, closeAt }
  playerWindowId = null;
  pendingEa2Path = null;
  isSecondary = false;
  lastSignalKey = null;
  lastSignalAt = 0;

  // 启动 HTTP 服务（支持端口变更后重启）
  startHttpServer() {
    if (this.srv) {
      try { this.srv.close(); } catch {}
      this.srv = null;
    }

    const token = this.cfg.apiToken || "";
    this.srv = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://" + req.headers.host);
      const method = req.method.toUpperCase();
      try {
        // 鉴权：除 ping 外均校验 token（Bearer 头或 ?token= 查询参数）
        const needAuth = url.pathname !== "/api/v1/plugin/auto-player/ping";
        if (needAuth && token) {
          const auth =
            (req.headers.authorization || "").replace(/^Bearer\s+/i, "") ||
            url.searchParams.get("token") ||
            "";
          if (auth !== token) return json(res, 401, { error: "unauthorized" });
        }

        if (method === "GET" && url.pathname === "/api/v1/plugin/auto-player/ping") {
          return json(res, 200, {
            ok: true,
            state: this.state,
            nextOpenAt: this.next,
            time: new Date().toISOString(),
          });
        }

        if (method === "POST" && url.pathname === "/api/v1/plugin/auto-player/signal") {
          const body = await readBody(req);
          const ea2Path = body?.ea2Path;
          if (!ea2Path) return json(res, 400, { error: "missing ea2Path" });
          if (!fs.existsSync(ea2Path)) return json(res, 404, { error: "not found" });
          flog("INFO", "signal " + ea2Path);
          this.scheduleFromFile(ea2Path);
          return json(res, 200, { ok: true });
        }

        if (method === "POST" && url.pathname === "/api/v1/plugin/auto-player/echo") {
          const body = await readBody(req);
          const msg = body?.text || "";
          flog("HTTP.ECHO", "sent=" + msg);
          return json(res, 200, { sent: msg, received: msg, time: new Date().toISOString() });
        }

        return json(res, 404, { error: "not found" });
      } catch (e) {
        flog("ERROR", "http err: " + e.message);
        return json(res, 500, { error: e.message });
      }
    });

    this.srv.on("error", (err) => {
      if (err?.code === "EADDRINUSE") {
        this.isSecondary = true;
        flog("ERROR", "listen EADDRINUSE 127.0.0.1:" + this.cfg.listenPort);
        this.log("HTTP port in use: " + this.cfg.listenPort);
        return;
      }
      flog("ERROR", "http listen error: " + (err?.message || err));
    });

    this.srv.listen(this.cfg.listenPort, "127.0.0.1", () => {
      this.isSecondary = false;
      flog("INFO", "HTTP server on port " + this.cfg.listenPort);
    });
    this.log("HTTP up :" + this.cfg.listenPort);
  }

  async init() {
    flog("INFO", "init log=" + path.join(LOG_DIR, "auto-player.log"));
    flog("INFO", "AUTO_PLAYER_BUILD=20260729_07");

    this.ctx.ipc.registerChannel("auto-player:status", async () => this.getStatus());

    this.ctx.ipc.registerChannel("auto-player:log", async (_e, payload) => {
      if (payload?.level && payload?.msg) {
        flog("R." + String(payload.level).toUpperCase(), payload.msg);
      }
      return { ok: true };
    });

    this.ctx.ipc.registerChannel("auto-player:echo", async (_e, payload) => {
      const msg = payload?.text || "";
      flog("R.ECHO", "sent=" + msg);
      return { sent: msg, received: msg, time: new Date().toISOString() };
    });

    flog("INFO", "IPC up");

    try {
      const c = await this.ctx.settings.all();
      if (c) {
        this.cfg = {
          listenPort: c.listenPort ?? 31235,
          advanceMinutes: c.advanceMinutes ?? 5,
          exitDelaySeconds: c.exitDelaySeconds ?? 30,
          apiToken: c.apiToken ?? "",
        };
      }
    } catch {}

    this.log(
      "ready port=" +
        this.cfg.listenPort +
        " " +
        this.cfg.advanceMinutes +
        "m/" +
        this.cfg.exitDelaySeconds +
        "s"
    );

    // 端口/token 变更 → 重启 HTTP 服务，避免“改了不生效”
    this.ctx.settings.onChange((c) => {
      if (!c) return;
      const oldPort = this.cfg.listenPort;
      this.cfg = {
        listenPort: c.listenPort ?? this.cfg.listenPort ?? 31235,
        advanceMinutes: c.advanceMinutes ?? this.cfg.advanceMinutes ?? 5,
        exitDelaySeconds: c.exitDelaySeconds ?? this.cfg.exitDelaySeconds ?? 30,
        apiToken: c.apiToken ?? this.cfg.apiToken ?? "",
      };
      if (c.listenPort && c.listenPort !== oldPort) {
        flog("INFO", "port changed " + oldPort + " -> " + c.listenPort + ", restarting HTTP server");
        this.startHttpServer();
      }
    });

    this.startHttpServer();
  }

  async destroy() {
    this.clearSchedule();
    try {
      this.srv?.close();
    } catch {}
    this.log("stop");
  }

  scheduleFromFile(ea2Path) {
    const parsed = this.parseExamFile(ea2Path);
    if (!parsed.length) return;

    const now = Date.now();
    if (this.state === "active" && this.currentTask && now < this.currentTask.closeAt) {
      this.pendingEa2Path = ea2Path;
      flog("INFO", "defer signal until close key=" + this.currentTask.key);
      return;
    }

    const adv = (this.cfg.advanceMinutes ?? 5) * 60e3;
    const delay = (this.cfg.exitDelaySeconds ?? 30) * 1e3;

    const future = parsed
      .filter((item) => item.start >= now)
      .sort((a, b) => a.start - b.start);

    const active = parsed
      .filter((item) => item.start - adv <= now && item.end + delay > now)
      .sort((a, b) => a.start - b.start);

    const target = future[0] ?? active[0];
    if (!target) {
      flog("INFO", "sched skip no future/active exam in file: " + ea2Path);
      this.clearSchedule();
      return;
    }

    const openAt = target.start - adv;
    const closeAt = target.end + delay;
    const key = `${ea2Path}|${target.start}|${target.end}`;

    // Keep the existing timers for an identical scheduled or active task.
    if (this.currentTask?.key === key) {
      flog("INFO", "dedupe current task key=" + key);
      return;
    }

    // Deduplicate repeated signals for the same task in a short interval.
    if (this.lastSignalKey === key && now - this.lastSignalAt < 5000) {
      flog("INFO", "dedupe signal key=" + key);
      return;
    }
    this.lastSignalKey = key;
    this.lastSignalAt = now;

    this.clearSchedule();

    this.currentTask = {
      key,
      ea2Path,
      start: target.start,
      end: target.end,
      openAt,
      closeAt,
    };

    this.next = openAt;

    const openIn = openAt - now;
    const closeIn = closeAt - now;

    flog(
      "INFO",
      "sched open=" + Math.round(openIn / 1e3) +
        "s close=" + Math.round(closeIn / 1e3) +
        "s at=" + new Date(openAt).toISOString() +
        " key=" + key
    );

    if (openIn > 0) {
      this.state = "scheduled";
      this.timers.push(setTimeout(() => this.openTask(), openIn));
    } else if (closeIn > 0) {
      this.openTask();
    } else {
      flog("INFO", "sched skip expired key=" + key);
      this.clearSchedule();
      return;
    }

    if (closeIn > 0) {
      this.timers.push(setTimeout(() => this.closeTask(), closeIn));
    }
  }

  parseExamFile(ea2Path) {
    let data;
    try {
      const raw = fs.readFileSync(ea2Path, "utf-8").replace(/^\uFEFF/, "");
      data = JSON.parse(raw);
    } catch {
      flog("ERROR", "bad ea2 " + ea2Path);
      return [];
    }

    if (!data?.examInfos?.length) return [];

    const parsed = [];
    for (const exam of data.examInfos) {
      const start = Date.parse(exam.start);
      const end = Date.parse(exam.end);
      if (!isNaN(start) && !isNaN(end)) {
        parsed.push({ start, end });
      }
    }
    return parsed;
  }

  async openTask() {
    if (!this.currentTask) return;
    if (this.state === "active") {
      flog("INFO", "open skip already active key=" + this.currentTask.key);
      return;
    }

    const task = this.currentTask;
    const existingWindowIds = new Set(BrowserWindow.getAllWindows().map((window) => window.id));
    try {
      const configData = fs.readFileSync(task.ea2Path, "utf-8").replace(/^\uFEFF/, "");
      const parsedConfig = JSON.parse(configData);
      if (!Array.isArray(parsedConfig?.examInfos) || parsedConfig.examInfos.length === 0) {
        throw new Error("exam file contains no examInfos");
      }

      await this.launchPlayerFromHost(configData);

      const playerWindow = BrowserWindow.getAllWindows().find((window) => {
        if (window.isDestroyed()) return false;
        if (!existingWindowIds.has(window.id)) return true;
        try {
          return /[#/]playerview(?:$|[/?#])/.test(window.webContents.getURL());
        } catch {
          return false;
        }
      });
      if (!playerWindow) {
        throw new Error("host did not create a player window");
      }

      this.state = "opening";
      this.next = null;
      const deliverConfig = () => {
        if (!playerWindow.isDestroyed()) {
          playerWindow.webContents.send("load-config", configData);
        }
      };
      playerWindow.webContents.once("did-finish-load", deliverConfig);
      deliverConfig();

      const loadedConfig = await this.waitForPlayerConfig(
        playerWindow,
        configData,
        parsedConfig.examName || "",
        parsedConfig.examInfos.length
      );
      if (!loadedConfig) {
        throw new Error("player did not load exam config");
      }

      this.playerWindowId = playerWindow.id;
      this.state = "active";
      flog(
        "INFO",
        "open verified window=" + playerWindow.id +
          " exams=" + parsedConfig.examInfos.length +
          " name=" + (parsedConfig.examName || "") +
          " path=" + task.ea2Path +
          " key=" + task.key
      );
    } catch (error) {
      this.state = "error";
      this.next = null;
      const failedWindow = this.playerWindowId
        ? BrowserWindow.fromId(this.playerWindowId)
        : BrowserWindow.getAllWindows().find((window) => {
            try {
              return /[#/]playerview(?:$|[/?#])/.test(window.webContents.getURL());
            } catch {
              return false;
            }
          });
      if (failedWindow && !failedWindow.isDestroyed()) {
        ipcMain.emit("player-window-exit", { sender: failedWindow.webContents });
      }
      flog("ERROR", "open failed key=" + task.key + " error=" + (error?.message || error));
    }
  }

  async waitForPlayerConfig(playerWindow, configData, expectedName, expectedCount) {
    let lastDiagnostic = null;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (playerWindow.isDestroyed()) return false;
      if (attempt % 4 === 0) {
        playerWindow.webContents.send("load-config", configData);
      }
      try {
        const loaded = await playerWindow.webContents.executeJavaScript(
          `(async () => {
            const debug = window.debugPlayerView;
            let sharedConfig = null;
            let sharedError = null;
            try {
              sharedConfig = await window.api?.ipc?.invoke?.("get-config");
            } catch (error) {
              sharedError = error?.message || String(error);
            }
            const config = debug?.config;
            return {
              readyState: document.readyState,
              hasDebug: Boolean(debug),
              loading: debug?.loading ?? null,
              loaded: debug?.loaded ?? null,
              source: debug?.source ?? null,
              name: config?.examName || "",
              count: Array.isArray(config?.examInfos) ? config.examInfos.length : 0,
              sharedLength: typeof sharedConfig === "string" ? sharedConfig.length : 0,
              sharedError
            };
          })()`,
          true
        );
        lastDiagnostic = loaded;
        if (loaded?.count === expectedCount && (!expectedName || loaded?.name === expectedName)) {
          flog("INFO", "config verified name=" + loaded.name + " exams=" + loaded.count);
          return true;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    flog("ERROR", "config verify diagnostic=" + JSON.stringify(lastDiagnostic));
    return false;
  }

  launchPlayerFromHost(configData) {
    const handlers = ipcMain._invokeHandlers;
    const handler = handlers?.get?.("player:open-from-editor");
    if (typeof handler !== "function") {
      return Promise.reject(new Error("host player:open-from-editor handler is unavailable"));
    }
    return Promise.resolve(handler({}, configData));
  }

  closeTask() {
    if (!this.currentTask) return;
    flog("INFO", "close key=" + this.currentTask.key);
    const pendingEa2Path = this.pendingEa2Path;
    this.pendingEa2Path = null;
    const playerWindow = this.playerWindowId
      ? BrowserWindow.fromId(this.playerWindowId)
      : null;
    if (playerWindow && !playerWindow.isDestroyed()) {
      ipcMain.emit("player-window-exit", { sender: playerWindow.webContents });
      this.clearSchedule();
      if (pendingEa2Path) setTimeout(() => this.scheduleFromFile(pendingEa2Path), 0);
      return;
    }
    BrowserWindow.getAllWindows().forEach((w) => {
      try {
        if (!w.isDestroyed() && /ExamAware|考试|知试/.test(w.getTitle())) {
          w.close();
        }
      } catch {}
    });
    this.clearSchedule();
    if (pendingEa2Path) setTimeout(() => this.scheduleFromFile(pendingEa2Path), 0);
  }

  getStatus() {
    if (!this.isSecondary) return Promise.resolve(this.localStatus());

    return new Promise((resolve) => {
      const req = http.get(
        {
          host: "127.0.0.1",
          port: this.cfg.listenPort,
          path: "/api/v1/plugin/auto-player/ping",
          timeout: 1000,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              const status = JSON.parse(body);
              resolve({ ...status, source: "primary" });
            } catch {
              resolve({ ...this.localStatus(), state: "disconnected" });
            }
          });
        }
      );
      req.on("timeout", () => req.destroy());
      req.on("error", () => resolve({ ...this.localStatus(), state: "disconnected" }));
    });
  }

  localStatus() {
    return {
      nextOpenAt: this.next,
      state: this.state,
      currentTask: this.currentTask
        ? {
            key: this.currentTask.key,
            ea2Path: this.currentTask.ea2Path,
            start: this.currentTask.start,
            end: this.currentTask.end,
            openAt: this.currentTask.openAt,
            closeAt: this.currentTask.closeAt,
          }
        : null,
    };
  }

  clearSchedule() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.next = null;
    this.state = "idle";
    this.currentTask = null;
    this.playerWindowId = null;
  }

  log(msg) {
    flog("INFO", msg);
    try {
      this.ctx.logger?.info?.("[auto-player] " + msg);
    } catch {}
  }
}

module.exports = {
  default: (ctx) => {
    const service = new Service(ctx);
    ctx.effect(() => {
      service.destroy().catch(() => {});
    });
    return service.init();
  },
};
