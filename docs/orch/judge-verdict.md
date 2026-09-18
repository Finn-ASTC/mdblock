# M4 盲评裁决（judge = hermes）

盲：A/B 匿名，出处未披露，映射封存在 `.orchestrator/judge-mapping.json`，裁决后才开封。
开封结果：A = omp（主实现，已合并），B = codex（对照）。

---

mdblock M4 盲评：候选 A vs 候选 B（src/render.ts，单模块盲评）

判据来源：docs/orch/CONTRACT.md §2（不变量）/§3（render.ts 小节），下称【C】；
          .orchestrator/briefs/m4-render.md，下称【任务书】。
材料：judge/A/ 与 judge/B/ 各 4 个文件。两份的 types.ts 与 syntax-map.ts 逐字节相同
      （md5 aea1ebe…/1a90da2…），全部差异都在 render.ts（A 157 行 / B 167 行）。
出处未查：没有用 git 历史，没进 .worktrees/，没读 .orchestrator/ 下 judge/ 与 briefs/ 之外的内容，
      没修改 A/ 或 B/ 任何文件（前后 md5 一致，见文末）。

================================================================
1 · 验收判据清单（通过 / 失败 / 无法判定 + 证据）
================================================================

C1 签名与导出形状
   通过（A/B）
   证据：bun 直接 import 两份模块，`renderMarkdown(md, theme, options)` 返回 Promise<string>；
        两份在 TS 7.0.2 严格模式（与仓库 tsconfig 同参数）下 `tsc --noEmit` 退出码 0。

C2 返回完整根元素 `<{tag} class="mdblock" data-theme="{theme.id}">…</{tag}>`
   通过（A/B）
   证据：div/article/section 三态各渲染一次，两份都产出
        `<div class="mdblock" data-theme="catppuccin-latte">…</div>`（article/section 同理，
        且以对应闭合标签收尾）；data-theme 跟随 theme.id（换 id=nord 得 data-theme="nord"）。
   差异（非违例）：A 在根开标签后插入 "\n"，并在闭合标签后多一个 "\n"；B 原样无尾换行。
        theme.id 里塞 `x" onmouseover="alert(1)` 时两份都转义（`&quot;`），无属性逃逸。

C3 N1/N3（样式不泄漏 / 不用 !important）
   不适用（本模块不产出 CSS）。已确认两份 render.ts 都没写 <style> 或 !important。

C4 N2 输出里除 var(--shiki-*) 外无任何字面颜色
   通过（A/B）
   证据：32 用例综合文档（标题/表格/任务列表/删除线/裸链接/ts 围栏/无语言围栏/未知语言围栏）：
        · style="…" 属性共 12 个，抠掉 var(--shiki-*) 后再扫
          `/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/` 与 CSS 具名颜色表 → 0 命中（两份）。
        · 任务书正则扫全文各命中 1 处，**是假阳性**：`<a href="https://example.com/a#deadbeef">`
          里的 URL 片段 `#deadbeef` 撞上十六进制正则；命中位置在 href 属性值内、不在样式里
          （我的扫描按上下文分类：style=0 / url=1 / 其它属性=0 / 正文=0）。
        · 输出只引用 `--shiki-*` 变量，非 shiki 的 var() 引用为空：
          [--shiki-foreground, --shiki-token-constant, --shiki-token-keyword, --shiki-token-string-expression]。
   反证（说明这条不是白测的）：夹具 Theme 的 colors.* 里每个 token 都填了互不相同的字面色（#111111…），
        results 里没有任何一处泄漏。

C5 关键架构性质：同文档换主题渲染，去掉 data-theme 后逐字节相同
   通过（A/B）
   证据：theme=catppuccin-latte(light) vs nord(dark) 渲染同一份综合文档，把 data-theme 值归一化后
        两份实现都得到**完全相同**的字符串（A 1772 vs 1760 字符的差异全部来自 data-theme 值长度）。
        更严格的一版：同一主题 id、两套完全不同的色板（light/dark）→ 两份实现的两次输出**逐字节相同**
        （A 1682 字符、B 1763 字符，各自自比相等）。即 colors.* 真的不进 HTML。

C6 高亮确实来自 createCssVariablesTheme()，不是内置主题
   通过（A/B）
   证据：A 用 `createCssVariablesTheme({ name })` 并在 createHighlighter 里注册后以名字引用；
        B 用 `createCssVariablesTheme({ name, variablePrefix: SHIKI_VAR_PREFIX })`。
        实测输出只出现 `var(--shiki-*)`，无任何内置主题色值（C4 已完成机器检查）。

C7 代码块结构固定 `<pre class="mdblock-code"><code class="language-<lang>">…</code></pre>`
   围栏块（带语言）  通过（A/B）：`<pre class="mdblock-code"><code class="language-ts">…`
   围栏块（未标语言）A 通过 / B **不符合任务书措辞**
        A：`<pre class="mdblock-code"><code class="language-text">plain text</code></pre>`
        B：`<pre class="mdblock-code"><code>plain text\n</code></pre>`（`<code>` 上完全没有 class）
        【C】原文对该情形只说「仍须带 .mdblock-code 类与 <pre><code> 结构」→ B 满足；
        【任务书】说「仍要带上面的结构与类名」→ B 少了类名。两种读法我都在此标明。
   缩进式代码块（4 空格）A **失败** / B 通过
        A：`<pre><code>indented code\n</code></pre>`（pre 与 code 上都没有类）
        B：`<pre class="mdblock-code"><code>indented code\n</code></pre>`
        A 根本没有接管 markdown-it 的 code_block 规则，缩进代码块整块绕过了本模块的代码块管线。
        这不只是字符串层面的事——见第 3 节的浏览器实测：用已合并的 src/css.ts，A 的缩进代码块内层
        `<code>` 只命中 `.mdblock code`（行内代码样式），文字变成强调色、带圆角半透明底，
        而 B 的每一个代码块都命中正确的 `.mdblock .mdblock-code code`。

C8 未标语言 → 纯文本、不抛错；未知语言 → 降级纯文本、不抛错
   通过（A/B，行为不同）
   证据（```notalang / ```TS / ```js / ```shell / ```c++ / ```text / ```constructor / ```toString /
        ```__proto__ / 40 字符语言名 / ```obj-c.2 / 语言名注入尝试）：
        · 两份都不抛错，注入的 `"><img src=x onerror=…>` 都没进 HTML（语言名白名单生效）。
        · A 先小写化再白名单校验，未知语言统一退成 `language-text`（原始语言名丢失）。
        · B 保留原样语言名写进 class（`language-NotALang`、`language-constructor`、`language-obj-c.2`），
          但只有 `bundledLanguages` 里真的有的才高亮；40 字符名被 SAFE_LANG 长度上限挡掉 → 连 class 都不写。
        · `constructor` / `toString` / `__proto__` 这类原型污染式语言名两份都安全（B 显式
          hasOwnProperty 判定，A 靠 shiki 报错后 catch）。

C9 语言按需加载
   通过（A/B，实现不同）
   A：`createHighlighter({ themes:[变量主题], langs: [] })` + 进程内缓存 `loadLanguage()`（含失败负缓存）。
   B：`createHighlighterCore({ …, engine: createOnigurumaEngine(import("shiki/wasm")) })` +
      以 `bundledLanguages` 的 loader 按需 `loadLanguage()`。
   两者都只注册 1 个主题、0 个语言，语法包确实是被 loadLanguage 拉进来的；性能相当
   （4000 行 ts：A 235ms / B 242ms），A 用 Promise.all 并发高亮，B 串行。

C10 HTML 转义（标题/文本/链接/图片 alt/代码内容）
   通过（A/B）
   证据：正文 `<script>alert(1)</script>` → `&lt;script&gt;alert(1)&lt;/script&gt;`（两份）；
        代码内容 `<div class="x"> & 'q' </div>` → 两份都转义（B 另外把 `'` 转成 `&#x27;`，
        不影响语义）；图片 alt 注入被转义；theme.id 引号被转义（见 C2）。

C11 GFM：表格 / 任务列表 / 删除线 / linkify 自动链接
   通过（A/B，任务列表标记不同）
   表格：两份都出 `<table><thead><th>`。
   删除线：两份都出 `<s>gone</s>`。
   自动链接：两份都把裸 URL 变 `<a href="…">`。
   任务列表：两份都出复选框，但：
        A：`<li class="task-list-item"><input class="task-list-item-checkbox" checked="" disabled="" type="checkbox"> done</li>`
        B：`<li class="task-list-item enabled"><label><input class="task-list-item-checkbox" checked=""type="checkbox"> done</label></li>`

C12 边界输入：空文档 / 只有空白 / 围栏未闭合 / 超长代码块 / 正文与代码里出现 </code>
   通过（A/B）
   证据：空文档与纯空白 → `<div class="mdblock" data-theme="…"></div>`（不抛错）；
        未闭合围栏 → 正常产出 1 个代码块；正文里的 `</code>` 与行内代码里的 `</code>` 都被转义，
        与代码块内的 `</code>` 不互相干扰（pre.mdblock-code 计数正确）；
        4000 行 ts 代码块 → 不抛错（A 输出 1621904 字符 / B 1725928 字符，都含 keyword 变量）。
   我另外压了这些：CRLF、BOM、波浪号围栏、四反引号围栏、围栏体含 NUL、正文含占位符字面量
        `mdblock-code-0`、引用块/列表项里的围栏、6 份文档并发渲染 —— 两份都正确、无占位符残留、
        无交叉污染（A 的 md 是模块级单例，靠每次 render 独立的 env 隔离，实测干净）。

C13 N4 导入带扩展名
   通过（A/B）：`./types.ts`、`./syntax-map.ts`（A 只用类型导入；B 还导入了 SHIKI_VAR_PREFIX 常量，
        把变量前缀钉在冻结的 syntax-map 上而不是依赖 shiki 默认值）。

C14 【任务书】要求的 `test/render.test.ts`
   无法判定：交到我手上的材料只有 render.ts + shim + types.ts + syntax-map.ts，两份都没有测试文件，
        所以「bun test 全绿 / 覆盖清单」这条判据我无法对任何一份进行验证（不臆测）。

C15 N7/N8（不臆造、不安静降级）
   通过（A/B）：通读两份源码，没有 TODO / 占位 / mock / 假实现；降级路径都显式落地为纯文本。
   说明：仓里没有装 typescript（node_modules 与 PATH 都没有 tsc），我按 §4 的验收命令用
        `bunx tsc`（拉到 typescript 7.0.2，原生版）跑，两份都 0 错误。

================================================================
2 · A / B 逐条对照表
================================================================
项目                     | A                                              | B
-------------------------|------------------------------------------------|------------------------------------------------
导出                     | renderMarkdown（契约签名）                      | 同
markdown-it 实例         | 模块级单例（每次 render 传独立 env）             | 每次 render new 一个
task-lists 选项          | { enabled: false }（默认，复选框带 disabled）    | { enabled: true, label: true }
围栏块接管               | 只覆盖 fence                                    | 同时覆盖 fence 与 code_block
缩进式代码块（4 空格）    | 未接管，退成 markdown-it 默认 `<pre><code>`     | 走同一条管线，带 .mdblock-code
占位符机制               | \u0000mdblock-code-N\u0000（NUL 包夹，输入撞不上）| \u0000mdblock-<randomUUID>-N\u0000
语言名规范化             | 小写化 + 正则白名单                              | 保留原样 + 正则白名单（大小写敏感）
语言是否可高亮           | 交给 shiki loadLanguage 试错                     | 先查 bundledLanguages（hasOwnProperty）+ 长度上限 32
未知语言 class           | 统一 `language-text`                            | 保留原名；名字不合规时不写 class
高亮结构                 | Shiki structure:"inline"，再把 `<br>` 换成真换行 | Shiki 默认 classic（`<span class="line">`）
`<pre>` 内联样式         | 自己拼 `<pre>`，没有内联样式                     | transformer 里显式清掉 Shiki 写的 style
代码内容尾部换行          | 去掉（`replace(/\n$/,"")`）                     | 保留（token.content 原样，总以 \n 结尾）
HTML 转义                | 复用 md.utils.escapeHtml                        | 自己写 escapeHtml（多转义一个 `'`）
渲染并发                 | Promise.all 并发高亮全部代码块                   | 串行 loadLanguage + 串行替换
根元素外围空白            | 根开标签后插 "\n"，闭合后多一个 "\n"            | 原样，无尾换行
非法 tag                 | throw TypeError（消息含允许值）                  | throw Error（消息含 JSON.stringify）
4000 行 ts 代码块耗时     | 235ms                                          | 242ms
44 项判据结果            | pass 32 / fail 1 / info 11                      | pass 31 / fail 2 / info 11
失败项                   | indented-code                                   | fence-nolang、single-line-fence

================================================================
3 · 行为差异清单（同一输入、两种输出；只贴实质差异，排版空白已折叠）
================================================================

D1 缩进式代码块（输入：`    indented code\n`）—— 本次唯一有真实视觉后果的差异
   A: <div class="mdblock" data-theme="catppuccin-latte"><pre><code>indented code\n</code></pre></div>
   B: <div …><pre class="mdblock-code"><code>indented code\n</code></pre></div>
   用已合并的 src/css.ts（renderCss）×Chromium 实测 computed style：
     A 的内层 <code> 命中 [.mdblock code]（行内代码规则）→ color rgb(30,102,245)（强调色，
       不是 codeText 的 rgb(76,79,105)）、background oklab(0.933…/0.75) 半透明底、
       padding 2.295px/6.12px、border-radius 6px。
     B 的内层 <code> 命中 [.mdblock code, .mdblock .mdblock-code code] → color rgb(76,79,105)、
       背景透明、padding 0、圆角 0（与围栏块完全一致）。
   即：同一篇文章里 A 的缩进代码块会长得跟围栏代码块不一样（字色是强调色 + 内嵌一个圆角色块）。

D2 未标语言围栏（输入：```\nplain text\n```）
   A: <pre class="mdblock-code"><code class="language-text">plain text</code></pre>
   B: <pre class="mdblock-code"><code>plain text\n</code></pre>
   （样式层面无差别：两份的内层 code 都命中 .mdblock .mdblock-code code，实测 computed style 同上。）

D3 未知语言围栏（输入：```notalang\nbody\n```）
   A: <code class="language-text">body</code>
   B: <code class="language-notalang">body\n</code>
   （B 保留作者写的语言名，A 丢弃；B 在名字超长/不合规时反而连 class 都不写：
     40 字符语言名 → B 出 `<code>`，A 出 `<code class="language-text">`。）

D4 大写语言名（输入：```TS\nconst y = 2;\n```）—— B 会悄悄丢掉高亮
   A: <code class="language-ts"> + <span style="color:var(--shiki-token-keyword)">…（正常高亮）
   B: <code class="language-TS">const y = 2;\n</code>（plain，无任何 token 变量）
   （`\`\`\`JSON` / `\`\`\`Python` 同理。）

D5 高亮结构（输入：```ts\nconst a = 1;\n```）
   A: <pre class="mdblock-code"><code class="language-ts"><span style="color:var(--shiki-token-keyword)">const</span>…<span style="color:var(--shiki-foreground)">;</span></code></pre>
   B: <pre class="mdblock-code"><code class="language-ts"><span class="line">…</span>\n<span class="line"></span></code></pre>
   差别只有 B 每行多一层 `<span class="line">`、且末尾多一个空行 span（因为没去掉 token.content 尾部的 \n）。
   实测（Chromium，同一套 css.ts）：1 行 / 3 行代码块的 pre 高度 A/B 完全相同（64 / 119 px），
   尾部换行**没有**造成额外行高 → 这条只体现在 DOM textContent 与复制粘贴（多一个尾换行），
   不是视觉缺陷，我把它记为标记卫生问题而不是渲染问题。

D6 任务列表（输入：- [x] done / - [ ] todo）
   A: <li class="task-list-item"><input class="task-list-item-checkbox" checked="" disabled="" type="checkbox"> done</li>
   B: <li class="task-list-item enabled"><label><input class="task-list-item-checkbox" checked=""type="checkbox"> done</label></li>
   · B 的复选框没有 disabled → 可点；但项目明确「没有运行时 JS」，勾选状态不会持久化，
     刷新即回退，这是个交互陷阱。
   · B 的 `checked=""type="checkbox"` 属性间少一个空白，是 HTML5 tokenizer 层面的非法串
     （任务书插件源码：空格本来由 disabledAttr 提供）。实测 Chromium innerHTML 与
     Bun 的 HTMLRewriter(lol-html) 都能靠错误恢复读出 type=checkbox / checked=true，
     所以不构成功能故障，属标记卫生问题。
   · A 走插件默认 enabled:false，与「无运行时 JS」的前提一致，且标记合法。

D7 排版空白（影响全部 37 个对拍用例，纯观感）
   A：`<div class="mdblock" data-theme="…">\n<p>hello</p>\n</div>\n`
   B：`<div class="mdblock" data-theme="…"><p>hello</p>\n</div>`
   另外两份都把围栏块后的空行吃掉（`</pre><p>` 相邻），这是同一个 markdown-it fence 规则替换的副产物，
   两边一致，不算差异。

对拍覆盖：37 个用例（综合文档、ts/无语言/未知/大小写/别名/c++/超长/注入语言名、
缩进代码块、表格、任务列表、空文档、纯空白、多代码块、引用块内围栏、只含围栏、
文本含 </code>、CRLF、BOM、波浪号围栏、四反引号、制表符、NUL、原始 HTML 块、
Setext 标题、图片 alt、带引号的链接 title、嵌套列表、分隔线）。
0 个用例逐字节相同（差异全部来自 D7 的排版空白），折掉 <pre> 外的空白后仍有 25 个用例实质不同。

================================================================
4 · 结论：更愿意 ship 候选 B
================================================================

理由（按权重排序）：

(1) B 的标记在真实样式表下**没有一处渲染错误**；A 有一处，而且是整块代码的配色错。
    用已合并的 src/css.ts + Chromium 实测：A 的缩进式代码块内层 <code> 只命中行内代码规则，
    文字变成强调色 + 带圆角半透明底；B 的每种代码块都命中 .mdblock .mdblock-code code。
    契约把代码块结构钉死，理由写的就是「便于 css.ts 选中」——按这个目的衡量，B 是达标的，A 不是。

(2) B 覆盖了两种代码块形态（fence 与 code_block），A 只覆盖 fence。
    A 的缩进代码块整块绕过了本模块的代码块管线，而缩进式代码块在真实文章里并不罕见。

(3) B 把变量前缀钉在冻结的 src/syntax-map.ts 的 SHIKI_VAR_PREFIX 上，A 依赖 shiki 的默认前缀
    （实测默认就是 --shiki-，所以 A 现在也对，只是多一份隐含假设）。

(4) 两者共同满足全部硬判据：N2 零字面色值、换主题不用重新高亮（两种测法都逐字节相同）、
    未知语言不抛错、注入不进 HTML、转义完整、边界输入不崩、类型干净、性能相当。
    所以取舍只在边缘行为上，而边缘行为按上面的实测，B 更靠近产物正确。

B 合并前建议修的（都很小，按优先级）：
  B1 未标语言/语言名不可解析时给 `<code>` 补 `class="language-text"`，让「结构与类名」在字面上也成立
     （现在 `\`\`\``、缩进代码块、超长语言名这三种都是裸 `<code>`）。
  B2 去掉传入 Shiki 前代码内容的尾部换行（`block.code.replace(/\n$/,"")`）：现在每个高亮代码块
     都多一个空 `<span class="line">`、DOM 文本多一个尾换行（实测不影响行高，但复制粘贴会多空行）。
  B3 语言名小写化再查表（现在 `\`\`\`TS` / `\`\`\`JSON` 会静默不高亮）。
  B4 任务列表改回 `{ enabled: false }`：静态文章块里可点但不持久化的复选框是交互陷阱，
     顺带消掉 `task-list-item enabled` 与 `checked=""type=` 这个非法属性串。
  B5（可选）根元素结尾补一个换行，与 A 一致，方便 CLI 直接重定向到文件。

候选 A 的具体缺陷（如果控制方最终选 A，这几条要修）：
  A1 【实证】缩进式代码块没有 .mdblock-code：未接管 markdown-it 的 code_block 规则。
     后果不是"少个类名"，而是用已合并 css.ts 实测内层 code 变成强调色 + 圆角半透明底，
     与围栏代码块外观不一致。修法：加一条 code_block 规则走同一条占位符管线（约 3 行）。
  A2 未知/不可高亮的语言统一退成 `language-text`，作者写的语言名（obj-c.2 等）丢失；
     与 B 相比信息更少。
  A3 根开标签后插 "\n"、闭合后多一个 "\n"，"返回完整根元素"这条在字面上不够干净
     （观感问题，不算违例）。
  A4 高亮走 structure:"inline" 并对整块结果做全局 `<br>` → `\n` 替换：
     当前代码内容都被转义所以是安全的，但这条替换没有作用域限制，属于脆弱点
     （B 的 classic 结构没有这个隐患）。
  A 的可取之处（若合并 A，别丢）：语言名小写化更宽容、复选框语义正确、复用 md.utils.escapeHtml、
  去掉代码内容尾换行、Promise.all 并发高亮、容器 tag 校验报错信息清晰。

一句话：两份都是能过验收的实现，差距只在边缘；按「产物在真实样式表下是否长得对」这条，
B 更干净；按「字面是否满足固定代码块结构」这条，两份各有缺口（A 缺 .mdblock-code，B 缺 language-*）。

================================================================
5 · 验证脚本路径与运行命令
================================================================
工作目录：<repo>/.orchestrator/judge

  judge/lib.ts           夹具（自造 Theme/Options，不 import src/theme.ts）+ 44 项判据电池
  judge/verify-A.ts      候选 A 的验证脚本 → report-A.json
  judge/verify-B.ts      候选 B 的验证脚本 → report-B.json
  judge/compare.ts       A/B 逐用例对拍（37 例，token 级 LCS diff）→ compare.json
  judge/visual-probe.ts  把 A/B 输出与已合并 src/css.ts 拼页 → /tmp/mdblock-judge-visual/visual.html

实际跑过的命令与结果：
  $ cd <repo>/.orchestrator/judge
  $ bun run verify-A.ts
    ===== 候选 A (A/render.ts) =====
    共 44 项：通过 32，失败 1，异常 0，信息 11
    FAIL  indented-code   缩进代码块也带 .mdblock-code
          含 <pre>=true；含 class="mdblock-code"=false；
          全文=<div class="mdblock" data-theme="catppuccin-latte">\n<pre><code>indented code\nsecond line\n</code></pre>\n</div>\n
    （另 11 条 INFO 为语言名矩阵、非法 tag、`<pre>` 内联样式、尾随字符等记录项）
  $ bun run verify-B.ts
    ===== 候选 B (B/render.ts) =====
    共 44 项：通过 31，失败 2，异常 0，信息 11
    FAIL  fence-nolang       未标语言围栏：结构 + 类名，不抛错
          pre.mdblock-code=true；code 标签=<code>
    FAIL  single-line-fence  单行围栏块只渲染一行
          inner 的换行数=1；class="line" 数=2
  $ bun run compare.ts
    用例 37：逐字节相同 0，不同 37   → compare.json
  $ bun run visual-probe.ts
    已写 /tmp/mdblock-judge-visual/visual.html（11714 字符，含 10 个用例）；css.ts 产出的样式表长度=7139
  （浏览器侧：browser-use/Chromium 加载 file:///tmp/mdblock-judge-visual/visual.html，
    取 getComputedStyle 与 getBoundingClientRect，观测值落在 visual.json）
  $ bunx tsc --version      → Version 7.0.2   （仓库里没有本地 typescript）
  $ bunx tsc --ignoreConfig --noEmit --target ESNext --module ESNext --moduleResolution bundler \
        --moduleDetection force --allowImportingTsExtensions --strict --noUncheckedIndexedAccess \
        --verbatimModuleSyntax --skipLibCheck --types bun \
        {A,B}/render.ts {A,B}/types.ts {A,B}/syntax-map.ts {A,B}/markdown-it-task-lists.d.ts
    → A-exit=0，B-exit=0（两份都无类型错误）

================================================================
边界遵守 / 自证
================================================================
· 没修改 A/ 或 B/：judge/A 与 judge/B 下所有文件的 md5 与任务开始时逐一相同
  （A: fb241d00…/4062ee69…/aea1ebea…/1a90da28…；B: 6c73d236…/23ed0bd7…/aea1ebea…/1a90da28…）。
· 没 git commit、没切分支（仍 integration），git status 干净（judge/ 在 .orchestrator/ 下、被 ignore）。
· 没读 .worktrees/，没读 .orchestrator/ 下 judge/ 与 briefs/ 之外的内容，没用 git 历史推断出处。
· 越界披露：为了量化「便于 css.ts 选中」这条判据，visual-probe.ts **只读 import 了已合并的
  src/css.ts**（M3 产物），没有读也不涉及 src/render.ts，没有修改仓库任何源码文件。
· 没写出的东西就不写：test/render.test.ts 不存在于材料里，所以 C14 记「无法判定」，
  没有代替它们跑 bun test，也没有声称跑过。
