# M2 · 主题加载与校验（`src/theme.ts`）

## 目标

实现主题文件的加载、结构校验、`extends` 继承解析。

## 必须读

- `docs/orch/CONTRACT.md` —— §2 全局不变量、§3 的 `src/theme.ts` 小节
- `src/types.ts` —— `Theme` / `ThemeFile` / `ThemeColors` / `SyntaxTokens`
- `themes/_schema.json` —— 校验规则的规范

## 交付物

### 1. `src/theme.ts`

逐字实现契约里的签名：

```ts
export class ThemeError extends Error {}
export function loadTheme(ref: string, opts?: { searchDir?: string }): Theme;
export function validateTheme(data: unknown, opts?: { baseDir?: string }): Theme;
```

要点：

- `loadTheme("nord")` → 在 `opts.searchDir ?? "themes"` 下找 `nord.json`；
  `loadTheme("./my-theme.json")` → 按路径读（相对 cwd）。两种都要支持。
- `extends` 解析：先递归解析基座（内置 id 或路径），再把当前文件给出的键覆盖上去。
  `colors` 与 `colors.syntax` 都是**按键**覆盖，不是整体替换。
- **循环 `extends` 必须抛 `ThemeError`**，不能死循环或栈溢出。自引用也算循环。
- 校验必须拒绝：非对象 / 数组 / null；缺 `name`；未知键（顶层与 `colors` 内部都算）；
  无 `extends` 时缺任何一个必填颜色 token；值不是非空字符串；`mode` 不是
  `dark`/`light`；`id` 不匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`。
- 解析后的 `Theme` 必须补齐：`id`（缺省用文件名 stem）、`family`（缺省用 `id`）、
  `mode`（缺省 `dark`）、`source`（缺省空串）。
- 所有错误抛 `ThemeError`，消息里带出错的文件路径或字段名。

### 2. `test/theme.test.ts`

用 `bun test`。测试用的主题 fixture 放 `test/fixtures/`（**你自己造**，不要依赖
`themes/*.json` —— 那些文件由另一个模块负责，你这里可能还没有）。

必须覆盖的用例（至少这些）：

- 合法主题文件解析成功，字段逐个正确
- 缺 `name` / 未知顶层键 / 未知 `colors` 键 / 缺一个 syntax token → 抛 `ThemeError`
- 颜色值不是字符串、或空串 → 抛 `ThemeError`
- `mode: "blue"` → 抛 `ThemeError`；非法 `id` 格式 → 抛 `ThemeError`
- `extends` 覆盖单个 token，未覆盖的来自基座
- `extends` 链两层，最终值正确
- 自引用 `extends` → 抛 `ThemeError`；A→B→A 循环 → 抛 `ThemeError`
- `loadTheme` 找不到主题 → 抛 `ThemeError`（不是 `ENOENT` 裸错误）

## 边界

不要修改 `src/types.ts`、`themes/_schema.json`、`package.json`、`tsconfig.json`。
不要 import 还没写的模块（`css.ts` / `render.ts` / `options.ts` / `build.ts`）。

## 控制方会怎么独立验收

读你的实现，跑我自己的用例（用一个临时 fixture 主题与一个循环 extends 案例），
并检查 `extends` 覆盖语义是不是**逐键**而不是整体替换。别只在测试里断言成功路径。

## 报告

写 `result.json`（字段见 CONTRACT.md §5）。`output` 里列出你跑的命令与输出、
以及你实现的错误场景清单。提交到你自己的分支。
