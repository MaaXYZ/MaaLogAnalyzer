# Changelog

（这是 git-cliff 自动生成的草稿，请人工合并同类项并改为用户视角后
写入正式的 CHANGELOG.md。）

## [3.6.0] - 2026-08-30

### 代码重构

- (archive) Drop entry-count limit on all platforms
- (process) Migrate to vue-virtual-scroller 3.x types and API
- (statistics) Remove redundant bar charts and echarts dependency
- (statistics) Rename module to runtime statistics for better naming

### 修复问题

- (tools) Retain nested task failure evidence
- Stabilize unmetered local log loading
- (text-search) Preserve search state across view switches
- Hide offscreen parked views in vue-virtual-scroller pool
- (analysis) Cleaner empty state for unloaded workspace
- (process) Truncation tooltips and copy polish
- (process) Distinguish unfinished tasks from realtime running
- (settings) Prevent mobile settings controls from overflowing card border
- (statistics) Enable horizontal scroll for wide statistics tables
- (statistics) Widen task filter dropdown and allow full option labels
- (process) Prevent horizontal scrolling on node nav header
- (tree) Keep node timeline hierarchy stable and truncate long labels
- (tree) Keep expand toggles and labels on the same row
- (tree) Make long tree labels truncate with ellipsis
- (tree) Style the actual task-doc trigger so long labels ellipsize
- (tree) Prevent descenders from being clipped in tree labels
- (flowchart) Clamp popover position inside canvas bounds
- (flowchart) Shrink popover to canvas height and reflow on content resize

### 新增功能

- (header) Surface view switcher as persistent segment tabs
- (process) Locate failing node from failed task card
- (text-search) Default to loaded log targets on view entry
- (detail) Jump to source log context from detail cards
- (flowchart) Add canvas legend and surface unexecuted-node filter
- (header) Accessible labels for icon buttons and theme icon
- (process) Select node when clicking the timeline minimap
- (mobile) Visible drag handle on detail drawer
- (settings) Clarify save semantics and add per-toggle hints
- (statistics) Add dedicated Wait Freezes statistics mode
- (statistics) Add P95, failure contribution and first-try retry metrics
- (statistics) Add per-task filtering to runtime statistics

### 杂项

- (deps) Upgrade vue-virtual-scroller to 3.0.5 and drop local patch
- (parser) Bump version to 1.2.0 for new statistics APIs


[3.6.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v3.5.0...v3.6.0## [3.5.0] - 2026-07-27

### 代码重构

- (statistics) Remove unused scroll ref
- Remove redundant initial assignments
- (vscode) Initialize load operation once
- Simplify regular expression literals

### 修复问题

- (parser) Validate chunk line count
- (search) Restore regular expression matches
- (parser) Scope trace queries to actual subtrees
- (parser) Preserve colliding source evidence
- (tauri) Isolate privileged file access
- (vscode) Block third-party webview scripts
- (ci) Harden release tag handling
- (release) Skip releases for non-tag runs
- (ci) Pin SSH deployment action
- (vscode) Handle analyze-file without URI
- (parser) Honor zero raw-line limit
- (parser) Keep node statistics finite
- (parser) Match screenshots by millisecond
- (parser) Reject non-object event details
- (parser) Reject concurrent full parses
- (realtime) Retain failed parse batches
- (search) Prevent stale searches from committing
- (search) Prevent stale source loads from overwriting current file
- (ci) Run the complete Vitest suite
- (parser) Reject invalid protocol scope identifiers
- (parser) Bound analyzer session retention
- (parser) Bind task events to trace occurrences
- (ci) Typecheck package test sources
- (types) Export resource loading details
- (parser) Prevent stale session overwrites
- (ci) Drop unused Pages deployment privileges
- (vscode) Use canonical registry in lockfile
- (ci) Validate the VS Code extension build
- (parser) Report the parser package version
- (web-zip) Reject archives exceeding extraction budgets
- (vscode) Gate untrusted external analysis requests
- (ci) Restrict VS Code release permissions
- (ci) Scope release write permissions
- (parser) Apply query limits globally
- (ci) Run Tauri unit tests
- (flowchart) Avoid interpolating node IDs in selectors
- (flowchart) Restart playback after the final item
- (parser) Scope wait-freezes images to trace occurrences
- (web) Revoke replaced blob URLs
- (vscode) Bound archive and log resource usage
- (parser) Isolate mutable snapshots
- (vscode) Cancel superseded load operations
- (tauri) Secure archive input processing
- (tools) Bound archive and filesystem inputs
- (web) Secure 7z and RAR extraction
- (tauri) Manage extracted asset lifetimes
- (realtime) Follow stable task identities
- (realtime) Report the active stream state
- (realtime) Surface incremental parse failures
- (flowchart) Preserve layout across realtime updates
- (search) Reject invalid regular expressions
- (web) Bound folder input resources
- (tauri) Bound regular file and folder inputs
- (web) Bound native file picker resources
- (upload) Ignore superseded file selections
- (vscode) Preserve latest picker intent
- (vscode) Validate webview load messages
- (settings) Isolate unsaved edits
- (settings) Reset persisted layouts
- (tools) Distinguish resource projections in preflight
- (parser) Disambiguate repeated task overviews
- (parser) Bound realtime dedup state
- (settings) Validate persisted values
- (kernel) Pin output schema type
- (release) Synchronize application versions
- (ci) Centralize release version updates
- (ci) Preflight npm release artifacts
- (release) Mark prerelease tags correctly
- (vscode) Align API types with minimum engine
- (deps) Update vulnerable runtime packages
- (deps) Update vulnerable build toolchain
- (vscode) Update vulnerable packaging tools
- (ci) Pass supported Vitest worker options
- (build) Prevent package manager shadowing
- (packages) Support Node 20 consumers
- (tauri) Align frontend and Rust dependencies
- (search) Validate persisted history
- (process) Reject invalid persisted collapse flags
- (ci) Use locked VS Code release tooling
- (vscode) Complete Windows context menu lifecycle
- (archive) Scope lazy ZIP import to its case
- (archive) Preserve 7z loader failure cause
- (release) Validate desktop assets and checksums
- (ci) Enforce frozen dependency installs
- (vscode) Skip invalid prerelease publishing
- (release) Require signed desktop installers
- (tauri) Use the pinned package manager in hooks
- (tutorial) Tolerate unavailable progress storage
- (tutorial) Reject array-shaped progress state
- (theme) Validate persisted preference
- (process) Render frozen parser snapshots
- (vscode) 文件夹中的图片通过 VS Code 本地资源 URL 按需加载

### 性能优化

- (parser) Avoid redundant snapshot sorting
- (parser) Adopt raw line buffers without copying
- (web) Reduce visualization bundle cost
- (parser) Move log parsing into a worker
- (parser) Transfer raw log bytes to worker

### 持续集成

- Pin third-party actions by commit
- Audit Rust dependencies with RustSec

### 新增功能

- (parser) Enforce external tool protocol envelopes
- (vscode) Localize runtime messages
- (analytics) Restore web-only Umami injection
- Support resilient large log loading

### 杂项

- Enforce lint and formatting standards
- Bump npm package versions

### 构建相关

- (tauri) Track resolved Rust dependencies
- Standardize pnpm version

### 测试改进

- (tools) Include task identities in preflight fixtures


[3.5.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v3.4.0...v3.5.0## [3.4.0] - 2026-07-25

### 代码重构

- (maa-log-tools) Drop parserInputLine from runtime inspection output

### 修复问题

- Emit NodeNext-compatible package declarations
- (maa-log-tools) Improve runtime signal aggregation
- (vscode) Analyze selected resources directly
- (vscode) Streamline archive log loading

### 新增功能

- Add log compatibility preflight
- Expose MaaFramework runtime version sessions
- (maa-log-tools) Enrich runtime inspection evidence with source segments
- (vscode) Send log images to MSE crop tool

### 杂项

- Release maa-log-tools 1.1.0
- Publish maa-log-tools


[3.4.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v3.3.0...v3.4.0## [3.3.0] - 2026-07-18

### 修复问题

- (tauri) Join native paths cross-platform
- (loader) Isolate concurrent parse requests
- (statistics) Include single recognition durations
- (tauri) Return real log content when opening zip archives
- (tauri) Align primary log group ranking with web ordering
- (parser) Make StringPool actually deduplicate interned strings
- (projector) Avoid NaN task durations for invalid timestamps
- (statistics) Support low-memory zip log uploads
- (tauri) Decode single log files with encoding fallback
- (flowchart) Decode tauri log files with encoding fallback
- (flowchart) Preserve text search files from folder uploads
- Keep raw JSON stable during realtime updates
- Preserve realtime follow state across views
- Update stale embedded web app versions
- Keep mobile detail drawer closed during realtime updates
- Preserve realtime view state across remounts

### 性能优化

- (realtime) Cache incremental task snapshots
- (search) Stream large loaded text content
- (archive) Avoid duplicate extracted buffers
- (projector) Cache parsed event timestamps across snapshots
- (loader) Detect log encoding from a sampled prefix
- (loader) Isolate text decoding to preserve code splitting

### 新增功能

- (ui) Replace blocking alerts with naive-ui toast messages
- Support MXU split ZIP archives

### 杂项

- (deps) Explicitly disallow esbuild and vue-demi build scripts
- (loader) Remove dead tauri zip error image cache
- (loader) Remove verbose file discovery debug logs


[3.3.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v3.2.1...v3.3.0## [3.2.1] - 2026-05-27

### 修复问题

- (detail) 默认展开识别和动作原始 JSON
- (detail) Clarify hit child recognition count label
- (detail) Improve combined recognition summaries


[3.2.1]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v3.2.0...v3.2.1## [3.2.0] - 2026-05-17

### 代码重构

- Json 渲染
- (detail) Extract runtime detail row builders

### 修复问题

- 修复 useIsMobile 的抖动问题
- Minimap 导致的切换任务延迟
- (vscode) RangeError: Invalid string length

### 新增功能

- 节点导航 focus 筛选
- Minimap


[3.2.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v3.1.0...v3.2.0## [3.1.0] - 2026-05-16

### 代码重构

- 主从详情面板

### 修复问题

- 节点名长度溢出处理
- Disable overflow-anchor to prevent scroll jumps when expanding virtual scroller items
- Resolve virtual scroller jumping when expanding/collapsing items
- Perfectly prevent scroll jumping via virtual overscroll padding
- (ProcessView) Patch vue-virtual-scroller to prevent scroll jumping when collapsing large items spanning the viewport top
- 实时解析选项丢失
- RangeError: Invalid string length
- (vscode-extension) Img-src CSP
- 延迟加载原始 json

### 性能优化

- Extreme frontend performance optimizations for large logs

### 持续集成

- Npm release
- Publish
- Fix publish

### 新增功能

- 可选择加载的日志
- 7z/RAR 压缩包支持

### 杂项

- Add opencode ignore

### 测试改进

- Fix


[3.1.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v3.0.2...v3.1.0## [3.0.2] - 2026-04-18

### 修复问题

- 扩大跨源去重窗口
- (parser) Ignore delayed mirrored starts and align dedup retention window
- 修复 ZIP 根目录调试/超时截图未加载的问题（MXU结构）
- 修复跨任务 wait_freezes 被错误打平的问题

### 新增功能

- (tools) Focus
- Image_projection evidence

### 测试改进

- Fix zipExtractor test BlobPart typing


[3.0.2]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v3.0.1...v3.0.2## [3.0.1] - 2026-04-15

### 持续集成

- (fix) 修下 npm 包发布

### 杂项

- 改下 release note


[3.0.1]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v3.0.0...v3.0.1## [3.0.0] - 2026-04-15

### 代码重构

- 移除内置 AI 分析，收敛为工具能力层 **BREAKING CHANGE**
- (monorepo) Migrate parser stack into workspace packages
- (types) Propagate generic task typing across kernel/runtime/adapter
- Log parser (#19)
- 删除进程线程相关筛选 **BREAKING CHANGE**

### 修复问题

- (parser,node-card) 保留 NextList.Failed payload 并修复失败重试轮次展示
- (log-parser) Allow running parent action to nest later sub-tasks
- 修复实时模式未跟随时滚动会回到首卡片的问题
- (build) 修复懒加载边界并消除导入混用告警
- (logParser) Correct wait_freezes ownership in nested custom flows
- Build error
- (parser) 修复实时预览中父 action 运行时子任务嵌套流不显示
- Custom rec 嵌套问题
- 实时 action 实时状态显示补丁
- 扩大跨源去重窗口

### 持续集成

- (npm) Add automated publish workflow for maa-log workspace packages
- (release) Build before publish and guard ts runtime entries
- Npm包发布配置

### 文档更新

- Langchain
- 工具协议文档初版

### 新增功能

- Resource.loading
- Focus
- 适配新日志名格式
- Action 全局折叠选项细化

### 构建相关

- (packages) Emit dist artifacts and switch exports/bin to dist


[3.0.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v2.9.0...v3.0.0## [2.9.0] - 2026-04-09

### 代码重构

- (parser) Extend typed event decoders for identity ids and wait-freezes fields
- (flowchart) Make task selection controlled by selectedTask and add fallback regression tests
- 拆分 parser
- (parser) Extract action/event/subtask helpers from logParser with regression tests
- (parser) Extract recognition merge/attach helpers with regression tests
- (parser) Extract recognition scope attachment helpers with regression tests
- (parser) Extract subtask action-group nesting helpers with regression tests
- (parser) Extract subtask snapshot lifecycle and merge helpers with tests
- (parser) Extract wait_freezes runtime helpers with regression tests
- (parser) Extract flow assembly helpers for wait_freezes and timeline sorting
- (parser) Extract task-scoped node aggregation helpers with regression tests
- (parser) Extract task stack tracker helper with regression tests
- (utils) Centralize timestamp parsing helper and reuse in parser/flow builders
- (parser) Move log parser helpers and tests into src/utils/logParser with concise names
- 继续拆
- 再拆点
- (parser) Extract pipeline node flow composition helpers
- (parser) Extract subtask action-node lifecycle helpers
- (parser) Extract runtime settlement helper for pipeline finalize
- (parser) Extract scoped node dispatch helper factories
- (parser) Extract simple node event router
- (parser) Extract subtask runtime cleanup helpers
- (parser) Extract pipeline-node starting handlers
- (parser) Extract recognition-node lifecycle helpers
- (parser) Extract recognition event handler helpers
- (parser) Extract next-list event handling helpers
- (parser) Extract action and wait_freezes event handlers
- (parser) Extract node dispatch lifecycle orchestration
- (parser) Extract pipeline runtime state helpers
- (parser) Extract node aggregation reset helper
- (parser) Extract subtask pipeline finalize helper
- (parser) Extract task pipeline finalize helper
- (parser) Extract active node preview helpers
- (parser) Extract subtask action-node lifecycle dispatcher
- (parser) Introduce task node runtime context factory
- (parser) Extract runtime context and task event loop
- (parser) Extract node dispatch config factory
- (parser) Extract task lifecycle context factory
- (parser) Inline scoped dispatch wrappers into event loop
- (parser) Reduce local wrapper helpers in getTaskNodes
- (parser) Inline pipeline start wrappers in dispatch config
- 任务列表布局调整
- 流程图展示

### 修复问题

- (process) Keep node nav selection highlight working under filtered lists
- (process-nav) Preserve node selection under filtered navigation and add regression test
- 流程图悬浮框定位失效
- 流程图节点颜色判定
- 延迟加载

### 持续集成

- (parser) Add core regression job and extract task lifecycle event decoders
- Fix
- Fix deploy

### 文档更新

- (parser) Add log parser architecture guide
- (parser) Add parser doc links

### 新增功能

- (process) 支持节点导航双模式并优化命中展示
- (process) Support node-nav hit mode and compact single-line header
- (flowchart,process) 统一执行时间线语义并增强节点导航
- 流程图悬浮框筛选

### 杂项

- (ci,parser) Generalize core test discovery and normalize pipeline id decoding


[2.9.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v2.8.0...v2.9.0## [2.8.0] - 2026-04-07

### 代码重构

- (parser) Unify pipeline node flow composition for recognition/action/wait-freezes
- (node-card) 抽取 flow rows 组装逻辑并修复详细卡片参数命名
- (parser,node-card) Unify recognition-node handling and extract merged recognition list
- (parser,node-card) Tighten typing and dedupe recognition/next-list handlers
- (parser,node-flow) 按 task_id 作用域处理子任务 NextList/WaitFreezes
- (parser) Unify RecognitionNode finalize flow for main/sub tasks
- (parser) Unify RecognitionNode start/finalize handling across task scopes
- (parser) Extract ActionNode helpers and add subtask action regression test
- (parser) Extract subtask action/pipeline finalize helpers and status resolvers
- (parser) Extract subtask action/pipeline finalize helpers and status resolvers
- (parser,node-card) Split pipeline finalize helpers and cache next-list match names
- (parser) Unify pipeline finalize flow assembly and dedupe NextList/WaitFreezes handlers
- (parser,node-card) Consolidate recognition/action event handlers and dedupe expand-state sync
- (parser) 收口节点事件生命周期处理并拆分 pipeline finalize 流程
- (parser) 统一节点事件分发并精简 RecognitionNode 热路径
- (ui) 简化 NodeCard 识别列表拼装与展开状态管理
- (ui) 抽取 NodeCard 共用状态渲染与 key 逻辑
- (parser,ui) 收口节点 upsert 与状态按钮映射逻辑
- (parser) 收口节点事件分发与 pipeline finalize 组装细节
- (parser,node-card) Unify flow status/next_list typing and simplify status props
- (parser) Dispatch node events by kind/phase and harden next_list parsing
- (parser) Simplify node event dispatch and add next_list resilience tests
- (parser) Normalize phase handling and ignore unknown node phases safely
- (parser) Cache message meta parsing and unify scoped node dispatch helpers
- (parser) Unify lifecycle phase/status handling and simplify scoped node dispatch
- (parser) Tighten terminal-phase handling and simplify subtask action lifecycle
- (parser) Scope message-meta cache to parser instance and streamline subtask lifecycle updates
- (process) Extract shared timeline list pane for desktop and mobile

### 修复问题

- (process) 修复节点导航首次点击定位偏到同名首个卡片
- (vscode) 同步宿主主题并移除 webview 内手动主题切换入口
- (image-preview) 避免下载 blob 图片时当前页跳转导致链接失效
- (tauri-image) 修复本地截图在 Tauri 中无法加载的问题
- (tauri-download) 修复图片下载按钮跳转页面且无法保存的问题
- (tauri-zip) 改为返回临时图片路径并统一协议，修复 ZIP 加载卡死崩溃
- (node-flow) Keep action subtree in action timeline
- (log-flow) 修正 WaitFreezes 归属并统一 Recognition/Action 树渲染
- (flowchart) Preserve selected task by identity across task list reordering
- (flowchart) Enforce global execution-order indexing for timeline, node badges, and execution edges
- (flowchart) Align node-click timeline selection to latest repeated execution order
- 移动端实时跟随和滚动

### 性能优化

- 优化大日志加载内存占用
- (startup) Keep VSCode analytics reporting async while preserving faster first paint

### 新增功能

- 解析 anchor
- 支持 WaitFreezes 事件并统一 Action 时间线展示
- (log-parser) Support recursive nested action groups
- (detail) Load wait_freezes debug draws from reco_ids via bridge reco detail

### 杂项

- (dev) Tauri dev 下禁用 Vite 自动开浏览器，保留 web dev 自动打开
- Vite忽略sample文件夹
- 忽略 .codex
- (deps) Rollup

### 测试改进

- 两组回归测试
- (parser) Add golden snapshots for task/node flow assembly and unknown-phase guards


[2.8.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v2.7.0...v2.8.0## [2.7.0] - 2026-03-28

### 代码重构

- Msg parse
- Tasker.Task
- (node-flow) Decouple pipeline top-level recognition/action from flow_items
- (selection) Remove legacy task.*.action id compatibility
- (log-parser,ui) Unify node flow model and switch to ts/end_ts fields
- (ai) Make first-round context and knowledge extraction relevance-driven
- (ui) 统一节点卡片嵌套/折叠逻辑并精简流程前缀
- (ai) 清理旧事件造成的冗余
- 页签
- 代码拆分

### 修复问题

- Tree 模式渲染 node.recognition 的嵌套
- (theme) 兼容 VS Code 主题变量并修复 Naive UI var(...) 颜色解析报错 (#18)
- (vscodelaunch) 隐藏主题切换按钮
- (realtime) 实时模式下展开子节点时未正常跟随
- (parser) Dedupe recognition attempts by reco_id and merge running/ended states
- (parser) Resolve RecognitionNode reco_id without node_id fallback and finalize pending node attempts
- 兼容 vscode-panel 参数
- Img 宽度约束
- 实时跟随仅在需要时滚动
- (process) Remove NodeCard hover horizontal shift to prevent content drift
- (bridge) 调整 bridge.keydown 为 Analyzer->Support，并对齐快捷键处理与协议
- Stabilize node card rendering and remove hover layout shift
- Load debug screenshots on web and unify detail image preview
- (vscode) Make raw JSON copy work in VS Code iframe
- (flowchart) Harden orthogonal edge rendering in web view
- (flowchart) Sync node card theme with VS Code webview classes

### 性能优化

- Tree
- (ai) Prompt
- Ai 分析界面布局优化
- 优化加载策略，显著减少内存占用

### 文档更新

- (protocol) Document query.node/query.taskDoc and command.reveal/openCrop
- 协议文档收尾

### 新增功能

- Tree 模式里 node.recognition 的嵌套支持“每一层独立折叠”
- 移除 flow_items
- (ai) 补充 flow 缩写语义，提升 prompt 可读性
- 插件版布局 (#17)
- (vscode-launch) Draw and raw image
- (vscode-launch) Bridge Image Cache
- (realtime) 增量逐帧解析并打通全链路 running 状态
- (realtime) 跟随扩大滑动条件
- (realtime) 跟随模式下检测到用户向上滚动就停止跟随
- (realtime) 实时里父节点 running 时，相关区域会强制保持展开
- (bridge) Make reco image loading resilient to inline/cached formats
- (vscode-launch) Add hover task docs and bridge node/reveal/crop integration
- (realtime) Implement snapshot replay request flow and snapshot end handling
- 图片支持点击放大
- (process-view) Add node-nav search with next/flow match details and explicit hit previews
- 节点筛选
- 关于对话框适配 embed
- (theme) Scope VSCode token theming and fix panel/filter contrast
- (analytics) Add Umami tracking for web/iframe/tauri/vscode with runtime-specific events
- (theme) Align Descriptions header and inline code text with VS Code theme tokens
- 显示未识别节点
- (statistics) Revamp node statistics layout, charts, and data panels

### 杂项

- 简化无效字段
- Div
- [JumpBack]和[Anchor]换下位置

### 样式调整

- (theme) Use vscode panel background as sole base surface
- Overflow: hidden


[2.7.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v2.6.0...v2.7.0## [2.6.0] - 2026-03-21

### 代码重构

- 流程解析
- 统一下详情格式

### 修复问题

- 移动端教程出界
- 跨秒漏去重
- 执行时间统一成开始时间
- Action 嵌套解析
- 重载后旧资源未回收
- 额外占用
- 首轮流式输出时无显示
- 后处理阶段内容消失
- 处理中告警延迟显示
- 动作不应该有识别详情
- 默认展开JSON数据选项未对任务详情生效
- (vscode) 右键菜单受 UTF-8 with BOM 影响

### 性能优化

- Ai 分析内存优化
- 减少字符串存储

### 新增功能

- AI 分析 (#16)
- Ai 分析板块教程
- 识别轮次区分
- (ai) SelectedNode
- 导出对话

### 杂项

- 删除无用脚本


[2.6.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v2.5.0...v2.6.0## [2.5.0] - 2026-03-14

### 修复问题

- (tutorial) 修复移动端目标定位丢失的问题
- 调整手机端分屏模式布局
- 修复分屏模式错误提示未加载目标的问题

### 性能优化

- 手机端分屏模式优化

### 文档更新

- (protocol) Add support-analyzer realtime json-rpc spec
- 测试

### 新增功能

- (text-search) 支持从 zip/文件夹加载目标并优先处理 maafw 日志
- (realtime) Stabilize follow scrolling and unify process header actions
- (flowchart) 流动
- (flowchart) 新增忽略未经过节点选项

### 杂项

- 连线设置


[2.5.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v2.4.0...v2.5.0## [2.4.0] - 2026-03-12

### 代码重构

- 设置布局
- About

### 修复问题

- 识别部分的节点名加下前缀

### 持续集成

- Push tag 时也触发部署 web

### 文档更新

- 更新 Agents.md
- README
- README

### 新增功能

- (flowchart) Focus
- (flowchart) 执行流程回放
- 新手教程
- 布局配置持久化
- 新手教程最后一步
- 支持 maafw.log
- (flowchart) 避障折线


[2.4.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v2.3.0...v2.4.0## [2.3.0] - 2026-03-12

### 代码重构

- 原始日志解析
- 非解析日志逻辑
- 自动布局采用 elkjs

### 修复问题

- (ci) 尝试修复流水线生成版本的错误
- Custom 嵌套任务未正常解析
- Build error
- Fix again
- 点击按钮时没有重置 isActionOnlyView 状态
- Build error
- NText 导入
- Missing required prop
- ECharts resize error
- 未正确解析截图
- 失败状态颜色显示错误
- 完善 ipc 去重
- 日志分析跳转流程图逻辑
- Import error
- 悬浮框里的执行标号改为任务全局执行顺序
- (vscode) 插件加载等问题
- (tauri) 权限问题
- (tauri) 解析逻辑对齐web

### 性能优化

- 优化节点详情展示
- 优化 IPC 去重逻辑
- 首屏加载

### 文档更新

- 加下插件
- (vscode) 更新文档

### 新增功能

- 加载截图
- 折叠
- 节点导航和执行流程卡片加个时间
- 解析内容无效的提示
- Ui 新增紧凑、树形两种风格
- 手机版网页适配
- 树形加点折叠
- 原始 json 数据折叠选项
- 加载 zip
- Umami Cloud 统计
- 置顶/置底
- Vision
- Wait_freezes 调试图
- 流程图
- (vscode) 增加侧边栏入口、Windows 右键菜单集成与中英文本地化

### 杂项

- 移除PipelineNode标签
- 调整节点导航宽度
- 改下名
- Gitignore
- 改下 release 包名


[2.3.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v2.2.0...v2.3.0## [2.2.0] - 2026-03-09

### 代码重构

- 合并识别尝试和 next list

### 修复问题

- IPC 去重问题
- 尝试修复快速切换任务后结构混乱的问题
- 完善 vue-virtual-scroller 类型声明
- 修复任务列表点击高亮错误的问题

### 持续集成

- Deploy to server (#15)
- 优化流水线
- Fix
- Fix again
- Version
- Web version

### 文档更新

- Agents.md

### 新增功能

- 给识别和动作结果加上时间戳
- 为任务列表的任务添加开始时间
- 上传文件夹
- Add VSCode extension release workflow
- Add VS Code extension support

### 杂项

- Migrate repository to MaaXYZ organization
- 一些小修改


[2.2.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v2.1.0...v2.2.0## [2.1.0] - 2026-02-14

### 代码重构

- 流水线展示重构

### 修复问题

- 修复 custom action中的操作不解析的问题
- 重新上传文件后未更新展示面板
- 切换模式的问题
- Uuid + task_id 组合作为任务的唯一标识，防止错误过滤
- 确保上传新文件时，旧的任务数据会被清除
- 删除了"节点详细信息"卡片中的"节点名称"项
- 修改去重策略
- Build error

### 性能优化

- 提高安全性
- 配置代码分割，将大的第三方库单独打包

### 新增功能

- 任务列表不再显示 MaaTaskerPostStop
- 进程和线程过滤只显示有任务数据的选项
- 性能统计
- 性能统计饼图

### 杂项

- Editor config
- 更新到 v2.1.0


[2.1.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v2.0.2...v2.1.0## [2.0.2] - 2026-02-06

### 其他

- Update CNAME from maafw.xyz to maafw.com

### 持续集成

- 更新 CI 配置以支持 Tauri v2

### 新增功能

- 支持本地应用读取非 UTF-8 编码的日志文件

### 杂项

- 修改组织名
- 升级到 Tauri v2


[2.0.2]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v2.0.1...v2.0.2## [2.0.1] - 2026-01-20

### 修复问题

- 简单修修解析和显示问题

### 文档更新

- Fix typo in README.md for MaaFramework
- README 调下内容顺序
- Enhance README with inspiration and contributors
- Update README to clarify log analysis focus

### 杂项

- 更新到v2.0.1


[2.0.1]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v2.0.0...v2.0.1## [2.0.0] - 2025-12-18

### 代码重构

- 日志分析ui

### 修复问题

- Path
- Favicon
- Failed action
- 修复 task_id 重复导致任务被覆盖的问题
- Parser
- 嵌套节点解析错误
- Form field element id
- Build error
- 部分节点名称解析错误
- Build error
- Tauri版解析进度框
- 未识别的节点不应该展示动作详情
- Aria-hidden
- Build error
- 换视图模式保留所有状态

### 性能优化

- 日志分析部分大文件加载以及内存占用优化
- 耗时显示优化
- 虚拟滚动
- Webp

### 文档更新

- Markdownlint error
- Readme 更新
- 文档美化
- 徽章调下位置

### 新增功能

- 部署到 github pages
- (ci) Add deployment check and update README (#5)
- 解析 maafw v5.3.0 的 log (#6)
- 折叠
- 日志分析节点导航

### 杂项

- Remove linux aarch64
- Ico
- Remove unused statistics code
- PipelineNode 标签
- 更新到v2.0.0
- 多了个脚本


[2.0.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v1.2.1...v2.0.0## [1.2.1] - 2025-12-13

### 代码重构

- (ci) Runner

### 修复问题

- 默认跟随系统主题
- 修复浅色模式下部分区域颜色异常的问题
- (ci) Build error
- (ci) Wix
- (ci) Build error

### 文档更新

- 文档跟随系统显示不同图片

### 新增功能

- Gitattributes
- (ci) Git cliff
- Upload artefacts

### 杂项

- (ci) 更新下载说明
- 更新到v1.2.1
- (ci) Description modify
- 移除 win arm


[1.2.1]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v1.2.0...v1.2.1## [1.2.0] - 2025-12-13

### 修复问题

- (ci) 添加 MSI 文件到 GitHub Release 上传列表
- 修复行数跳转错误 (#2)

### 新增功能

- Support for hightlight (#3)

### 杂项

- 更新到v1.2.0


[1.2.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v1.1.0...v1.2.0## [1.1.0] - 2025-12-11

### 代码重构

- 移除 NSIS 依赖，使用便携式 exe 文件

### 修复问题

- 修复 Windows 构建产物问题，添加构建检查和 msi 目标
- 移除 AppImage 打包目标，使用更稳定的 deb 包
- 修复 Windows 构建中的 PowerShell 语法错误

### 文档更新

- 添加界面截图展示到 README

### 新增功能

- 添加格式错误的提示

### 杂项

- 整理下项目
- 更新到v1.1.0


[1.1.0]: https://github.com/MaaXYZ/MaaLogAnalyzer/compare/v1.0.0...v1.1.0## [1.0.0] - 2025-12-11

### 修复问题

- (ci) Run error
- (ci) Run error
- (ci) Type error
- (ci) Type error
- (rust) 修修
- (ci) Ci error
- (ci) 简化构建配置，修复 Windows MSI 和 Linux ARM64 问题
- (ci) Ci error
- (ci) Mac intel runner
- (ci) Mismatch

### 新增功能

- V1



<!-- generated by git-cliff -->
