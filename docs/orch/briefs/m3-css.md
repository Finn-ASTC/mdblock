# M3 · 样式生成（`src/css.ts`）

## 目标

由 `Theme` + `Options` 生成一份**零 JS、零 `:root` 泄漏**的样式表文本。

## 必须读

- `docs/orch/CONTRACT.md` —— §2 不变量（N1/N3 直接管本模块）、§3 的 `src/css.ts` 小节（变量清单是硬要求）
- `src/types.ts` —— `Theme` / `Options`
- `src/syntax-map.ts` —— 高亮变量名的唯一来源，用 `shikiVarName()`

## 交付物

### 1. `src/css.ts`

```ts
export function renderCss(theme: Theme, options: Options): string;
```

硬要求（违反即验收失败）：

- **契约表里列出的每一个变量都必须在 `.mdblock` 上定义**，一个不能少，包括
  `--shiki-foreground`、`--shiki-background` 和 `SYNTAX_KEYS` 对应的 12 个
  `shikiVarName(key)`。高亮变量取 `theme.colors.syntax[key]`。
- **不出现 `:root`**，**不出现不以 `.mdblock` 开头的顶层选择器**，**不用 `!important`**。
- `options.border === ""` → `--mdblock-border: none`，否则透传。
- `options.shadow === "none"` → `--mdblock-shadow: none`；`soft`/`hard`/`ring` 你自己设计
  三个有区分度的 box-shadow；其它字符串按原始 CSS 透传。
- `options.bg === null` → `--mdblock-bg` 取 `theme.colors.bg`。
- `options.hardIsolation === true` → 在 `.mdblock` 规则**最前面**加 `all: revert`。

需要覆盖的元素（都要有像样的样式，不是占位）：

标题 h1–h6（层级递减的字号/间距，颜色用 `--mdblock-heading`）、段落、有序/无序列表
（含嵌套缩进）、任务列表（`markdown-it-task-lists` 产出的 `.task-list-item` 与复选框）、
引用块、表格（表头、边框、斑马纹）、分隔线、行内代码、代码块
（`.mdblock-code`，背景用 `--mdblock-code-bg`）、链接（含 `:hover`）、图片（`max-width:100%`）、
`<kbd>`、上下标、删除线。

中间色用 `color-mix(in oklab, ...)` 从主题 token 派生 —— **不要往主题里加 token**，
`ThemeColors` 是冻结的。

产出的 CSS 要可读（合理缩进、分组注释）。用户会手写覆盖这些变量，所以变量要定义得干净。

### 2. `test/css.test.ts`

用 `bun test`。自己造 fixture `Theme` 与 `Options`（**不要 import `src/theme.ts` 或
`src/options.ts`** —— 那些模块由别的 agent 负责，你这里可能还没有）。

至少覆盖：

- 契约表里的每一个变量名都出现在输出里（用 `SYNTAX_KEYS` + `shikiVarName()` 遍历断言，
  不要手写 12 个字符串）
- 输出里不含 `:root`
- 输出里每一行选择器都以 `.mdblock` 开头（允许 `@media` 之类的块结构，自己合理处理断言）
- 输出里不含 `!important`
- `border: ""` → `--mdblock-border: none`；`shadow: "none"` → `--mdblock-shadow: none`
- `bg: null` 用主题 `bg`；`bg: "#123456"` 用它
- `hardIsolation: true` 时 `.mdblock` 规则里含 `all: revert`；`false` 时不含
- 切换 `theme` 只改颜色、不改布局变量（拿两份不同颜色的主题比，布局部分必须逐字相同）

## 边界

不要修改冻结文件。不要写 `render.ts` / `build.ts` / `cli.ts` 的代码 —— 即使你觉得
它们该怎么写。你的世界只有 `css.ts` 和它的测试。

## 控制方会怎么独立验收

读实现；用自己的 fixture 跑上面全部断言；另外检查 `--shiki-*` 变量名与
`src/syntax-map.ts` 的 `shikiVarName()` 输出逐字一致（因为 `render.ts` 引用的就是这些名字，
名字错一位整个高亮就废了）。

## 报告

写 `result.json`（字段见 CONTRACT.md §5）。`output` 里贴 `bun test` 的命令与结果、
以及你列的变量数量。提交到你自己的分支。
