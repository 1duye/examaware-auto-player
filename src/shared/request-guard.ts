// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 α-氯氰菊酯 <https://github.com/1duye>
// Watermark: 1duye/examaware-auto-player#WM-2026​​‌‌​​​‌​‌‌​​‌​​​‌‌‌​‌​‌​‌‌‌‌​​‌​‌‌​​‌​‌​‌‌‌‌‌​​​‌‌​​‌​‌​‌‌‌‌​​​​‌‌​​​​‌​‌‌​‌‌​‌​‌‌​​​​‌​‌‌‌​‌‌‌​‌‌​​​​‌​‌‌‌​​‌​​‌‌​​‌​‌​​‌​‌‌​‌​‌‌​​​​‌​‌‌‌​‌​‌​‌‌‌​‌​​​‌‌​‌‌‌‌​​‌​‌‌​‌​‌‌‌​​​​​‌‌​‌‌​​​‌‌​​​​‌​‌‌‌‌​​‌​‌‌​​‌​‌​‌‌‌​​‌​​‌‌‌‌‌​​​​‌‌​​‌​​​‌‌​​​​​​‌‌​​‌​​​‌‌​‌‌​

import { isAbsolute } from "node:path";

/**
 * 本机 HTTP API 的来路判定与入参校验。
 *
 * 单独放一个模块，一是因为它是安全边界、值得被单测覆盖，
 * 二是因为 main 的 bundle 里不该混着一段没法测的内联逻辑。
 */
export type RequestHeaders = Readonly<Record<string, string | string[]>>;

export function readHeader(headers: RequestHeaders, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/**
 * 是否来自浏览器的跨源请求。
 *
 * 本机 API 没有鉴权，而浏览器对「简单请求」不会先握手：任意网页 POST 一下，
 * 服务端就会真的执行——等于任何网站都能把教室拉进 kiosk 全屏。
 * 浏览器一定带 Origin / Sec-Fetch-Site；原生客户端（ClassIsland 的 HttpClient）
 * 不带。自家设置页走宿主网络层并显式带 x-auto-player-client: ui。
 */
export function isBrowserRequest(headers: RequestHeaders): boolean {
  if (readHeader(headers, "x-auto-player-client").trim().toLowerCase() === "ui") return false;
  if (readHeader(headers, "origin").trim()) return true;
  const site = readHeader(headers, "sec-fetch-site").trim().toLowerCase();
  if (site === "cross-site" || site === "same-site") return true;
  const contentType = readHeader(headers, "content-type").trim().toLowerCase();
  return Boolean(contentType) && !contentType.startsWith("application/json");
}

/** 只接受绝对路径的 .ea2 文件，避免把任意路径塞进播放器。 */
export function normalizeEa2Path(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || !/\.ea2$/i.test(value) || !isAbsolute(value)) return null;
  return value;
}
