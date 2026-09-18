import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CSS_FILE_NAME, main, parseArgs, UsageError } from "../src/cli.ts";
import type { ParsedArgs } from "../src/cli.ts";
import { DEFAULTS } from "../src/options.ts";
import type { Options } from "../src/types.ts";

// ── 测试脚手架 ─────────────────────────────────────────────────────────────

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mdblock-cli-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/** 一段覆盖标题/正文/行内代码/围栏代码的输入，围栏语言是 ts（必有 keyword token）。 */
const MARKDOWN = [
  "# 标题",
  "",
  "普通段落，带 `行内代码` 和一个 [链接](https://example.com/)。",
  "",
  "```ts",
  "const answer: number = 42;",
  "```",
  "",
].join("\n");

/** N2 的字面色值探针（在 `--css inline` 产物里只应命中内联样式表）。 */
const COLOR_LITERAL = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\brgba?\(|\bhsla?\(/;

type WriteTarget = { write(chunk: string): boolean };

/** 临时接管一个标准流，拿到 `main` 写出去的内容。 */
async function captureStd(
  stream: "stdout" | "stderr",
  run: () => Promise<number>,
): Promise<{ code: number; text: string }> {
  const target = (stream === "stdout" ? process.stdout : process.stderr) as unknown as WriteTarget;
  const original = target.write;
  let text = "";
  target.write = (chunk: string) => {
    text += chunk;
    return true;
  };
  try {
    return { code: await run(), text };
  } finally {
    target.write = original;
  }
}

function expectUsageError(run: () => unknown, pattern: RegExp): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UsageError);
  expect((caught as Error).message).toMatch(pattern);
}

// ── parseArgs（纯函数，表驱动） ────────────────────────────────────────────

describe("parseArgs：正常路径", () => {
  test("单个输入，无输出选项", () => {
    expect(parseArgs(["post.md"])).toEqual({
      help: false,
      inputs: ["post.md"],
      override: {},
    } satisfies Partial<ParsedArgs>);
  });

  test("-o 与 --out=value 两种写法", () => {
    expect(parseArgs(["post.md", "-o", "dist/x.html"]).out).toBe("dist/x.html");
    expect(parseArgs(["post.md", "--out=dist/x.html"]).out).toBe("dist/x.html");
  });

  test("批量：多个输入 + -d", () => {
    const parsed = parseArgs(["a.md", "b.md", "-d", "dist"]);
    expect(parsed.inputs).toEqual(["a.md", "b.md"]);
    expect(parsed.outdir).toBe("dist");
  });

  test("-c/--config 取路径", () => {
    expect(parseArgs(["post.md", "-c", "mdblock.json"]).config).toBe("mdblock.json");
    expect(parseArgs(["post.md", "--config=mdblock.json"]).config).toBe("mdblock.json");
  });

  test("全部长选项都进 override，且类型正确", () => {
    const parsed = parseArgs([
      "post.md",
      "--theme",
      "nord",
      "--width",
      "800px",
      "--font-size",
      "20px",
      "--line-height",
      "1.4",
      "--font-family",
      "serif",
      "--padding",
      "8px",
      "--radius",
      "4px",
      "--border",
      "1px solid red",
      "--shadow",
      "ring",
      "--bg",
      "#101014",
      "--tag",
      "article",
      "--hard-isolation",
      "--css",
      "file",
    ]);
    expect(parsed.override).toEqual({
      theme: "nord",
      width: "800px",
      fontSize: "20px",
      lineHeight: 1.4,
      fontFamily: "serif",
      padding: "8px",
      radius: "4px",
      border: "1px solid red",
      shadow: "ring",
      bg: "#101014",
      tag: "article",
      hardIsolation: true,
      css: "file",
    } satisfies Partial<Options>);
  });

  test("--line-height 解析成 number（含 --flag=value 写法）", () => {
    expect(parseArgs(["post.md", "--line-height", "2"]).override.lineHeight).toBe(2);
    expect(parseArgs(["post.md", "--line-height=1.25"]).override.lineHeight).toBe(1.25);
  });

  test("--bg 空串表示回到主题背景（null）", () => {
    expect(parseArgs(["post.md", "--bg", ""]).override.bg).toBeNull();
  });

  test("重复给出的选项后者赢", () => {
    const parsed = parseArgs(["post.md", "--theme", "nord", "--theme", "dracula"]);
    expect(parsed.override.theme).toBe("dracula");
  });

  test("--help 不需要输入文件", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  test("`--` 之后一律当作输入", () => {
    expect(parseArgs(["--", "--weird-name.md"]).inputs).toEqual(["--weird-name.md"]);
  });

  test("不存在的输入文件不会被解析期拒绝（纯函数不做 IO）", () => {
    expect(parseArgs(["definitely-missing-9f3a.md"]).inputs).toEqual(["definitely-missing-9f3a.md"]);
  });
});

describe("parseArgs：错误路径", () => {
  test("未知选项", () => {
    expectUsageError(() => parseArgs(["post.md", "--nope"]), /未知选项/);
    expectUsageError(() => parseArgs(["-z", "post.md"]), /未知选项/);
  });

  test("没有输入文件", () => {
    expectUsageError(() => parseArgs([]), /缺少输入文件/);
  });

  test("选项缺少值", () => {
    expectUsageError(() => parseArgs(["post.md", "-o"]), /缺少值/);
    expectUsageError(() => parseArgs(["post.md", "--line-height"]), /缺少值/);
  });

  test("-o 与 -d 同用", () => {
    expectUsageError(() => parseArgs(["post.md", "-o", "x.html", "-d", "dist"]), /不能同时/);
  });

  test("多个输入必须有 -d", () => {
    expectUsageError(() => parseArgs(["a.md", "b.md"]), /-d\/--outdir/);
    expectUsageError(() => parseArgs(["a.md", "b.md", "-o", "x.html"]), /-d\/--outdir/);
  });

  test("--line-height 不是数字", () => {
    expectUsageError(() => parseArgs(["post.md", "--line-height", "abc"]), /需要一个数字/);
    expectUsageError(() => parseArgs(["post.md", "--line-height", ""]), /需要一个数字/);
  });

  test("--css / --tag 的枚举校验", () => {
    expectUsageError(() => parseArgs(["post.md", "--css", "bogus"]), /只接受/);
    expectUsageError(() => parseArgs(["post.md", "--tag", "p"]), /只接受/);
  });

  test("--hard-isolation 不接受值", () => {
    expectUsageError(() => parseArgs(["post.md", "--hard-isolation=true"]), /不接受值/);
  });
});

// ── main 端到端 ────────────────────────────────────────────────────────────

describe("main：产出", () => {
  test("--css inline：写文件、读回来含 .mdblock / --mdblock- 变量 / var(--shiki-*)", async () => {
    const dir = tempDir();
    const input = join(dir, "post.md");
    const out = join(dir, "post.html");
    writeFileSync(input, MARKDOWN);

    const code = await main([input, "-o", out]);
    expect(code).toBe(0);

    const html = readFileSync(out, "utf8");
    expect(html).toContain('<div class="mdblock" data-theme="catppuccin-latte">');
    expect(html).toContain("</div>");
    expect(html).toContain("<style>");
    expect(html).toContain("--mdblock-bg:");
    expect(html).toContain("--mdblock-width:");
    expect(html).toContain("--shiki-token-keyword:");
    expect(html).toContain("var(--shiki-token-keyword)");

    // N2 属于 markup：内联样式表里必然有字面色值，剥掉它之后正文不应再有颜色。
    const markup = html.replace(/<style>[\s\S]*?<\/style>/, "");
    expect(markup).not.toMatch(COLOR_LITERAL);
    expect(html).toMatch(COLOR_LITERAL);
  });

  test("--css file：样式表写到 -o 同目录，HTML 只含 <link>", async () => {
    const dir = tempDir();
    const input = join(dir, "post.md");
    const nested = join(dir, "dist");
    const out = join(nested, "post.html");
    writeFileSync(input, MARKDOWN);

    expect(await main([input, "--css", "file", "-o", out])).toBe(0);

    const css = readFileSync(join(nested, CSS_FILE_NAME), "utf8");
    expect(css).toContain("--mdblock-bg:");
    expect(css).toContain("--shiki-token-keyword:");
    expect(css).not.toContain(":root");
    expect(css).not.toContain("!important");

    const html = readFileSync(out, "utf8");
    expect(html).toContain(`<link rel="stylesheet" href="${CSS_FILE_NAME}">`);
    expect(html).not.toContain("<style>");
    expect(html).toContain("var(--shiki-token-keyword)");
  });

  test("--css none：只有文章块，不含样式", async () => {
    const dir = tempDir();
    const input = join(dir, "post.md");
    const out = join(dir, "post.html");
    writeFileSync(input, MARKDOWN);

    expect(await main([input, "--css", "none", "-o", out])).toBe(0);

    const html = readFileSync(out, "utf8");
    expect(html).toContain('class="mdblock"');
    expect(html).toContain("var(--shiki-token-keyword)");
    expect(html).not.toContain("<style>");
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
  });

  test("批量 -d：每个输入产同名 .html，目录不存在就创建", async () => {
    const dir = tempDir();
    const first = join(dir, "alpha.md");
    const second = join(dir, "beta.md");
    const outdir = join(dir, "deep", "dist");
    writeFileSync(first, MARKDOWN);
    writeFileSync(second, "# beta\n");

    const code = await main([first, second, "-d", outdir, "--css", "file"]);
    expect(code).toBe(0);

    const alpha = readFileSync(join(outdir, "alpha.html"), "utf8");
    const beta = readFileSync(join(outdir, "beta.html"), "utf8");
    expect(alpha).toContain('class="mdblock"');
    expect(beta).toContain('class="mdblock"');
    expect(beta).not.toContain("var(--shiki-token-keyword)");
    expect(alpha).toContain(`href="${CSS_FILE_NAME}"`);
    expect(readFileSync(join(outdir, CSS_FILE_NAME), "utf8")).toContain("--mdblock-bg:");
  });

  test("单个输入 + -d 也按批量处理（写到 outdir 下的同名 .html）", async () => {
    const dir = tempDir();
    const input = join(dir, "solo.md");
    const outdir = join(dir, "out");
    writeFileSync(input, "# solo\n");

    expect(await main([input, "-d", outdir])).toBe(0);
    expect(readFileSync(join(outdir, "solo.html"), "utf8")).toContain('class="mdblock"');
  });

  test("无 -o 时写 stdout", async () => {
    const dir = tempDir();
    const input = join(dir, "post.md");
    writeFileSync(input, MARKDOWN);

    const { code, text } = await captureStd("stdout", () => main([input]));
    expect(code).toBe(0);
    expect(text).toContain('<div class="mdblock" data-theme="catppuccin-latte">');
    expect(text).toContain("<style>");
    expect(text).toContain("var(--shiki-token-keyword)");
  });
});

describe("main：优先级与错误路径", () => {
  test("DEFAULTS → --config → CLI flag，后两者逐键覆盖", async () => {
    const dir = tempDir();
    const input = join(dir, "post.md");
    const out = join(dir, "post.html");
    const config = join(dir, "mdblock.json");
    writeFileSync(input, "# 标题\n");
    writeFileSync(
      config,
      JSON.stringify({ width: "600px", "font-size": "15px", theme: "nord", hardIsolation: true, bg: null }),
    );

    expect(await main([input, "-c", config, "--width", "900px", "-o", out])).toBe(0);

    const html = readFileSync(out, "utf8");
    expect(html).toContain('<div class="mdblock" data-theme="nord">');
    expect(html).toContain("--mdblock-width: 900px"); // CLI flag 赢过 --config
    expect(html).toContain("--mdblock-font-size: 15px"); // 未被子覆盖的 config 值
    expect(html).toContain("all: revert"); // config 的布尔值
    expect(html).toContain("--mdblock-bg: #2e3440"); // bg:null → 主题的 colors.bg
  });

  test("--config 的 camelCase 键也认", async () => {
    const dir = tempDir();
    const input = join(dir, "post.md");
    const out = join(dir, "post.html");
    const config = join(dir, "camel.json");
    writeFileSync(input, "# 标题\n");
    writeFileSync(config, JSON.stringify({ fontSize: "21px", lineHeight: 2 }));

    expect(await main([input, "-c", config, "-o", out])).toBe(0);
    const html = readFileSync(out, "utf8");
    expect(html).toContain("--mdblock-font-size: 21px");
    expect(html).toContain("--mdblock-line-height: 2");
  });

  test("用法错误返回 2，消息写 stderr", async () => {
    const dir = tempDir();
    const input = join(dir, "post.md");
    writeFileSync(input, "# 标题\n");

    const cases: Array<[string, string[]]> = [
      ["未知 flag", [input, "--nope"]],
      ["输入文件不存在", [join(dir, "missing.md"), "-o", join(dir, "x.html")]],
      ["-o 与 -d 同用", [input, "-o", join(dir, "x.html"), "-d", dir]],
      ["--line-height 非数字", [input, "--line-height", "abc", "-o", join(dir, "x.html")]],
      ["--css 非法", [input, "--css", "bogus", "-o", join(dir, "x.html")]],
    ];

    for (const [label, argv] of cases) {
      const { code, text } = await captureStd("stderr", () => main(argv));
      expect(`${label}: ${code}`).toBe(`${label}: 2`);
      expect(text.trim().length, `${label} 应该写 stderr`).toBeGreaterThan(0);
    }
  });

  test("配置文件问题按用法错误处理", async () => {
    const dir = tempDir();
    const input = join(dir, "post.md");
    writeFileSync(input, "# 标题\n");

    const badJson = join(dir, "bad.json");
    writeFileSync(badJson, "{ not json");
    const unknownKey = join(dir, "unknown.json");
    writeFileSync(unknownKey, JSON.stringify({ nope: 1 }));
    const badType = join(dir, "bad-type.json");
    writeFileSync(badType, JSON.stringify({ lineHeight: "1.7" }));

    for (const argv of [
      [input, "-c", join(dir, "missing.json"), "-o", join(dir, "x.html")],
      [input, "-c", badJson, "-o", join(dir, "x.html")],
      [input, "-c", unknownKey, "-o", join(dir, "x.html")],
      [input, "-c", badType, "-o", join(dir, "x.html")],
    ]) {
      const { code, text } = await captureStd("stderr", () => main(argv));
      expect(code).toBe(2);
      expect(text).toContain("mdblock:");
    }
  });

  test("--help 输出用法并返回 0", async () => {
    const { code, text } = await captureStd("stdout", () => main(["--help"]));
    expect(code).toBe(0);
    expect(text).toContain("mdblock <input.md>");
    expect(text).toContain("--hard-isolation");
    expect(text).toContain(DEFAULTS.theme);
  });
});
