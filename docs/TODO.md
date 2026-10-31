# UI 体验改进待办

> 来源：2026-11 一次五维度 UX 审计（视觉 / 任务流 / 数据可信度 / 无障碍 / 性能）。
> 5 名审计员分别在生产构建（`vite preview` 的 `dist`）上用 Playwright 实测、axe 扫描、
> WCAG 对比度计算与真实日志跑流程取样，Lead 汇总去重后落地了第一批修复。
>
> 维护方式：**已修的条目移出本文件**，末尾「已交付」只留一行索引，避免下次重复劳动。
> 每条都带证据位置与工作量，排序按「收益 ÷ 成本」。

## 先做（各 10–30 分钟）

### 1. 三个一级视图的标题区还没统一

- 现状：运行统计是「22px 标题 + 徽标 + 两行副标题 + 右侧控件」的页头；文本搜索是 16px 加粗
  `📝 文本搜索` 夹在工具栏里与下拉框同高；日志分析没有标题，一进去就是三张面板卡。
  切换视图时「我在哪一页」的锚点每次换位置和字号。
- 建议：抽 `ViewHeader.vue`（`title 20px/600` + 可选徽标 + 可选副标题 + `#actions` 槽，高 56px），
  三个视图都接；日志分析补一个只有标题的页头。
- 证据：`src/views/NodeStatisticsView.vue:186`（22px）、
  `src/views/textSearch/components/TextSearchTopToolbarDesktop.vue:29`（16px + emoji）。
- 工作量：半天。

### 2. 空状态图标是 naive-ui 默认那枚「方框 + ✕」

- 现状：搜索结果、文件内容、Wait Freezes 明细、节点详情等 5 处空态共用同一个 40px 图标，
  图形里自带一个 ✕，读起来像「加载失败 / 图片损坏」，且不在本应用的 antd 线性图标体系里。
- 建议：统一 `<empty-state>` 包装（空数据用 `InboxOutlined`，未选文件用 `FileSearchOutlined`），
  或至少统一覆盖 `n-empty` 的 `#icon` 槽。
- 证据：`src/views/textSearch/components/TextSearchContentPane.vue`、
  `.../TextSearchResultsCard.vue`、`src/views/nodeStatistics/components/NodeStatisticsEmptyState.vue`、
  `src/views/DetailView.vue`。
- 工作量：30 分钟。

### 3. 圆角还有 5 档（2 / 6 / 8 / 12 / 16px）

- 现状：卡片与按钮 2px（全局 `borderRadius: '2px'`），节点导航搜索框 6px，导航行与徽标 8px，
  空态拖拽区 12px，统计 KPI 卡 16px。用户读不出「哪类元素更圆」的规律。
- 建议：只保留两档 —— 容器 2px（贴 VS Code）、浮层/输入/徽标 6px；落成
  `--app-radius-card` / `--app-radius-control` 两个变量再逐处替换。
- 证据：`src/Index.vue` 的 `common.borderRadius`、`src/views/process/components/NodeNavSearchInput.vue:59`、
  `src/views/nodeStatistics/components/NodeStatisticsSummarySection.vue:371`。
- 工作量：30 分钟。

### 4. 流程图图例 11px、60% 不透明，却承载全图的全部编码规则

- 现状：读懂流程图要同时记住 4 种状态色 + 5 种线型，说明文字挤在左下角 213×95 的浮层里，
  字号 11px、`opacity: .6`，是全页最难点亮、最易漏读的文本。
- 建议：正文提到 12px、`opacity: 1`；默认折叠成「图例 ▸」，展开后两列（宽 300 → 360px）。
- 证据：`src/views/flowchart/components/FlowchartLegend.vue:71,91,130`。
- 工作量：30 分钟。

## 中等（2 小时–半天）

### 5. 「打开日志」有 3 种按钮样式、4 个入口

- 现状：文本搜索是绿色 `primary`「选择其它文件」，流程图是灰色 `secondary`「打开」，
  日志分析是描边「重新加载」；破坏性动作「清除」用琥珀 `warning`，而琥珀在流程图图例里表示
  「运行中」、在文本搜索里表示文件体积。同一屏里琥珀色有两种互不相干的含义。
- 建议：顶栏放唯一的全局入口并统一叫「打开」；打开类动作统一 `secondary + 图标`，
  破坏性动作统一 `error + quaternary`；琥珀只留给「运行中/超时」。
- 证据：`src/views/textSearch/components/TextSearchTopToolbarDesktop.vue:47-60`、
  `src/views/flowchart/components/FlowchartTopToolbar.vue:67`、
  `src/views/process/components/ProcessTimelineToolbar.vue:55-63`。
- 工作量：半天（含顶栏入口）。

### 6. 设置面板：改完要手动保存、关掉就丢、恢复默认无二次确认

- 现状：`useSettingsState.ts` 的 `reloadDraft` 在关闭面板时直接丢弃草稿且无提示；
  「恢复默认」还会顺带重置面板布局，属破坏性操作却没有确认。
- 建议：偏好类开关改完即时生效；若保留保存按钮，至少在有未保存修改时提示；
  「恢复默认」拆成「恢复设置默认」与「恢复布局默认」两个动作，破坏性那个加二次确认。
- 证据：`src/views/settings/composables/useSettingsState.ts`、`src/views/SettingsView.vue`。
- 工作量：半天。

### 7. 节点导航紧凑模式仍然只有颜色

- 现状：本轮已把「识别未命中」从失败里拆出来（新增 `not-hit` 状态，并在行内补了只给读屏的
  状态文字），但**看得见的部分**仍然只有 8px 圆点：未命中复用超时的琥珀色、动作失败与失败近乎同红。
  色弱用户与非读屏用户都只能靠颜色猜。
- 建议：圆点改成形状（✓ / ✕ / ⏱ / ▶ / ○），或把状态做成一枚 12px 图标 + 短词（「未命中」）；
  未命中与超时必须能在形状上区分，不只是同色圆点。
- 证据：`src/views/process/components/NodeNavItem.vue` 的 `getNodeNavDotClass` 与 `nav-status-dot` 样式。
- 工作量：1 小时。

### 8. 首屏引导（tour）与窄屏/已加载状态的关系没理顺

- 现状：首次进入是空态，tour 会盖在任务列表面板上；用户在 1024 及以下宽度时，引导气泡与
  被指目标经常不在同一屏内。
- 建议：tour 的 target 找不到时跳过该步；窄屏用 `mobileTarget`；已加载日志时不要从「上传区」那步开始。
- 工作量：2 小时。

## 性能基线（本轮生产构建实测，供后续改动对比）

同一台机器（12 核）、`vite preview` 生产构建、Playwright 驱动，每项重复取样取中位数：

| 场景                     | 数据           | 实测                         | 结论                             |
| ------------------------ | -------------- | ---------------------------- | -------------------------------- |
| 冷启动到首帧可交互       | —              | 206–229ms                    | 好                               |
| 首屏传输量               | —              | 357KB                        | 好                               |
| 解析到首个任务可见       | 4000 行 / 13MB | 236ms / 360ms                | 好（流式解析，首个任务出现很快） |
| 切任务（`[` / `]`）      | 4000 行 / 13MB | 53ms / **536ms**             | 13MB 下已可感知                  |
| 切视图                   | 全部           | 49–148ms                     | 好                               |
| 首次进流程图（ELK 布局） | 13MB           | **1677ms**                   | 已有骨架提示，仍偏慢             |
| 大日志解析全程           | 80MB           | 2.97s（进度弹窗 0.48s 出现） | 好                               |
| JS 堆                    | 4000 行        | 43MB                         | 好                               |

结论：**解析与首屏没问题**，瓶颈集中在「大日志切任务」和「首次流程图布局」两处。
若要继续优化，先做切任务（`processView` 时间线重渲染 + 节点导航重建），再考虑图表布局预热之外的增量布局。

## 已否决 / 搁置（附理由，勿重复提）

- **宿主级组合键**（`Ctrl/Cmd+…`）：需每个宿主各写一份（VS Code `contributes.keybindings`、
  Tauri 菜单 accelerator、embed 的 `bridge.keydown` 白名单），四端还要维护「哪端支持哪些键」。
  当前键位零修饰键、四端一套代码零冲突。真要做时先只做 VS Code 一端。
- **首屏「最近打开」列表**：属于新功能，另立项。
- **解析进度弹窗加取消按钮**：实测代价被高估 —— 13MB 484ms、15MB 802ms、80MB 2.97s 就结束，
  用户点取消的时间窗口只有 3 秒，收益不足以承担「中断解析」的一致性成本。若将来引入更大日志
  （>500MB）再回来看这条。
- **任务卡 #序号 保留状态色**：状态已由图标 + 状态词表达，而状态色当文字色只有 3.1–3.6:1
  不达标，故 #序号 改为中性色。

## 已交付（本轮，索引性质，勿重复）

视觉：空态拖拽区整块可点/拖拽高亮/焦点环；任务卡三行压两行（状态图标 + 状态词 + 元信息一行）；
成功率列补回数字与色档；流程图节点锚点圆点隐藏；节点卡标题/时间不再互相挤压折行；
折叠把手归位（展开态在面板标题栏、收起态才出竖排把手）；统计表窄屏隐藏两列且表头省略；
文本搜索元信息不再使用语义色。

流程：切任务时的 `querySelectorAll` 异常与「选中卡滚不进视野」；≤1100px 默认收起详情面板
（`useIsCompactDesktop`）；详情面板空态改为任务概要（失败节点 / 最慢节点可点进详情）；
顶栏显示当前日志名（悬停完整路径）；错误提示按五类区分并给下一步；加载失败不再清空已加载日志；
文本搜索未执行态与取消选择文案修正。

数据：统计不再静默丢弃未结算节点（口径脚注）；流程图执行顺序列表显示真实节点名；
「识别未命中」与「节点失败」拆成两种状态。

无障碍：全局 `:focus-visible` 焦点环；状态色拆成图形色/文字色两套 token（`--app-status-*-text`）；
浅色主题主色修正（白字 1.60:1 → 达标）；空态描述对比度；视图切换选中态补描边与主色文字；
任务卡与节点导航行可聚焦、有 role/aria、支持 Enter/Space；全站 `aria-live` 播报区
（搜索结果数、解析进度、toast）。
