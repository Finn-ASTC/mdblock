# mdblock · agent-orchestrator 实地测试报告

日期：2026-09-18 · 控制方：一个 omp 会话（root，depth 0）· 目标：验证
`agent-orchestrator` 那套「模块划分 → 每模块一条分支 + 一个 worktree + 指定一个终端 agent →
控制方调度与独立验收 → 合并整理」在真实项目上到底怎么跑。

---

## 0. 交付了什么

`mdblock` v0.1，在 `main` 上，25 个提交：

| 部分 | 规模 |
|---|---|
| 源码 `src/` | 1578 行 / 9 文件（types、syntax-map、theme、css、render、options、build、cli、类型 shim） |
| 测试 `test/` | 2143 行 / 6 文件，**160 个用例全绿** |
| 内置主题 `themes/` | 10 个主题 JSON + 官方来源表 + JSON Schema，677 行 |
| 验收设施 | `test/acceptance.ts`（26 条静态判据）+ `test/hostile-host.html`（敌意宿主页） |

命令：

```bash
bun src/cli.ts examples/post.md --theme catppuccin-mocha -o post.html      # 自包含片段
bun src/cli.ts posts/*.md -d dist/ --css file --theme nord                 # 批量 + 共享样式表
bun run test && bun run typecheck && bun run accept                        # 门禁
```

浏览器实测（Chromium，敌意宿主页）：三个不同主题的文章块同页共存、各自配色正确
（`#eff1f5` / `#1e1e2e` / `#2e3440`），代码块有独立背景与语法高亮，列表/表格/引用/分隔线
正常，宿主样式零穿透。

---

## 1. 编排基线

7 个 job、13 次`prepare`、12 轮实际执行、4 种终端 agent、5 条模块分支 + 1 条对照分支。

| job | 分支 | agent | depth | 轮次 | 结果 | 我的独立验收 |
|---|---|---|---|---|---|---|
| M1 主题库 | `m1-themes` | codex | **3（开放嵌套）** | 1 | success | 23/23 跨模块 + 官方源 10/10 色值核对 |
| M2 主题加载 | `m2-theme-loader` | hermes | 2 | 1 | success | 26/26 自造边界用例 |
| M3 样式生成 | `m3-css` | opencode/OMO | 2 | **5** | success | 逐轮静态 + 浏览器 computed style |
| M4 渲染 | `m4-render` | omp | 2 | 2 | success | 23/23 + 盲评后的补强 |
| M4b 渲染（对照） | `m4-render-alt` | codex | 2 | 1 | success | 交由盲评 |
| M5 CLI | `m5-cli` | codex | 2 | 1 | success | 真命令跑四种模式 + 错误码 |
| 盲评 | — | hermes | 2 | 1 | success | 44 判据 + 37 例对拍 + Chromium 实测 |

**时间**：墙钟约 26 分钟（首个提交 04:09:27 → 最后一轮解决 04:35:09，四个 agent 并行）；
agent 计算时长合计 46.7 分钟，中位 199 s，最长 770 s（M1，含 4 次审批往返）。

**M1 的嵌套实验**：给它 `max_depth=3`，其余锁 `max_depth=2`。它**没有**派子代理 ——
自己串行做完了 10 个主题（12.8 分钟，全部联网核对）。深度放开不等于会自发扇出。

---

## 2. 编排协议的实际表现

**正常工作**：`prepare` 生成 round 身份 → 提交 → `validate --check-files` → 独立验收，
这条链在四个 agent 上 12/12 轮都产出了合法结果文件。原子发布、`result.json` 字段契约、
`files_created/modified` 的净变化语义都按协议落地了。

**协议与工具的缺陷（按影响排序）**：

| # | 缺陷 | 影响 |
|---|---|---|
| P-1 | `protocol.py record` 硬编码 herdr pane 正则 `w[0-9]+:p[0-9]+`（`scripts/protocol.py:264`），而本机 herdr 生成的 workspace id 是 `wF` | `record` 一律 `rc=3`，`resources.json` 无法生成。**只能用 controller receipt 替代**；round 协议本身不依赖它 |
| P-5 | `agent prompt` 对 **codex** 吞长 prompt：约 9 KB 的 `prompt.txt` 提交返回 `rc 0`，但 TUI composer 保持空、pane 缓冲里搜不到任何片段 | **静默失败**。hermes / opencode / omp 三个都能收长 prompt，只有 codex 不行。兜底：发短指令指向 `prompt.txt` 路径，再让它自己读 |
| P-7 | herdr + fish 启动竞态（9 次启动中 2 次）：`agent start` 把命令敲进 fish 但没执行，120 s 超时退出，**且没有注册 agent 名字** | 后续 `agent prompt <name>` 报 `agent_not_found`。按 transports 配方：确认前台是 shell 且待执行行就是该命令 → 发一个回车 → `agent rename <pane> <name>` 补绑 |
| P-8 | codex 逐命令网络审批：`--search` 只给原生 web_search，**shell 联网仍走审批** | M1 全程消耗控制方 **4 次审批往返**。第 3 次起提供「对 `cd /tmp/pal` 前缀不再询问」后脱身 |
| P-3 | codex 默认 sandbox 是 **read-only**：不给 `-s workspace-write` 时 `--add-dir` 被忽略并直接退回 shell | agent 连 worktree 都写不了。字典里「用 workspace-write 时加 `--add-dir`」隐含了启动者必须显式给 `-s workspace-write` |
| P-6 | git worktree 的 `.git` 是指向 `<主仓库>/.git/worktrees/<name>` 的**文件**，`-s workspace-write` 只覆盖 cwd | worktree 里 `git commit` 要写主仓库 `.git` → 被拦、需审批。修法：启动时补 `--add-dir <主仓库>/.git` |
| P-2 | 首次按配方在 `wF:p1` 上 `pane split` 得到 `wF:p2`，随后该 pane 再查是 `pane_not_found` | 改用每 job 一个**独立 tab**（用户要求），此后稳定 |
| — | `--add-dir` 只解决 round-root 写入，不解决**读** | 未见读受限；但 M3 想读 worktree 之外的文件时被 opencode 自己拦下（见 §5） |

**控制方干预次数**：全程 8 次（M1 审批 ×4、M4b 提交审批 ×1、M5 验证审批 ×2、
M3 越界读拒绝 ×1）。**没有一次返工是 agent 之间的冲突** —— 所有返工都来自验收发现。

---

## 3. 谁抓到了什么（本次最有价值的一节）

「验收面」决定了能看见什么。同一份代码，判据越窄越安全：

| 缺陷 | 谁发现 | 发现它需要什么 |
|---|---|---|
| A-1 变量挂在裸 `.mdblock` → 同页多主题互相污染 | 我，**在扇出之后、合并之前**建验收设施时 | 一个 A/B 双主题的浏览器探针 + `getComputedStyle` |
| 缩进式代码块未接管，配色变成强调色 | **hermes 盲评** | 一个比我的判据更宽的输入矩阵（它写了 44 条判据、37 例对拍） |
| 宿主 `ul,ol{list-style:none}`（Tailwind preflight）抹掉列表符号 | 我的浏览器探针 | 真的在宿主页里算 computed style |
| 宿主 `code,pre{font-family,font-size}` 改掉代码块字体字号 | 我的浏览器探针 | 同上 |
| `all: revert` 因 A-1 搬到高特异性规则 → **整个 hard-isolation 块被 revert 成裸样式** | 我的浏览器探针 | 同上，且要**分别断言三个块**而不是只测一个 |
| N2 判据把内联 `<style>` 一起扫 → 3 条假阳性 | **M5 agent 主动上报** | agent 越界发现控制方的错并守住边界 |

**关键数字**：在 `bun test` 160 条 + `tsc` 干净 + acceptance 静态 26 条**全绿**的状态下，
浏览器层仍然暴露出 **4 个真缺陷**（其中 `all: revert` 那条让整个功能失效）。
静态判据与真实渲染之间有一条几乎不可见的缝。

---

## 4. 我自己犯的错（诚实清单）

| # | 错误 | 谁纠正 |
|---|---|---|
| 1 | 契约 A-1：把主题变量定义在裸 `.mdblock` 上，同页多主题共存失效。设计 spec 里没有这条约束，是我冻结契约时的**新增缺陷** | 我（建验收设施时用双主题探针实证） |
| 2 | 契约 A-2：设计 spec 写明「根上显式声明全部继承型属性」，**契约正文漏掉**，M3 按字面实现 → 继承宿主字距/大写 | 我（对照 spec 反查时发现） |
| 3 | 验收脚本假阳性 ×1：N2 把 `--css inline` 的内联 `<style>` 当 markup 扫 → 3 条失败 | **M5 agent** 指出 |
| 4 | 验收脚本假阳性 ×2：`word-spacing` 期望写 `normal`，Chromium 计算值是 `0px` | 我（浏览器复核时） |
| 5 | 探针自身 bug：M2 的 `full()` 把 `colors` 写在 `...extra` 之后，坏值被覆盖 → 5 条假失败 | 我（重跑前先怀疑探针） |
| 6 | 官方色值核对连错两轮：正则捕获组吃掉 `#`（10/10 全判失败）；以及两个源文件选错（night 变体、palette.json 不含 highlight 档） | 我 |

**控制方错误 6 次 vs agent 侧「按字面实现」1 次**（M3 的两轮返工都是我的契约漏项，不是它读错）。

**两条教训**：
1. **报缺陷前先怀疑探针。** 6 条里 3 条是假阳性。
2. **契约必须逐条对照 spec 反查。** A-1/A-2 都属于「spec 里有、契约里没有」——
   我凭记忆写清单，漏了两条，而并行实现会忠实地放大这两条。

---

## 5. 各 agent 的行为画像

**codex（M1 / M4b / M5）**
- 长 prompt 静默不落地（P-5）；逐命令网络审批（P-8）；worktree 提交需 `--add-dir .git`（P-6）。
- 报告极其详尽：M5 贴出逐条真命令与输出、四个错误码、换主题不变性探针结果。
- **M5 主动上报控制方的 harness bug，并明确声明「这是 M6 文件，我没有动」** —— 边界意识正确。
- M4b 的实现在盲评中**胜出**。

**hermes（M2 / 盲评）**
- 启动竞态一次（P-7），回车救回。
- M2 一次通过，36 个自测 + 我的 26 条边界用例全过。
- 盲评产出 16 K 字：44 条判据、37 例 A/B 对拍、Chromium 实测、**主动 md5 自证没有改动被测文件**、
  **如实把「测试文件不在材料里」记为「无法判定」而不是猜**，还主动披露自己越界只读了一次
  `src/css.ts` 用于量化判据。

**opencode / OMO（M3）**
- 最快：首轮 86 s 完成 250 行 CSS + 13 个测试。
- 轮次最多（5 轮），但**4 次返工全部由外部发现**：A-1（契约缺陷）、A-2（契约漏项）、
  reset 穿透、`all: revert` 特异性 —— 没有一次是它自己的失误。
- 曾试图读 worktree 之外的 `.orchestrator/`（里面有本 ledger，写着「这些 agent 正在被测试」），
  被 opencode 权限弹窗拦下，我选了 Reject 并说明「以 prompt 为准」。
  **这是这次唯一的观察者效应风险**，预案是对的：它最终没读到。

**omp（M4）**
- 一次交付 157 行 + 18 测试，我的 23 条判据全过（含「两主题渲染逐字节相同」这条架构性质）。
- 唯一真缺陷：只接管 `fence` 没接管 `code_block`，被盲评抓到，第 2 轮 48 s 修完。

---

## 6. 结论

**协议层面成立**：模块划分 → 独立 worktree + 分支 → 每模块一个终端 agent →
控制方按轮调度与独立验收 → 合并整理，这条路在四个不同 agent 上跑通了，12/12 轮都有合法回传，
没有一次 agent 间的文件冲突（文件所有权切得干净）。

**成本结构出乎预期**：agent 计算 46.7 分钟不是瓶颈，**瓶颈是控制方的审批往返与判据演化**。
8 次人工干预里 7 次是审批（多数本可以启动时就授好权），而真正的返工全部来自验收面扩张。

**最有性价比的一步是盲评**：花 6.5 分钟、一个全新 agent 会话、匿名化两份实现，
抓到一个**已经合并**的模块里的真缺陷（缩进式代码块配色错误）。它同时产出了
「两份实现各有什么问题」的结构化对照，比我再读一遍代码便宜得多。

**最脆弱的一环是控制方自己的验收判据**：160 条单元测试 + 26 条静态判据全绿时，
浏览器层仍有 4 个真缺陷；而我的判据本身还产生了 3 次假阳性。
判据面比产物面窄，就会给出「通过」的假安全感 —— **判据要在扇出之前写，而不是之后**。

### 可复用的做法

1. **Wave 0 冻结契约**（类型 + 变量名 + 导出签名 + 不可变量），再扇出。契约错，全员错。
2. **文件所有权不相交** + 每个写者一个 worktree/branch。这次四个模块的文件零重叠，合并零冲突。
3. **round 身份 + 独立验收**：`result.json` 的 `status` 不是证据，`validate --check-files` 也不是，
   真正的证据是我自己跑出来的产物。
4. **把「验收设施」提前写**：它抓到过一条会让五份实现全部带病合并的契约缺陷。
5. **对交付物做盲评**：匿名 + 换一个 agent + 更宽的输入矩阵。
6. **用户可见性**：每个 job 一个独立 tab（`--no-focus`），控制方不在 pane 里抢输入。

### 已知边界（不打算修的）

- 宿主带 `!important` 或特异性高于 `.mdblock X` 的 descendant 规则（如
  `.prose p { color: gray }`）仍会穿透 —— 命名空间 CSS 的固有边界，
  `--hard-isolation` 的 `all: revert` 只作用于根元素自身。敌意宿主页的 L2 区就是这条演示。
- `themes/` 按 cwd 解析：从子目录跑 CLI 会找不到内置主题（M5 实测遇到）。
