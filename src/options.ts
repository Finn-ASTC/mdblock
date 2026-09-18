/**
 * `src/options.ts` — 默认值与分层合并（M5）。
 *
 * 契约 §3 要求 `DEFAULTS` 逐字等于冻结的那一块，`resolveOptions` 后者覆盖前者、
 * `undefined` 视为未提供。本模块不做任何 IO，因此可以在任何地方安全复用。
 */

import type { Options } from "./types.ts";

/**
 * `Options` 的键，顺序与 `src/types.ts` 一致。
 *
 * 合并时按这张表取值，层里的未知键会被忽略 —— CLI 传入的是解析过的
 * `Partial<Options>`，配置文件的未知键在 `cli.ts` 里就已经报用法错误了。
 */
const OPTION_KEYS = [
  "theme",
  "width",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "padding",
  "radius",
  "border",
  "shadow",
  "bg",
  "tag",
  "hardIsolation",
  "css",
] as const satisfies readonly (keyof Options)[];

/** 契约 §3 冻结的默认值（逐字）。 */
export const DEFAULTS: Options = {
  theme: "catppuccin-latte",
  width: "720px",
  fontSize: "17px",
  lineHeight: 1.7,
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif',
  padding: "32px",
  radius: "12px",
  border: "",
  shadow: "soft",
  bg: null,
  tag: "div",
  hardIsolation: false,
  css: "inline",
};

/**
 * 依次合并若干层，后面的层覆盖前面的层，返回一个全新的 `Options`。
 *
 * - `undefined` 的整层视为未提供，直接跳过；
 * - 层里值为 `undefined` 的键视为未提供，不会把已有值覆盖成 `undefined`
 *   （`null` 是合法值，例如 `{ bg: null }` 会正常覆盖）。
 */
export function resolveOptions(...layers: Array<Partial<Options> | undefined>): Options {
  const merged: Options = { ...DEFAULTS };
  const target = merged as unknown as Record<string, unknown>;
  for (const layer of layers) {
    if (layer === undefined) continue;
    for (const key of OPTION_KEYS) {
      const value = layer[key];
      if (value !== undefined) target[key] = value;
    }
  }
  return merged;
}
