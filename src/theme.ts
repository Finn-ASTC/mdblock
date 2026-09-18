/**
 * 主题文件的加载、结构校验与 `extends` 继承解析（M2）。
 *
 * 校验规则以 `themes/_schema.json` 为规范，手写实现（不引入 JSON Schema 库）。
 * 全局不变量见 `docs/orch/CONTRACT.md` §2：本模块只用带扩展名的相对导入（N4），
 * 不臆造行为（N7），做不到就抛 `ThemeError` 说明原因（N8）。
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SYNTAX_KEYS } from "./syntax-map.ts";
import type { SyntaxTokens, Theme, ThemeColors, ThemeMode } from "./types.ts";

/** 全部主题错误都用它抛出，消息里带出错的文件路径或字段名。 */
export class ThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeError";
  }
}

/**
 * 内置主题目录：`<包根>/themes`，由本模块自身的位置推出，**与 cwd 无关**。
 * 见 `docs/orch/CONTRACT.md` 修订 A-3 —— 早先按 cwd 解析，导致 CLI 离开仓库根
 * 就找不到内置主题。
 */
const BUILTIN_THEMES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "themes");

/** `id` / `family` 的格式（`themes/_schema.json`）。 */
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 顶层允许出现的键（`additionalProperties: false`）。 */
const FILE_KEYS = new Set<string>([
  "id",
  "name",
  "family",
  "mode",
  "source",
  "extends",
  "colors",
]);

/** `colors` 中的非 syntax 键，顺序与 `ThemeColors` 一致。 */
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
] as const satisfies readonly (keyof Omit<ThemeColors, "syntax">)[];

type PlainColorKey = (typeof COLOR_KEYS)[number];

const COLOR_KEY_SET = new Set<string>(COLOR_KEYS);
const SYNTAX_KEY_SET = new Set<string>(SYNTAX_KEYS);

/** 文件里给出的、已逐字段校验过的原始内容。 */
interface ParsedThemeFile {
  id?: string;
  name: string;
  family?: string;
  mode?: ThemeMode;
  source?: string;
  extendsRef?: string;
  colors?: ParsedColors;
}

interface ParsedColors {
  plain: Partial<Record<PlainColorKey, string>>;
  syntax: Partial<SyntaxTokens>;
}

/** `extends` 解析所需的上下文。 */
interface ResolveContext {
  /** 相对引用（路径或内置 id）的解析基准目录。 */
  baseDir: string;
  /** 内置主题目录（绝对路径）。 */
  searchDir: string;
  /** 当前数据来源的文件绝对路径；纯数据（validateTheme 直接调用）时为 undefined。 */
  file?: string;
  /** 正在解析链上的文件绝对路径，用于循环检测（含文件自身）。 */
  stack: readonly string[];
}

// --------------------------------------------------------------------------
// 小工具
// --------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "数组";
  if (value === undefined) return "undefined";
  return `${typeof value} ${JSON.stringify(value)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 消息里用的文件路径：能转成 cwd 相对路径就转，否则用绝对路径。 */
function displayPath(file: string): string {
  const rel = relative(process.cwd(), file);
  return rel === "" || rel.startsWith("..") ? file : rel;
}

/** 文件名去掉 `.json` 后缀，作为缺省 id。 */
function stemOf(file: string): string {
  const base = basename(file);
  return base.endsWith(".json") ? base.slice(0, -".json".length) : base;
}

/** 把候选字符串规范成合法 id（不合法时返回 undefined）。 */
function normalizeId(candidate: string): string | undefined {
  if (ID_PATTERN.test(candidate)) return candidate;
  const slug = candidate
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ID_PATTERN.test(slug) ? slug : undefined;
}

/** 当前数据来源文件能提供的缺省 id（文件名 stem）。 */
function stemId(ctx: ResolveContext): string | undefined {
  return ctx.file === undefined ? undefined : normalizeId(stemOf(ctx.file));
}

// --------------------------------------------------------------------------
// 校验（逐字对应 themes/_schema.json）
// --------------------------------------------------------------------------

function readColor(value: unknown, field: string): string {
  if (!isNonEmptyString(value)) {
    throw new ThemeError(`${field} 必须是非空字符串，收到 ${describeValue(value)}`);
  }
  return value;
}

function readOptionalString(
  object: Record<string, unknown>,
  key: string,
  where: string,
  field: string,
): string | undefined {
  const value = object[key];
  if (value === undefined) return undefined;
  if (!isNonEmptyString(value)) {
    throw new ThemeError(`${where}: 字段 "${field}" 必须是非空字符串，收到 ${describeValue(value)}`);
  }
  return value;
}

function parseSyntax(value: unknown, where: string): Partial<SyntaxTokens> {
  if (!isPlainObject(value)) {
    throw new ThemeError(`${where}: 字段 "colors.syntax" 必须是对象，收到 ${describeValue(value)}`);
  }
  const syntax: Partial<SyntaxTokens> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!SYNTAX_KEY_SET.has(key)) {
      throw new ThemeError(`${where}: "colors.syntax" 中未知的键 "${key}"`);
    }
    syntax[key as keyof SyntaxTokens] = readColor(raw, `${where}: 字段 "colors.syntax.${key}"`);
  }
  return syntax;
}

function parseColors(value: unknown, where: string): ParsedColors {
  if (!isPlainObject(value)) {
    throw new ThemeError(`${where}: 字段 "colors" 必须是对象，收到 ${describeValue(value)}`);
  }
  const plain: Partial<Record<PlainColorKey, string>> = {};
  let syntax: Partial<SyntaxTokens> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === "syntax") {
      syntax = parseSyntax(raw, where);
      continue;
    }
    if (!COLOR_KEY_SET.has(key)) {
      throw new ThemeError(`${where}: "colors" 中未知的键 "${key}"`);
    }
    plain[key as PlainColorKey] = readColor(raw, `${where}: 字段 "colors.${key}"`);
  }
  return { plain, syntax };
}

/** 顶层结构校验：拒绝非对象/数组/null、未知键、缺 name、非法 mode/id/family。 */
function parseThemeFile(data: unknown, where: string): ParsedThemeFile {
  if (!isPlainObject(data)) {
    throw new ThemeError(`${where}: 主题必须是对象，收到 ${describeValue(data)}`);
  }

  for (const key of Object.keys(data)) {
    if (!FILE_KEYS.has(key)) {
      throw new ThemeError(`${where}: 未知的顶层键 "${key}"`);
    }
  }

  if (data["name"] === undefined) {
    throw new ThemeError(`${where}: 缺少必填字段 "name"`);
  }
  const name = readColor(data["name"], `${where}: 字段 "name"`);

  const id = data["id"] === undefined
    ? undefined
    : readColor(data["id"], `${where}: 字段 "id"`);
  if (id !== undefined && !ID_PATTERN.test(id)) {
    throw new ThemeError(
      `${where}: 字段 "id" 必须匹配 ${ID_PATTERN.source}，收到 ${JSON.stringify(id)}`,
    );
  }

  const family = readOptionalString(data, "family", where, "family");
  if (family !== undefined && !ID_PATTERN.test(family)) {
    throw new ThemeError(
      `${where}: 字段 "family" 必须匹配 ${ID_PATTERN.source}，收到 ${JSON.stringify(family)}`,
    );
  }

  let mode: ThemeMode | undefined;
  if (data["mode"] !== undefined) {
    const rawMode = data["mode"];
    if (rawMode !== "dark" && rawMode !== "light") {
      throw new ThemeError(
        `${where}: 字段 "mode" 必须是 "dark" 或 "light"，收到 ${describeValue(rawMode)}`,
      );
    }
    mode = rawMode;
  }

  const source = readOptionalString(data, "source", where, "source");
  const extendsRef = readOptionalString(data, "extends", where, "extends");
  const colors = data["colors"] === undefined ? undefined : parseColors(data["colors"], where);

  if (extendsRef === undefined && colors === undefined) {
    throw new ThemeError(`${where}: 没有 "extends" 时必须提供 "colors"`);
  }

  const parsed: ParsedThemeFile = { name };
  if (id !== undefined) parsed.id = id;
  if (family !== undefined) parsed.family = family;
  if (mode !== undefined) parsed.mode = mode;
  if (source !== undefined) parsed.source = source;
  if (extendsRef !== undefined) parsed.extendsRef = extendsRef;
  if (colors !== undefined) parsed.colors = colors;
  return parsed;
}

// --------------------------------------------------------------------------
// extends 解析
// --------------------------------------------------------------------------

/** `ref` 是路径（`./x.json`、`test/fixtures/x.json`）还是内置 id（`nord`）。 */
function looksLikePathRef(ref: string): boolean {
  return ref.includes("/") || ref.endsWith(".json") || ref.startsWith(".");
}

/** 候选绝对路径，按优先级排列。 */
function refCandidates(ref: string, ctx: ResolveContext): string[] {
  const candidates: string[] = [];
  if (looksLikePathRef(ref)) {
    candidates.push(isAbsolute(ref) ? ref : resolve(ctx.baseDir, ref));
    candidates.push(resolve(ctx.searchDir, ref));
  } else {
    candidates.push(resolve(ctx.searchDir, `${ref}.json`));
    candidates.push(resolve(ctx.baseDir, `${ref}.json`));
  }
  return [...new Set(candidates)];
}

/** 把引用解析成一个存在的文件；找不到时抛 `ThemeError`（不是 ENOENT 裸错误）。 */
function resolveThemePath(ref: string, ctx: ResolveContext): string {
  const candidates = refCandidates(ref, ctx);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new ThemeError(
    `找不到主题 "${ref}"（已查找：${candidates.map(displayPath).join(", ")}）`,
  );
}

function readThemeJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new ThemeError(`无法读取主题文件 ${displayPath(file)}：${errorMessage(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ThemeError(`主题文件 ${displayPath(file)} 不是合法 JSON：${errorMessage(error)}`);
  }
}

/** 按键合并 `colors` 与 `colors.syntax`；合并后仍缺 token 就报错。 */
function mergeColors(
  own: ParsedColors | undefined,
  base: ThemeColors | undefined,
  where: string,
): ThemeColors {
  const plain: Partial<Record<PlainColorKey, string>> = {};
  const syntax: Partial<SyntaxTokens> = {};
  const missing: string[] = [];

  for (const key of COLOR_KEYS) {
    const value = own?.plain[key] ?? base?.[key];
    if (value === undefined) missing.push(`colors.${key}`);
    else plain[key] = value;
  }
  for (const key of SYNTAX_KEYS) {
    const value = own?.syntax[key] ?? base?.syntax[key];
    if (value === undefined) missing.push(`colors.syntax.${key}`);
    else syntax[key] = value;
  }

  if (missing.length > 0) {
    throw new ThemeError(`${where}: 缺少必填颜色 token：${missing.join(", ")}`);
  }
  return { ...(plain as Record<PlainColorKey, string>), syntax: syntax as SyntaxTokens };
}

/** 校验 + 递归解析 `extends`，返回补齐后的 `Theme`。 */
function resolveTheme(data: unknown, ctx: ResolveContext): Theme {
  const where = ctx.file === undefined ? "<inline theme>" : displayPath(ctx.file);
  const parsed = parseThemeFile(data, where);

  const base = parsed.extendsRef === undefined
    ? undefined
    : loadThemeByRef(parsed.extendsRef, ctx);

  const colors = mergeColors(parsed.colors, base?.colors, where);

  const id = parsed.id
    ?? stemId(ctx)
    ?? base?.id
    ?? normalizeId(parsed.name)
    ?? "custom";

  return {
    id,
    name: parsed.name,
    family: parsed.family ?? base?.family ?? id,
    mode: parsed.mode ?? base?.mode ?? "dark",
    source: parsed.source ?? base?.source ?? "",
    colors,
  };
}

/** 读取一个 `extends` 引用指向的主题文件并递归解析（带循环检测）。 */
function loadThemeByRef(ref: string, ctx: ResolveContext): Theme {
  const file = resolveThemePath(ref, ctx);
  if (ctx.stack.includes(file)) {
    const chain = [...ctx.stack, file].map(displayPath).join(" -> ");
    throw new ThemeError(`extends 循环引用：${chain}`);
  }
  const data = readThemeJson(file);
  return resolveTheme(data, {
    baseDir: dirname(file),
    searchDir: ctx.searchDir,
    file,
    stack: [...ctx.stack, file],
  });
}

// --------------------------------------------------------------------------
// 公开 API
// --------------------------------------------------------------------------

/**
 * 按内置主题 id（`nord`）或主题文件路径（`./my-theme.json`，相对 cwd）加载主题。
 *
 * 读文件 → `validateTheme` 级别的结构校验 → 递归解析 `extends` 链 → 返回补齐后的
 * `Theme`。任何失败都抛 `ThemeError`。
 *
 * 内置 id 在 `<包根>/themes/` 下查找（**与 cwd 无关**，所以装到哪都能用）；
 * `opts.searchDir` 可以覆盖它，此时按 cwd 解析。相对路径形式的 `ref` 始终按 cwd 解析。
 */
export function loadTheme(ref: string, opts?: { searchDir?: string }): Theme {
  if (!isNonEmptyString(ref)) {
    throw new ThemeError(`loadTheme: ref 必须是非空字符串，收到 ${describeValue(ref)}`);
  }
  const searchDir = resolve(opts?.searchDir ?? BUILTIN_THEMES_DIR);
  const file = resolveThemePath(ref, { baseDir: process.cwd(), searchDir, stack: [] });
  const data = readThemeJson(file);
  return resolveTheme(data, {
    baseDir: dirname(file),
    searchDir,
    file,
    stack: [file],
  });
}

/**
 * 校验一份已解析的主题文件内容（`unknown`），返回补齐后的 `Theme`。
 *
 * `opts.baseDir` 是 `extends` 里相对路径的解析基准（缺省 cwd）。没有 `extends` 时
 * 必须给出全部必填颜色 token；有 `extends` 时缺的键从基座继承（按键覆盖，不整体
 * 替换）。所有失败抛 `ThemeError`。
 */
export function validateTheme(data: unknown, opts?: { baseDir?: string }): Theme {
  return resolveTheme(data, {
    baseDir: resolve(opts?.baseDir ?? process.cwd()),
    searchDir: resolve(BUILTIN_THEMES_DIR),
    stack: [],
  });
}
