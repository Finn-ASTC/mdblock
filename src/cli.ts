/**
 * `src/cli.ts` — mdblock 命令行（M5）。
 *
 * 契约 §3 的要点在这里落地：
 *   - 优先级：`DEFAULTS` → `--config` 文件 → CLI flag；
 *   - `parseArgs` 是纯函数（只解析 argv、不发 IO），用法错误抛 `UsageError`；
 *   - `main` 自己 catch：用法错误写 stderr 并返回 `2`，成功返回 `0`，
 *     其它运行期错误（例如主题加载失败）写 stderr 并返回 `1`；
 *   - `--css inline|file|none` 决定样式怎么落地：内联 `<style>`、
 *     写 `mdblock.css` + `<link>`、或什么都不带。
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { build } from "./build.ts";
import { DEFAULTS, resolveOptions } from "./options.ts";
import type { BlockTag, CssMode, Options } from "./types.ts";

/** 用法错误：`main` 捕获后把消息写到 stderr 并返回退出码 `2`。 */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** `parseArgs` 的结果。`override` 只含命令行上显式给出的键。 */
export interface ParsedArgs {
  help: boolean;
  inputs: string[];
  /** `-o` / `--out`：单文件输出路径；缺省写 stdout。 */
  out?: string;
  /** `-d` / `--outdir`：批量输出目录。 */
  outdir?: string;
  /** `-c` / `--config`：JSON 配置文件路径。 */
  config?: string;
  override: Partial<Options>;
}

/** `--css file` 产出的样式表文件名；也是 `<link>` 的 href。 */
export const CSS_FILE_NAME = "mdblock.css";

/** 帮助文本。 */
export const USAGE = `mdblock — 把 Markdown 渲染成自包含的「文章块」

用法：
  mdblock <input.md> [options]
  mdblock <input.md>... -d <outdir> [options]

选项：
  -o, --out <file>              单文件输出路径（默认 stdout）
  -d, --outdir <dir>            批量输出目录，每个输入产一个同名 .html
  -c, --config <file>           JSON 配置文件（键名同长选项）
      --theme <ref>             内置主题 id 或主题文件路径（默认 ${DEFAULTS.theme}）
      --width <css>             根元素 max-width（默认 ${DEFAULTS.width}）
      --font-size <css>         正文字号（默认 ${DEFAULTS.fontSize}）
      --line-height <n>         行高，数字（默认 ${DEFAULTS.lineHeight}）
      --font-family <css>       字体栈
      --padding <css>           内边距（默认 ${DEFAULTS.padding}）
      --radius <css>            圆角（默认 ${DEFAULTS.radius}）
      --border <css>            边框的完整 CSS 值；空串表示无边框
      --shadow <css>            阴影预设 none|soft|hard|ring，或原始 box-shadow
      --bg <color>              背景色（缺省取主题的 colors.bg）
      --tag <div|article|section>  根元素标签（默认 ${DEFAULTS.tag}）
      --hard-isolation          根元素追加 all: revert 兜底
      --css <inline|file|none>  样式产出方式（默认 ${DEFAULTS.css}）
  -h, --help                    显示本帮助
`;

const CSS_MODES: readonly CssMode[] = ["inline", "file", "none"];
const TAGS: readonly BlockTag[] = ["div", "article", "section"];

/** `Options` 的每个键对应的长选项名（kebab-case）。 */
const OPTION_NAMES: ReadonlyArray<readonly [keyof Options, string]> = [
  ["theme", "theme"],
  ["width", "width"],
  ["fontSize", "font-size"],
  ["lineHeight", "line-height"],
  ["fontFamily", "font-family"],
  ["padding", "padding"],
  ["radius", "radius"],
  ["border", "border"],
  ["shadow", "shadow"],
  ["bg", "bg"],
  ["tag", "tag"],
  ["hardIsolation", "hard-isolation"],
  ["css", "css"],
];

const OPTION_KEY_BY_NAME = new Map<string, keyof Options>(
  OPTION_NAMES.map(([key, name]) => [name, key]),
);

/** camelCase 转 kebab-case：stringExpression -> string-expression。 */
function kebabCase(input: string): string {
  return input.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/**
 * 把长选项名（或配置文件的键）归一到 `Options` 的键。
 * `--font-size`、`font-size`、`fontSize` 都指向 `fontSize`；未知返回 `undefined`。
 */
function optionKey(name: string): keyof Options | undefined {
  const stripped = name.replace(/^--?/, "").trim();
  return stripped === "" ? undefined : OPTION_KEY_BY_NAME.get(kebabCase(stripped));
}

/**
 * 把命令行/配置文件里的字符串值转成对应键的值，顺带做枚举与数字校验。
 * 校验失败抛 `UsageError`（退出码 2）。`label` 只用于错误消息。
 */
function coerceOption(key: keyof Options, raw: string, label: string): Partial<Options> {
  switch (key) {
    case "lineHeight": {
      const trimmed = raw.trim();
      const value = trimmed === "" ? Number.NaN : Number(trimmed);
      if (!Number.isFinite(value)) {
        throw new UsageError(`${label} 需要一个数字，收到 ${JSON.stringify(raw)}`);
      }
      return { lineHeight: value };
    }
    case "tag": {
      if (!TAGS.includes(raw as BlockTag)) {
        throw new UsageError(`${label} 只接受 ${TAGS.join(" / ")}，收到 ${JSON.stringify(raw)}`);
      }
      return { tag: raw as BlockTag };
    }
    case "css": {
      if (!CSS_MODES.includes(raw as CssMode)) {
        throw new UsageError(
          `${label} 只接受 ${CSS_MODES.join(" / ")}，收到 ${JSON.stringify(raw)}`,
        );
      }
      return { css: raw as CssMode };
    }
    case "hardIsolation":
      throw new UsageError(`${label} 是布尔开关，不接受值`);
    case "bg":
      // 空串表示「恢复用主题的 colors.bg」，即契约里的 null。
      return { bg: raw === "" ? null : raw };
    default:
      return { [key]: raw } as Partial<Options>;
  }
}

/**
 * 解析 argv。纯函数：不读文件、不写文件、不碰 `process`。
 *
 * 返回 `help: true` 时不校验输入数量（`mdblock --help` 必须总是可用）；
 * 其余用法错误（未知选项、缺值、`-o` 与 `-d` 同用、多个输入没有 `-d`、
 * 枚举或数字解析失败）抛 `UsageError`。
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { help: false, inputs: [], override: {} };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;

    if (arg === "--") {
      parsed.inputs.push(...argv.slice(index + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      parsed.inputs.push(arg);
      continue;
    }

    // `--flag=value` 拆成名字与内联值；短选项只支持 `-o value` 形式。
    let name = arg;
    let inlineValue: string | undefined;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        name = arg.slice(0, eq);
        inlineValue = arg.slice(eq + 1);
      }
    }

    const takeValue = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      const value = argv[index + 1];
      if (value === undefined) throw new UsageError(`选项 ${name} 缺少值`);
      index += 1;
      return value;
    };

    switch (name) {
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      case "-o":
      case "--out":
        parsed.out = takeValue();
        break;
      case "-d":
      case "--outdir":
        parsed.outdir = takeValue();
        break;
      case "-c":
      case "--config":
        parsed.config = takeValue();
        break;
      case "--hard-isolation":
        if (inlineValue !== undefined) {
          throw new UsageError("选项 --hard-isolation 是布尔开关，不接受值");
        }
        parsed.override.hardIsolation = true;
        break;
      default: {
        const key = optionKey(name);
        if (key === undefined) throw new UsageError(`未知选项：${name}`);
        Object.assign(parsed.override, coerceOption(key, takeValue(), name));
      }
    }
  }

  if (parsed.help) return parsed;
  if (parsed.inputs.length === 0) {
    throw new UsageError("缺少输入文件（用法见 mdblock --help）");
  }
  if (parsed.out !== undefined && parsed.outdir !== undefined) {
    throw new UsageError("-o/--out 与 -d/--outdir 不能同时使用");
  }
  if (parsed.inputs.length > 1 && parsed.outdir === undefined) {
    throw new UsageError("多个输入文件需要 -d/--outdir 指定输出目录");
  }
  if (parsed.outdir !== undefined) {
    const seen = new Map<string, string>();
    for (const input of parsed.inputs) {
      const name = htmlNameFor(input);
      const first = seen.get(name);
      if (first !== undefined) {
        throw new UsageError(
          `批量模式下 ${first} 与 ${input} 会写出同一个文件 ${name}（后者覆盖前者）；` +
            "请改名、分目录跑，或拆成两次调用",
        );
      }
      seen.set(name, input);
    }
  }
  return parsed;
}

/** 读取并校验 `--config` 文件；未知键与类型不符都算用法错误。 */
function readConfig(path: string): Partial<Options> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new UsageError(`配置文件读不到：${path}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new UsageError(`配置文件不是合法 JSON：${path}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new UsageError(`配置文件必须是 JSON 对象：${path}`);
  }

  const layer: Partial<Options> = {};
  for (const [rawKey, rawValue] of Object.entries(data as Record<string, unknown>)) {
    const key = optionKey(rawKey);
    if (key === undefined) {
      throw new UsageError(`配置文件里有未知键 ${JSON.stringify(rawKey)}：${path}`);
    }
    const label = `配置项 ${rawKey}`;
    if (key === "hardIsolation") {
      if (typeof rawValue !== "boolean") throw new UsageError(`${label} 需要布尔值：${path}`);
      layer.hardIsolation = rawValue;
      continue;
    }
    if (key === "lineHeight") {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        throw new UsageError(`${label} 需要数字：${path}`);
      }
      layer.lineHeight = rawValue;
      continue;
    }
    if (key === "bg" && rawValue === null) {
      layer.bg = null;
      continue;
    }
    if (typeof rawValue !== "string") throw new UsageError(`${label} 需要字符串：${path}`);
    Object.assign(layer, coerceOption(key, rawValue, label));
  }
  return layer;
}

/** `renderMarkdown` 产出的第一个标签就是根元素的开标签。 */
const ROOT_OPEN_TAG = /^<[a-z]+(?:\s[^>]*)?>/;

/** 把一段片段插到根元素开标签之后（保持 <div class="mdblock" …> 逐字不变）。 */
function injectAfterRootTag(html: string, snippet: string): string {
  const match = ROOT_OPEN_TAG.exec(html);
  if (match === null) return `${snippet}${html}`;
  const [tag] = match;
  return `${tag}\n${snippet}${html.slice(tag.length)}`;
}

/** `--css inline`：样式表内联进产物，片段自包含。 */
function styleSnippet(css: string): string {
  return `<style>\n${css.trimEnd()}\n</style>\n`;
}

/** `--css file`：只留一个指向同目录样式表的 `<link>`。 */
const LINK_SNIPPET = `<link rel="stylesheet" href="${CSS_FILE_NAME}">\n`;

/** `a/b/post.md` -> `post.html`（同名，扩展名换掉）。 */
function htmlNameFor(input: string): string {
  const base = basename(input);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${stem}.html`;
}

function complain(message: string): void {
  process.stderr.write(`mdblock: ${message}\n`);
}

/** 输入必须是已存在的普通文件；目录、缺失、权限问题都在这里变成用法错误。 */
function isReadableFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * CLI 主流程。**不抛异常**：用法错误返回 `2`，其它错误返回 `1`，成功返回 `0`。
 */
export async function main(argv: string[]): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      complain(error.message);
      return 2;
    }
    throw error;
  }

  if (parsed.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  try {
    const configLayer = parsed.config === undefined ? undefined : readConfig(parsed.config);
    const options = resolveOptions(DEFAULTS, configLayer, parsed.override);

    for (const input of parsed.inputs) {
      if (!isReadableFile(input)) throw new UsageError(`输入文件不存在或不是文件：${input}`);
    }

    const { out, outdir } = parsed;
    const stdoutMode = out === undefined && outdir === undefined;
    let outDir = ".";
    if (outdir !== undefined) {
      outDir = outdir;
      mkdirSync(outDir, { recursive: true });
    } else if (out !== undefined) {
      const parent = dirname(out);
      outDir = parent === "" ? "." : parent;
      mkdirSync(outDir, { recursive: true });
    }
    const cssPath = join(outDir, CSS_FILE_NAME);

    let css = "";
    const files: Array<{ path: string | null; html: string }> = [];
    for (const input of parsed.inputs) {
      const markdown = readFileSync(input, "utf8");
      const built = await build(markdown, options);
      css = built.css;

      const snippet =
        options.css === "inline" ? styleSnippet(built.css) : options.css === "file" ? LINK_SNIPPET : null;
      files.push({
        path: stdoutMode ? null : outdir !== undefined ? join(outDir, htmlNameFor(input)) : (out as string),
        html: snippet === null ? built.html : injectAfterRootTag(built.html, snippet),
      });
    }

    // 一次调用只有一个主题，所以样式表只写一份，落在产物 HTML 的同一目录。
    if (options.css === "file") writeFileSync(cssPath, css);

    for (const file of files) {
      if (file.path === null) process.stdout.write(file.html);
      else writeFileSync(file.path, file.html);
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      complain(error.message);
      return 2;
    }
    complain(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
