import { describe, expect, test } from "bun:test";

import { DEFAULTS, resolveOptions } from "../src/options.ts";
import type { Options } from "../src/types.ts";

/**
 * 契约 §3 里那一块，逐字抄写。`DEFAULTS` 与它不等就是契约漂移 —— 这条测试的
 * 价值就在于把「默认值」这个公开 API 钉死在测试里，而不是从实现里反推期望值。
 */
const CONTRACT_DEFAULTS: Options = {
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

const CONTRACT_KEYS: ReadonlyArray<keyof Options> = [
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
];

describe("DEFAULTS", () => {
  test("逐字等于契约 §3 的默认值块", () => {
    expect(DEFAULTS).toEqual(CONTRACT_DEFAULTS);
  });

  test("键集合正好是 Options 的 13 个键，没有多余键", () => {
    expect([...Object.keys(DEFAULTS)].sort()).toEqual([...CONTRACT_KEYS].sort());
  });

  test("默认主题是 catppuccin-latte，默认样式模式是 inline", () => {
    expect(DEFAULTS.theme).toBe("catppuccin-latte");
    expect(DEFAULTS.css).toBe("inline");
    expect(DEFAULTS.bg).toBeNull();
    expect(DEFAULTS.border).toBe("");
  });
});

describe("resolveOptions", () => {
  test("没有任何层时返回一份与 DEFAULTS 相等的新对象", () => {
    const resolved = resolveOptions();
    expect(resolved).toEqual(DEFAULTS);
    expect(resolved).not.toBe(DEFAULTS);
  });

  test("后者覆盖前者", () => {
    const resolved = resolveOptions({ width: "600px", css: "none" }, { width: "900px" });
    expect(resolved.width).toBe("900px");
    expect(resolved.css).toBe("none");
  });

  test("undefined 的层视为未提供", () => {
    const resolved = resolveOptions(undefined, { width: "600px" });
    expect(resolved).toEqual({ ...DEFAULTS, width: "600px" });
  });

  test("undefined 的键不覆盖已有值（包括默认值）", () => {
    const resolved = resolveOptions({ width: "600px" }, { width: undefined, theme: undefined });
    expect(resolved.width).toBe("600px");
    expect(resolved.theme).toBe(DEFAULTS.theme);
  });

  test("null 是合法值，会正常覆盖（bg: null 表示用主题背景）", () => {
    const resolved = resolveOptions({ bg: "#123456" }, { bg: null });
    expect(resolved.bg).toBeNull();
  });

  test("布尔与数字 0/1.7 这类假值不会被误当成 undefined", () => {
    const resolved = resolveOptions({ hardIsolation: true, lineHeight: 1 });
    expect(resolved.hardIsolation).toBe(true);
    expect(resolved.lineHeight).toBe(1);
    expect(resolveOptions({ hardIsolation: false }).hardIsolation).toBe(false);
  });

  test("结果总是完整的 Options（每个键都有值）", () => {
    const resolved = resolveOptions({ theme: "nord" });
    for (const key of CONTRACT_KEYS) expect(resolved[key]).not.toBeUndefined();
    expect(Object.keys(resolved).sort()).toEqual([...CONTRACT_KEYS].sort());
  });

  test("不修改传入的层对象，也不修改 DEFAULTS", () => {
    const layer: Partial<Options> = { width: "600px" };
    const snapshot = { ...DEFAULTS };
    const resolved = resolveOptions(layer);
    resolved.width = "1px";
    resolved.theme = "nord";
    expect(layer.width).toBe("600px");
    expect(DEFAULTS).toEqual(snapshot);
  });

  test("层里的未知键不会进入结果", () => {
    const resolved = resolveOptions({ nope: 1 } as unknown as Partial<Options>);
    expect(Object.keys(resolved).sort()).toEqual([...CONTRACT_KEYS].sort());
  });
});
