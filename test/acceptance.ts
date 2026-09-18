#!/usr/bin/env bun
/**
 * mdblock 端到端验收（控制方所有，Wave 0 之后的验收设施）。
 *
 * 三件事：
 *   1. 用真实 CLI 产出全部四种样式模式（inline / file / none）的产物
 *   2. 对产物做机器断言：契约不变量 N1（无 :root 泄漏）、N2（HTML 无字面色值）、
 *      变量齐全、修订 A-1（变量挂在 .mdblock[data-theme]）、错误路径退出码
 *   3. 组装 dist/hostile.html：把三个不同主题的文章块塞进敌意宿主页，
 *      并注入一个探针脚本，把计算样式写进页面与 window.__mdblockProbe，
 *      供浏览器侧复核（截图 + 读值）
 *
 * 用法：bun test/acceptance.ts
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SHIKI_BACKGROUND_VAR,
  SHIKI_FOREGROUND_VAR,
  SYNTAX_KEYS,
  shikiVarName,
} from "../src/syntax-map.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, "dist");

/** 契约 §3 表格里那 18 个 `--mdblock-*` 变量。 */
const MD_VARS = [
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
] as const;

const SHIKI_VARS = [
  SHIKI_FOREGROUND_VAR,
  SHIKI_BACKGROUND_VAR,
  ...SYNTAX_KEYS.map((key) => shikiVarName(key)),
] as const;

/** N2：字面色值探测器。`--shiki-*` 变量引用不算。 */
const COLOR_LITERAL = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\brgba?\(|\bhsla?\(/;

let passed = 0;
const failures: string[] = [];

function check(id: string, desc: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${id}  ${desc}`);
  } catch (error) {
    failures.push(`${id} ${desc} — ${(error as Error).message}`);
    console.log(`  \u2717 ${id}  ${desc}\n       ${(error as Error).message}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function cli(args: string[]): { code: number; stdout: string; stderr: string } {
  const proc = spawnSync("bun", ["src/cli.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return { code: proc.status ?? -1, stdout: proc.stdout ?? "", stderr: proc.stderr ?? "" };
}

/** 抽出 CSS 里每个规则的选择器（去注释后按 `{` 切分），用于 N1 检查。 */
function topLevelSelectors(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors: string[] = [];
  for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
    for (const piece of (match[1] ?? "").split(",")) {
      const selector = piece.trim();
      if (selector) selectors.push(selector);
    }
  }
  return selectors;
}

// ── 1. 产出 ────────────────────────────────────────────────────────────────

console.log("\n[1] 用真实 CLI 产出产物");
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const runs = {
  latte: cli(["examples/post.md", "--theme", "catppuccin-latte", "--css", "inline", "-o", "dist/latte.html"]),
  mocha: cli(["examples/post.md", "--theme", "catppuccin-mocha", "--css", "inline", "-o", "dist/mocha.html"]),
  nordIsolated: cli(["examples/post.md", "--theme", "nord", "--hard-isolation", "--css", "inline", "-o", "dist/nord.html"]),
  fileMode: cli(["examples/post.md", "--theme", "nord", "--css", "file", "-o", "dist/file.html"]),
  noneMode: cli(["examples/post.md", "--theme", "nord", "--css", "none", "-o", "dist/none.html"]),
};

for (const [name, run] of Object.entries(runs)) {
  check(`E-${name}`, `CLI 退出码 0（${name}）`, () => {
    assert(run.code === 0, `退出码 ${run.code}；stderr: ${run.stderr.slice(0, 300)}`);
  });
}

// ── 2. 产物断言 ────────────────────────────────────────────────────────────

console.log("\n[2] 契约不变量");

const fragments = {
  latte: readFileSync(join(DIST, "latte.html"), "utf8"),
  mocha: readFileSync(join(DIST, "mocha.html"), "utf8"),
  nord: readFileSync(join(DIST, "nord.html"), "utf8"),
};

for (const [name, html] of Object.entries(fragments)) {
  check(`N2-${name}`, `markup 无字面色值（${name}）`, () => {
    // N2 判的是 markup：`--css inline` 的 `<style>` 块职责正是定义这些颜色，必须剥掉再扫。
    const markup = html.replace(/<style>[\s\S]*?<\/style>/g, "");
    const hits = markup.match(new RegExp(COLOR_LITERAL, "g"));
    assert(hits === null, `markup 出现字面色值：${(hits ?? []).slice(0, 5).join(", ")}`);
  });
}

check("N2-0", "inline 样式表本身确实定义了颜色（上一条不是因为空文件而通过）", () => {
  const styleBlocks = fragments.latte.match(/<style>[\s\S]*?<\/style>/g) ?? [];
  assert(styleBlocks.length === 1, `inline 产物应有 1 个 <style>，实际 ${styleBlocks.length}`);
  assert(
    new RegExp(COLOR_LITERAL).test(styleBlocks[0] ?? ""),
    "内联样式表里没有任何字面色值 —— 主题色没被写进去，说明契约变量是空的",
  );
});

check("B-1", "根元素形如 <div class=\"mdblock\" data-theme=\"…\">", () => {
  assert(
    fragments.latte.includes('<div class="mdblock" data-theme="catppuccin-latte">'),
    "latte 片段里没找到期望的根元素",
  );
  assert(
    fragments.nord.includes('<div class="mdblock" data-theme="nord">'),
    "nord 片段里没找到期望的根元素",
  );
});

check("B-2", "代码高亮引用 var(--shiki-token-keyword)", () => {
  assert(
    fragments.latte.includes("var(--shiki-token-keyword)"),
    "没找到 --shiki-token-keyword 的引用 —— 高亮可能用了内置主题而不是 css-variables",
  );
});

check("B-3", "inline 模式自包含（含 <style>）", () => {
  assert(fragments.latte.includes("<style>"), "inline 模式产物里没有 <style>");
});

check("B-5", "所有 <pre> 都是 .mdblock-code（含缩进式代码块）", () => {
  const total = fragments.latte.match(/<pre\b/g) ?? [];
  const tagged = fragments.latte.match(/<pre class="mdblock-code">/g) ?? [];
  assert(
    total.length === tagged.length,
    `共 ${total.length} 个 <pre>，只有 ${tagged.length} 个带 mdblock-code —— ` +
      "有代码块绕过了渲染管线（缩进式代码块最容易漏）",
  );
  assert(total.length >= 4, `示例文档应产出多个代码块，实际只有 ${total.length}`);
});

check("B-4", "hardIsolation 打开时根规则含 all: revert", () => {
  assert(fragments.nord.includes("all: revert"), "nord（--hard-isolation）产物里没有 all: revert");
  assert(!fragments.latte.includes("all: revert"), "latte 没开 --hard-isolation 却出现了 all: revert");
});

// ── 2b. --css file ────────────────────────────────────────────────────────

console.log("\n[3] --css file / --css none");

check("F-1", "产出 dist/mdblock.css 且 HTML 只用 <link>", () => {
  assert(existsSync(join(DIST, "mdblock.css")), "dist/mdblock.css 不存在");
  const html = readFileSync(join(DIST, "file.html"), "utf8");
  assert(
    html.includes('<link rel="stylesheet" href="mdblock.css">'),
    "file.html 里没有期望的 <link>",
  );
  assert(!html.includes("<style>"), "file 模式不应该内联 <style>");
});

check("S-1", "--css none 既不内联也不链接样式", () => {
  const html = readFileSync(join(DIST, "none.html"), "utf8");
  assert(!html.includes("<style>"), "none 模式不该有 <style>");
  assert(!/<link[^>]+stylesheet/.test(html), "none 模式不该有 stylesheet <link>");
  assert(html.includes('class="mdblock"'), "none 模式仍应产出文章块标记");
});

const css = readFileSync(join(DIST, "mdblock.css"), "utf8");

check("N1-1", "CSS 不含 :root", () => {
  assert(!/(^|[\s,{}]):root\b/.test(css), "CSS 里出现了 :root 选择器");
});

check("N1-2", "CSS 每个选择器都以 .mdblock 开头（或 @ 规则）", () => {
  const bad = topLevelSelectors(css).filter((s) => !s.startsWith(".mdblock") && !s.startsWith("@"));
  assert(bad.length === 0, `越界选择器：${bad.slice(0, 5).join(" | ")}`);
});

check("N1-3", "CSS 不用 !important", () => {
  assert(!css.includes("!important"), "CSS 里出现了 !important");
});

check("V-1", `CSS 定义全部 ${MD_VARS.length + SHIKI_VARS.length} 个公开变量`, () => {
  const missing = [...MD_VARS, ...SHIKI_VARS].filter((name) => !css.includes(`${name}:`));
  assert(missing.length === 0, `缺少变量：${missing.join(", ")}`);
});

check("A1-1", "修订 A-1：变量定义在 .mdblock[data-theme=\"nord\"]", () => {
  const scoped = /\.mdblock\[data-theme="nord"\]\s*\{([\s\S]*?)\}/.exec(css);
  assert(scoped !== null, '没找到 .mdblock[data-theme="nord"] 规则');
  const body = scoped[1] ?? "";
  const missing = [...MD_VARS, ...SHIKI_VARS].filter((name) => !body.includes(`${name}:`));
  assert(missing.length === 0, `该规则里缺少变量：${missing.join(", ")}`);
  const bare = /(^|\n)\.mdblock\s*\{([\s\S]*?)\}/.exec(css);
  if (bare) {
    const leak = [...MD_VARS, ...SHIKI_VARS].filter((name) => (bare[2] ?? "").includes(`${name}:`));
    assert(leak.length === 0, `裸 .mdblock 规则里仍在定义变量：${leak.join(", ")}`);
  }
});

// ── 3. 错误路径 ────────────────────────────────────────────────────────────

console.log("\n[4] 错误路径退出码");

const errorRuns: Array<[string, string[], number]> = [
  ["X-1 未知 flag", ["examples/post.md", "--nope"], 2],
  ["X-2 -o 与 -d 同用", ["examples/post.md", "-o", "dist/x.html", "-d", "dist"], 2],
  ["X-3 输入文件不存在", ["examples/does-not-exist.md", "-o", "dist/x.html"], 2],
  ["X-4 --line-height 非数字", ["examples/post.md", "--line-height", "abc", "-o", "dist/x.html"], 2],
];

for (const [label, args, expected] of errorRuns) {
  check(label, `退出码 ${expected}`, () => {
    const run = cli(args);
    assert(run.code === expected, `实际退出码 ${run.code}；stderr: ${run.stderr.slice(0, 200)}`);
    assert(run.stderr.trim().length > 0, "错误信息应该写到 stderr");
  });
}

check("X-5", "批量同名 basename 报用法错误而不是静默覆盖", () => {
  const run = cli(["examples/post.md", "examples/post.md", "-d", "dist/collide"]);
  assert(run.code === 2, `实际退出码 ${run.code}，期望 2`);
  assert(/同一个文件/.test(run.stderr), `失败原因不对：${run.stderr.slice(0, 200)}`);
  assert(!existsSync(join(DIST, "collide")), "报错时不应该留下输出目录");
});

check("X-6", "内置主题在任意 cwd 下可用（不再依赖仓库根）", () => {
  const proc = spawnSync("bun", [join(ROOT, "src/cli.ts"), join(ROOT, "examples/post.md"),
    "--theme", "nord", "-o", join(DIST, "cwd-free.html")], { cwd: DIST, encoding: "utf8" });
  assert(proc.status === 0, `从 ${DIST} 运行时退出码 ${proc.status}；stderr: ${(proc.stderr ?? "").slice(0, 200)}`);
  const html = readFileSync(join(DIST, "cwd-free.html"), "utf8");
  assert(html.includes('data-theme="nord"'), "产物里没有 nord 主题");
  assert(html.includes("--mdblock-bg: #2e3440"), "nord 的背景色没写进产物");
});

check("X-7", "未知主题名给出明确的 ThemeError 而不是崩溃", () => {
  const run = cli(["examples/post.md", "--theme", "no-such-theme", "-o", "dist/x.html"]);
  assert(run.code === 1, `实际退出码 ${run.code}，期望 1`);
  assert(/找不到主题/.test(run.stderr), `错误信息不对：${run.stderr.slice(0, 200)}`);
});

// ── 4. 组装敌意宿主页 ──────────────────────────────────────────────────────

console.log("\n[5] 组装敌意宿主页");

const PROBE = `
<pre id="probe-output" style="font:12px/1.5 monospace;letter-spacing:normal;text-transform:none;background:#fff;color:#111;padding:12px;margin:24px 0;white-space:pre-wrap;"></pre>
<script>
(function () {
  var blocks = [
    { id: "A", selector: 'section[data-probe="A"] .mdblock' },
    { id: "B", selector: 'section[data-probe="B"] .mdblock' },
    { id: "C", selector: 'section[data-probe="C"] .mdblock' }
  ];
  var report = {};
  var lines = [];
  blocks.forEach(function (b) {
    var root = document.querySelector(b.selector);
    if (!root) { report[b.id] = null; return; }
    var g = getComputedStyle(root);
    var p = root.querySelector("p");
    var gp = p ? getComputedStyle(p) : null;
    var a = root.querySelector("a");
    var ga = a ? getComputedStyle(a) : null;
    var pre = root.querySelector("pre");
    var gpre = pre ? getComputedStyle(pre) : null;
    var th = root.querySelector("th");
    var gth = th ? getComputedStyle(th) : null;
    var li = root.querySelector("li");
    var gli = li ? getComputedStyle(li) : null;
    report[b.id] = {
      dataTheme: root.getAttribute("data-theme"),
      background: g.backgroundColor,
      color: g.color,
      fontFamily: g.fontFamily.slice(0, 40),
      letterSpacing: g.letterSpacing,
      textTransform: g.textTransform,
      pMarginTop: gp ? gp.marginTop : null,
      pColor: gp ? gp.color : null,
      pLineHeight: gp ? gp.lineHeight : null,
      aColor: ga ? ga.color : null,
      preBackground: gpre ? gpre.backgroundColor : null,
      preFontFamily: gpre ? gpre.fontFamily.slice(0, 30) : null,
      thTextAlign: gth ? gth.textAlign : null,
      thBorderStyle: gth ? gth.borderStyle : null,
      liListStyle: gli ? gli.listStyleType : null,
      wordSpacing: g.wordSpacing,
      boxSizing: g.boxSizing,
      preFontSize: gpre ? gpre.fontSize : null,
      liColor: gli ? gli.color : null,
      tdColor: (function () {
        var td = root.querySelector("td");
        return td ? getComputedStyle(td).color : null;
      })(),
      strongFontWeight: (function () {
        var s = root.querySelector("strong");
        return s ? getComputedStyle(s).fontWeight : null;
      })()
    };
  });

  var A = report.A || {};
  var B = report.B || {};
  var checks = [];
  var expect = function (id, label, actual, want) {
    checks.push({ id: id, label: label, ok: String(actual) === String(want), actual: actual, want: want });
  };
  expect("L1-1", "根元素未继承宿主 letter-spacing", A.letterSpacing, "normal");
  expect("L1-2", "根元素未继承宿主 text-transform", A.textTransform, "none");
  expect("L1-3", "根元素未继承宿主 word-spacing", A.wordSpacing === "normal" || A.wordSpacing === "0px", true);
  expect("L1-4", "段落 margin 未被宿主 *{margin:0} 抹掉", A.pMarginTop !== "0px", true);
  expect("L1-5", "box-sizing 是我们的 border-box", A.boxSizing, "border-box");
  expect("L1-6", "th 边框是我们的 solid 而非宿主 dotted", A.thBorderStyle, "solid");
  expect("L1-7", "th 对齐是我们的 left 而非宿主 right", A.thTextAlign, "left");
  expect("L1-8", "代码块字体不是宿主的 cursive", String(A.preFontFamily).indexOf("cursive") === -1, true);
  expect("L1-9", "列表符号没被宿主 list-style:none 抹掉", A.liListStyle !== "none", true);
  expect("L1-10", "strong 字重不是宿主的 400", A.strongFontWeight !== "400", true);
  expect("L1-12", "代码块字号未被宿主 pre{font-size} 覆盖", parseFloat(A.preFontSize) > 12, true);
  expect("COEXIST-1", "同页两块主题不同（背景色不同）", A.background !== B.background, true);
  var C = report.C || {};
  expect("ISO-1", "hard-isolation 块的背景是主题色而非透明", C.background !== "rgba(0, 0, 0, 0)", true);
  expect("ISO-2", "hard-isolation 块的文字色不是宿主色", C.color !== "rgb(187, 0, 0)", true);
  expect("ISO-3", "hard-isolation 块未继承宿主字距", C.letterSpacing, "normal");
  expect("ISO-4", "hard-isolation 块未继承宿主大写", C.textTransform, "none");
  expect("ISO-5", "hard-isolation 块的字体不是宿主的花体", String(C.fontFamily).indexOf("cursive") === -1, true);
  var codeNodes = document.querySelectorAll('section[data-probe="A"] .mdblock pre code');
  var codeColors = Array.prototype.map.call(codeNodes, function (n) {
    return getComputedStyle(n).color;
  });
  var uniforms = codeColors.length > 0 && codeColors.every(function (c) { return c === codeColors[0]; });
  expect("L1-11", "所有代码块内层 code 字色一致（缩进块 vs 围栏块）", uniforms ? "same" : codeColors.join(" | "), "same");
  expect("L1-13", "段落文字色 = 文章块主题色（未被宿主 p{color} 改掉）", A.pColor, A.color);
  expect("L1-14", "列表项文字色 = 文章块主题色（未被宿主 li{color} 改掉）", A.liColor, A.color);
  expect("L1-15", "表格单元文字色 = 文章块主题色（未被宿主 td{color} 改掉）", A.tdColor, A.color);
  Object.keys(report).forEach(function (k) {
    lines.push("块 " + k + "  data-theme=" + (report[k] ? report[k].dataTheme : "?") +
      "\\n  bg=" + (report[k] ? report[k].background : "-") +
      "  color=" + (report[k] ? report[k].color : "-") +
      "  letter-spacing=" + (report[k] ? report[k].letterSpacing : "-") +
      "  text-transform=" + (report[k] ? report[k].textTransform : "-") +
      "\\n  p.margin-top=" + (report[k] ? report[k].pMarginTop : "-") +
      "  p.color=" + (report[k] ? report[k].pColor : "-") +
      "  a.color=" + (report[k] ? report[k].aColor : "-") +
      "\\n  pre.bg=" + (report[k] ? report[k].preBackground : "-") +
      "  th.text-align=" + (report[k] ? report[k].thTextAlign : "-") +
      "  th.border=" + (report[k] ? report[k].thBorderStyle : "-") +
      "  li.list-style=" + (report[k] ? report[k].liListStyle : "-"));
  });
  window.__mdblockProbe = report;
  window.__mdblockChecks = checks;
  lines.push("");
  lines.push("=== 验收检查（L1 普通宿主层）===");
  var failed = 0;
  checks.forEach(function (c) {
    if (!c.ok) failed++;
    lines.push((c.ok ? "PASS  " : "FAIL  ") + c.id + "  " + c.label +
      "   [实际=" + c.actual + "  期望=" + c.want + "]");
  });
  lines.push(failed === 0 ? ">>> L1 层全部通过" : (">>> " + failed + " 项失败"));
  var out = document.getElementById("probe-output");
  if (out) out.textContent = lines.join("\\n\\n");
})();
</script>
`;

const template = readFileSync(join(ROOT, "test/hostile-host.html"), "utf8");
const page = template
  .replace(
    "<!--BLOCKS-L1-->",
    `<section data-probe="A">\n${fragments.latte}\n</section>\n` +
      `<section data-probe="B">\n${fragments.mocha}\n</section>\n` +
      `<section data-probe="C">\n${fragments.nord}\n</section>`,
  )
  .replace("<!--BLOCK-L2-->", fragments.nord)
  .replace("</body>", `${PROBE}\n</body>`);
writeFileSync(join(DIST, "hostile.html"), page);

check("H-1", "三个文章块已注入 L1 层、一个注入 L2 层", () => {
  const html = readFileSync(join(DIST, "hostile.html"), "utf8");
  for (const theme of ["catppuccin-latte", "catppuccin-mocha", "nord"]) {
    assert(html.includes(`data-theme="${theme}"`), `宿主页里没找到 ${theme} 的块`);
  }
  assert(!html.includes("<!--BLOCK"), "还有未替换的占位符");
  assert(html.includes("limit-demo"), "缺少 L2 已知限制演示区");
});

// ── 汇总 ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} 通过，${failures.length} 失败`);
if (failures.length > 0) {
  console.log("\n失败项：");
  for (const line of failures) console.log(`  - ${line}`);
  console.log("\n宿主页（供浏览器复核）：dist/hostile.html");
  process.exit(1);
}
console.log("\n宿主页（供浏览器复核）：dist/hostile.html");
