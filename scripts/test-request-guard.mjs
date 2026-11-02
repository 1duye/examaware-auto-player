#!/usr/bin/env node
// 安全边界单测：浏览器来源拦截 + .ea2 路径校验。
// 跑法：pnpm test（等价于 node scripts/test-request-guard.mjs）
import { isBrowserRequest, normalizeEa2Path } from "../src/shared/request-guard.ts";

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  if (actual === expected) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`✗ ${name}\n    期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

const h = (entries) => Object.fromEntries(entries);

// —— isBrowserRequest ——

// ClassIsland 的 HttpClient：没有 Origin，application/json
check(
  "CI 原生客户端放行",
  isBrowserRequest(h([["content-type", "application/json; charset=utf-8"]])),
  false
);
check("无任何头（curl / 宿主 RPC）放行", isBrowserRequest({}), false);
check("自家设置页标记放行", isBrowserRequest(h([["x-auto-player-client", "ui"], ["origin", "http://127.0.0.1:14100"]])), false);
check("大小写不敏感的客户端标记", isBrowserRequest(h([["X-Auto-Player-Client", "UI"]])), false);
check("带 Origin 拦截", isBrowserRequest(h([["origin", "https://evil.example"]])), true);
check("跨站 Sec-Fetch-Site 拦截", isBrowserRequest(h([["sec-fetch-site", "cross-site"]])), true);
check("同站 Sec-Fetch-Site 拦截", isBrowserRequest(h([["sec-fetch-site", "same-site"]])), true);
check("表单 Content-Type 拦截", isBrowserRequest(h([["content-type", "application/x-www-form-urlencoded"]])), true);
check("纯文本 Content-Type 拦截", isBrowserRequest(h([["content-type", "text/plain"]])), true);
check("同源 Sec-Fetch-Site 放行", isBrowserRequest(h([["sec-fetch-site", "same-origin"]])), false);
check("多值头取第一个", isBrowserRequest(h([["origin", ["https://evil.example", "https://ok.example"]]])), true);
check("纯空格的 Origin 视为无", isBrowserRequest(h([["origin", "   "]])), false);

// —— normalizeEa2Path ——

check("绝对 .ea2 通过", normalizeEa2Path("C:\\Users\\hong\\data\\EA2\\考试记录_20261102.ea2"), "C:\\Users\\hong\\data\\EA2\\考试记录_20261102.ea2");
check("大小写扩展名通过", normalizeEa2Path("C:\\x\\A.EA2"), "C:\\x\\A.EA2");
check("前后空格被裁掉", normalizeEa2Path("  C:\\x\\a.ea2  "), "C:\\x\\a.ea2");
check("相对路径拒绝", normalizeEa2Path("data/EA2/a.ea2"), null);
check("非 .ea2 拒绝", normalizeEa2Path("C:\\x\\a.json"), null);
check("没有扩展名拒绝", normalizeEa2Path("C:\\x\\a"), null);
check("空串拒绝", normalizeEa2Path("   "), null);
check("非字符串拒绝", normalizeEa2Path(42), null);
check("null 拒绝", normalizeEa2Path(null), null);
check("前缀伪装 .ea2 拒绝", normalizeEa2Path("C:\\x\\a.ea2.exe"), null);

console.log(`\n${passed} 通过，${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
