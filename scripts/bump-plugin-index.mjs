#!/usr/bin/env node
// 把 ExamAware 插件源（ExamAware/PluginIndex）里的 auto-player 条目顶到新版本。
//
// 索引里的版本号只有一个来源：npm 上真实发布过的版本。所以本脚本先确认 npm 上
// 已经存在目标版本，再去改 PluginIndex 的 index/plugins/auto-player.yml —— 只改
// latestVersion 与 versions 里的版本行，dist（integrity/shasum/tarball）由 PluginIndex
// 的 CI（tools/fetch_npm.py）从 npm 拉取，不要手写。
//
// 用法：
//   node scripts/bump-plugin-index.mjs --repo ../PluginIndex            # 本地已 clone 的索引仓库
//   node scripts/bump-plugin-index.mjs --repo ../PluginIndex --version 0.2.3
//   node scripts/bump-plugin-index.mjs --repo ../PluginIndex --pr       # 改完直接推送分支并开 PR
//   node scripts/bump-plugin-index.mjs --dry-run                        # 只看会改什么
//
// 退出码：0 = 已就绪（或已改好），1 = npm 上没有该版本，2 = 参数/环境问题。

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const PKG = "examaware-auto-player";
const ENTRY = join("index", "plugins", "auto-player.yml");
const NPM_REGISTRY = "https://registry.npmjs.org";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name, fallback = undefined) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const dryRun = flag("--dry-run");
const openPr = flag("--pr");

const localPkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const version = option("--version", localPkg.version);
const repo = resolve(option("--repo", join(process.cwd(), "..", "PluginIndex")));
const branch = option("--branch", `chore/auto-player-${version}`);
// fork 的仓库名可能被 GitHub 加了后缀（如 PluginIndex-1），PR 的 head 要带所有者
const forkOwner = option("--fork-owner", "1duye");

const fail = (code, message) => {
  console.error(`✗ ${message}`);
  process.exit(code);
};

const sortVersions = (list) =>
  list.slice().sort((a, b) => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i += 1) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  });

const main = async () => {
  // ① npm 上必须真有这个版本，否则索引写了也没东西可装
  const url = `${NPM_REGISTRY}/${PKG}`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) fail(1, `npm 读取 ${PKG} 失败：HTTP ${response.status}`);
  const meta = await response.json();
  const published = Object.keys(meta.versions || {});
  if (!published.includes(version)) {
    fail(
      1,
      `npm 上没有 ${PKG}@${version}（已有：${sortVersions(published).join(", ") || "无"}）。\n  先 npm publish，再跑本脚本。`
    );
  }
  const info = meta.versions[version];
  console.log(`✓ npm 已有 ${PKG}@${version} · tarball ${info.dist?.tarball ?? "(未提供)"}`);

  // ② 定位索引仓库与条目
  if (!existsSync(repo)) fail(2, `找不到索引仓库：${repo}（用 --repo 指定已 clone 的 ExamAware/PluginIndex）`);
  const entryPath = join(repo, ENTRY);
  if (!existsSync(entryPath)) fail(2, `索引仓库里没有 ${ENTRY}`);

  const text = readFileSync(entryPath, "utf8");
  const lines = text.split(/\r?\n/);
  const latestIdx = lines.findIndex((l) => /^latestVersion:/.test(l));
  if (latestIdx < 0) fail(2, `${ENTRY} 里没有 latestVersion 字段`);

  const current = lines[latestIdx].split(":")[1]?.trim();
  if (current === version) {
    console.log(`= 索引已经是 ${version}，无需改动`);
    return;
  }

  // ③ 只有 latestVersion 需要改；版本明细与 dist 由 PluginIndex CI 生成
  lines[latestIdx] = `latestVersion: ${version}`;
  const next = lines.join("\n");

  if (dryRun) {
    console.log(`[dry-run] ${ENTRY}: latestVersion ${current} -> ${version}`);
    return;
  }

  writeFileSync(entryPath, next, "utf8");
  console.log(`✓ 已更新 ${ENTRY}: latestVersion ${current} -> ${version}`);

  if (!openPr) {
    console.log("下一步：在该仓库里 git checkout -b、提交、推送并开 PR；或加 --pr 让脚本代劳。");
    return;
  }

  const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "inherit" });
  // 分支可能已经建好（重跑本脚本时），能切就切，别再 -b 报错
  try {
    git("checkout", "-b", branch);
  } catch {
    git("checkout", branch);
  }
  git("add", ENTRY);
  git("commit", "-m", `chore(auto-player): bump to ${version}`);
  git("push", "-u", "origin", branch);
  execFileSync(
    "gh",
    [
      "pr",
      "create",
      "--repo",
      "ExamAware/PluginIndex",
      "--base",
      "main",
      "--head",
      `${forkOwner}:${branch}`,
      "--title",
      `chore(auto-player): bump to ${version}`,
      "--body",
      `自动放映 ${version} 已发布到 npm（${url}）。本 PR 只把 latestVersion 顶到新版本，dist 元数据由 CI 的 tools/fetch_npm.py 从 npm 拉取。\n\n对应 Release：https://github.com/1duye/examaware-auto-player/releases/tag/v${version}`
    ],
    { cwd: repo, stdio: "inherit" }
  );
};

main().catch((error) => fail(2, error?.message || String(error)));
