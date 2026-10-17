import { defineComponent, h } from "vue";
import { defineRendererPlugin } from "@dsz-examaware/plugin-sdk";

const RENDERER_BUILD = "20261015_ui2";
const SETTINGS_PAGE_ID = "auto-player";

const unwrapApiResponse = (payload: any) =>
  payload?.success === true && payload?.data !== undefined ? payload.data : payload;

const formatCountdown = (milliseconds: number) => {
  const safe = Math.max(0, milliseconds);
  const total = Math.floor(safe / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

const formatClock = (timestamp?: number | null) => {
  if (!timestamp || !Number.isFinite(timestamp)) return "--:--";
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const formatRange = (start?: number | null, end?: number | null) =>
  start && end ? `${formatClock(start)} – ${formatClock(end)}` : "";

const STYLE_ID = "ap2-design-styles";
const STYLE_CSS = [
  '.ap2-root{color:var(--td-text-color-primary);font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;max-width:760px;padding:4px 2px 28px}',
  ".ap2-root *{box-sizing:border-box}",
  ".ap2-root h2{margin:0 0 6px;font-size:24px;line-height:1.4;font-weight:600;letter-spacing:-.01em;color:var(--td-text-color-primary)}",
  ".ap2-desc{margin:0 0 14px;color:var(--td-text-color-secondary);font-size:13px;line-height:1.6}",
  ".ap2-section{display:flex;align-items:center;gap:8px;margin:18px 0 8px;font-size:13px;font-weight:600;color:var(--td-text-color-secondary)}",
  ".ap2-section::before{content:'';width:3px;height:14px;border-radius:2px;background:var(--td-brand-color)}",
  ".ap2-card{background:var(--td-bg-color-container);border:1px solid var(--td-border-level-1-color);border-radius:var(--td-radius-large,12px);overflow:hidden;margin-bottom:12px}",
  ".ap2-item{display:flex;align-items:center;gap:12px;padding:12px 16px}",
  ".ap2-item+.ap2-item{border-top:1px solid var(--td-border-level-1-color)}",
  ".ap2-item-main{flex:1;min-width:0}",
  ".ap2-item-title{font-size:15px;font-weight:600;color:var(--td-text-color-primary)}",
  ".ap2-item-desc{color:var(--td-text-color-secondary);font-size:12px;margin-top:3px;line-height:1.5}",
  ".ap2-item-action{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}",
  ".ap2-pill{display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:var(--td-radius-round,999px);background:var(--td-bg-color-component);border:1px solid var(--td-border-level-1-color);font-size:12px;color:var(--td-text-color-secondary);white-space:nowrap}",
  ".ap2-dot{width:8px;height:8px;border-radius:50%;background:var(--td-text-color-placeholder);flex:none}",
  ".ap2-dot.ok{background:#00a870}",
  ".ap2-dot.err{background:var(--td-error-color,#e34d59)}",
  ".ap2-dot.warn{background:var(--td-warning-color,#e37318)}",
  ".ap2-dot.pop{animation:ap2-pop .2s cubic-bezier(.2,.8,.2,1)}",
  "@keyframes ap2-pop{0%{transform:scale(.35)}60%{transform:scale(1.3)}100%{transform:scale(1)}}",
  ".ap2-status{font-size:22px;font-weight:600;letter-spacing:-.01em;color:var(--td-text-color-primary)}",
  ".ap2-service{margin-top:4px;font-size:12px;color:var(--td-text-color-placeholder);font-family:ui-monospace,'Cascadia Mono',Consolas,monospace;word-break:break-all}",
  ".ap2-count{font-family:ui-monospace,'Cascadia Mono',Consolas,monospace;font-size:28px;font-weight:650;letter-spacing:-.01em;color:var(--td-brand-color);font-variant-numeric:tabular-nums}",
  ".ap2-mono{font-family:ui-monospace,'Cascadia Mono',Consolas,monospace;word-break:break-all}",
  ".ap2-flash{animation:ap2-flash .18s cubic-bezier(.2,.8,.2,1)}",
  "@keyframes ap2-flash{from{opacity:.35;transform:translateY(3px)}to{opacity:1;transform:none}}",
  ".ap2-field-row{display:flex;align-items:center;gap:8px}",
  ".ap2-input{height:34px;width:96px;padding:0 10px;color:var(--td-text-color-primary);background:var(--td-bg-color-specialcomponent);border:1px solid var(--td-border-level-2-color);border-radius:var(--td-radius-default,6px);font-size:14px;font-variant-numeric:tabular-nums;outline:none;transition:border-color .2s,box-shadow .2s}",
  ".ap2-input:focus{border-color:var(--td-brand-color);box-shadow:0 0 0 2px var(--td-brand-color-focus)}",
  ".ap2-unit{font-size:12px;color:var(--td-text-color-secondary);min-width:24px}",
  ".ap2-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 14px;border:1px solid var(--td-border-level-2-color);border-radius:var(--td-radius-default,6px);background:var(--td-bg-color-component);color:var(--td-text-color-primary);font-size:13.5px;font-weight:500;cursor:pointer;transition:transform .12s cubic-bezier(.2,.8,.2,1),filter .18s ease}",
  ".ap2-btn:active{transform:scale(.97)}",
  ".ap2-btn:disabled{opacity:.5;cursor:not-allowed}",
  "@media (hover:hover) and (pointer:fine){.ap2-btn:hover{filter:brightness(1.08)}}",
  ".ap2-btn.primary{background:var(--td-brand-color);border-color:transparent;color:#fff}",
  ".ap2-btn.danger{color:var(--td-error-color,#e34d59);border-color:var(--td-error-color,#e34d59)}",
  ".ap2-switch{position:relative;display:inline-flex;align-items:center;width:42px;height:24px;border-radius:999px;background:var(--td-bg-color-component);border:1px solid var(--td-border-level-2-color);cursor:pointer;transition:background .18s ease,border-color .18s ease;flex:none}",
  ".ap2-switch::after{content:'';position:absolute;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.2,.8,.2,1)}",
  ".ap2-switch.on{background:var(--td-brand-color);border-color:transparent}",
  ".ap2-switch.on::after{transform:translateX(18px)}",
  ".ap2-warn{margin:0 0 12px;padding:10px 14px;border-radius:var(--td-radius-default,6px);background:var(--td-warning-color-1,rgba(227,115,24,.12));border:1px solid var(--td-warning-color-3,rgba(227,115,24,.35));color:var(--td-warning-color-8,#8f4a0d);font-size:12.5px;line-height:1.6}",
  ".ap2-in{opacity:0;transform:translateY(6px);animation:ap2-in .16s cubic-bezier(.2,.8,.2,1) forwards}",
  ".ap2-in.d2{animation-delay:.05s}",
  ".ap2-in.d3{animation-delay:.1s}",
  "@keyframes ap2-in{to{opacity:1;transform:none}}",
  ".ap2-toast{position:fixed;right:28px;top:28px;max-width:320px;padding:10px 16px;border-radius:var(--td-radius-default,6px);color:#fff;font-size:13px;font-weight:500;opacity:0;transform:translateY(-8px);transition:transform .2s cubic-bezier(.2,.8,.2,1),opacity .18s ease;pointer-events:none;z-index:2147483000}",
  ".ap2-toast.show{opacity:1;transform:none}",
  ".ap2-toast.ok{background:var(--td-success-color,#00a870)}",
  ".ap2-toast.err{background:var(--td-error-color,#e34d59)}",
  "@media (prefers-reduced-motion:reduce){.ap2-in,.ap2-flash,.ap2-dot.pop{animation:none;opacity:1}.ap2-btn{transition:filter .15s ease}.ap2-toast{transition:opacity .15s ease;transform:none}}"
,
  /* ==== v2 布局：居中 hero / 两列 KPI / 空状态 / 居中主操作 ==== */
  ".ap2-root{max-width:880px;margin:0 auto;padding:26px 22px 44px}",
  ".ap2-hero{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:6px 0 22px}",
  ".ap2-root .ap2-hero-title{margin:0;font-size:26px;line-height:1.3;font-weight:650;letter-spacing:-.01em;color:var(--td-text-color-primary)}",
  ".ap2-hero-sub{margin:0;max-width:520px;font-size:13px;line-height:1.75;color:var(--td-text-color-secondary)}",
  ".ap2-hero-meta{display:flex;flex-direction:column;align-items:center;gap:7px;min-height:24px}",
  ".ap2-root .ap2-service{margin-top:0;max-width:520px;font-size:11.5px}",
  ".ap2-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 22px}",
  ".ap2-kpi{display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 14px 18px;text-align:center;background:var(--td-bg-color-container);border:1px solid var(--td-border-level-1-color);border-radius:var(--td-radius-large,12px)}",
  ".ap2-kpi-label{font-size:12px;color:var(--td-text-color-secondary)}",
  ".ap2-empty{display:flex;flex-direction:column;align-items:center;gap:5px;padding:22px 18px;text-align:center;color:var(--td-text-color-placeholder);font-size:12.5px;line-height:1.7}",
  ".ap2-empty strong{font-weight:600;color:var(--td-text-color-secondary)}",
  ".ap2-footer{display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:26px}",
  ".ap2-footer-hint{max-width:460px;margin:0;text-align:center;font-size:12px;line-height:1.7;color:var(--td-text-color-placeholder)}",
  ".ap2-btn.lg{height:38px;padding:0 24px;font-size:14px;font-weight:600}",
  "@media (max-width:640px){.ap2-root{padding:20px 16px 36px}.ap2-kpis{grid-template-columns:1fr}}"].join("\n");

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLE_CSS;
  document.head.appendChild(el);
}

export default defineRendererPlugin<Record<string, unknown>>({
  async activate(ctx) {
    ctx.logger.info(`auto-player renderer ready build=${RENDERER_BUILD}`);

    const SettingsPage = defineComponent({
      name: "AutoPlayerSettingsPage",
      setup() {
        ensureStyles();

        const initial = (ctx.api.settings.get() || {}) as any;
        const state = {
          enabled: initial.enabled !== false,
          advanceMinutes: initial.advanceMinutes ?? 5,
          exitDelaySeconds: initial.exitDelaySeconds ?? 30,
          appliedEnabled: initial.enabled !== false,
          appliedAdvanceMinutes: initial.advanceMinutes ?? 5,
          appliedExitDelaySeconds: initial.exitDelaySeconds ?? 30,
          publishEndpoint: initial.publishEndpoint !== false,
          currentPort: 0,
          status: "正在连接",
          countdown: "暂无排程",
          serviceUrl: "",
          connected: false,
          taskTitle: "",
          taskRange: "",
          taskMeta: "",
          hasTask: false,
          lastSignal: "",
          lastError: "",
          notice: "",
          noticeOk: true
        };

        let pollTimer: ReturnType<typeof setInterval> | undefined;
        let noticeTimer: ReturnType<typeof setTimeout> | undefined;
        let lastConnected = false;

        const getRoot = () => document.querySelector("[data-auto-player-root]");

        const triggerFlash = (el: Element | null) => {
          if (!el) return;
          el.classList.remove("ap2-flash");
          void (el as HTMLElement).offsetWidth;
          el.classList.add("ap2-flash");
        };

        const triggerPop = (el: Element | null) => {
          if (!el) return;
          el.classList.remove("pop");
          void (el as HTMLElement).offsetWidth;
          el.classList.add("pop");
        };

        const setText = (selector: string, value: string, flash = false) => {
          const el = getRoot()?.querySelector(selector);
          if (!el || el.textContent === value) return;
          el.textContent = value;
          if (flash) triggerFlash(el);
        };

        const renderState = () => {
          const root = getRoot();
          if (!root) return;

          const pillText = root.querySelector("[data-auto-player-pill-text]");
          if (pillText) {
            const text = state.connected ? "服务在线" : "服务离线";
            if (pillText.textContent !== text) {
              pillText.textContent = text;
              triggerFlash(pillText);
            }
          }

          const dot = root.querySelector("[data-auto-player-dot]");
          if (dot) {
            const cls = state.lastError ? "warn" : state.connected ? "ok" : "err";
            dot.classList.toggle("ok", cls === "ok");
            dot.classList.toggle("err", cls === "err");
            dot.classList.toggle("warn", cls === "warn");
            const marker = state.connected ? cls : "offline";
            if (marker !== (dot as any).__marker) {
              (dot as any).__marker = marker;
              triggerPop(dot);
            }
          }

          setText("[data-auto-player-status]", state.status, true);
          setText("[data-auto-player-countdown]", state.countdown, true);

          const serviceUrl = root.querySelector("[data-auto-player-service-url]");
          if (serviceUrl) {
            serviceUrl.textContent = state.serviceUrl;
            (serviceUrl as HTMLElement).style.display = state.serviceUrl ? "block" : "none";
          }

          setText("[data-auto-player-current-port]", state.currentPort ? String(state.currentPort) : "—");

          const portSwitch = root.querySelector("[data-auto-player-port-switch]");
          if (portSwitch) portSwitch.classList.toggle("on", state.publishEndpoint);

          const taskSection = root.querySelector("[data-auto-player-task-section]");
          if (taskSection) (taskSection as HTMLElement).style.display = state.hasTask ? "" : "none";
          setText("[data-auto-player-task-title]", state.taskTitle, true);
          setText("[data-auto-player-task-range]", state.taskRange);
          setText("[data-auto-player-task-meta]", state.taskMeta);

          const signalRow = root.querySelector("[data-auto-player-signal-row]");
          if (signalRow) (signalRow as HTMLElement).style.display = state.lastSignal ? "" : "none";
          setText("[data-auto-player-signal]", state.lastSignal);

          const errorRow = root.querySelector("[data-auto-player-error-row]");
          if (errorRow) (errorRow as HTMLElement).style.display = state.lastError ? "" : "none";
          setText("[data-auto-player-error]", state.lastError);

          const emptyState = root.querySelector("[data-auto-player-empty]");
          if (emptyState) {
            (emptyState as HTMLElement).style.display =
              state.lastSignal || state.lastError ? "none" : "";
          }

          setText("[data-auto-player-applied]",
            `生效配置：${state.appliedEnabled ? "自动放映已开启" : "自动放映已暂停"} · 提前 ${state.appliedAdvanceMinutes} 分钟 · 延迟 ${state.appliedExitDelaySeconds} 秒`);

          const sw = root.querySelector("[data-auto-player-switch]");
          if (sw) sw.classList.toggle("on", state.enabled);

          const notice = root.querySelector("[data-auto-player-notice]");
          if (notice) {
            notice.textContent = state.notice;
            notice.classList.toggle("show", Boolean(state.notice));
            notice.classList.toggle("ok", state.noticeOk);
            notice.classList.toggle("err", !state.noticeOk);
          }
        };

        const showNotice = (message: string, ok: boolean) => {
          clearTimeout(noticeTimer);
          state.notice = message;
          state.noticeOk = ok;
          renderState();
          noticeTimer = setTimeout(() => {
            state.notice = "";
            renderState();
          }, 3000);
        };

        const baseUrl = async () => (await ctx.api.http.baseUrl()).replace(/\/$/, "");

        const load = async () => {
          try {
            const url = await baseUrl();
            state.serviceUrl = `${url}/api/v1/${ctx.plugin.name}`;
            try {
              state.currentPort = Number(new URL(url).port) || 0;
            } catch {
              state.currentPort = 0;
            }
            const response = await ctx.api.network.getJson(`${state.serviceUrl}/ping`, {
              timeoutMs: 2000,
              maxBytes: 64 * 1024,
              allowLocalNetwork: true
            });
            const payload: any = unwrapApiResponse(response);
            state.connected = true;
            const mode = payload?.state;
            state.status =
              mode === "active" ? "正在放映"
                : mode === "opening" ? "正在加载考试档案"
                : mode === "error" ? "放映启动失败"
                : mode === "scheduled" ? "已排程"
                : "空闲";
            state.countdown =
              mode === "scheduled" && payload?.nextOpenAt ? formatCountdown(payload.nextOpenAt - Date.now())
                : mode === "active" ? "正在放映"
                : mode === "opening" ? "正在加载考试档案"
                : mode === "error" ? "放映启动失败"
                : "暂无排程";

            state.appliedEnabled = payload?.settings?.enabled !== false;
            state.appliedAdvanceMinutes = payload?.settings?.advanceMinutes ?? state.appliedAdvanceMinutes;
            state.appliedExitDelaySeconds = payload?.settings?.exitDelaySeconds ?? state.appliedExitDelaySeconds;

            const task = payload?.currentTask;
            state.hasTask = Boolean(task);
            if (task) {
              state.taskTitle = task.examName || task.subject || "考试";
              state.taskRange = formatRange(task.start, task.end);
              state.taskMeta = `科目 ${task.subject || "—"} · 共 ${task.examCount ?? 1} 场 · 放映 ${formatClock(task.openAt)}–${formatClock(task.closeAt)}`;
            }

            state.lastSignal = payload?.lastEa2Path
              ? `${payload.lastSignalResult || "received"} · ${formatClock(Date.parse(payload.lastSignalTime))} · ${payload.lastEa2Path}`
              : "";
            state.lastError = payload?.lastError || "";
          } catch {
            state.connected = false;
            state.status = "服务未连接";
            state.countdown = "无法获取";
          }
          renderState();
        };

        const save = async () => {
          try {
            await ctx.api.settings.patch({
              enabled: state.enabled,
              advanceMinutes: state.advanceMinutes,
              exitDelaySeconds: state.exitDelaySeconds,
              publishEndpoint: state.publishEndpoint
            });
            state.appliedEnabled = state.enabled;
            state.appliedAdvanceMinutes = state.advanceMinutes;
            state.appliedExitDelaySeconds = state.exitDelaySeconds;
            showNotice("已保存", true);
            await load();
          } catch (error: any) {
            showNotice(`保存失败：${error?.message || error}`, false);
          }
        };

        const stopNow = async () => {
          try {
            const url = await baseUrl();
            await ctx.api.network.request(`${url}/api/v1/${ctx.plugin.name}/stop`, {
              method: "POST",
              allowLocalNetwork: true,
              timeoutMs: 4000
            });
            showNotice("已停止当前放映", true);
            await load();
          } catch (error: any) {
            showNotice(`停止失败：${error?.message || error}`, false);
          }
        };

        const selfTest = async () => {
          try {
            const url = await baseUrl();
            const response: any = await ctx.api.network.getJson(`${url}/api/v1/${ctx.plugin.name}/ping`, {
              timeoutMs: 4000,
              maxBytes: 64 * 1024,
              allowLocalNetwork: true
            });
            const payload: any = unwrapApiResponse(response);
            const port = new URL(url).port;
            showNotice(payload?.ok ? `连通正常 · 端口 ${port} · ${payload?.build}` : "返回异常", Boolean(payload?.ok));
          } catch (error: any) {
            showNotice(`连通失败：${error?.message || error}`, false);
          }
        };

        void load();
        pollTimer = setInterval(() => void load(), 1000);
        ctx.scope.add({
          dispose: () => {
            clearInterval(pollTimer);
            clearTimeout(noticeTimer);
          }
        });

        return () =>
          h("section", { "data-auto-player-root": "", class: "ap2-root" }, [
            // ① hero —— 居中：标题 / 一句说明 / 连接状态。短文本居中＝视觉锚点
            h("div", { class: "ap2-hero ap2-in" }, [
              h("h2", { class: "ap2-hero-title" }, "自动放映"),
              h(
                "p",
                { class: "ap2-hero-sub" },
                "接收 ClassIsland 推送的考试安排，考前自动进入全屏放映，考完自动退出。"
              ),
              h("div", { class: "ap2-hero-meta" }, [
                h("span", { class: "ap2-pill" }, [
                  h("span", { "data-auto-player-dot": "", class: "ap2-dot err" }),
                  h("span", { "data-auto-player-pill-text": "" }, "服务离线")
                ]),
                h("div", { "data-auto-player-service-url": "", class: "ap2-service", style: "display:none" }, "")
              ])
            ]),

            // ② 数据卡 —— 两列、数值居中
            h("div", { class: "ap2-kpis ap2-in d2" }, [
              h("div", { class: "ap2-kpi" }, [
                h("div", { class: "ap2-kpi-label" }, "放映状态"),
                h("div", { "data-auto-player-status": "", class: "ap2-status" }, state.status)
              ]),
              h("div", { class: "ap2-kpi" }, [
                h("div", { class: "ap2-kpi-label" }, "距下一场"),
                h("div", { "data-auto-player-countdown": "", class: "ap2-count" }, state.countdown)
              ])
            ]),

            // ③ 当前场次 —— 有场次才整段出现（标题靠左、卡内左对齐、操作靠右）
            h("div", { "data-auto-player-task-section": "", style: "display:none" }, [
              h("div", { class: "ap2-section" }, "当前场次"),
              h("div", { "data-auto-player-task-card": "", class: "ap2-card" }, [
                h("div", { class: "ap2-item" }, [
                  h("div", { class: "ap2-item-main" }, [
                    h("div", { "data-auto-player-task-title": "", class: "ap2-item-title" }, ""),
                    h("div", { "data-auto-player-task-range": "", class: "ap2-item-desc" }, ""),
                    h("div", { "data-auto-player-task-meta": "", class: "ap2-item-desc" }, "")
                  ]),
                  h("div", { class: "ap2-item-action" }, [
                    h("button", { type: "button", class: "ap2-btn danger", onClick: stopNow }, "立即停止放映")
                  ])
                ])
              ])
            ]),

            // ④ 放映设置 —— 标签靠左、控件靠右
            h("div", { class: "ap2-section" }, "放映设置"),
            h("div", { class: "ap2-card ap2-in d2" }, [
              h("div", { class: "ap2-item" }, [
                h("div", { class: "ap2-item-main" }, [
                  h("div", { class: "ap2-item-title" }, "自动放映"),
                  h("div", { class: "ap2-item-desc" }, "临时暂停自动放映，不影响接收信号")
                ]),
                h("div", { class: "ap2-item-action" }, [
                  h("span", {
                    "data-auto-player-switch": "",
                    class: state.enabled ? "ap2-switch on" : "ap2-switch",
                    onClick: () => {
                      state.enabled = !state.enabled;
                      renderState();
                    }
                  })
                ])
              ]),
              h("div", { class: "ap2-item" }, [
                h("div", { class: "ap2-item-main" }, [
                  h("div", { class: "ap2-item-title" }, "提前启动"),
                  h("div", { class: "ap2-item-desc" }, "考试开始前多少分钟进入放映")
                ]),
                h("div", { class: "ap2-item-action" }, [
                  h("div", { class: "ap2-field-row" }, [
                    h("input", {
                      "data-auto-player-advance": "",
                      class: "ap2-input",
                      type: "number",
                      min: 0,
                      max: 60,
                      value: state.advanceMinutes,
                      onInput: (event: Event) => {
                        state.advanceMinutes = Number((event.target as HTMLInputElement).value) || 0;
                      }
                    }),
                    h("span", { class: "ap2-unit" }, "分钟")
                  ])
                ])
              ]),
              h("div", { class: "ap2-item" }, [
                h("div", { class: "ap2-item-main" }, [
                  h("div", { class: "ap2-item-title" }, "延迟退出"),
                  h("div", { class: "ap2-item-desc" }, "考试结束后延迟多少秒退出")
                ]),
                h("div", { class: "ap2-item-action" }, [
                  h("div", { class: "ap2-field-row" }, [
                    h("input", {
                      "data-auto-player-exit-delay": "",
                      class: "ap2-input",
                      type: "number",
                      min: 0,
                      max: 300,
                      value: state.exitDelaySeconds,
                      onInput: (event: Event) => {
                        state.exitDelaySeconds = Number((event.target as HTMLInputElement).value) || 0;
                      }
                    }),
                    h("span", { class: "ap2-unit" }, "秒")
                  ])
                ])
              ])
            ]),

            // ④-2 服务端口 —— EA 上报当前端口，ClassIsland 端自动跟随
            h("div", { class: "ap2-section" }, "服务端口"),
            h("div", { class: "ap2-card ap2-in d2" }, [
              h("div", { class: "ap2-item" }, [
                h("div", { class: "ap2-item-main" }, [
                  h("div", { class: "ap2-item-title" }, "端口自动上报"),
                  h("div", { class: "ap2-item-desc" }, "把 EA 当前 HTTP API 端口写到 auto-player-endpoint.json；ClassIsland 端打开「自动发现端口」后会自动跟随，两边不用再手工对齐。")
                ]),
                h("div", { class: "ap2-item-action" }, [
                  h("span", {
                    "data-auto-player-port-switch": "",
                    class: state.publishEndpoint ? "ap2-switch on" : "ap2-switch",
                    onClick: () => {
                      state.publishEndpoint = !state.publishEndpoint;
                      renderState();
                    }
                  })
                ])
              ]),
              h("div", { class: "ap2-item" }, [
                h("div", { class: "ap2-item-main" }, [
                  h("div", { class: "ap2-item-title" }, "EA 当前端口"),
                  h("div", { class: "ap2-item-desc" }, "宿主自己报的监听端口；EA 重启后可能变化，ClassIsland 会自动跟上")
                ]),
                h("div", { class: "ap2-item-action" }, [
                  h("span", { "data-auto-player-current-port": "", class: "ap2-mono" }, "—")
                ])
              ])
            ]),

            // ⑤ 记录与诊断 —— 空状态居中；有数据时逐行左对齐
            h("div", { class: "ap2-section" }, "记录与诊断"),
            h("div", { class: "ap2-card ap2-in d3" }, [
              h("div", { "data-auto-player-empty": "", class: "ap2-empty" }, [
                h("strong", null, "还没有收到 ClassIsland 的信号"),
                h("span", null, "打开 ClassIsland、并把当天要考的科目标记为「考试科目」后，这里会出现最近一次推送记录。")
              ]),
              h("div", { "data-auto-player-signal-row": "", class: "ap2-item", style: "display:none" }, [
                h("div", { class: "ap2-item-main" }, [
                  h("div", { class: "ap2-item-title" }, "最近一次信号"),
                  h("div", { "data-auto-player-signal": "", class: "ap2-item-desc ap2-mono" }, "")
                ])
              ]),
              h("div", { "data-auto-player-error-row": "", class: "ap2-item", style: "display:none" }, [
                h("div", { class: "ap2-item-main" }, [
                  h("div", { class: "ap2-item-title" }, "最近一次错误"),
                  h("div", { "data-auto-player-error": "", class: "ap2-item-desc" }, "")
                ])
              ]),
              h("div", { class: "ap2-item" }, [
                h("div", { class: "ap2-item-main" }, [
                  h("span", { "data-auto-player-applied": "", class: "ap2-item-desc" }, "")
                ]),
                h("div", { class: "ap2-item-action" }, [
                  h("button", { type: "button", class: "ap2-btn", onClick: selfTest }, "连通性自检")
                ])
              ])
            ]),

            // ⑥ 底部 —— 主操作居中收束
            h("div", { class: "ap2-footer" }, [
              h("button", { type: "button", class: "ap2-btn primary lg", onClick: save }, "保存设置"),
              h(
                "p",
                { class: "ap2-footer-hint" },
                "改动保存后立即生效。配合 ClassIsland 插件「ExamAware2联系人」使用：由它生成当日考试档案并推送信号。"
              )
            ]),
            h("div", { "data-auto-player-notice": "", class: "ap2-toast" }, state.notice)
          ]);
      }
    });

    ctx.scope.add(
      await ctx.api.ui.settings.registerPage({
        id: SETTINGS_PAGE_ID,
        label: "自动放映",
        icon: "play-circle",
        order: 60,
        component: () => Promise.resolve(SettingsPage)
      })
    );
  }
});
