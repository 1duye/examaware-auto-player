// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 α-氯氰菊酯 <https://github.com/1duye>
// Watermark: 1duye/examaware-auto-player#WM-2026​​‌‌​​​‌​‌‌​​‌​​​‌‌‌​‌​‌​‌‌‌‌​​‌​‌‌​​‌​‌​‌‌‌‌‌​​​‌‌​​‌​‌​‌‌‌‌​​​​‌‌​​​​‌​‌‌​‌‌​‌​‌‌​​​​‌​‌‌‌​‌‌‌​‌‌​​​​‌​‌‌‌​​‌​​‌‌​​‌​‌​​‌​‌‌​‌​‌‌​​​​‌​‌‌‌​‌​‌​‌‌‌​‌​​​‌‌​‌‌‌‌​​‌​‌‌​‌​‌‌‌​​​​​‌‌​‌‌​​​‌‌​​​​‌​‌‌‌‌​​‌​‌‌​​‌​‌​‌‌‌​​‌​​‌‌‌‌‌​​​​‌‌​​‌​​​‌‌​​​​​​‌‌​​‌​​​‌‌​‌‌​
import { defineComponent, h } from "vue";
import { defineRendererPlugin } from "@dsz-examaware/plugin-sdk";
import { WATERMARK } from "../shared/watermark";

const RENDERER_BUILD = "20261115_ui4";
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
  /* B 端设置页：左对齐页头 / 横向指标条 / 0.5px 微边框卡片 / 单一主操作 */
  '.ap2-root{--ap2-r-card:12px;--ap2-r-control:8px;--ap2-r-chip:6px;color:var(--td-text-color-primary);font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.6;max-width:880px;padding:2px 0 36px;text-align:left}',
  ".ap2-root *{box-sizing:border-box}",
  ".ap2-root :focus-visible{outline:2px solid var(--td-brand-color);outline-offset:2px}",
  '.ap2-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:2px 0 16px;border-bottom:0.5px solid var(--td-border-level-1-color)}',
  ".ap2-header-main{flex:1 1 340px;min-width:0}",
  ".ap2-title{margin:0 0 6px;font-size:20px;line-height:1.35;font-weight:600;letter-spacing:-.005em;color:var(--td-text-color-primary);text-wrap:balance}",
  ".ap2-sub{margin:0;max-width:560px;font-size:13px;line-height:1.7;color:var(--td-text-color-secondary);text-wrap:pretty}",
  ".ap2-header-side{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
  '.ap2-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:var(--ap2-r-chip);font-size:12px;font-weight:500;color:var(--td-text-color-secondary);background:var(--td-bg-color-component);border:0.5px solid var(--td-border-level-1-color);white-space:nowrap}',
  ".ap2-pill.ok{background:rgba(0,168,112,.1);background:color-mix(in srgb,var(--td-success-color,#00a870) 12%,transparent);border-color:rgba(0,168,112,.3);border-color:color-mix(in srgb,var(--td-success-color,#00a870) 32%,transparent);color:var(--td-text-color-primary)}",
  ".ap2-pill.warn{background:rgba(227,115,24,.1);background:color-mix(in srgb,var(--td-warning-color,#e37318) 12%,transparent);border-color:rgba(227,115,24,.3);border-color:color-mix(in srgb,var(--td-warning-color,#e37318) 32%,transparent);color:var(--td-text-color-primary)}",
  ".ap2-pill.err{background:rgba(227,77,89,.1);background:color-mix(in srgb,var(--td-error-color,#e34d59) 12%,transparent);border-color:rgba(227,77,89,.3);border-color:color-mix(in srgb,var(--td-error-color,#e34d59) 32%,transparent);color:var(--td-text-color-primary)}",
  ".ap2-dot{width:6px;height:6px;border-radius:50%;background:var(--td-text-color-placeholder);flex:none}",
  ".ap2-dot.ok{background:var(--td-success-color,#00a870)}",
  ".ap2-dot.err{background:var(--td-error-color,#e34d59)}",
  ".ap2-dot.warn{background:var(--td-warning-color,#e37318)}",
  ".ap2-dot.pop{animation:ap2-pop .2s cubic-bezier(.2,.8,.2,1)}",
  '.ap2-service{margin:8px 0 0;font-size:12px;line-height:1.7;color:var(--td-text-color-placeholder);font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;word-break:break-all}',
  ".ap2-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0 0}",
  ".ap2-metric{padding:13px 16px;border:0.5px solid var(--td-border-level-1-color);border-radius:var(--ap2-r-card);background:var(--td-bg-color-container);min-width:0}",
  ".ap2-metric-label{font-size:12px;line-height:1.5;color:var(--td-text-color-secondary)}",
  '.ap2-metric-value{margin-top:4px;font-size:20px;line-height:1.25;font-weight:600;letter-spacing:-.01em;color:var(--td-text-color-primary);font-variant-numeric:tabular-nums;font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;word-break:break-all}',
  ".ap2-metric-value.accent{color:var(--td-brand-color)}",
  ".ap2-section{margin:26px 0 10px;font-size:13px;font-weight:600;line-height:1.5;color:var(--td-text-color-secondary);display:flex;align-items:center;gap:8px}",
  '.ap2-section::before{content:"";width:2px;height:12px;border-radius:1px;background:var(--td-brand-color);flex:none}',
  ".ap2-card{border:0.5px solid var(--td-border-level-1-color);border-radius:var(--ap2-r-card);background:var(--td-bg-color-container);overflow:hidden}",
  ".ap2-row{display:flex;align-items:flex-start;gap:16px;padding:14px 16px}",
  ".ap2-row+.ap2-row{border-top:0.5px solid var(--td-border-level-1-color)}",
  ".ap2-row-main{flex:1 1 auto;min-width:0}",
  ".ap2-row-title{font-size:14px;font-weight:500;line-height:1.5;color:var(--td-text-color-primary)}",
  ".ap2-row-desc{margin-top:3px;font-size:12px;line-height:1.6;color:var(--td-text-color-secondary);text-wrap:pretty}",
  ".ap2-row-action{display:flex;align-items:center;gap:8px;flex:none;flex-wrap:wrap;justify-content:flex-end;padding-top:1px}",
  '.ap2-mono{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;word-break:break-all;font-variant-numeric:tabular-nums}',
  ".ap2-field{display:flex;align-items:center;gap:8px}",
  ".ap2-input{height:32px;width:88px;padding:0 10px;color:var(--td-text-color-primary);background:var(--td-bg-color-specialcomponent);border:0.5px solid var(--td-border-level-2-color);border-radius:var(--ap2-r-control);font-size:14px;line-height:1.4;font-variant-numeric:tabular-nums;outline:none;transition:border-color .15s ease,background .15s ease}",
  ".ap2-input:hover{border-color:var(--td-brand-color)}",
  ".ap2-input:focus{border-color:var(--td-brand-color);box-shadow:0 0 0 2px var(--td-brand-color-focus)}",
  ".ap2-unit{font-size:12px;line-height:1.5;color:var(--td-text-color-secondary);min-width:24px}",
  ".ap2-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 14px;border:0.5px solid var(--td-border-level-2-color);border-radius:var(--ap2-r-control);background:var(--td-bg-color-container);color:var(--td-text-color-primary);font-size:13px;font-weight:500;line-height:1.2;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .12s cubic-bezier(.2,.8,.2,1);white-space:nowrap}",
  ".ap2-btn:active{transform:scale(.98)}",
  ".ap2-btn:disabled{opacity:.5;cursor:not-allowed}",
  "@media (hover:hover) and (pointer:fine){.ap2-btn:hover{background:var(--td-bg-color-container-hover,var(--td-bg-color-component))}}",
  ".ap2-btn.primary{background:var(--td-brand-color);border-color:transparent;color:#fff}",
  "@media (hover:hover) and (pointer:fine){.ap2-btn.primary:hover{background:var(--td-brand-color);filter:brightness(1.06)}}",
  ".ap2-btn.ghost{border-color:transparent;background:transparent;color:var(--td-text-color-secondary)}",
  ".ap2-btn.danger{color:var(--td-error-color,#e34d59);border-color:rgba(227,77,89,.45);border-color:color-mix(in srgb,var(--td-error-color,#e34d59) 45%,transparent);background:transparent}",
  "@media (hover:hover) and (pointer:fine){.ap2-btn.danger:hover{background:rgba(227,77,89,.08);background:color-mix(in srgb,var(--td-error-color,#e34d59) 10%,transparent)}}",
  ".ap2-switch{position:relative;display:inline-flex;align-items:center;width:40px;height:22px;border-radius:999px;background:var(--td-bg-color-component);border:0.5px solid var(--td-border-level-2-color);cursor:pointer;transition:background .18s ease,border-color .18s ease;flex:none}",
  '.ap2-switch::after{content:"";position:absolute;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .18s cubic-bezier(.2,.8,.2,1)}',
  ".ap2-switch.on{background:var(--td-brand-color);border-color:transparent}",
  ".ap2-switch.on::after{transform:translateX(18px)}",
  ".ap2-empty{padding:22px 16px;border-radius:var(--ap2-r-card);color:var(--td-text-color-placeholder);font-size:13px;line-height:1.7}",
  ".ap2-empty strong{display:block;margin-bottom:2px;font-weight:500;color:var(--td-text-color-secondary)}",
  ".ap2-hint{margin:22px 0 0;font-size:12px;line-height:1.7;color:var(--td-text-color-placeholder);text-wrap:pretty}",
  '.ap2-hint code{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:12px}',
  '.ap2-toast{position:fixed;right:24px;top:24px;max-width:320px;padding:10px 14px 10px 16px;border-radius:var(--ap2-r-control);background:var(--td-bg-color-container);border:0.5px solid var(--td-border-level-1-color);box-shadow:0 8px 24px rgba(0,0,0,.14);color:var(--td-text-color-primary);font-size:13px;line-height:1.6;opacity:0;transform:translateY(-6px);transition:transform .2s cubic-bezier(.2,.8,.2,1),opacity .18s ease;pointer-events:none;z-index:2147483000}',
  '.ap2-toast::before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:2px;border-radius:1px;background:var(--td-success-color,#00a870)}',
  ".ap2-toast.err::before{background:var(--td-error-color,#e34d59)}",
  ".ap2-toast.show{opacity:1;transform:none}",
  ".ap2-in{opacity:0;transform:translateY(6px);animation:ap2-in .18s cubic-bezier(.2,.8,.2,1) forwards}",
  ".ap2-in.d2{animation-delay:.04s}",
  ".ap2-in.d3{animation-delay:.08s}",
  "@keyframes ap2-in{to{opacity:1;transform:none}}",
  "@keyframes ap2-pop{0%{transform:scale(.4)}60%{transform:scale(1.25)}100%{transform:scale(1)}}",
  ".ap2-flash{animation:ap2-flash .18s cubic-bezier(.2,.8,.2,1)}",
  "@keyframes ap2-flash{from{opacity:.4}to{opacity:1}}",
  "@media (prefers-reduced-motion:reduce){.ap2-in,.ap2-flash,.ap2-dot.pop{animation:none;opacity:1;transform:none}.ap2-btn,.ap2-toast{transition:none}}",
  "@media (max-width:720px){.ap2-metrics{grid-template-columns:1fr}.ap2-row{flex-wrap:wrap}.ap2-row-action{width:100%;justify-content:flex-start}}"
].join("\n");

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
          watermark: WATERMARK,
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

          const pill = root.querySelector("[data-auto-player-pill]");
          if (pill) {
            pill.classList.toggle("ok", state.connected && !state.lastError);
            pill.classList.toggle("warn", state.connected && Boolean(state.lastError));
            pill.classList.toggle("err", !state.connected);
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
          if (portSwitch) {
            portSwitch.classList.toggle("on", state.publishEndpoint);
            portSwitch.setAttribute("aria-checked", String(state.publishEndpoint));
          }

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

          setText("[data-auto-player-watermark]", state.watermark || "—");

          setText("[data-auto-player-applied]",
            `生效配置：${state.appliedEnabled ? "自动放映已开启" : "自动放映已暂停"} · 提前 ${state.appliedAdvanceMinutes} 分钟 · 延迟 ${state.appliedExitDelaySeconds} 秒`);

          const sw = root.querySelector("[data-auto-player-switch]");
          if (sw) {
            sw.classList.toggle("on", state.enabled);
            sw.setAttribute("aria-checked", String(state.enabled));
          }

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

            state.watermark = payload?.watermark || WATERMARK;
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
              // 打上「自家设置页」标记：EA 端据此放行，否则它会把带 Origin 的浏览器请求挡掉
              headers: { "x-auto-player-client": "ui" },
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

        const onVisibilityChange = () => {
          if (!document.hidden) void load();
        };
        document.addEventListener("visibilitychange", onVisibilityChange);
        void load();
        // 设置页只是开着的标签页之一，隐藏时不必每秒发请求；2 秒一次已经够实时
        pollTimer = setInterval(() => {
          if (!document.hidden) void load();
        }, 2000);
        ctx.scope.add({
          dispose: () => {
            clearInterval(pollTimer);
            clearTimeout(noticeTimer);
            document.removeEventListener("visibilitychange", onVisibilityChange);
          }
        });

        return () =>
          h("section", { "data-auto-player-root": "", class: "ap2-root" }, [
            /* ① 页头：左对齐标题与说明，右侧状态徽标 + 全页唯一主操作 */
            h("header", { class: "ap2-header ap2-in" }, [
              h("div", { class: "ap2-header-main" }, [
                h("h2", { class: "ap2-title" }, "自动放映"),
                h(
                  "p",
                  { class: "ap2-sub" },
                  "接收 ClassIsland 推送的考试安排，考前自动进入全屏放映，考完自动退出。"
                )
              ]),
              h("div", { class: "ap2-header-side" }, [
                h("span", { "data-auto-player-pill": "", class: "ap2-pill" }, [
                  h("span", { "data-auto-player-dot": "", class: "ap2-dot err" }),
                  h("span", { "data-auto-player-pill-text": "" }, "服务离线")
                ]),
                h("button", { type: "button", class: "ap2-btn primary", onClick: save }, "保存设置")
              ])
            ]),
            h("div", { "data-auto-player-service-url": "", class: "ap2-service", style: "display:none" }, ""),

            /* ② 指标条：三段等宽，全部左对齐，数字锁等宽防抖 */
            h("div", { class: "ap2-metrics ap2-in d2" }, [
              h("div", { class: "ap2-metric" }, [
                h("div", { class: "ap2-metric-label" }, "放映状态"),
                h(
                  "div",
                  { "data-auto-player-status": "", class: "ap2-metric-value", role: "status", "aria-live": "polite" },
                  state.status
                )
              ]),
              h("div", { class: "ap2-metric" }, [
                h("div", { class: "ap2-metric-label" }, "距下一场"),
                h(
                  "div",
                  { "data-auto-player-countdown": "", class: "ap2-metric-value accent", role: "status", "aria-live": "polite" },
                  state.countdown
                )
              ]),
              h("div", { class: "ap2-metric" }, [
                h("div", { class: "ap2-metric-label" }, "EA 当前端口"),
                h("div", { "data-auto-player-current-port": "", class: "ap2-metric-value" }, "—")
              ])
            ]),

            /* ③ 当前场次：有场次才出现，破坏性操作只用描边不填色 */
            h("div", { "data-auto-player-task-section": "", style: "display:none" }, [
              h("div", { class: "ap2-section" }, "当前场次"),
              h("div", { class: "ap2-card" }, [
                h("div", { class: "ap2-row" }, [
                  h("div", { class: "ap2-row-main" }, [
                    h("div", { "data-auto-player-task-title": "", class: "ap2-row-title" }, ""),
                    h("div", { "data-auto-player-task-range": "", class: "ap2-row-desc ap2-mono" }, ""),
                    h("div", { "data-auto-player-task-meta": "", class: "ap2-row-desc" }, "")
                  ]),
                  h("div", { class: "ap2-row-action" }, [
                    h("button", { type: "button", class: "ap2-btn danger", onClick: stopNow }, "立即停止放映")
                  ])
                ])
              ])
            ]),

            /* ④ 放映设置 */
            h("div", { class: "ap2-section" }, "放映设置"),
            h("div", { class: "ap2-card ap2-in d2" }, [
              h("div", { class: "ap2-row" }, [
                h("div", { class: "ap2-row-main" }, [
                  h("div", { class: "ap2-row-title" }, "自动放映"),
                  h("div", { class: "ap2-row-desc" }, "临时暂停自动放映，不影响接收信号")
                ]),
                h("div", { class: "ap2-row-action" }, [
                  h("span", {
                    "data-auto-player-switch": "",
                    class: state.enabled ? "ap2-switch on" : "ap2-switch",
                    role: "switch",
                    tabindex: 0,
                    "aria-checked": String(state.enabled),
                    "aria-label": "自动放映",
                    onKeydown: (event: KeyboardEvent) => {
                      if (event.key !== " " && event.key !== "Enter") return;
                      event.preventDefault();
                      state.enabled = !state.enabled;
                      renderState();
                    },
                    onClick: () => {
                      state.enabled = !state.enabled;
                      renderState();
                    }
                  })
                ])
              ]),
              h("div", { class: "ap2-row" }, [
                h("div", { class: "ap2-row-main" }, [
                  h("div", { class: "ap2-row-title" }, "提前启动"),
                  h("div", { class: "ap2-row-desc" }, "考试开始前多少分钟进入放映")
                ]),
                h("div", { class: "ap2-row-action" }, [
                  h("div", { class: "ap2-field" }, [
                    h("input", {
                      "data-auto-player-advance": "",
                      class: "ap2-input",
                      type: "number",
                      min: 0,
                      max: 60,
                      value: state.advanceMinutes,
                      "aria-label": "提前启动分钟数",
                      onInput: (event: Event) => {
                        state.advanceMinutes = Number((event.target as HTMLInputElement).value) || 0;
                      }
                    }),
                    h("span", { class: "ap2-unit" }, "分钟")
                  ])
                ])
              ]),
              h("div", { class: "ap2-row" }, [
                h("div", { class: "ap2-row-main" }, [
                  h("div", { class: "ap2-row-title" }, "延迟退出"),
                  h("div", { class: "ap2-row-desc" }, "考试结束后延迟多少秒退出")
                ]),
                h("div", { class: "ap2-row-action" }, [
                  h("div", { class: "ap2-field" }, [
                    h("input", {
                      "data-auto-player-exit-delay": "",
                      class: "ap2-input",
                      type: "number",
                      min: 0,
                      max: 300,
                      value: state.exitDelaySeconds,
                      "aria-label": "延迟退出秒数",
                      onInput: (event: Event) => {
                        state.exitDelaySeconds = Number((event.target as HTMLInputElement).value) || 0;
                      }
                    }),
                    h("span", { class: "ap2-unit" }, "秒")
                  ])
                ])
              ])
            ]),

            /* ⑤ 服务端口：宿主端口会飘，这里只说怎么跟上，端口数值已上移到指标条 */
            h("div", { class: "ap2-section" }, "服务端口"),
            h("div", { class: "ap2-card ap2-in d2" }, [
              h("div", { class: "ap2-row" }, [
                h("div", { class: "ap2-row-main" }, [
                  h("div", { class: "ap2-row-title" }, "端口自动上报"),
                  h(
                    "div",
                    { class: "ap2-row-desc" },
                    "把 EA 当前 HTTP API 端口写到 auto-player-endpoint.json；ClassIsland 端打开「自动发现端口」后自动跟随，两边不用再手工对齐。"
                  )
                ]),
                h("div", { class: "ap2-row-action" }, [
                  h("span", {
                    "data-auto-player-port-switch": "",
                    class: state.publishEndpoint ? "ap2-switch on" : "ap2-switch",
                    role: "switch",
                    tabindex: 0,
                    "aria-checked": String(state.publishEndpoint),
                    "aria-label": "端口自动上报",
                    onKeydown: (event: KeyboardEvent) => {
                      if (event.key !== " " && event.key !== "Enter") return;
                      event.preventDefault();
                      state.publishEndpoint = !state.publishEndpoint;
                      renderState();
                    },
                    onClick: () => {
                      state.publishEndpoint = !state.publishEndpoint;
                      renderState();
                    }
                  })
                ])
              ])
            ]),

            /* ⑥ 记录与诊断：空态左对齐；有数据时逐行展开 */
            h("div", { class: "ap2-section" }, "记录与诊断"),
            h("div", { class: "ap2-card ap2-in d3" }, [
              h("div", { "data-auto-player-empty": "", class: "ap2-empty" }, [
                h("strong", null, "还没有收到 ClassIsland 的信号"),
                h("span", null, "打开 ClassIsland、并把当天要考的科目标记为「考试科目」后，这里会出现最近一次推送记录。")
              ]),
              h("div", { "data-auto-player-signal-row": "", class: "ap2-row", style: "display:none" }, [
                h("div", { class: "ap2-row-main" }, [
                  h("div", { class: "ap2-row-title" }, "最近一次信号"),
                  h("div", { "data-auto-player-signal": "", class: "ap2-row-desc ap2-mono" }, "")
                ])
              ]),
              h("div", { "data-auto-player-error-row": "", class: "ap2-row", style: "display:none" }, [
                h("div", { class: "ap2-row-main" }, [
                  h("div", { class: "ap2-row-title" }, "最近一次错误"),
                  h("div", { "data-auto-player-error": "", class: "ap2-row-desc" }, "")
                ])
              ]),
              h("div", { class: "ap2-row" }, [
                h("div", { class: "ap2-row-main" }, [
                  h("div", { class: "ap2-row-title" }, "构建水印"),
                  h("div", { "data-auto-player-watermark": "", class: "ap2-row-desc ap2-mono" }, "—")
                ])
              ]),
              h("div", { class: "ap2-row" }, [
                h("div", { class: "ap2-row-main" }, [
                  h("div", { class: "ap2-row-title" }, "生效配置"),
                  h("div", { "data-auto-player-applied": "", class: "ap2-row-desc" }, "")
                ]),
                h("div", { class: "ap2-row-action" }, [
                  h("button", { type: "button", class: "ap2-btn", onClick: selfTest }, "连通性自检")
                ])
              ])
            ]),

            /* ⑦ 页脚只放说明，主操作已在页头 */
            h(
              "p",
              { class: "ap2-hint" },
              "改动保存后立即生效。配合 ClassIsland 插件「ExamAware2联系人」使用：由它生成当日考试档案并推送信号。"
            ),
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
