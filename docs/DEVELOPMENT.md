# 开发说明

面向改这个插件的人。使用者请看 [README](../README.md)。

## 结构

| 文件 | 角色 |
| --- | --- |
| `src/index.js` | **Host 半部**：拦截 LLM 流式调用与 `session/event` 采集用量；维护按模型统计与三份时间台账；读写 `$DSH_HOME/musage-stats.json`；提供 loopback-only 的 `/__musage-stats` 路由；持有唯一一份默认价目 |
| `src/client.js` | **Client 半部**：注册到设置面板 `settings.section` 的 React 组件；三个子页面；纯 SVG 图表（不引入图表库）；中英文字典 |
| `src/route-security.js` | 统计路由的同源 / loopback 校验与请求体上限 |
| `cordis.patch.yml` | DSH bundle 声明，安装后自动挂载为 profile 层 |
| `scripts/` | 验证与预览工具链（**不随 npm 包发布**） |
| `tests/` | 单元测试（**不随 npm 包发布**） |

Client 半部是 `__ModuleLoader__` 闭包工厂形态的**纯 JS**（无构建、无 JSX、无 TypeScript）：
`React` 由 shell 提供，`React.createElement` 手写。改这块别引入 `import`/`export`。

两半部通过快照通信：Host 生成 `snapshot()`，Client 轮询同一个路由（10 秒，标签页隐藏时不请求）。
默认价的唯一真源是 Host 的 `PRESET_PRICES`，随快照的 `presets` 字段下发——两端各存一份
会立刻出现"重置按钮与计费口径漂移"。

## 页面结构与设计

首页只放宏观统计，**高度不随模型数增长**（11 / 45 / 90 个模型实测都是 700px）；
明细与配置各自成页，切过去才渲染。

| 子页面 | 内容 | 实测高度 |
| --- | --- | --- |
| 总览 | 关键数字（花费 / 总 Token / 余额）→ 用量趋势 → 活跃度热力图 → 效率卡 → 花费去向 → 次要计数 | **恒定 700px** |
| 模型明细 | 全部模型（按费用降序）、"仅显示已调用模型"开关、价格配置 | 随模型数增长，面板内滚动 |
| 配置 | 目标货币与汇率、余额查询配置、添加模型 | 203px |

表里的高度是**实测值**，`npm run verify` 会重新量一遍并比对（改布局而不改文档会直接失败）。

顺序即优先级：**先看结论，再看理由**。关键数字的 DOM 位置必须早于趋势图，有闸门断言守着。

设计理念取自 shell 与 `dsh-context` 的统计页——*计数、占比、趋势是三类不同的东西，各归其位*。
刻意**没有**环形占比图：套餐里往往一个模型占绝大多数 token，环形图退化成整圆；而且按 token
排会把"调用少但单价高"的模型藏起来，那恰恰是最该优化钱的地方。费用占比直接进每一行。

**首页不放模型明细**：那是"逐个对象"的清单，属于明细页；首页两处都列模型卡片是纯重复。
首页的每条信息都必须是"整体"的。

设置面板内容区可用高度是 `800 − 54（头部）− 24（底部内边距）= 722px`，首页 700px
一屏放得下（量出来的，不是估的）。金额按量级分档显示小数位：`≥ 0.01` 最多 4 位，
更小才到 6 位——一律 6 位会让主数字变成 `340.992536` 这类读不出也占宽度的东西。

### 两页必须同口径：按"提供服务的模型"分组

一个模型可以有多个历史 id：`deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 退役后由
V4.1 Flash 同价继续服务。首版首页按服务模型合并、明细页按原始 id 分行，于是同一个模型
在首页是 ¥183、在明细页变成 ¥8 + ¥131 + ¥44 三个数字——用户会直接判定"统计错了"
（线上就是这么反馈的）。现在两页共用同一套分组：

- 明细页一张卡 = 一个服务模型，数字是合并后的；
- 折叠态在调用数后补一句"合并 N 个 id"；
- 展开后逐个列出历史 id 的调用数与 token，想对账时能看清合计怎么来的；
- 价格配置挂在服务模型键上，退役 id 不会出现"有价格却显示未配置"。

代码上有个坑：`deepseek-flash` 既是服务模型键、又是其中一个原始 id，**同一字符串在两种口径下
答案不同**（合并 ¥3 vs 单行 ¥2）。所以不用字符串猜意图，按调用方分成两个函数：
`costOf(原始 id)` 走单行（首页逐行汇总才不会重复计数）、`costOfMerged(服务模型键)` 走合并行。
测试钉住"合并后 15 次调用 / ¥3"。

## 图表的硬约束

1. **明细不浮在图上**。悬停时段的明细是图**上方**一条固定高度（18px）的信息行，不是绝对定位
   的浮层——浮层要么盖住最高的柱子、要么越过图表底边。固定高度在数学上不可能溢出。
2. **柱高只用百分比，不传像素**。曾用 `chartHeight = 132` 在 JS 里算 px，而 CSS 容器后来被改到
   86px，满高的柱子向上戳出 46px，**且只检查左右边界的断言报"无溢出"**。百分比高度让 JS 与 CSS
   无法漂移，最小可见高度交给 CSS 的 `min-height`。
3. **合并桶会自证**。多个 id 由同一模型服务、按同一价格计费时会被合并成一个桶，桶名带 `+N`
   并在展开区列出被合并的 id；**当前是独立模型的 id 绝不合并**（`deepseek-v4-pro` 在改路由前
   有独立价格与统计，并进 Flash 会同时错算金额和统计）。
4. **悬停不改变布局**。摘要行常驻（显示最新时段），浮窗 `position: fixed` 不占空间，
   真实排版检查会比对悬停前后的页面高度。

柱数有硬上限，不会随时间变密：按天 host 只下发最近 45 天 → 图上最多 30 根；按小时保留 26 小时
→ 最多 26 根。柱是**靠左排列的定宽块**（不是 `flex: 1`），5 个数据点时柱群只占 97px / 588px。
单柱宽 12–18px，窄栏自动少画几根而不是压成细线。

悬停浮窗的约束加在**柱子**上而不是气泡上：柱子必须留在绘图区内，气泡只需留在视口内。
曾经把两者搞反过——既把气泡限制在绘图区里（样式也换成了非气泡的浅色面），又没防住柱子纵向溢出。

## 计费数据模型与两个开关

价格表的每条记录（`prices[model]`）除了四档单价与峰谷配置，还有两个**开关字段**：

| 字段 | 含义 | 缺省 |
| --- | --- | --- |
| `customPricing` | 用用户填的价（`true`）还是内置默认价（缺省） | 缺省 = 内置默认 |
| `tokenPlan` | 该模型由预付套餐覆盖 → **只记 token，不计费用** | 缺省 = 按量计费 |

两者都只存 `true`，`false` 一律留 `undefined`，避免数据文件被撑大。

**能力项与用户选择分开**：内置预设里的 `tokenPlanSupported`（由 `TOKEN_PLAN_MODELS` 打标）
是"这个模型有没有套餐可买"，只出现在预设里、不进用户数据；用户勾的 `tokenPlan` 才进数据文件。
界面按能力项决定是否显示勾选框，按用户选择决定计费方式。

**生效价格只有一处**：客户端的 `priceOf()` —— 勾了 `tokenPlan` 返回 null（不计费），否则按
`customPricing` 在内置默认价与用户价之间选。展示用的价格走 `displayPriceOf()`（不因套餐返回
null），否则价格表单会拿到 null 崩掉。**注意别再把两者合并**：这是"计费"与"展示"两条不同的问题。

**迁移顺序不能反**：`loadState` → `migrateLegacyDefaults` → `backfillMissingPrices` →
`detectCustomPricing`。`detectCustomPricing` 必须在迁移**之后**跑：先跑的话，停在历代默认价的
条目会因为"与当前预设不同"被判成用户自定义，迁移从此再也碰不到它，旧口径永久留在账上
（这里踩过，测试 `startup migration upgrades stale defaults` 当场变红）。

**两个开关不得丢数据**：客户端切换开关时只发 `{model, customPricing|tokenPlan}`，**不带
`price`**；Host 收到只有开关的请求时只改开关、绝不重写数值。若客户端把表单里的数字一起发过去，
关掉自定义计费时表单显示的正是内置默认价，一发送就覆盖了用户填过的价。两端各有测试钉住。

**provider 维度**：价格表以模型 id 为主键，另有两层 provider 相关字段——
`prices[model].provider`（用户固定的计价来源）与 `prices[model].providers[providerId]`
（该 provider 的覆盖价）。生效价格的解析顺序（客户端 `displayPriceOf` / `priceOf`）：

1. `tokenPlan` 生效 → 不计费（返回 null）；
2. 所选 provider 有覆盖价 → 用它（覆盖价是用户显式填的，不受 `customPricing` 开关影响）；
3. 否则按 `customPricing` 在"用户基础价"与"内置默认价"之间选。

计价来源的自动判定：用户固定优先；否则**单来源**模型直接用它的 provider；多来源且未指定时
用基础价并在界面标注（台账不按 provider 拆 token，因此多来源无法精确分摊——本机只有 2 个
这样的模型，且都是 DeepSeek 经 dashscope，同价）。

**`tokenPlan` 是三态**：缺省 = 跟随 provider（订阅型 provider 的模型默认算套餐）；
`true` = 用户勾选；`false` = 用户明确取消（**false 必须落盘**，否则重启后又被自动打开）。
订阅型 provider 名单由 Host 的 `SUBSCRIPTION_PROVIDERS` 定义并随快照下发，规则只有一处。

**价目刷新（2026-09-14，官方页）**：GPT-5.6 luna/terra/sol 修正为官方值（此前只有一半）、
Astra 与 GLM-5.2/5.3 补上缓存命中价；同时删除 V4-Pro 的 `rerouteFrom/rerouteTo`——官方脚注 (2)
已改为"继续提供、计费不变"，旧规则会把 9/14 之后的 V4-Pro 用量低估约 5 倍。被替换掉的旧值
登记进 `LEGACY_PRESET_PRICES.v0165`，停在旧值的用户下次启动会被自动升级。

## 时间台账

| 台账 | 粒度 | 保留 | 用途 |
| --- | --- | --- | --- |
| `dayBuckets` | 天（含逐模型、逐工具明细） | 120 天 | 趋势图（下发最近 45 天，其中最近 32 天带逐模型明细） |
| `hourBuckets` | 小时 | 26 小时 | 趋势图按小时视图 |
| `heatBuckets` | 天，**只有两个标量**（tokens、工具调用） | 371 天 | 热力图 |

热力图单独记账是因为：明细台账每天存着逐模型与逐工具的明细，铺 371 个格子会让 payload 与磁盘
膨胀一个数量级。实测满一年 `heatSeries` 只有 13.4 KB（含它之后整份快照 20.4 KB）。

强度按**相对当期峰值**分四档（25% / 50% / 75%），不用分位数——分位数在稀疏数据上会给出反直觉的
深色格子（只有一天有数据也能染成最深）。格子颜色由 `brand-primary` 与主题底色用 `color-mix`
派生，不写死色值；格子尺寸随容器宽度自适应（4–11px）。

账为空时热力图卡**仍然渲染**（铺满格子 + "从本版本开始累积"的说明），而不是整张消失——
早期版本写成"有数据才渲染"，于是新装或刚重启时看起来像功能不存在。

### 历史回填

时间台账只从插件运行起累积，但**之前的用量完整存在于会话日志里**。启动时通过 `ctx.sessionQuery`
（base 组合已挂载；`openAt: never` 下精确读仍可用，SQLite 从不打开）读一次历史，把台账里
**还没有的日子**补上。

三条不变式（都有测试钉住）：

1. **只填缺失的日子**，今天一律不动——因此不会与实时采集重复计数。
2. **只统计本会话自有事件**：`readSession()` 返回的日志带 `inheritedEventCount`，fork 出来的
   会话继承父会话的事件，不切掉这段就会把同一批用量算两次。
3. **30 秒时间预算，超时不写完成标记**，下次启动继续。几百个会话可以分几次跑完，不阻塞启动。

单次会话读取失败（损坏 / 已清理）会被跳过；部署未挂载该服务时优雅降级为 `unavailable`。

**必须用延迟注入拿服务**：`session-query-sqlite` 虽然挂在组合里，但 `apply` 执行时该服务可能
还没注册——直接 `ctx.get('sessionQuery')` 会拿到 `undefined`，回填静默不跑（线上首版正是如此）。

```js
ctx.inject(['sessionQuery'], (scoped) => { attempt(scoped.sessionQuery) })
```

回调在依赖可用后触发；服务始终不存在时回调不触发，插件不受影响。

**一轮不够，所以有重试、唤醒与版本化完成标记**：

- 启动瞬间 `listSessions()` 可能返回 0（会话索引未就绪，几分钟后才有 120+ 条）。空语料记
  `empty`，**绝不写完成标记**，按 20 秒间隔重试（最多 15 次）。
- 定时窗口仍可能不够：任何真实会话事件到达（说明语料确实存在了）就**唤醒一次**补跑。
  唤醒只发生一次且不新增重试链，避免每个事件都触发整库重扫。
- 完成标记用**递增版本号**（`heatBackfillRev`）而不是布尔：旧版本曾把"扫了 0 个会话"当成完成，
  坏布尔值会让历史永远补不上；换成版本号后旧标记自然失效，会重跑一轮。
- 重试是幂等的（只填缺失的日子），"多跑一轮"永远安全。
- `ctx.interval` 返回的是 **disposer 函数**而不是 timer id：停表必须调用它，用 `clearInterval`
  无效（会退化成无限重试）。这是实际发生过的 bug。

**免重启的手动重跑**：`POST /__musage-stats` 带 `{"action":"backfill"}`，
返回 `{ok, state, days, sessions}`。

## 工具调用指标

除拦截 LLM 流式调用统计 token 与费用外，还订阅 `session/event` 采集工具调用。工具事件本身
不带模型：插件在每次流式调用时记下「会话 → 最近模型」，工具事件按该会话的最近模型归因；
会话未知时归到 `unknown`，计入总量与工具排行但不参与按模型拆分。

两个易错点（都有测试钉住）：一次工具调用会产生 `tool/call` 与 `tool/result` **两个**事件，
调用数只在 `tool/call` 累加、失败数只在 `tool/result` 带 `error` 时累加；桶内按工具名的计数有上限
（16 个，超出按调用量淘汰），但**调用总数不受影响**（总量记在按模型的字段里）。

## 先确认版本：面板标题旁的 `vX.Y.Z`

插件改动**必须重启 dsh web 才生效**。标题旁显示的版本号是"我看到的是不是最新代码"的唯一可靠判据：

- 版本号与刚改的不一致 → 重启没生效，不要继续排查功能
- 版本号是新的但功能仍缺失 → 才是真的看代码

这个标签是踩坑后加的：热力图曾"前台没显示"，根因之一就是重启没生效，而界面上当时没有任何线索
能区分"代码没加载"和"功能有 bug"。

## 控件样式口径

面板与 shell 同处一个设置面板，控件必须取 shell 的口径，否则会像另一套控件。对齐的是
`@deepseek-ai/dsh-client-ui-primitives` 的 Button 与 settings-models 的 `.input`：

| 控件 | 口径 |
| --- | --- |
| 普通按钮 | `.sm` 胶囊 + `.outline`：`height 28px` / `radius 14px` / `0.5px solid --dsw-alias-border-l3` |
| 按钮 hover / active | `--dsw-alias-interactive-bg-hover` / `--dsw-alias-interactive-bg-active` |
| 选中按钮 | `--dsw-alias-button-primary-fill` + 前景 `--dsw-alias-label-primary-foreground` |
| 输入框 / 下拉 | `height 28px` / `radius 8px` / `0.5px solid --dsw-alias-border-l4` / `--dsw-alias-bg-layer-1` |
| focus | 只换 `border-color: --dsw-alias-brand-primary`，不加 outline |
| 标签页 | 幽灵按钮的 hover/active 底色 + 选中态下划线 |

`npm run verify` 的主题一致性检查会拒绝手写边框宽度、颜色字面量与过小的控件圆角。

## 界面预览与截图

```bash
npm run preview           # 生成 .verify-home/preview-{light,dark}.html（真实组件 + 真实 CSS + 真实主题令牌）
npm run preview:shot      # 再截图成 PNG（每个子页面重渲染后再拍，需要 google-chrome）
npm run preview:measure   # 用浏览器真实排版量出各区块高度、横向溢出与纵向越界
npm run preview:measure -- --width=420    # 换宽度
npm run preview:measure -- --tab=models   # 指定子页面
npm run preview:measure -- --models=40    # 指定模型数量，用于验证总览恒定高度
npm run shots:readme      # 生成 README 用的 assets/*.png，并清理清单外的陈旧截图
```

预览用**真实组件**（jsdom 挂载 + 真实数据态），CSS 取自客户端 `apply` 注入的 `<style>`，
主题令牌内联 harness 的 `design-platform.css`，所以配色与线上一致。它不启动、不重启 dsh web，
也不写任何真实 profile。

**README 的图片一律用仓库内相对路径**（`assets/*.png`），不允许外链图床：GitHub 会把外链图片
改写走 `camo.githubusercontent.com`，在部分网络下长期加载不出来，而作者本地一切正常——
线上就发生过"README 图片全碎"。私有仓库更是只有相对路径可行。发布出去的 README 也要能显示，
所以 `assets` 在 `files` 白名单里；`verify` 会核对"README 引用的每张图都存在、都没有外链、
都随包发布"。

产物文件名后缀由**写入、测量、截图三处共用同一个函数**（`suffixOf`）。这里踩过两次同一个坑：
三处各拼一次后缀，于是测量/截图读到的是上一轮的旧文件——**看起来在验当前代码，其实在验历史
产物**。`--shot` 也必须为每个子页面重新渲染再拍（曾经只给"已存在的 HTML"拍照，配置页截图因此
是几十分钟前的产物），窗口高度按整页实测高度给（固定 1400 会拍进半屏空白）。

预览的柱数始终显示上限值——markup 在 jsdom 里生成，jsdom 没有排版引擎。真实宽度自适应由
`tests/panel.test.mjs` 用 stub 覆盖。

## 测试与验证

```bash
npm test          # 单元测试
npm run verify    # 上线前闸门：不启动、不重启 dsh web
```

插件装进 profile 后要重启 dsh web 才生效；如果插件本身有问题，重启会把 Web 进程挂死。
`npm run verify` 在**不触碰正在运行进程**的前提下跑十项检查，任何一项失败都明确打印"不要重启"：

| 检查 | 抓什么 |
| --- | --- |
| 源文件语法 | `node --check`，两个半部加路由安全模块 |
| Host 生命周期 | 真实 `apply()`；导出契约完整；`dispose` 路径不抛错 |
| 主题一致性 | 控件只用 `--dsw-alias-*` 令牌；禁止手写边框宽度、颜色字面量、过小的圆角 |
| Client 注册与回收 | `__ModuleLoader__.load()` 契约；注册到 `settings.section`；zh/en 字典 key 对称；disposer 可回收 |
| Client 组件渲染 | jsdom 真实挂载 + 数据态渲染：模型名出现、图表真的画出来、设计意图成立（无环形图、已移除的旧结构不再出现）、文本无 NaN/Infinity/undefined |
| profile 组合树 | `dsh --profile web --dump-config` 能解析且包含本插件行 |
| 价格与迁移路径 | 用 `$DSH_HOME/musage-stats.json` 的真实副本跑一次，校验版本升级、官方单价、UTC 工作日窗口、所有 DeepSeek 模型都能计费 |
| 真实排版不越界 | Chrome 实测首页**默认态与悬停浮窗态**：非固定定位元素不得越出容器；浮窗必须在视口内且确实渲染；悬停前后页面高度一致；柱是定宽的靠左块。同一项还核对 README 写下的实测高度与当前代码一致 |
| npm 发布产物 | `npm pack --dry-run` 校验白名单：运行时要的文件（`src/*`、`cordis.patch.yml`、README、LICENSE）必须在，测试/脚本/文档不得混入；再把真实 tarball 解开导入一次 Host 半部——`node --check` 只验语法，导入才能发现"工作区能跑、发布后装不上" |
| 单元测试 | `npm test` 全绿 |

注意 `--dump-config` **只解析组合树、不加载插件模块**——它挡不住语法错误，所以语法与渲染
必须由前面几项负责，两者不可互相替代。服务面检查用临时目录，不写真实 profile。

### 单元测试的分工

- `tests/pricing.test.mjs`：别名归一化、官方单价、UTC 工作日高峰窗口边界（周末、跨零点、非 UTC 时区、空窗口）
- `tests/migration.test.mjs`：用临时 `DSH_HOME` 真跑 `apply()`，验证启动迁移升级旧默认价、保留用户自定义单价、尊重已关闭的峰谷开关、修复"开关开着但时段为空"的残留条目
- `tests/series.test.mjs`：时间台账聚合、幂等性、小时归属、120 天滚动窗口、坏数据丢弃
- `tests/tools.test.mjs`：工具调用计数（不翻倍）、失败归因、按会话模型归因、未知会话兜底、落盘恢复、工具名上限、热力账的每日标量与其独立性
- `tests/panel.test.mjs`：标签页结构、总览不含模型卡片、无数据时不渲染空壳、图表无浮层、子页面切换、热力图格子覆盖今天、柱靠左且随宽度自适应、悬停浮窗定位、明细页与首页的合并口径一致
- `tests/backfill.test.mjs`：只补缺失的日子、不动今天、切掉 fork 继承事件、空语料不算完成、被预算截断要重试、真实会话事件唤醒一次且仅一次、旧布尔完成标记必须失效
- `tests/route-security.test.mjs`：loopback 同源校验与请求体上限

测试把写盘防抖通过 `DSH_MODEL_USAGE_FLUSH_MS` 压到 60ms，并直接驱动防抖回调 / `dispose` 做同步
落盘——不等定时器，否则在负载下会读到旧文件而随机失败。

### 发布

```bash
npm run verify            # 闸门
npm pack --dry-run        # 确认产物只含 src / cordis.patch.yml / README / LICENSE
npm publish
```

`files` 字段是白名单：测试与脚本留在仓库里，不进 tarball。发布后在 profile 里用
`dsh plugin --profile web add model-usage-plugin` 装的就是同一份产物。

## License

MIT
