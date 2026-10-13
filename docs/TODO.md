# UI 体验改进待办

来源：一次通读主要视图代码的 UI 审查（12 条）。这里只保留**尚未处理**的条目，每条都标了证据
位置、建议做法与工作量；已完成与已否决的列在末尾，避免重复劳动。

排序按「收益 ÷ 成本」。

## 先做（各 10–30 分钟）

### 1. 上传拖拽区：整块可点 + 拖拽中高亮 + 按钮兜底

- 现状：`src/views/process/components/EmptyUploadPanel.vue` 的 drop zone 只绑了
  `drop` / `dragover` / `dragenter`，没有 `@click`，但样式给了 `cursor: pointer` —— 点不动。
- 另一个坑：选择按钮包在 `v-if="props.showReloadControls"`（:123）里，该开关为假时页面上只剩
  「点击下方按钮选择」，下面却什么都没有。
- 建议：整块区域 `@click` 直接打开文件选择；加 dragging 状态（文件拖过时高亮）；按钮区在
  `showReloadControls` 为假时也给出兜底入口。

### 2. 顶栏显示当前打开的日志

- 现状：`src/views/app/components/header/AppHeaderDesktop.vue` 只有 设置 / 关于 / 主题三个按钮，
  看不出当前打开的是哪份日志。
- 建议：顶栏显示文件名（或目录名），悬停显示完整路径；「重新加载」入口放在旁边。
- 场景：对比多份日志、实时跟随时，分不清自己在看哪份。

### 3. 任务卡压成两行，去掉重复的状态行

- 现状（部分已做）：信息行已合并（`src/utils/taskListFormat.ts` 的 `buildTaskMetaLine`），但卡片
  仍是 3 行 —— `状态: 成功` 单独占一行，与右侧 `#序号` 标签的颜色重复表达同一件事。
- 建议：

  - 第一行：状态图标 + 任务名 + 耗时
  - 第二行：开始时间 · 节点数 · 失败于 xxx

- 顺带解决「只靠颜色表达状态」在任务卡这一半。

### 4. 三处小打磨

- **搜索选项内联**：`src/views/textSearch/components/TextSearchControlCard.vue` 的
  `Aa` / `.*` 目前折叠在「搜索选项」里，看不出当前是否开了正则 / 区分大小写；建议按 VS Code 的
  做法放到输入框尾部。
- **流程图开关改名**：`src/views/flowchart/components/FlowchartTopToolbar.vue`（:54）的
  「忽略未经过节点」→ 更直观的「只看执行路径」。
- **圆角分层**：`src/Index.vue`（:402）全局 `borderRadius: '2px'`；建议只在 VS Code 场景用 2px
  贴合编辑器，Web / Tauri 用 4–6px（空状态拖拽区当前是 12px，风格不一致）。

## 中等（半天级）

### 5. 解析进度弹窗：补信息 + 可取消

- 现状：`src/views/app/modals/ParsingProgressModal.vue`（:35）只有「解析进度：N%」；
  `closable` / `mask-closable` / `close-on-esc` 全关，选错大文件只能干等。
- 建议：补文件名、大小、已解析行数或剩余时间；加「取消」按钮。
- 前置确认：`LogParser` 是否支持中断；不支持则退而求其次「取消 = 忽略本次结果」。

### 6. 「打开」入口统一

- 现状：同一个动作在不同地方叫「选择文件 / 文件夹」「重新加载」「打开」（流程图工具栏），各视图
  各放一份入口。
- 建议：顶栏放全局入口，统一叫「打开」；各视图不再重复放。

### 7. 状态不只靠颜色

- 现状：节点导航圆点只靠颜色区分 —— 超时与运行中同为 `--app-status-warning`，动作失败与识别
  失败近乎同一个红；色弱用户难以分辨。
- 建议：紧凑模式下在圆点之外加形状 / 图标（✓ / ✕ / ⏱ / ▶）；任务卡那一半随 #3 一起做。

### 8. 设置：即时生效 / 未保存提醒 / 恢复默认二次确认

- 现状：`src/views/settings/composables/useSettingsState.ts` 的 `reloadDraft` 会在关闭面板时把草稿
  丢掉且无提示；`src/views/SettingsView.vue`（:26-27）是「保存设置 / 恢复默认」按钮式；「恢复
  默认」还会同时重置面板布局，属破坏性操作却没有二次确认。
- 建议：这类偏好改完即时生效；若保留保存按钮，至少在有未保存修改时提醒；恢复默认加二次确认，
  或拆成「恢复设置默认」与「恢复布局默认」两个动作。

### 9. 详情面板空状态给出任务概要

- 现状：`src/views/DetailView.vue`（:95）只有一句「请在时间线或节点导航中选择节点查看详情」。
- 建议：默认展示所选任务的概要 —— 失败节点列表、耗时最长的节点。

## 已完成（勿重复）

- 状态色统一：语义 token 收口到 `src/style.css` 的 `--app-status-*`、`src/utils/statusColors.ts`
  与 `src/Index.vue` 的派生；`NodeCard` 圆点描边不再写死深色主题值。
- 「仅看失败」灰点 → 漏斗 + 失败数徽标（节点导航、流程图节点弹窗两处）。
- 键盘操作：`j` / `k` / `↑` / `↓` 节点、`[` / `]` 任务、`n` / `Shift+n` 搜索命中、
  `Enter` / `Shift+Enter` 搜索框内跳转、`f` 仅失败、`1`–`5` 切视图、`Esc` 关浮层 / 清筛选、
  `?` 键位表。
- 任务卡信息行合并；日期分组 + 点击折叠 + 两线分隔的样式。
- 统计视图里重复的日志导入入口已删除。

## 已否决 / 搁置（附理由）

- **宿主级组合键**（`Ctrl/Cmd+…`，含报告里的 `Ctrl+O` 打开、`Ctrl+F` 搜索）：需要每个宿主各写
  一份（VS Code `contributes.keybindings`、Tauri 菜单 accelerator、embed 的 `bridge.keydown`
  白名单），四端还要维护一张「哪端支持哪些键」的映射。当前键位刻意零修饰键，四端一套代码零
  冲突；真要做时先只做 VS Code 一端。
- **首屏「最近打开」列表**：属于新功能，另立项。
