# M5 · CLI 与组装（`src/options.ts` / `src/build.ts` / `src/cli.ts`）

## 目标

把已经合进 `integration` 的模块组装成一个可用的命令行工具。

## 背景

你的 worktree 是从 `integration` 开的，`src/theme.ts`、`src/css.ts`、`src/render.ts`
**已经在里面了**，可以 import 它们。先读它们确认实际签名，再动手。

## 必须读

- `docs/orch/CONTRACT.md` —— §2 不变量、§3 的 `src/options.ts` / `src/build.ts` / `src/cli.ts` 小节
- `src/types.ts`、`src/theme.ts`、`src/css.ts`、`src/render.ts`

## 交付物

### 1. `src/options.ts`

```ts
export const DEFAULTS: Options;
export function resolveOptions(...layers: Array<Partial<Options> | undefined>): Options;
```

`DEFAULTS` 必须**逐字**等于 CONTRACT.md §3 里那一块（主题默认 `catppuccin-latte`）。
`resolveOptions` 后者覆盖前者，`undefined` 的层与 `undefined` 的键都视为未提供。

### 2. `src/build.ts`

```ts
export interface BuildOutput { html: string; css: string; }
export function build(markdown: string, options: Options): Promise<BuildOutput>;
```

`css` 来自 `renderCss(loadTheme(options.theme), options)`；`html` 来自 `renderMarkdown`。
**不要**在 `html` 里内联 `<style>` —— 组装是 `cli.ts` 的事。

### 3. `src/cli.ts`

```ts
export function parseArgs(argv: string[]): ParsedArgs;
export async function main(argv: string[]): Promise<number>;
```

用法与 flag 表见 CONTRACT.md §3。要点：

- 优先级：`DEFAULTS` → `--config` 文件 → CLI flag。
- `--css inline`（默认）：`<style>` 内联在产物 HTML 里，自包含。
- `--css file`：CSS 写到 `mdblock.css`（单文件模式下写到 `-o` 所在目录；批量模式写到
  `--outdir`），HTML 只含 `<link rel="stylesheet" href="mdblock.css">`。
- `--css none`：只输出 HTML。
- 单文件无 `-o` → 写 stdout。
- 批量 `a.md b.md -d dist/`：每个输入产一个同名 `.html`。`-d` 不存在就创建。
- 用法错误（未知 flag、输入文件不存在、`-o` 与 `-d` 同用、`--line-height` 不是数字）
  → stderr 打印可读消息，返回 `2`。`main` 内部 catch，不要抛出去。
- 成功返回 `0`。
- `parseArgs` 必须是纯函数（不发 IO），便于测试。

### 4. 测试

- `test/options.test.ts`：`DEFAULTS` 与契约逐字比对；覆盖顺序（后者赢）；
  `undefined` 不覆盖已有值。
- `test/cli.test.ts`：`parseArgs` 的表驱动用例（含全部错误路径）；
  `main` 端到端 —— 用 `Bun.spawn` 或直接调用 `main` 并对临时目录里的产物做断言。
  至少要有一个用例真的**产出文件并读回来**，断言产物里含 `.mdblock`、
  含 `--mdblock-` 变量、含 `var(--shiki-`。

## 全仓库门禁

你这一轮结束时，整个仓库必须同时满足：

```bash
bun test && bunx tsc --noEmit
```

两条都要绿。如果 `theme.ts` / `css.ts` / `render.ts` 里有让类型或测试挂掉的问题，
**先回传 `blocked` 说明**，不要顺手改别人的文件 —— 那些文件的归属不在你这一轮。

## 控制方会怎么独立验收

用真实命令跑一遍（不是跑你的测试）：拿仓库根的一个示例 md，分别用
`--css inline` / `--css file` / 批量 `-d` 产出，然后检查产物里变量齐全、
`<link>` 路径正确、退出码与 stderr 行为符合契约。

## 报告

写 `result.json`（字段见 CONTRACT.md §5）。`output` 里贴你实际跑的命令与输出、
以及全仓库 `bun test` 与 `bunx tsc --noEmit` 的结果。提交到你自己的分支。
