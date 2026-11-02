#!/usr/bin/env node
// 校验源码里的零宽水印：把 U+200B/U+200C 还原成原始明文。
// 用法：node scripts/verify-watermark.mjs <file...>
import { readFileSync } from "node:fs";

const ZERO = "\u200B";
const ONE = "\u200C";

export function decode(text) {
  const bits = [...text].filter((ch) => ch === ZERO || ch === ONE).map((ch) => (ch === ONE ? "1" : "0"));
  const usable = bits.length - (bits.length % 8);
  const bytes = [];
  for (let i = 0; i < usable; i += 8) bytes.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  return Buffer.from(bytes).toString("utf8");
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/verify-watermark.mjs <file...>");
  process.exit(2);
}

let missing = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const payload = decode(text);
  if (!payload) {
    console.error(`✗ ${file}：没有找到零宽水印`);
    missing += 1;
    continue;
  }
  console.log(`✓ ${file}：${payload}`);
}
process.exit(missing === 0 ? 0 : 1);
