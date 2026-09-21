# mdblock 设计 spec

日期：2026-09-18 · 状态：已批准（方案 A / 命名空间 CSS / L2 渲染 / Node+TS）· 控制方：Main

## 1. 目标

把 Markdown 文档构建成一个可以嵌入任意网页的「文章块」：一段自包含 HTML 片段加一份
样式表。配色由主题配置文件驱动，内置若干开源主题；外框、尺寸、字号等可配置。

## 2. 已定决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 交付形态 | 构建期 CLI | 零运行时 JS，静态站/CDN 友好，无 JS 环境可用 |
| 样式隔离 | 命名空间 CSS（`.mdblock` 前缀） | 零 JS、体积最小、可 F12 调试；变量定义在 `.mdblock` 上，同一页可多主题共存 |
| 渲染范围 | CommonMark + GFM + 代码高亮（L2） | 覆盖技术文档；KaTeX/脚注/TOC 明确排除 |
| 实现栈 | Node + TypeScript，bun 运行 | 生态最全，开发最快 |
| 主题模型 | 数据驱动（token 表 → CSS 变量） | 「配色依据主题配置文件生成」的直接形态；变量名即稳定公开 API |

## 3. 架构

```
themes/*.json ──┐
                ├─▶ theme.ts ──▶ Theme ──▶ css.ts ──▶ 样式表文本
CLI/config ─────┴─▶ options.ts ─▶ Options ─┘
post.md ────────────────────────▶ render.ts ─▶ 文章块 HTML
                                     (markdown-it + Shiki)
                                     ▼
                       build.ts / cli.ts 组装 ─▶ dist/post.html (+ mdblock.css)
```

关键性质：**Shiki 使用 `createCssVariablesTheme()`**，高亮只产出 `var(--shiki-*)`
引用，不产出字面色值；变量定义由 `css.ts` 从主题的代码 token 生成。因此**换主题不需要
重新高亮**，一份 HTML 可以配任意主题的样式表。这条性质由不变量 N2 机器可检。

## 4. 主题模型

三层 token，避免每个主题塞几十个值：

1. **UI token**（10 个）：`bg surface text heading muted border accent accentAlt codeBg codeText`
2. **高亮 token**（12 个，键名由上游 Shiki 变量决定）：`string comment constant keyword
   parameter function stringExpression punctuation link inserted deleted changed`
3. **派生值**：用 `color-mix(in oklab, …)` 从上面算 hover、斑马纹、分割线，零 JS 派生

内置主题：catppuccin（latte/frappe/macchiato/mocha）、nord、gruvbox-dark、tokyo-night、
rose-pine-dawn、solarized-dark、dracula —— 共 10 个。色值必须来自官方调色板，并在
`source` 字段留 URL。

自定义主题：与内置同 schema 的 JSON，`--theme ./my.json`，支持 `extends` 继承与覆盖，
循环继承必须报错。

## 5. 参数面

优先级：`DEFAULTS` → `--config` 文件 → CLI flag。

| 组 | 参数 | 默认 |
|---|---|---|
| 尺寸 | `--width` `--font-size` `--line-height` `--font-family` | 720px / 17px / 1.7 / 系统栈 |
| 外框 | `--padding` `--radius` `--border` `--shadow` `--bg` | 32px / 12px / 无 / soft / 主题 bg |
| 结构 | `--tag` | div |
| 隔离 | `--hard-isolation`（根上 `all: revert`） | off |
| 产出 | `--css inline\|file\|none` | inline |
| 其它 | `--theme` `--config` | catppuccin-latte |

20 个 CSS 变量 + 14 个 Shiki 变量构成公开 API，用户可以手写覆盖。

## 6. 明确不做（YAGNI）

运行期 Web Component、iframe 隔离、KaTeX/脚注/TOC、md frontmatter 覆盖参数、代码块复制
按钮（需 JS）、主题在线预览站、多语言界面。

## 7. 验证

- `bun test`：各模块自己的测试
- `bunx tsc --noEmit`：类型干净
- `test/acceptance.mjs`：生成敌意宿主页（`p{margin:0!important}`、`a{color:red}`、
  preflight 式 reset、`*{box-sizing:content-box}`）+ 两个不同主题的文章块共存，
  浏览器截图确认不被穿透；机器断言 N1（CSS 无 `:root`）、N2（HTML 无字面色值）

## 8. 编排设计（元层）

本项目同时是一次 `agent-orchestrator` 的实地测试：模块划分 → 每模块一条分支 +
一个 worktree + 指定一个终端 agent → 控制方调度、独立验收 → 合并整理 → 实验报告。

| 模块 | 分支 | agent | depth |
|---|---|---|---|
| M1 主题库 | `m1-themes` | codex | 3（开放嵌套） |
| M2 主题加载 | `m2-theme-loader` | hermes | 2 |
| M3 样式生成 | `m3-css` | opencode/OMO | 2 |
| M4 渲染 | `m4-render` | omp | 2 |
| M4b 渲染（对照） | `m4-render-alt` | codex | 2 |
| M5 CLI | `m5-cli` | codex | 2 |
| M6 验收设施 | `m6-acceptance` | Main | — |

M4 与 M4b 是**同 brief 双 agent 对照**，由 hermes 在去掉出处的条件下盲评。

控制方义务：每轮 `prepare` 生成 round 身份、提交后记 `submission.json`、收
`result.json` 后 `validate --check-files`、**独立验收产物**（不信 `output`）、
每轮追加一行到 `.orchestrator/ledger.md`。
