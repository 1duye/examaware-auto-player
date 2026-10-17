# Bug：v1.5.2 下插件注册的设置页在侧边栏可见，点开却整块空白

| 项 | 值 |
| --- | --- |
| 宿主版本 | ExamAware Desktop v1.5.2（resources/app.asar 构建于 2026-08-19 20:32） |
| 平台 | Windows 11 / x64 |
| 涉及插件 | @examaware-plugins/auto-player（API v2，renderer 入口注册一个 settings 页） |
| 严重程度 | 阻断：插件设置页完全不可用，且宿主侧没有任何可见提示 |

## 1. 现象

插件主进程加载正常，渲染入口也执行了（证据见第 3 节），设置窗口中该插件的侧边栏入口正常出现；但点开该入口后，右侧内容区是**整块空白**（纯背景色，无报错、无 loading、无骨架）。

## 2. 复现步骤

1. 安装 ExamAware Desktop v1.5.2（app.asar 为 2026-08-19 构建）。
2. 安装一个 API v2 插件，满足：
   - `examaware.apiVersion = 2`；
   - `examaware.targets.renderer` 指向导出 `defineRendererPlugin`（`apiVersion: 2`, `process: "renderer"`）的 ESM；
   - `examaware.activation.rendererWindows` 包含 `"settings"`；
   - renderer 入口里调用 `ctx.api.ui.settings.registerPage({ id, label, icon, order, component })` 注册一个设置页。
3. 重启 EA → 打开 设置：侧边栏能看到该插件注册的页面（label 为插件自定义名称）。
4. 点击它 → 内容区整块空白。

参考插件：`@examaware-plugins/auto-player`，注册的页面 label 为「自动放映」。

## 3. 已经确认的事实

1. **主进程侧完全正常**（`%AppData%\@dsz-examaware\desktop\logs\examaware-2026-10-14.log`）：

   ~~~
   [PluginLoader] import format=cjs path=...\plugins\auto-player-0.2.0\dist\main\index.cjs exists=true
   [PluginHost] [@examaware-plugins/auto-player] auto-player API v2 ready build=...
   [PluginHost] [PluginHost] Loaded plugin @examaware-plugins/auto-player
   ~~~

2. **渲染入口确实执行过**：侧边栏的「自动放映」入口只可能由插件在渲染层调用 `ctx.api.ui.settings.registerPage(...)` 注册（该插件的 renderer 产物里只有这一处 `registerPage` 调用，没有其它注册途径）。入口能出现，说明 renderer 入口已被加载并执行。

3. **入口契约合法**：直接 `import()` 部署目录里的 renderer 产物，其默认导出为 `apiVersion = 2`、`process = "renderer"` 的工厂，满足宿主 `loadRendererPlugin` 里对 API v2 的校验。

4. **四个加载门槛都满足**：该插件 `enabled` 为真（`plugins.json` 未列出该插件时按 manifest 默认值 true）、状态为 `active`、`hasRendererEntry` 为真、`activation.rendererWindows` 为 `["settings"]`，而设置窗口的 window kind 按 `getCurrentPluginWindowKind()` 也是 `settings`。

5. **已排除「宿主缺少 desktopApi 延迟初始化处理」**：v1.5.2 的渲染包里 `desktopPluginHost` 存在等价的 `desktopApiRef` + `attachDesktopApi(api) → 重新同步` 逻辑（`attachDesktopApi` 会写回引用并触发一次渲染层插件重扫），因此不是「宿主完全没有重试机制」。

## 4. 日志侧对比

插件自己的设置页在正常渲染时每秒轮询插件 HTTP 路由 `/ping`，因此日志里 `/ping` 的命中数可以直接反映「设置页有没有渲染出来」：

| 日志日期 | 宿主版本 | 该日部署的插件 | `/ping` 命中 |
| --- | --- | --- | --- |
| 2026-07-31 | v1.4.4 | auto-player v2.4 | 3948 |
| 2026-08-01 | v1.4.4 | auto-player v2.7 | 2632 |
| 2026-08-31 | v1.5.2 | auto-player v2.9 | 3 |
| 2026-10-14 | v1.5.2 | auto-player 0.2.0 | 1 |

（每秒轮询会产生上千条命中，8/31 与 10/14 的个位数命中是手工请求，即设置页从未渲染成功。）注意这里宿主与插件版本同时变化，因此该表只能说明「v1.5.2 下插件设置页确实没有渲染」，不足以单独断定回归点在宿主侧。

作为对照：官方插件 `@dsz-examaware/ringtone-factory`（`activation.rendererWindows: ["main", "plugin"]`，自己 `windows.open` 打开独立窗口）在 v1.5.2 下正常，2026-08-31 的日志里有它的插件窗口 `plugin:@dsz-examaware/ringtone-factory:ringtone-factory` 正常出现。

## 5. 目前还缺的关键信息

因为是「页面注册成功但内容不渲染」，问题大概率出在宿主渲染插件注册的那个 `component` 这一步（组件未被挂载/渲染时抛错被吞掉/跨 Vue 实例互操作）。需要渲染进程的 Console 才能定论：

- 设置窗口中是否有 `[DesktopPluginHost] ...` 或 Vue 的渲染错误；
- `window.api.plugins.list()` 中该插件的 `enabled / status / hasRendererEntry / rendererWindows` 实际取值；
- 切换到这个设置页时，注册的 `component()` 是否被调用、是否抛错。

如果有需要，我可以配合提供最小复现工程或直接贴 Console 截图。

## 6. 顺带反馈：@dsz-examaware/plugin-sdk 的依赖声明

已发布的 `@dsz-examaware/plugin-sdk@1.5.2` 的 `package.json`：

~~~json
"dependencies": {
  "@dsz-examaware/core": "workspace:*",
  "@dsz-examaware/rpc": "workspace:*",
  "archiver": "^7.0.1",
  "tar": "^7.4.3"
}
~~~

`workspace:*` 在发布到注册表后无法被外部项目解析，外部 `pnpm install` 会直接失败（目前只能在插件项目里用 `pnpm-workspace.yaml` 的 `overrides` 绕过）。建议发布时替换为具体版本号。

---

以上日志、源码片段与产物均取自 2026-08-19 构建的官方 `resources/app.asar` 与本机部署目录。
