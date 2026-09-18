# mdblock 冻结契约（Wave 0）

本文件是所有模块的**唯一规范**。它由控制方（Main）在 Wave 0 冻结；Wave 1/2 期间
任何模块都不得修改它，也不得修改 `src/types.ts`、`src/syntax-map.ts`、
`themes/_schema.json`、`package.json`、`tsconfig.json`。需要改动的，回传
`blocked` 并说明要改什么、为什么，由控制方裁决。

## 0. 项目是什么

`mdblock` 是一个**构建期 CLI**：读一个 Markdown 文件，产出一个可以粘贴进任意网页的
「文章块」——一段自包含 HTML 片段加一份样式表。没有运行时 JS，没有 Web Component，
没有 iframe。

```
markdown ──render.ts──▶ 文章块 HTML（只含 var(--shiki-*) 引用）
主题 JSON ──theme.ts──▶ Theme ──css.ts──▶ 样式表文本（定义全部变量与规则）
                    └──────── build.ts / cli.ts 组装 ──▶ 产物
```

## 1. 依赖（已冻结，不得增删）

`markdown-it@15`、`markdown-it-task-lists@2`、`shiki@4`。
需要新依赖时回传 `blocked`，不要自己 `bun add`。

## 2. 全局不变量（每个模块都适用，违反即验收失败）

- **N1 样式不泄漏**：产出的 CSS 中**不得出现 `:root` 选择器**，也不得出现不以
  `.mdblock` 开头的顶层选择器。主题变量一律定义在 `.mdblock` 上，因此同一页可以
  贴多篇不同主题的文章块。
- **N2 高亮无字面色值**：文章块 HTML 中**不得出现任何字面颜色**
  （`#rgb`/`#rrggbb`/`rgb(...)`/`hsl(...)`/颜色名）。高亮只能引用
  `var(--shiki-*)`。这是「换主题不用重新高亮」这条架构性质的机器可检形式。
- **N3 不用 `!important`**：所有规则靠 `.mdblock` 前缀取得特异性；抵御宿主穿透
  只允许通过 `--hard-isolation` 的 `all: revert` 兜底。
- **N4 导入带扩展名**：`import ... from "./types.ts"`。运行时是 bun，`tsconfig` 已开
  `allowImportingTsExtensions`。**不要**用无扩展名裸导入。
- **N5 测试**：`bun test`，测试文件放 `test/<模块名>.test.ts`。断言行为，不断言实现细节
  （不校验源码文本、不校验内部函数名）。
- **N6 只在自己的 worktree 提交**：cwd 就是你的 worktree。不得切换分支、不得
  `git push`、不得修改 `main`。
- **N7 不臆造事实**：色值、API 用法、命令输出必须有来源。跑过的命令才写进报告。
- **N8 不安静地降级**：做不到就回传 `blocked`/`error` 并说明，不要用假实现、占位符、
  `TODO`、mock 或「先这样后面再补」蒙混过关。

## 3. 模块接口（必须逐字实现这些导出）

### `src/theme.ts` — 主题加载、校验、`extends` 解析

```ts
export class ThemeError extends Error {}

export function loadTheme(ref: string, opts?: { searchDir?: string }): Theme;

export function validateTheme(data: unknown, opts?: { baseDir?: string }): Theme;
```

- `ref` 是内置主题 id（`nord`）或主题文件路径（`./my-theme.json`）。内置主题在
  仓库根的 `themes/` 目录。
- `loadTheme` 读文件 → `validateTheme` → 解析 `extends` 链 → 返回补齐后的 `Theme`。
- `validateTheme` 必须拒绝：非对象、缺 `name`、未知键、缺必填颜色 token、值不是非空
  字符串、`mode` 不是 `dark`/`light`、`id` 不匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`。
- `extends` 是主题文件/内置 id 的引用；`extends` 只覆盖它给出的键；**循环 extends 必须
  报错**，不能栈溢出或死循环。
- 校验规则以 `themes/_schema.json` 为规范（手写实现，不引入 JSON Schema 库）。
- 错误一律抛 `ThemeError`，消息里带上出错的文件或字段。

### `src/css.ts` — 由 Theme + Options 生成样式表文本

```ts
export function renderCss(theme: Theme, options: Options): string;
```

必须在 `.mdblock` 上定义下列**全部**变量（这是公开 API，用户会手写覆盖它们）：

| 组 | 变量 |
|---|---|
| 面 | `--mdblock-bg` `--mdblock-surface` `--mdblock-text` `--mdblock-heading` `--mdblock-muted` |
| 线/强调 | `--mdblock-border-color` `--mdblock-accent` `--mdblock-accent-alt` |
| 代码 | `--mdblock-code-bg` `--mdblock-code-text` |
| 布局 | `--mdblock-width` `--mdblock-padding` `--mdblock-radius` `--mdblock-font-size` `--mdblock-line-height` `--mdblock-font-family` |
| 外框 | `--mdblock-border` `--mdblock-shadow` |
| 高亮 | `--shiki-foreground` `--shiki-background`、以及 `SYNTAX_KEYS` 每个键一个 `shikiVarName(key)` |

- `--mdblock-border` 存 `options.border` 的完整 CSS 值；`options.border === ""` 时值为 `none`。
- `--mdblock-shadow`：`options.shadow` 为预设名时映射到实际 box-shadow；`none` 必须产出
  `none`；其它字符串按原始 CSS 值透传。
- `--mdblock-bg`：`options.bg` 为 `null` 时取 `theme.colors.bg`。
- `--shiki-foreground` = `theme.colors.codeText`；`--shiki-background` = `theme.colors.codeBg`。
- `options.hardIsolation === true` 时，在 `.mdblock` 上追加 `all: revert`（放在规则最前，
  让后续声明重新接管需要的属性）。
- 需要覆盖：标题层级、段落、列表（含嵌套与任务列表）、引用块、表格（含表头与
  `:nth-child` 斑马纹）、分隔线、行内代码、代码块、链接（含 `:hover`）、图片、
  脚注样式不必做。用 `color-mix(in oklab, ...)` 派生 hover / 斑马纹 / 分割线等
  中间色，而不是再往主题里加 token。

### `src/render.ts` — Markdown 转文章块 HTML

```ts
export function renderMarkdown(
  markdown: string,
  theme: Theme,
  options: Options,
): Promise<string>;
```

- 返回**完整根元素**：`<{options.tag} class="mdblock" data-theme="{theme.id}">…</{tag}>`。
- Markdown：CommonMark + GFM（表格、任务列表、删除线、`linkify` 自动链接）。
  用 `markdown-it` + `markdown-it-task-lists`。
- 代码高亮：用 `shiki` 的 `createCssVariablesTheme()`（`import { createCssVariablesTheme } from "shiki"`）
  作为主题，`codeToHtml` 渲染围栏代码块。**必须**满足 N2。
  `<pre>` 上的内联 `background-color: var(--shiki-background)` 是允许的（它是变量引用）；
  但除 `var(--shiki-*)` 之外不得出现任何字面色值。
- 未标语言的围栏代码块按纯文本渲染（不高亮），仍须带 `.mdblock-code` 类与 `<pre><code>` 结构。
- 按需加载语言，不要把全部语言打进内存；未知语言降级为纯文本而不是抛错。
- 代码块结构固定为 `<pre class="mdblock-code"><code class="language-<lang>">…</code></pre>`，
  便于 `css.ts` 选中。

### `src/options.ts` — 默认值与分层合并

```ts
export const DEFAULTS: Options;

export function resolveOptions(
  ...layers: Array<Partial<Options> | undefined>
): Options;
```

- 后者覆盖前者；`undefined` 视为未提供（不能把前面的值覆盖成 `undefined`）。
- `DEFAULTS` 必须正好等于：

```ts
{
  theme: "catppuccin-latte",
  width: "720px",
  fontSize: "17px",
  lineHeight: 1.7,
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif',
  padding: "32px",
  radius: "12px",
  border: "",
  shadow: "soft",
  bg: null,
  tag: "div",
  hardIsolation: false,
  css: "inline",
}
```

### `src/build.ts` — 组装

```ts
export interface BuildOutput { html: string; css: string; }

export function build(markdown: string, options: Options): Promise<BuildOutput>;
```

- `css` 来自 `renderCss(loadTheme(options.theme), options)`；`html` 来自 `renderMarkdown`。
- **不要在 `html` 里内联 `<style>`**：组装由 `cli.ts` 负责，`build` 只返回两块内容。

### `src/cli.ts` — 命令行

```ts
export function parseArgs(argv: string[]): ParsedArgs;
export async function main(argv: string[]): Promise<number>;
```

```
mdblock <input.md> [options]
mdblock <input.md>... -d <outdir> [options]

-o, --out <file>        单文件输出路径（默认 stdout）
-d, --outdir <dir>      批量输出目录
-c, --config <file>     JSON 配置文件（键名同长选项）
    --theme <ref>       --width --font-size --line-height --font-family
    --padding --radius --border --shadow --bg
    --tag <div|article|section>
    --hard-isolation
    --css <inline|file|none>
-h, --help
```

- 参数优先级（后者覆盖前者）：`DEFAULTS` → `--config` 文件 → CLI flag。
- `--css inline`（默认）：产物 HTML 里内联 `<style>`，自包含。
- `--css file`：CSS 写到 `mdblock.css`（单文件模式写到 `-o` 同目录），HTML 只含
  `<link rel="stylesheet" href="mdblock.css">`。
- `--css none`：只输出 HTML，不含任何样式。
- 未知参数、缺失输入文件、`-o` 与 `-d` 同用 → 打印到 stderr 并返回退出码 `2`。
- 成功返回 `0`。`main` 里自己 catch 错误并转成退出码，不要抛出去。
- 数值型 flag（`--line-height`）解析成 number，解析失败按用法错误处理。

## 4. 验收命令

```bash
bun test          # 你的模块测试必须全绿
bunx tsc --noEmit # 类型必须干净（你自己的 worktree 里）
```

控制方在合并后会跑 `bun test` + `bunx tsc --noEmit` + `test/acceptance.mjs`。

## 5. 回传契约

每轮结束必须写一个 JSON 到本轮 prompt 给出的 `result_path`（绝对路径），用原子发布
（写临时文件再 rename），字段如下，**全部必填**：

```json
{
  "schema_version": 1,
  "job_id": "<照抄 prompt>",
  "round_id": "<照抄 prompt>",
  "status": "success | error | blocked",
  "output": "做了什么、跑了什么命令、看到什么输出",
  "files_created": ["src/foo.ts"],
  "files_modified": [],
  "files_generated": [],
  "files_deleted": [],
  "error": null,
  "blocked_reason": null,
  "completed_at": "2026-09-18T10:00:00Z"
}
```

- `status: "error"` 时 `error` 为非空字符串；`blocked` 时 `blocked_reason` 是**具体的
  问句**；其余情况两者为 `null`。
- 路径用 `/`、相对 cwd、不含 `..`。别把 `node_modules/` 写进去。
- `output` 里不要声称没跑过的测试。**声称跑过就必须贴命令和输出。**
- 不要用 Markdown 代码围栏包 JSON，不要有重复键。
