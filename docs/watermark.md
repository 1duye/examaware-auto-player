# 代码水印

两个插件（这个仓库和 `ClassIsland.ExamRecorderPlugin`）的源码都埋了同一套水印。目的只有一个：**代码被整体搬走时，能对上是哪来的**。它不限制谁用——许可各自照旧（这个仓库 GPL-3.0-only，ClassIsland 端 MIT）。

## 三层

| 层 | 位置 | 特点 |
| --- | --- | --- |
| ① 明水印 | 每个源文件开头三行：SPDX / 版权 / `Watermark: ...` | 人眼可见，删掉很显眼，改起来也麻烦 |
| ② 暗水印 | 第③行末尾的一串零宽字符 | 不可见，复制粘贴跟着走，普通编辑器不会清掉 |
| ③ 运行时指纹 | `src/shared/watermark.ts` 的 `WATERMARK`，打进 `dist/`，并由 `GET /ping` 的 `watermark` 字段回显 | 源码被改写也行，跑起来的插件仍然自报来源 |

设置页「记录与诊断」里的「构建水印」那行显示的就是第③层的值。

## 暗水印怎么编的

明文：`1duye|examaware-auto-player|2026`

1. 按 UTF-8 取字节；
2. 每个字节从高位到低位展开成 8 位；
3. 0 → `U+200B`（零宽空格），1 → `U+200C`（零宽连字符）；
4. 整串拼在明水印行末尾。

所以那行在编辑器里看着是空的，实际有 256 个不可见字符。解码就是反过来做一遍，`scripts/verify-watermark.mjs` 干这个：

```bash
node scripts/verify-watermark.mjs src/main/index.ts
# 1duye|examaware-auto-player|2026
```

## 维护约定

- 新增源文件时，把 `src/shared/watermark.ts` 开头那三行抄过去（第③行的零宽串直接从旧文件复制，别手打）。
- 别用会"清理不可见字符"的工具批量格式化源码；真要格式化，事后跑一次 `verify-watermark.mjs` 确认还在。
- 水印与构建无关，不影响产物体积之外的任何东西；CI 端对应的是 `AssemblyMetadata("Watermark")` 与启动日志。
