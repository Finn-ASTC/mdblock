/**
 * mdblock 冻结契约（Wave 0，控制方所有）。
 *
 * 本文件、`src/syntax-map.ts`、`themes/_schema.json` 与 `docs/orch/CONTRACT.md`
 * 在 Wave 1/2 期间禁止修改。任何模块需要改动其中的内容，必须回传 `blocked`
 * 请求控制方裁决，不得自行修改。
 */

export type ThemeMode = "dark" | "light";

/** 外框阴影预设；也允许传原始 box-shadow 值。 */
export type ShadowPreset = "none" | "soft" | "hard" | "ring";

/** 文章块根元素标签。 */
export type BlockTag = "div" | "article" | "section";

/** 样式产出方式。 */
export type CssMode = "inline" | "file" | "none";

/**
 * 代码高亮 token。
 *
 * 键集合由 `src/syntax-map.ts` 的 `SYNTAX_KEYS` 唯一决定，对应 Shiki
 * `createCssVariablesTheme()` 使用的 `--shiki-token-*` 变量。禁止增删键。
 */
export interface SyntaxTokens {
  string: string;
  comment: string;
  constant: string;
  keyword: string;
  parameter: string;
  function: string;
  stringExpression: string;
  punctuation: string;
  link: string;
  inserted: string;
  deleted: string;
  changed: string;
}

/** 一套主题的完整颜色集合。所有值均为非空 CSS 颜色字符串。 */
export interface ThemeColors {
  /** 文章块背景。 */
  bg: string;
  /** 次级面：代码块、引用块、表头背景。 */
  surface: string;
  /** 正文颜色。 */
  text: string;
  /** 标题颜色。 */
  heading: string;
  /** 次要文本：caption、分隔说明、表格边框说明。 */
  muted: string;
  /** 边框颜色。 */
  border: string;
  /** 主强调色：链接、行内代码、列表标记。 */
  accent: string;
  /** 次强调色：hover / visited / 引用块左边线。 */
  accentAlt: string;
  /** 代码块背景。 */
  codeBg: string;
  /** 代码块内默认文字（同时作为 `--shiki-foreground`）。 */
  codeText: string;
  /** 代码高亮 token。 */
  syntax: SyntaxTokens;
}

/** 解析完成、可直接用于渲染的主题。 */
export interface Theme {
  /** 唯一 id，kebab-case；内置主题由文件名决定。 */
  id: string;
  /** 展示名。 */
  name: string;
  /** 主题家族，如 "catppuccin"。 */
  family: string;
  mode: ThemeMode;
  /** 官方调色板来源 URL，供人工核对色值。 */
  source: string;
  colors: ThemeColors;
}

/**
 * 主题文件的磁盘格式。
 *
 * 无 `extends` 时 `colors` 必须提供 `ThemeColors` 的全部非 syntax 键，且
 * `colors.syntax` 必须提供 `SyntaxTokens` 的全部键；有 `extends` 时只提供覆盖项。
 */
export interface ThemeFile {
  id?: string;
  name: string;
  family?: string;
  mode?: ThemeMode;
  source?: string;
  extends?: string;
  colors?: Partial<Omit<ThemeColors, "syntax">> & { syntax?: Partial<SyntaxTokens> };
}

/** 文章块的全部可配置参数（已解析，不含 undefined）。 */
export interface Options {
  /** 内置主题 id 或自定义主题文件路径，由 `theme.ts` 解析。 */
  theme: string;
  /** 根元素 max-width，CSS 长度值。 */
  width: string;
  fontSize: string;
  lineHeight: number;
  fontFamily: string;
  padding: string;
  radius: string;
  /** 完整 CSS border 值（如 `1px solid #333`）；空字符串表示无边框。 */
  border: string;
  /** 阴影预设名，或原始 box-shadow 值。 */
  shadow: ShadowPreset | string;
  /** null 表示使用主题的 `colors.bg`。 */
  bg: string | null;
  tag: BlockTag;
  /** 在根元素上追加 `all: revert` 兜底，抵御宿主高特异性规则穿透。 */
  hardIsolation: boolean;
  css: CssMode;
}

/**
 * 各文件必须导出的签名（本区块是规范，`docs/orch/CONTRACT.md` 有完整说明）：
 *
 *   src/theme.ts
 *     export class ThemeError extends Error {}
 *     export function loadTheme(ref: string, opts?: { searchDir?: string }): Theme;
 *     export function validateTheme(data: unknown, opts?: { baseDir?: string }): Theme;
 *
 *   src/css.ts
 *     export function renderCss(theme: Theme, options: Options): string;
 *
 *   src/render.ts
 *     export function renderMarkdown(
 *       markdown: string, theme: Theme, options: Options
 *     ): Promise<string>;
 *
 *   src/options.ts
 *     export const DEFAULTS: Options;
 *     export function resolveOptions(
 *       ...layers: Array<Partial<Options> | undefined>
 *     ): Options;
 *
 *   src/build.ts
 *     export interface BuildOutput { html: string; css: string; }
 *     export function build(markdown: string, options: Options): Promise<BuildOutput>;
 *
 *   src/cli.ts
 *     export function parseArgs(argv: string[]): ParsedArgs;
 *     export async function main(argv: string[]): Promise<number>;
 */
export {};
