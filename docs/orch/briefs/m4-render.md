# M4 · Markdown 渲染（`src/render.ts`）

## 目标

把 Markdown 渲染成文章块 HTML：CommonMark + GFM + 代码高亮，且**不产生任何字面色值**。

## 必须读

- `docs/orch/CONTRACT.md` —— §2 不变量（**N2 直接管本模块**）、§3 的 `src/render.ts` 小节
- `src/types.ts` —— `Theme` / `Options` / `BlockTag`
- `src/syntax-map.ts` —— 高亮变量名来源

## 交付物

### 1. `src/render.ts`

```ts
export function renderMarkdown(
  markdown: string,
  theme: Theme,
  options: Options,
): Promise<string>;
```

返回**完整根元素**：`<{options.tag} class="mdblock" data-theme="{theme.id}">…</{tag}>`。

要点：

- 用 `markdown-it` + `markdown-it-task-lists`，开 `linkify`、GFM 表格与删除线。
- 高亮用 **`createCssVariablesTheme()`**。已核实本机 `shiki@4.4.3` 从
  `@shikijs/core` 导出 `createCssVariablesTheme`，且 `shiki` 主入口 `export * from "@shikijs/core"`，
  所以 `import { createCssVariablesTheme } from "shiki"` 可用；变量前缀默认 `--shiki-`，
  正是 `src/syntax-map.ts` 假设的那套。
- **N2 是硬要求**：输出的 HTML 里除了 `var(--shiki-*)` 之外**不能有任何字面颜色**。
  为此主题必须是 `createCssVariablesTheme()` 的产物，**不能**用 `theme.colors.*` 去算颜色，
  也不能用任何内置主题（`nord` / `catppuccin-*` 之类）。
- 代码块结构固定：`<pre class="mdblock-code"><code class="language-<lang>">…</code></pre>`。
  `<pre>` 上的内联 `background-color: var(--shiki-background)` 允许存在（它是变量引用）；
  如果你能让 Shiki 不写这行内联样式，也可以。
- 未标语言的围栏块按纯文本渲染，仍要带上面的结构与类名。
- 语言按需加载，未知语言降级为纯文本而不是抛错。`lang` 属性要经过白名单/校验，
  不能把任意字符串拼进 HTML 或当模块名 import。
- 记得 HTML 转义（标题、文本、链接、图片 alt 等）。

**已知矛盾，你需要自己解决**：`markdown-it` 的 `highlight` 回调是**同步**的，而 Shiki 是
**异步**的。怎么调和由你设计（常见做法是两遍：第一遍用占位符收集代码块，第二遍异步高亮
后替换）。不要为了绕过它而改 `renderMarkdown` 的签名 —— 签名是冻结的。

### 2. `test/render.test.ts`

用 `bun test`。自己造 fixture `Theme` 与 `Options`（**不要 import `src/theme.ts` 或
`src/options.ts`**）。

至少覆盖：

- 根元素：`options.tag` 生效、`class="mdblock"`、`data-theme` 等于 `theme.id`
- **输出里不含字面色值**：用正则
  `/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/` 扫全文，必须为空
- 输出里含 `var(--shiki-token-keyword)`（拿一段带关键字的 JS/TS 代码验证）
- 未标语言的围栏块 → 有 `<pre class="mdblock-code">` 且不抛错
- 未知语言（` ```notalang `）→ 降级为纯文本，不抛错
- GFM：表格渲染成 `<table>`；任务列表渲染出复选框；`~~删除线~~` 渲染成 `<s>` 或 `<del>`
- 自动链接：裸 URL 变成 `<a>`
- HTML 转义：`<script>` 出现在正文里被转义
- 标题 id 或至少 h1–h6 正确映射

## 边界

不要修改冻结文件；不要 import 还没写的模块；不要写 `css.ts` / `cli.ts`。
你产出的 HTML 只负责引用 `var(--shiki-*)`，**定义**这些变量是 `css.ts` 的事。

## 控制方会怎么独立验收

读实现；用自己的 fixture 跑上面的断言；重点两件事：
(a) 用正则扫真实输出确认零字面色值；
(b) 检查你用的 Shiki 主题确实来自 `createCssVariablesTheme()`，而不是内置主题 —— 这是
「换主题不用重新高亮」这条架构性质能否成立的分水岭。

## 报告

写 `result.json`（字段见 CONTRACT.md §5）。`output` 里贴 `bun test` 的命令与结果、
说明你如何调和同步/异步矛盾、以及你按需加载语言的方式。提交到你自己的分支。
