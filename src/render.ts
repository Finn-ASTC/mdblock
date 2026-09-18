/**
 * Markdown → 文章块 HTML（M4）。
 *
 * 高亮主题固定为 Shiki `createCssVariablesTheme()` 的产物：它自身不携带任何具体色值，
 * 只把 token 颜色写成 `var(--shiki-*)` 引用。因此本模块产出的 HTML 里没有字面颜色
 * （契约 N2），"换主题不用重新高亮" 才成立 —— `theme` 参数只用于根元素的 `data-theme`，
 * 真正定义这些变量的是 `css.ts`。
 *
 * 同步/异步矛盾：markdown-it 的 `highlight` / 渲染器规则是同步的，Shiki 是异步的。
 * 这里让围栏规则只产出一个占位符并把 `{lang, code}` 收进每次渲染独立的 `env`，等
 * `md.render()` 同步跑完后并发解析所有代码块，再整块字符串替换回占位符。
 * `renderMarkdown` 的签名因此保持不变。
 */

import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import { createCssVariablesTheme, createHighlighter } from "shiki";
import type { BundledLanguage, Highlighter } from "shiki";
import type { Options, Theme } from "./types.ts";

/** Shiki 变量主题名；`codeToHtml` 用名字引用已注册的主题，不必每次重新归一化。 */
const SHIKI_THEME_NAME = "mdblock-css-variables";

/** Shiki 变量主题；进程内共享，不含色值，可安全跨调用复用。 */
const SHIKI_THEME = createCssVariablesTheme({ name: SHIKI_THEME_NAME });

/** 未标语言、语言不可用或渲染失败时写进 `<code>` 的语言类名。 */
const PLAIN_LANG = "text";

/** 允许作为根元素的标签（`BlockTag`）。 */
const TAGS = ["div", "article", "section"] as const;

/**
 * 高亮器为进程内单例：创建时 `langs: []`，之后按需 `loadLanguage()`，
 * 所以整包语法不会被预载进内存。
 */
let highlighterPromise: Promise<Highlighter> | undefined;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: [SHIKI_THEME], langs: [] });
  return highlighterPromise;
}

/** 语言名 → 是否可用。失败结果一并缓存，避免同一个未知语言反复触发 ShikiError。 */
const languageLoads = new Map<string, Promise<boolean>>();

function loadLanguage(lang: string): Promise<boolean> {
  let pending = languageLoads.get(lang);
  if (!pending) {
    pending = (async () => {
      try {
        const highlighter = await getHighlighter();
        await highlighter.loadLanguage(lang as BundledLanguage);
        return true;
      } catch {
        // 未知语言：按纯文本降级，不抛错。
        return false;
      }
    })();
    languageLoads.set(lang, pending);
  }
  return pending;
}

/**
 * 允许的语言名形态：字母数字开头，其余为字母数字与 `+#._-`。
 * 通过校验的名字才可能进入 `class="language-…"`，因此任何别名/引号/尖括号都进不来。
 */
const LANG_NAME_RE = /^[a-z0-9][a-z0-9+#._-]*$/;

/** 取 fence info string 的首个词（允许 ```ts title="x" 这类附加信息）并校验。 */
function readLang(info: string): string | undefined {
  const name = (info.trim().split(/\s+/)[0] ?? "").toLowerCase();
  return LANG_NAME_RE.test(name) ? name : undefined;
}

/**
 * 代码块占位符。markdown-it 会把输入里的 NUL 归一化成 U+FFFD，所以被 NUL 包夹的标记
 * 不可能与正文（或代码内容）撞车。
 */
function codeMarker(index: number): string {
  return `\u0000mdblock-code-${index}\u0000`;
}

type PendingCodeBlock = {
  /** 已校验的小写语言名；`undefined` 表示按纯文本渲染。 */
  lang: string | undefined;
  code: string;
};

/** 每次 `renderMarkdown` 独立传入的 env，占位符与代码块靠它关联。 */
type RenderEnv = { codeBlocks: PendingCodeBlock[] };

const md = new MarkdownIt({ html: false, linkify: true });
md.use(taskLists, { enabled: false });

// CommonMark + GFM 表格/删除线由 markdown-it 默认 preset 提供，任务列表由插件提供，
// 自动链接由 linkify: true 提供；原始 HTML 关闭（html: false），正文里的标签会被转义。
md.renderer.rules.fence = (tokens, idx, _options, env) => {
  const token = tokens[idx];
  if (!token) return "";
  const { codeBlocks } = env as unknown as RenderEnv;
  const index = codeBlocks.length;
  codeBlocks.push({ lang: readLang(token.info), code: token.content });
  return codeMarker(index);
};

/** 渲染单个围栏代码块；语言不可用或渲染失败时降级为纯文本，不抛错。 */
async function renderCodeBlock(block: PendingCodeBlock): Promise<string> {
  // 围栏内容总是以一个换行结尾，去掉它，免得 `<pre>` 里多出一整行空白。
  const source = block.code.replace(/\n$/, "");
  const { lang } = block;
  if (lang && (await loadLanguage(lang))) {
    try {
      const highlighter = await getHighlighter();
      const inner = highlighter
        .codeToHtml(source, { lang, theme: SHIKI_THEME_NAME, structure: "inline" })
        // inline 结构用 `<br>` 分行；`<pre>` 里换成真正的换行，复制时换行才不丢。
        .replace(/<br\s*\/?>/g, "\n");
      return `<pre class="mdblock-code"><code class="language-${lang}">${inner}</code></pre>`;
    } catch {
      // 语法本身渲染失败：退回纯文本。
    }
  }
  return `<pre class="mdblock-code"><code class="language-${PLAIN_LANG}">${md.utils.escapeHtml(source)}</code></pre>`;
}

/**
 * 把 Markdown 渲染成完整文章块根元素：
 * `<{tag} class="mdblock" data-theme="{theme.id}">…</{tag}>`。
 */
export async function renderMarkdown(
  markdown: string,
  theme: Theme,
  options: Options,
): Promise<string> {
  if (!TAGS.includes(options.tag)) {
    throw new TypeError(
      `mdblock: 不支持的根元素标签 ${JSON.stringify(options.tag)}，只允许 ${TAGS.join(" / ")}`,
    );
  }

  const env: RenderEnv = { codeBlocks: [] };
  let body = md.render(markdown, env);

  const rendered = await Promise.all(env.codeBlocks.map((block) => renderCodeBlock(block)));
  env.codeBlocks.forEach((_block, index) => {
    // split/join 而非 replace：替换内容里的 `$&` 之类不会被当成替换模式。
    body = body.split(codeMarker(index)).join(rendered[index] ?? "");
  });

  const inner = body.trim();
  const themeId = md.utils.escapeHtml(theme.id);
  return `<${options.tag} class="mdblock" data-theme="${themeId}">${
    inner ? `\n${inner}\n` : ""
  }</${options.tag}>\n`;
}
