import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../src/render.ts";
import type { Options, Theme } from "../src/types.ts";

/** 自造 fixture：本模块测试不依赖 `src/theme.ts` / `src/options.ts`。 */
const theme: Theme = {
  id: "fixture-dark",
  name: "Fixture Dark",
  family: "fixture",
  mode: "dark",
  source: "https://example.com/fixture",
  colors: {
    bg: "#101014",
    surface: "#181820",
    text: "#e6e6f0",
    heading: "#f5f5ff",
    muted: "#9a9ab0",
    border: "#2a2a36",
    accent: "#7aa2f7",
    accentAlt: "#bb9af7",
    codeBg: "#0c0c12",
    codeText: "#d8d8ee",
    syntax: {
      string: "#9ece6a",
      comment: "#565f89",
      constant: "#ff9e64",
      keyword: "#bb9af7",
      parameter: "#e0af68",
      function: "#7aa2f7",
      stringExpression: "#73daca",
      punctuation: "#89ddff",
      link: "#7dcfff",
      inserted: "#9ece6a",
      deleted: "#f7768e",
      changed: "#e0af68",
    },
  },
};

const options: Options = {
  theme: "fixture-dark",
  width: "720px",
  fontSize: "17px",
  lineHeight: 1.7,
  fontFamily: 'system-ui, sans-serif',
  padding: "32px",
  radius: "12px",
  border: "",
  shadow: "soft",
  bg: null,
  tag: "article",
  hardIsolation: false,
  css: "inline",
};

/** N2 的机器可检形式。 */
const LITERAL_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

/** 去掉标签并还原实体后的可见文本，用来断言"内容没被改动"。 */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

const DOC = `# 大标题

段落，含 [链接](https://example.com/one) 和 \`inline code\`。

| 列 A | 列 B |
| --- | --- |
| 1 | 2 |

- [ ] 未完成
- [x] 已完成

~~删掉这句~~

\`\`\`ts
const answer: number = 42;
// 注释
\`\`\`

\`\`\`notalang
who knows <b>this</b>
\`\`\`

\`\`\`
无语言围栏 <b>raw</b>
\`\`\`
`;

describe("根元素", () => {
  test("tag / class / data-theme 由 options 与 theme 决定", async () => {
    const html = await renderMarkdown("# hi", theme, options);
    expect(html.startsWith(`<article class="mdblock" data-theme="${theme.id}">`)).toBe(true);
    expect(html.trimEnd().endsWith("</article>")).toBe(true);
    expect(html).toContain("<h1>hi</h1>");

    const div = await renderMarkdown("# hi", theme, { ...options, tag: "div" });
    expect(div.startsWith(`<div class="mdblock" data-theme="${theme.id}">`)).toBe(true);
    expect(div.trimEnd().endsWith("</div>")).toBe(true);

    const section = await renderMarkdown("# hi", theme, { ...options, tag: "section" });
    expect(section.startsWith(`<section class="mdblock" data-theme="${theme.id}">`)).toBe(true);
    expect(section.trimEnd().endsWith("</section>")).toBe(true);
  });

  test("空文档也返回完整根元素", async () => {
    expect(await renderMarkdown("", theme, options)).toBe(
      `<article class="mdblock" data-theme="${theme.id}"></article>\n`,
    );
  });
});

describe("N2：输出不含字面色值", () => {
  test("富文本文档整篇扫描为零", async () => {
    const html = await renderMarkdown(DOC, theme, options);
    expect(LITERAL_COLOR_RE.test(html)).toBe(false);
    expect(html).toContain("mdblock-code");
  });

  test("高亮只引用 var(--shiki-*)", async () => {
    const html = await renderMarkdown(DOC, theme, options);
    expect(html).toContain("var(--shiki-token-keyword)");
    expect(html).toContain("var(--shiki-token-comment)");
    expect(html).toContain("var(--shiki-token-constant)");
  });
});

describe("代码块", () => {
  test("标语言的围栏块结构与类名固定", async () => {
    const html = await renderMarkdown("```ts\nconst x: number = 1;\n```\n", theme, options);
    expect(html).toContain('<pre class="mdblock-code"><code class="language-ts">');
    expect(html).toContain("var(--shiki-token-keyword)");
    expect(html).toContain("</code></pre>");
  });

  test("代码内容原样保留（换行、缩进、转义）", async () => {
    const source = "if (a < b) {\n  go();\n}";
    const html = await renderMarkdown(`\`\`\`ts\n${source}\n\`\`\`\n`, theme, options);
    // `<` 在 HTML 里必须被转义，但代码块的可见文本要与围栏内容逐字相同。
    expect(html).not.toContain("if (a < b)");
    expect(textOf(html)).toContain(source);
  });

  test("未标语言的围栏块按纯文本渲染", async () => {
    const html = await renderMarkdown("```\nplain <b>text</b>\n```\n", theme, options);
    expect(html).toContain('<pre class="mdblock-code"><code class="language-text">');
    expect(html).toContain("&lt;b&gt;text&lt;/b&gt;");
    expect(LITERAL_COLOR_RE.test(html)).toBe(false);
  });

  test("未知语言降级为纯文本，不抛错", async () => {
    const html = await renderMarkdown("```notalang\nsome : stuff\n```\n", theme, options);
    expect(html).toContain('<pre class="mdblock-code"><code class="language-text">');
    expect(html).toContain("some : stuff");
  });

  test("info string 经校验：恶意/畸形语言名不会进入 HTML", async () => {
    const html = await renderMarkdown(
      '```ts"><script>alert(1)</script>\nconst a = 1;\n```\n',
      theme,
      options,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain('language-ts"');
    expect(html).toContain('<code class="language-text">');
    expect(html).toContain("const a = 1;");
  });

  test("info string 的附加信息不影响语言解析", async () => {
    const html = await renderMarkdown('```ts title="x"\nconst a = 1;\n```\n', theme, options);
    expect(html).toContain('<code class="language-ts">');
  });

  test("空围栏块不抛错", async () => {
    const html = await renderMarkdown("```ts\n```\n", theme, options);
    expect(html).toContain('<pre class="mdblock-code"><code class="language-ts">');
  });
});

describe("GFM", () => {
  test("表格渲染成 <table>", async () => {
    const html = await renderMarkdown("| a | b |\n| - | - |\n| 1 | 2 |\n", theme, options);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>1</td>");
  });

  test("任务列表渲染出复选框", async () => {
    const html = await renderMarkdown("- [ ] todo\n- [x] done\n", theme, options);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain("contains-task-list");
  });

  test("删除线渲染成 <s> / <del>", async () => {
    const html = await renderMarkdown("~~gone~~\n", theme, options);
    expect(/<(s|del)>gone<\/(s|del)>/.test(html)).toBe(true);
  });

  test("裸 URL 自动链接", async () => {
    const html = await renderMarkdown("see https://example.com/path now\n", theme, options);
    expect(html).toContain('<a href="https://example.com/path">');
  });
});

describe("转义与标题", () => {
  test("正文里的 HTML 被转义", async () => {
    const html = await renderMarkdown("before <script>alert(1)</script> after\n", theme, options);
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("图片 alt 与属性被转义", async () => {
    const html = await renderMarkdown('![a "quoted" alt](/img.png)\n', theme, options);
    expect(html).toContain("<img src=\"/img.png\" alt=\"a &quot;quoted&quot; alt\">");
  });

  test("h1–h6 正确映射", async () => {
    const html = await renderMarkdown(
      "# one\n\n## two\n\n### three\n\n#### four\n\n##### five\n\n###### six\n",
      theme,
      options,
    );
    for (const [level, text] of [
      [1, "one"],
      [2, "two"],
      [3, "three"],
      [4, "four"],
      [5, "five"],
      [6, "six"],
    ] as const) {
      expect(html).toContain(`<h${level}>${text}</h${level}>`);
    }
    expect(html).not.toContain("<h7>");
  });
});
