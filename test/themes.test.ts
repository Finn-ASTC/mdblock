/**
 * 内置主题库的独立校验（M1）。
 *
 * 本文件刻意不 import `src/theme.ts`（该模块由别的 Wave 负责），只把主题当作
 * 磁盘上的 JSON 数据来验证，因此可以独立运行。
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const THEMES_DIR = join(import.meta.dir, "..", "themes");
const SOURCES_PATH = join(THEMES_DIR, "_sources.json");

/** `SyntaxTokens` 的全部键，一个都不能少、也不能多。 */
const SYNTAX_KEYS = [
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
] as const;

/** `ThemeColors` 的非 syntax 键。 */
const COLOR_KEYS = [
  "bg",
  "surface",
  "text",
  "heading",
  "muted",
  "border",
  "accent",
  "accentAlt",
  "codeBg",
  "codeText",
] as const;

const BUILTIN_THEMES = [
  { id: "catppuccin-latte", family: "catppuccin", mode: "light", source: "https://github.com/catppuccin/palette" },
  { id: "catppuccin-frappe", family: "catppuccin", mode: "dark", source: "https://github.com/catppuccin/palette" },
  { id: "catppuccin-macchiato", family: "catppuccin", mode: "dark", source: "https://github.com/catppuccin/palette" },
  { id: "catppuccin-mocha", family: "catppuccin", mode: "dark", source: "https://github.com/catppuccin/palette" },
  { id: "nord", family: "nord", mode: "dark", source: "https://www.nordtheme.com/docs/colors-and-palettes" },
  { id: "gruvbox-dark", family: "gruvbox", mode: "dark", source: "https://github.com/morhetz/gruvbox" },
  { id: "tokyo-night", family: "tokyo-night", mode: "dark", source: "https://github.com/folke/tokyonight.nvim" },
  { id: "rose-pine-dawn", family: "rose-pine", mode: "light", source: "https://rosepinetheme.com/palette" },
  { id: "solarized-dark", family: "solarized", mode: "dark", source: "https://ethanschoonover.com/solarized" },
  { id: "dracula", family: "dracula", mode: "dark", source: "https://draculatheme.com/contribute" },
] as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const THEME_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type JsonObject = Record<string, unknown>;

function readJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

function themeFile(id: string): string {
  return join(THEMES_DIR, `${id}.json`);
}

/** 主题里出现的每一个颜色值（10 个 UI token + 12 个 syntax token）。 */
function themeColors(theme: JsonObject): string[] {
  const colors = theme.colors as JsonObject;
  const syntax = colors.syntax as JsonObject;
  return [
    ...COLOR_KEYS.map((key) => colors[key]),
    ...SYNTAX_KEYS.map((key) => syntax[key]),
  ] as string[];
}

function paletteOf(sources: JsonObject, id: string): Set<string> {
  const entry = sources[id] as JsonObject | undefined;
  const palette = entry?.palette as JsonObject;
  return new Set(Object.values(palette).map((value) => String(value).toLowerCase()));
}

const sources = readJson(SOURCES_PATH);

describe("themes/_sources.json", () => {
  test("为全部 10 个内置主题声明了 url 与 palette", () => {
    expect(Object.keys(sources).sort()).toEqual(BUILTIN_THEMES.map((t) => t.id).sort());
    for (const { id, source } of BUILTIN_THEMES) {
      const entry = sources[id] as JsonObject;
      expect(typeof entry.url).toBe("string");
      expect(String(entry.url).length).toBeGreaterThan(0);
      expect(entry.url).toBe(source);
      const palette = entry.palette as JsonObject;
      expect(Object.keys(palette).length).toBeGreaterThan(0);
      for (const value of Object.values(palette)) {
        expect(typeof value).toBe("string");
        expect(value as string).toMatch(HEX_COLOR);
      }
    }
  });
});

describe("内置主题文件", () => {
  for (const expected of BUILTIN_THEMES) {
    const { id } = expected;

    test(`${id}: 文件存在且是合法 JSON`, () => {
      expect(existsSync(themeFile(id))).toBe(true);
      const theme = readJson(themeFile(id));
      expect(typeof theme).toBe("object");
      expect(theme).not.toBeNull();
    });

    test(`${id}: 必填字段齐全且与文件名/表格一致`, () => {
      const theme = readJson(themeFile(id));
      expect(theme.id).toBe(id);
      expect(theme.id as string).toMatch(THEME_ID);
      expect(typeof theme.name).toBe("string");
      expect((theme.name as string).length).toBeGreaterThan(0);
      expect(theme.family).toBe(expected.family);
      expect(theme.mode).toBe(expected.mode);
      expect(theme.source).toBe(expected.source);
      expect(typeof theme.colors).toBe("object");
      expect(theme.colors).not.toBeNull();
    });

    test(`${id}: 10 个 UI token + 12 个 syntax 键全部给出合法色值`, () => {
      const theme = readJson(themeFile(id));
      const colors = theme.colors as JsonObject;
      const syntax = colors.syntax as JsonObject;

      expect(Object.keys(colors).sort()).toEqual([...COLOR_KEYS, "syntax"].sort());
      expect(Object.keys(syntax).sort()).toEqual([...SYNTAX_KEYS].sort());

      for (const key of COLOR_KEYS) {
        expect(colors[key]).toMatch(HEX_COLOR);
      }
      for (const key of SYNTAX_KEYS) {
        expect(syntax[key]).toMatch(HEX_COLOR);
      }
    });

    test(`${id}: 每个颜色值都逐字出现在 _sources.json 的官方调色板里`, () => {
      const theme = readJson(themeFile(id));
      const palette = paletteOf(sources, id);
      for (const value of themeColors(theme)) {
        expect(palette.has(value.toLowerCase())).toBe(true);
      }
    });
  }
});
