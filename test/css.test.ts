import { describe, expect, test } from "bun:test";

import { renderCss } from "../src/css.ts";
import {
  SHIKI_BACKGROUND_VAR,
  SHIKI_FOREGROUND_VAR,
  SYNTAX_KEYS,
  shikiVarName,
} from "../src/syntax-map.ts";
import type { Options, SyntaxTokens, Theme } from "../src/types.ts";

/* ── fixtures ─────────────────────────────────────────────────────────── */

const SYNTAX_A: SyntaxTokens = {
  string: "#a10001",
  comment: "#a10002",
  constant: "#a10003",
  keyword: "#a10004",
  parameter: "#a10005",
  function: "#a10006",
  stringExpression: "#a10007",
  punctuation: "#a10008",
  link: "#a10009",
  inserted: "#a1000a",
  deleted: "#a1000b",
  changed: "#a1000c",
};

const SYNTAX_B: SyntaxTokens = {
  string: "#b10001",
  comment: "#b10002",
  constant: "#b10003",
  keyword: "#b10004",
  parameter: "#b10005",
  function: "#b10006",
  stringExpression: "#b10007",
  punctuation: "#b10008",
  link: "#b10009",
  inserted: "#b1000a",
  deleted: "#b1000b",
  changed: "#b1000c",
};

const THEME_A: Theme = {
  id: "test-a",
  name: "Test A",
  family: "test",
  mode: "dark",
  source: "https://example.com/a",
  colors: {
    bg: "#111111",
    surface: "#121212",
    text: "#131313",
    heading: "#141414",
    muted: "#151515",
    border: "#161616",
    accent: "#171717",
    accentAlt: "#181818",
    codeBg: "#191919",
    codeText: "#1a1a1a",
    syntax: SYNTAX_A,
  },
};

const THEME_B: Theme = {
  id: "test-b",
  name: "Test B",
  family: "test",
  mode: "light",
  source: "https://example.com/b",
  colors: {
    bg: "#211111",
    surface: "#221212",
    text: "#231313",
    heading: "#241414",
    muted: "#251515",
    border: "#261616",
    accent: "#271717",
    accentAlt: "#281818",
    codeBg: "#291919",
    codeText: "#2a1a1a",
    syntax: SYNTAX_B,
  },
};

const OPTIONS: Options = {
  theme: "test-a",
  width: "720px",
  fontSize: "17px",
  lineHeight: 1.7,
  fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
  padding: "32px",
  radius: "12px",
  border: "",
  shadow: "soft",
  bg: null,
  tag: "div",
  hardIsolation: false,
  css: "inline",
};

/** Every variable the contract requires to be defined on `.mdblock`. */
const CONTRACT_VARS = [
  "--mdblock-bg",
  "--mdblock-surface",
  "--mdblock-text",
  "--mdblock-heading",
  "--mdblock-muted",
  "--mdblock-border-color",
  "--mdblock-accent",
  "--mdblock-accent-alt",
  "--mdblock-code-bg",
  "--mdblock-code-text",
  "--mdblock-width",
  "--mdblock-padding",
  "--mdblock-radius",
  "--mdblock-font-size",
  "--mdblock-line-height",
  "--mdblock-font-family",
  "--mdblock-border",
  "--mdblock-shadow",
  SHIKI_FOREGROUND_VAR,
  SHIKI_BACKGROUND_VAR,
] as const;

const ALL_VARS: string[] = [
  ...CONTRACT_VARS,
  ...SYNTAX_KEYS.map((key) => shikiVarName(key)),
];

const LAYOUT_VARS = [
  "--mdblock-width",
  "--mdblock-padding",
  "--mdblock-radius",
  "--mdblock-font-size",
  "--mdblock-line-height",
  "--mdblock-font-family",
] as const;

function withOptions(overrides: Partial<Options>): Options {
  return { ...OPTIONS, ...overrides };
}

/** Selector under which the theme custom properties must be defined. */
function themeSelector(id: string): string {
  return `.mdblock[data-theme="${id}"]`;
}

const THEME_A_SELECTOR = themeSelector(THEME_A.id);
const THEME_B_SELECTOR = themeSelector(THEME_B.id);

/** Body of the first rule matching `selector` (declarations only). */
function ruleBody(css: string, selector: string): string {
  const lines = css.split("\n");
  const start = lines.findIndex((line) => line.trim() === `${selector} {`);
  if (start === -1) throw new Error(`no rule found for ${selector}`);
  const end = lines.indexOf("}", start);
  if (end === -1) throw new Error(`unterminated rule for ${selector}`);
  return lines.slice(start + 1, end).join("\n");
}

/** Body of the bare `.mdblock` frame rule. */
function rootBody(css: string): string {
  return ruleBody(css, ".mdblock");
}

/** Selector text of every rule, comments stripped. */
function selectors(css: string): string[] {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith("{"))
    .map((line) => line.slice(0, -1).trim());
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) collectStrings(nested, out);
  }
  return out;
}

/* ── tests ────────────────────────────────────────────────────────────── */

describe("renderCss", () => {
  test("defines every contract variable on .mdblock[data-theme=...] not bare .mdblock", () => {
    const css = renderCss(THEME_A, OPTIONS);
    const scoped = ruleBody(css, THEME_A_SELECTOR);
    const bare = rootBody(css);

    expect(ALL_VARS).toHaveLength(32);
    for (const variable of ALL_VARS) {
      expect(scoped).toContain(`${variable}:`);
      expect(bare).not.toContain(`${variable}:`);
    }
  });

  test("scopes variables per theme id so two themes can coexist", () => {
    const cssA = renderCss(THEME_A, OPTIONS);
    const cssB = renderCss(THEME_B, OPTIONS);

    const scopedA = ruleBody(cssA, THEME_A_SELECTOR);
    const scopedB = ruleBody(cssB, THEME_B_SELECTOR);

    expect(cssA).toContain(`${THEME_A_SELECTOR} {`);
    expect(cssB).toContain(`${THEME_B_SELECTOR} {`);
    expect(cssA).not.toContain(`${THEME_B_SELECTOR} {`);
    expect(cssB).not.toContain(`${THEME_A_SELECTOR} {`);

    for (const variable of ALL_VARS) {
      expect(scopedA).toContain(`${variable}:`);
      expect(scopedB).toContain(`${variable}:`);
      expect(rootBody(cssA)).not.toContain(`${variable}:`);
      expect(rootBody(cssB)).not.toContain(`${variable}:`);
    }

    expect(scopedA).toContain(`--mdblock-bg: ${THEME_A.colors.bg};`);
    expect(scopedB).toContain(`--mdblock-bg: ${THEME_B.colors.bg};`);
  });

  test("highlight variables carry the theme token values", () => {
    const css = renderCss(THEME_A, OPTIONS);
    const root = ruleBody(css, THEME_A_SELECTOR);

    expect(root).toContain(`${SHIKI_FOREGROUND_VAR}: ${THEME_A.colors.codeText};`);
    expect(root).toContain(`${SHIKI_BACKGROUND_VAR}: ${THEME_A.colors.codeBg};`);
    for (const key of SYNTAX_KEYS) {
      expect(root).toContain(`${shikiVarName(key)}: ${THEME_A.colors.syntax[key]};`);
    }
  });

  test("never emits a global root selector", () => {
    expect(renderCss(THEME_A, OPTIONS)).not.toContain(":root");
  });

  test("every selector starts with .mdblock and there are no at-rules", () => {
    const found = selectors(renderCss(THEME_A, OPTIONS));
    expect(found.length).toBeGreaterThan(10);
    for (const selector of found) {
      expect(selector.startsWith(".mdblock")).toBe(true);
      expect(selector.startsWith("@")).toBe(false);
    }
  });

  test("never uses !important", () => {
    expect(renderCss(THEME_A, OPTIONS)).not.toContain("!important");
  });

  test("maps border and shadow none values", () => {
    const root = ruleBody(
      renderCss(THEME_A, withOptions({ shadow: "none" })),
      THEME_A_SELECTOR,
    );
    expect(root).toContain("--mdblock-border: none;");
    expect(root).toContain("--mdblock-shadow: none;");
  });

  test("passes through an explicit border", () => {
    const root = ruleBody(
      renderCss(THEME_A, withOptions({ border: "2px solid red" })),
      THEME_A_SELECTOR,
    );
    expect(root).toContain("--mdblock-border: 2px solid red;");
  });

  test("gives the three shadow presets distinct values", () => {
    const value = (shadow: Options["shadow"]): string => {
      const match = ruleBody(
        renderCss(THEME_A, withOptions({ shadow })),
        THEME_A_SELECTOR,
      ).match(/--mdblock-shadow: (.+);/);
      if (!match || !match[1]) throw new Error(`no shadow for ${shadow}`);
      return match[1];
    };

    const presets = [value("soft"), value("hard"), value("ring")];
    expect(new Set(presets).size).toBe(3);
    expect(presets.every((value_) => value_ !== "none")).toBe(true);
  });

  test("uses the theme bg when options.bg is null and the override otherwise", () => {
    const fromTheme = ruleBody(renderCss(THEME_A, OPTIONS), THEME_A_SELECTOR);
    expect(fromTheme).toContain(`--mdblock-bg: ${THEME_A.colors.bg};`);

    const overridden = ruleBody(
      renderCss(THEME_A, withOptions({ bg: "#123456" })),
      THEME_A_SELECTOR,
    );
    expect(overridden).toContain("--mdblock-bg: #123456;");
  });

  test("adds all: revert first only when hardIsolation is true", () => {
    const isolated = ruleBody(
      renderCss(THEME_A, withOptions({ hardIsolation: true })),
      THEME_A_SELECTOR,
    );
    expect(isolated.trimStart().startsWith("all: revert;")).toBe(true);

    const plain = ruleBody(
      renderCss(THEME_A, withOptions({ hardIsolation: false })),
      THEME_A_SELECTOR,
    );
    expect(plain).not.toContain("all: revert");
  });

  test("switching theme only changes colour literals", () => {
    const cssA = renderCss(THEME_A, OPTIONS);
    const cssB = renderCss(THEME_B, OPTIONS);

    const allColors = [
      ...collectStrings(THEME_A.colors),
      ...collectStrings(THEME_B.colors),
    ];
    const normalize = (css: string, id: string): string =>
      css.split(themeSelector(id)).join(themeSelector("<id>"));
    const stripColorLines = (css: string): string =>
      css
        .split("\n")
        .filter((line) => !allColors.some((color) => line.includes(color)))
        .join("\n");

    expect(stripColorLines(normalize(cssA, THEME_A.id))).toBe(
      stripColorLines(normalize(cssB, THEME_B.id)),
    );

    const layoutOf = (css: string): string[] =>
      css
        .split("\n")
        .filter((line) => LAYOUT_VARS.some((v) => line.trim().startsWith(`${v}:`)));
    expect(layoutOf(cssA)).toEqual(layoutOf(cssB));
  });

  test("styles the required markdown elements", () => {
    const css = renderCss(THEME_A, OPTIONS);
    for (const fragment of [
      ".mdblock h1",
      ".mdblock h2",
      ".mdblock h3",
      ".mdblock h4",
      ".mdblock h5",
      ".mdblock h6",
      ".mdblock blockquote",
      ".mdblock table",
      ".mdblock thead th",
      ".mdblock tbody tr:nth-child(even)",
      ".mdblock .task-list-item",
      ".mdblock .task-list-item-checkbox",
      ".mdblock li > ul",
      ".mdblock hr",
      ".mdblock code",
      ".mdblock .mdblock-code",
      ".mdblock a:hover",
      ".mdblock img",
      ".mdblock kbd",
      ".mdblock sub",
      ".mdblock sup",
      ".mdblock del",
    ]) {
      expect(css).toContain(fragment);
    }
    expect(css).toContain("max-width: 100%");
  });

  test("derives in-between colours with color-mix(in oklab, ...)", () => {
    const css = renderCss(THEME_A, OPTIONS);
    expect(css).toContain("color-mix(in oklab,");
  });
});
