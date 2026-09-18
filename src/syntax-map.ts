/**
 * 代码高亮变量映射（Wave 0 冻结）。
 *
 * 变量名不是本项目发明的：它们必须与 Shiki `createCssVariablesTheme()` 生成的
 * `var(--shiki-token-*)` 引用逐字对应。`css.ts` 负责按 `shikiVarName()` 定义这些
 * 变量，`render.ts` 负责按上游引用它们 —— 两边共用本文件，因此换主题不需要重新
 * 高亮代码。
 */

import type { SyntaxTokens } from "./types.ts";

/** Shiki css-variables 的变量前缀。 */
export const SHIKI_VAR_PREFIX = "--shiki-";

/** 正文前景变量名，由 Shiki 在 `<pre>` 上引用。 */
export const SHIKI_FOREGROUND_VAR = `${SHIKI_VAR_PREFIX}foreground`;

/** 代码块背景变量名，由 Shiki 在 `<pre>` 上引用。 */
export const SHIKI_BACKGROUND_VAR = `${SHIKI_VAR_PREFIX}background`;

/** 全部代码高亮 token 键。禁止增删；与 `SyntaxTokens` 的键一一对应。 */
export const SYNTAX_KEYS = [
  "string",
  "comment",
  "constant",
  "keyword",
  "parameter",
  "function",
  "stringExpression",
  "punctuation",
  "link",
  "inserted",
  "deleted",
  "changed",
] as const satisfies readonly (keyof SyntaxTokens)[];

export type SyntaxKey = (typeof SYNTAX_KEYS)[number];

/** camelCase 转 kebab-case：stringExpression -> string-expression。 */
function kebabCase(input: string): string {
  return input.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/** token 键对应的 Shiki CSS 变量名，例如 function -> --shiki-token-function。 */
export function shikiVarName(key: SyntaxKey): string {
  return `${SHIKI_VAR_PREFIX}token-${kebabCase(key)}`;
}
