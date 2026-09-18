# M1 · 主题库（10 个内置主题）

## 目标

产出 10 个内置主题的 JSON 文件，加上一份「官方调色板来源表」和一个校验测试。

你的交付物是**数据**，不是代码。机器可检的核心要求一句话：
**每个颜色值都必须逐字出现在你声明的官方调色板里。**

## 必须读

- `docs/orch/CONTRACT.md` —— 唯一规范，尤其 §2 不变量与 §3 的 `ThemeFile`/`ThemeColors`
- `src/types.ts` —— `ThemeColors`、`SyntaxTokens` 的字段名
- `themes/_schema.json` —— 磁盘格式的规范
- `examples/theme-example.json` —— 控制方给的形状示例（照它的字段顺序与风格；它的 id 是
  `example`，**不是**你要产出的 10 个之一）

## 交付物

### 1. `themes/<id>.json` × 10

| id | 家族 | mode | 官方调色板 |
|---|---|---|---|
| `catppuccin-latte` | catppuccin | light | https://github.com/catppuccin/palette |
| `catppuccin-frappe` | catppuccin | dark | 同上 |
| `catppuccin-macchiato` | catppuccin | dark | 同上 |
| `catppuccin-mocha` | catppuccin | dark | 同上 |
| `nord` | nord | dark | https://www.nordtheme.com/docs/colors-and-palettes |
| `gruvbox-dark` | gruvbox | dark | https://github.com/morhetz/gruvbox |
| `tokyo-night` | tokyo-night | dark | https://github.com/folke/tokyonight.nvim |
| `rose-pine-dawn` | rose-pine | light | https://rosepinetheme.com/palette |
| `solarized-dark` | solarized | dark | https://ethanschoonover.com/solarized |
| `dracula` | dracula | dark | https://draculatheme.com/contribute |

每个文件必须给出**完整的** `colors`：10 个 UI token + `syntax` 的全部 12 个键
（`string comment constant keyword parameter function stringExpression punctuation
link inserted deleted changed`）。不许省略、不许留空串。

`source` 字段填上面那张表里对应的官方 URL。

### 2. `themes/_sources.json`

把你实际取值的官方调色板落成机器可检的形式：

```json
{
  "nord": {
    "url": "https://www.nordtheme.com/docs/colors-and-palettes",
    "palette": { "nord0": "#2e3440", "nord1": "#3b4252", "...": "..." }
  }
}
```

`palette` 必须包含该主题**你用到的每一个色值**（可以是整张官方调色板，也可以只列用到的）。
这是你「色值来自官方」这个声明的证据面。

### 3. `test/themes.test.ts`

用 `bun test`，独立于其它模块（**不要 import `src/theme.ts`**，那个模块还没写）。断言：

- 10 个主题文件都存在、能被 `JSON.parse`、含全部必填字段
- 所有颜色值匹配 `/^#[0-9a-f]{6}$/i`，`syntax` 12 个键一个不缺
- **每个颜色值都能在 `_sources.json` 对应条目的 `palette` 值集合里找到**
- `id` 与文件名一致，`mode` 与上表一致，`family` 与上表一致

## 联网

需要取官方色值。**如果你无法联网**：用你已知的官方色值，但必须
(a) 在 `output` 里**明确声明你没联网核对**，(b) 仍然填 `source` URL。控制方会独立核对
每个十六进制值，所以编造会被抓到 —— 宁可明说。

## 控制方会怎么独立验收

1. 逐个文件跑上面的断言（不看你的测试，我自己写脚本）
2. 抽查每个主题至少 5 个色值，与 `_sources.json` 的 URL 实际内容比对
3. 检查 `_sources.json` 是否真的覆盖了你用到的全部色值（多列没关系，漏列算失败）

## 报告

写 `result.json`（字段见 CONTRACT.md §5），`output` 里说明：哪些主题你是联网核对的、
哪些不是、`_sources.json` 每个主题列了多少个色值。提交到你自己的分支。

## 允许的嵌套

本轮 `max_depth` 是 3：**你可以**把这个任务拆给子代理并行做（例如每个主题一个子代理），
但你必须自己汇总、验证并只在本轮结束后发布**一次** `result.json`。子代理产生的文件
算在你本轮的 `files_created` 里。
