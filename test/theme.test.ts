/**
 * `src/theme.ts` 的行为测试。
 *
 * 断言行为（抛什么错、合并成什么值），不断言实现细节。fixture 主题全部位于
 * `test/fixtures/`，不依赖 `themes/*.json`（那些文件由 M1 模块负责，本 worktree
 * 里可能还没有）。
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { ThemeError, loadTheme, validateTheme } from "../src/theme.ts";

const FIXTURES = join(import.meta.dir, "fixtures");

function fixture(name: string): string {
  return join(FIXTURES, name);
}

/** 断言 `fn` 抛 `ThemeError`，可选断言消息内容，并返回该错误。 */
function expectThemeError(fn: () => unknown, pattern?: RegExp): ThemeError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ThemeError);
  const error = caught as ThemeError;
  if (pattern !== undefined) expect(error.message).toMatch(pattern);
  return error;
}

const BASE = loadTheme(fixture("base.json"));

describe("loadTheme：合法主题", () => {
  test("逐字段解析合法主题文件", () => {
    const theme = loadTheme(fixture("valid.json"));

    expect(theme.id).toBe("fixture-valid");
    expect(theme.name).toBe("Fixture Valid");
    expect(theme.family).toBe("fixture");
    expect(theme.mode).toBe("light");
    expect(theme.source).toBe("https://example.invalid/fixture-valid");

    expect(theme.colors.bg).toBe("#ffffff");
    expect(theme.colors.surface).toBe("#f4f4f6");
    expect(theme.colors.text).toBe("#1b1b1f");
    expect(theme.colors.heading).toBe("#000000");
    expect(theme.colors.muted).toBe("#767680");
    expect(theme.colors.border).toBe("#d8d8de");
    expect(theme.colors.accent).toBe("#0055ff");
    expect(theme.colors.accentAlt).toBe("#aa00ff");
    expect(theme.colors.codeBg).toBe("#f0f0f4");
    expect(theme.colors.codeText).toBe("#222228");

    expect(theme.colors.syntax.string).toBe("#008000");
    expect(theme.colors.syntax.comment).toBe("#808080");
    expect(theme.colors.syntax.constant).toBe("#b00020");
    expect(theme.colors.syntax.keyword).toBe("#0000ff");
    expect(theme.colors.syntax.parameter).toBe("#a0522d");
    expect(theme.colors.syntax.function).toBe("#795548");
    expect(theme.colors.syntax.stringExpression).toBe("#008000");
    expect(theme.colors.syntax.punctuation).toBe("#555555");
    expect(theme.colors.syntax.link).toBe("#0066cc");
    expect(theme.colors.syntax.inserted).toBe("#2e7d32");
    expect(theme.colors.syntax.deleted).toBe("#c62828");
    expect(theme.colors.syntax.changed).toBe("#ef6c00");
  });

  test("缺省字段补齐：id 用文件名 stem，family 用 id，mode 为 dark，source 为空串", () => {
    const theme = loadTheme(fixture("minimal.json"));

    expect(theme.id).toBe("minimal");
    expect(theme.family).toBe("minimal");
    expect(theme.mode).toBe("dark");
    expect(theme.source).toBe("");
    expect(theme.name).toBe("Fixture Minimal");
    expect(theme.colors.syntax.link).toBe("#73daca");
  });

  test("相对 cwd 的路径引用也能加载", () => {
    const ref = `./${relative(process.cwd(), fixture("valid.json"))}`;
    expect(loadTheme(ref).id).toBe("fixture-valid");
  });

  test("内置 id 形式在 searchDir 下查 <id>.json", () => {
    const theme = loadTheme("fixture-found", { searchDir: fixture("search") });
    expect(theme.id).toBe("fixture-found");
    expect(theme.name).toBe("Fixture Found");
    expect(theme.mode).toBe("light");
  });
});

describe("validateTheme：直接校验已解析数据", () => {
  test("合法对象 + baseDir 解析 extends", () => {
    const data = JSON.parse(
      `{"name":"Inline Child","extends":"./base.json","colors":{"accent":"#123456"}}`,
    );
    const theme = validateTheme(data, { baseDir: FIXTURES });

    expect(theme.name).toBe("Inline Child");
    expect(theme.colors.accent).toBe("#123456");
    expect(theme.colors.text).toBe(BASE.colors.text);
    expect(theme.colors.syntax.string).toBe(BASE.colors.syntax.string);
  });

  test("inline 数据没有文件名可用时，id 回落到 name 派生的 slug", () => {
    const theme = validateTheme({
      name: "Inline Theme",
      colors: BASE.colors,
    });
    expect(theme.id).toBe("inline-theme");
  });
});

describe("extends：逐键覆盖", () => {
  test("只覆盖给出的 token，其余继承基座", () => {
    const theme = loadTheme(fixture("extends-one.json"));

    expect(theme.colors.accent).toBe("#ff0000");
    expect(theme.colors.syntax.keyword).toBe("#123456");

    expect(theme.colors.bg).toBe(BASE.colors.bg);
    expect(theme.colors.surface).toBe(BASE.colors.surface);
    expect(theme.colors.text).toBe(BASE.colors.text);
    expect(theme.colors.heading).toBe(BASE.colors.heading);
    expect(theme.colors.muted).toBe(BASE.colors.muted);
    expect(theme.colors.border).toBe(BASE.colors.border);
    expect(theme.colors.accentAlt).toBe(BASE.colors.accentAlt);
    expect(theme.colors.codeBg).toBe(BASE.colors.codeBg);
    expect(theme.colors.codeText).toBe(BASE.colors.codeText);

    for (const key of [
      "string",
      "comment",
      "constant",
      "parameter",
      "function",
      "stringExpression",
      "punctuation",
      "link",
      "inserted",
      "deleted",
      "changed",
    ] as const) {
      expect(theme.colors.syntax[key]).toBe(BASE.colors.syntax[key]);
    }

    expect(theme.name).toBe("Fixture Extends One");
    expect(theme.id).toBe("fixture-extends-one");
    expect(theme.family).toBe(BASE.family);
    expect(theme.mode).toBe(BASE.mode);
    expect(theme.source).toBe(BASE.source);
  });

  test("只有 extends 没有 colors 时全部继承基座（name 仍被覆盖）", () => {
    const theme = loadTheme(fixture("bare-extends.json"));

    expect(theme.name).toBe("Fixture Bare Extends");
    expect(theme.colors).toEqual(BASE.colors);
  });

  test("extends 链两层：每一层覆盖自己给出的键", () => {
    const mid = loadTheme(fixture("extends-mid.json"));
    const top = loadTheme(fixture("extends-top.json"));

    expect(mid.colors.accent).toBe("#00aa88");
    expect(mid.colors.bg).toBe("#010203");

    expect(top.colors.heading).toBe("#abcdef");
    expect(top.colors.syntax.keyword).toBe("#0f0f0f");
    expect(top.colors.accent).toBe("#00aa88");
    expect(top.colors.bg).toBe("#010203");
    expect(top.colors.text).toBe(BASE.colors.text);
    expect(top.colors.syntax.comment).toBe(BASE.colors.syntax.comment);
    expect(top.family).toBe("fixture-top");
    expect(top.id).toBe("fixture-extends-top");
  });

  test("extends 的引用可以是内置 id（配合 searchDir）", () => {
    const theme = loadTheme(fixture("child-by-id.json"), { searchDir: fixture("search") });

    expect(theme.name).toBe("Fixture By Id");
    expect(theme.colors.accent).toBe("#abcdef");
    expect(theme.colors.text).toBe(
      loadTheme("fixture-found", { searchDir: fixture("search") }).colors.text,
    );
  });

  test("extends 子文件缺 id 时用文件名 stem，而不是继承基座的 id", () => {
    const theme = loadTheme(fixture("extends-no-id.json"));

    expect(theme.id).toBe("extends-no-id");
    expect(theme.id).not.toBe(BASE.id);
    expect(theme.colors.accent).toBe("#00ff00");
    expect(theme.colors.text).toBe(BASE.colors.text);
  });
});

describe("extends：循环必须抛 ThemeError", () => {
  test("自引用", () => {
    expectThemeError(() => loadTheme(fixture("self-cycle.json")), /循环/);
  });

  test("A -> B -> A", () => {
    expectThemeError(() => loadTheme(fixture("cycle-a.json")), /循环/);
  });

  test("从 B 进入同样报循环", () => {
    expectThemeError(() => loadTheme(fixture("cycle-b.json")), /循环/);
  });
});

describe("loadTheme：找不到或读不了都要是 ThemeError", () => {
  test("找不到内置主题：抛出 ThemeError，而不是 ENOENT 裸错误", () => {
    const error = expectThemeError(
      () => loadTheme("definitely-not-a-theme-9f3a"),
      /找不到主题/,
    );
    expect((error as NodeJS.ErrnoException).code).toBeUndefined();
  });

  test("找不到相对路径主题", () => {
    expectThemeError(() => loadTheme("./nope/missing-theme.json"), /找不到主题/);
  });

  test("文件不是合法 JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdblock-theme-"));
    const broken = join(dir, "broken.json");
    writeFileSync(broken, `{"name":"Broken",`);
    expectThemeError(() => loadTheme(broken), /不是合法 JSON/);
  });
});

describe("校验拒绝的场景", () => {
  const rejected: Array<[string, RegExp]> = [
    ["bad-no-name.json", /name/],
    ["bad-name-empty.json", /name/],
    ["bad-unknown-top-key.json", /未知的顶层键 "author"/],
    ["bad-unknown-color-key.json", /colors.*未知的键 "selection"/],
    ["bad-missing-syntax-token.json", /colors\.syntax\.changed/],
    ["bad-color-type.json", /colors\.bg/],
    ["bad-color-empty.json", /colors\.accent/],
    ["bad-mode.json", /mode/],
    ["bad-id.json", /id/],
    ["bad-family.json", /family/],
    ["bad-colors-not-object.json", /colors/],
    ["bad-not-object.json", /必须是对象/],
    ["bad-no-colors.json", /必须提供 "colors"/],
  ];

  for (const [name, pattern] of rejected) {
    test(`${name} → ThemeError`, () => {
      expectThemeError(() => loadTheme(fixture(name)), pattern);
    });
  }

  test("非对象 / 数组 / null / 原始值都被 validateTheme 拒绝", () => {
    for (const value of [null, [], 42, "theme", true, undefined]) {
      expectThemeError(() => validateTheme(value), /对象/);
    }
  });

  test("未知顶层键与未知 colors 键在 validateTheme 直调时也拒绝", () => {
    expectThemeError(() => validateTheme({ name: "X", colors: BASE.colors, extra: 1 }), /extra/);
    expectThemeError(
      () => validateTheme({ name: "X", colors: { ...BASE.colors, glow: "#fff" } }),
      /glow/,
    );
  });

  test("未知 syntax token 被拒绝", () => {
    expectThemeError(
      () =>
        validateTheme({
          name: "X",
          colors: { ...BASE.colors, syntax: { ...BASE.colors.syntax, emoji: "#fff" } },
        }),
      /emoji/,
    );
  });

  test("mode 只接受 dark/light；id/family 只接受 kebab-case", () => {
    expectThemeError(
      () => validateTheme({ name: "X", mode: "blue", colors: BASE.colors }),
      /mode/,
    );
    expectThemeError(
      () => validateTheme({ name: "X", id: "Bad_Id", colors: BASE.colors }),
      /id/,
    );
    expectThemeError(
      () => validateTheme({ name: "X", id: "-leading", colors: BASE.colors }),
      /id/,
    );
    expectThemeError(
      () => validateTheme({ name: "X", family: "Bad Family", colors: BASE.colors }),
      /family/,
    );
  });

  test("空的 name / source / extends 被拒绝", () => {
    expectThemeError(
      () => validateTheme({ name: "", colors: BASE.colors }),
      /name/,
    );
    expectThemeError(
      () => validateTheme({ name: "X", source: "", colors: BASE.colors }),
      /source/,
    );
    expectThemeError(
      () => validateTheme({ name: "X", extends: "", colors: BASE.colors }),
      /extends/,
    );
  });

  test("错误消息里带上出错的文件路径", () => {
    const error = expectThemeError(() => loadTheme(fixture("bad-mode.json")));
    expect(error.message).toContain("bad-mode.json");
  });
});

describe("内置主题目录与 cwd 无关", () => {
  /** 在临时目录里跑 `body`，结束后恢复 cwd 并清理。 */
  function inElsewhere(body: (dir: string) => void): void {
    const before = process.cwd();
    const dir = mkdtempSync(join(tmpdir(), "mdblock-cwd-"));
    try {
      process.chdir(dir);
      body(dir);
    } finally {
      process.chdir(before);
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("在仓库外的 cwd 也能按 id 加载内置主题", () => {
    inElsewhere(() => {
      const theme = loadTheme("nord");
      expect(theme.id).toBe("nord");
      expect(theme.colors.bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(Object.keys(theme.colors.syntax).length).toBeGreaterThan(0);
    });
  });

  test("在仓库外的 cwd，自定义主题 extends 内置 id 同样解析得到", () => {
    inElsewhere((dir) => {
      const file = join(dir, "child-of-nord.json");
      writeFileSync(
        file,
        JSON.stringify({ name: "Child Of Nord", extends: "nord", colors: { accent: "#ff0000" } }),
      );

      const theme = loadTheme("./child-of-nord.json");
      expect(theme.colors.accent).toBe("#ff0000");
      expect(theme.colors.bg).toBe(loadTheme("nord").colors.bg);
    });
  });

  test("显式 searchDir 仍然是 cwd 相对，且覆盖内置目录", () => {
    inElsewhere(() => {
      writeFileSync("local-theme.json", JSON.stringify({ name: "Local", colors: BASE.colors }));
      const theme = loadTheme("local-theme", { searchDir: "." });
      expect(theme.name).toBe("Local");
    });
  });
});
