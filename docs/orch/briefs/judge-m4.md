# 盲评任务：两份 `render.ts` 实现（候选 A / 候选 B）

## 背景

`mdblock` 项目把 Markdown 渲染成可嵌入任意网页的「文章块」。规范在
`<repo>/docs/orch/CONTRACT.md` 的 §2（全局不变量）与
§3 的 `src/render.ts` 小节；控制方发给两位独立实现者的**同一份**任务书在
`<repo>/.orchestrator/briefs/m4-render.md`。

## 你的材料

- `<repo>/.orchestrator/judge/A/` —— 候选 A，自包含
  （`render.ts` + 类型 shim + `types.ts` + `syntax-map.ts`）
- `<repo>/.orchestrator/judge/B/` —— 候选 B，同结构

两份是同一任务、同一契约下的两个独立实现。**它们的出处对你不透明，也不要去查**
（不要用 git 历史、不要读 `.worktrees/`、不要猜工具或模型）。只判产物。

## 你要做的

1. 读契约与任务书，列出 `render.ts` 的验收判据。
2. 对 A 和 B **各写一份自己的验证脚本**（放在 `judge/` 下）并**真的运行**。至少覆盖：
   - 根元素形状（`tag` 的 div/article/section 三态、`class="mdblock"`、`data-theme`）
   - 不变量 N2：输出里除 `var(--shiki-*)` 之外**没有任何字面色值**
   - 关键架构性质：同一文档用两个不同主题渲染，去掉 `data-theme` 后是否**逐字节相同**
   - 未标语言围栏块、未知语言围栏块、GFM（表格 / 任务列表 / 删除线 / 自动链接）
   - HTML 转义（正文里的 `<script>`）
   - 边界输入：空文档、只有空白、围栏未闭合、超长代码块、文本里出现 `</code>`
3. **重点找两份实现行为不一致的地方**，以及各自独有的崩溃或降级问题。

## 输出格式（写进 result.json 的 `output`，可以长）

1. 验收判据清单：每条给 通过 / 失败 / 无法判定 + 证据
2. A 与 B 的**逐条对照表**
3. 行为差异清单：同一输入、两种输出，贴出差异
4. 结论：更愿意 ship 哪一份、为什么；另一份的具体缺陷
5. 你的验证脚本路径与运行命令

## 边界

- 不要修改 `A/` 或 `B/` 里的任何文件。
- 不要 `git commit`、不要碰仓库其它目录。
- 不要读 `<repo>/.worktrees/`，也不要读
  `<repo>/.orchestrator/` 下除 `judge/` 与 `briefs/` 之外的内容。
- 不要臆造结论：跑过的命令才写，没跑就说没跑。
