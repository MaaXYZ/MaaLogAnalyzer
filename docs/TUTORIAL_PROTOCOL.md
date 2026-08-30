# 新手教程协议（Spotlight Tour Protocol）

本文档用于说明如何在 `MaaLogAnalyzer` 中配置“聚焦高亮”新手教程。你只需要改步骤配置，不需要改引擎代码。

## 1. 配置文件位置

- 步骤配置：`src/tutorial/steps.ts`
- 步骤类型：`src/tutorial/types.ts`
- 渲染引擎：`src/components/TourOverlay.vue`
- 接入逻辑：`src/App.vue`

## 2. 版本控制

- 当前版本常量：`TOUR_VERSION`（在 `src/tutorial/steps.ts`）
- 本地存储键：`TOUR_STORAGE_KEY`（默认 `maa-log-analyzer-tutorial-version`）
- 自动触发规则：
  - 当本地已完成版本 `< TOUR_VERSION` 时，应用启动后会自动用内置样例拉起教程。

更新教程内容后，如果希望老用户重新看到新步骤：

1. 修改 `TOUR_STEPS`
2. 同时递增 `TOUR_VERSION`

## 3. 步骤结构

`TourStep` 定义：

```ts
export interface TourStep {
  id: string
  title: string
  content: string
  target: string
  view?: 'analysis' | 'search' | 'statistics' | 'flowchart' | 'split'
  placement?: 'auto' | 'top' | 'right' | 'bottom' | 'left'
  padding?: number
  action?: 'none' | 'selectFirstTask' | 'selectFirstNode'
  optional?: boolean
  nextLabel?: string
  prevLabel?: string
}
```

字段说明：

- `id`: 步骤唯一标识，建议短且稳定。
- `title`: 步骤标题。
- `content`: 说明文案。
- `target`: 目标元素选择器（建议使用 `data-tour="..."`）。
- `view`: 进入步骤前切换到指定视图。
- `placement`: 提示卡优先位置（当前引擎已预留，默认 `auto`）。
- `padding`: 高亮框外扩像素（默认 `8`）。
- `action`: 步骤前置动作。
  - `none`: 不做动作
  - `selectFirstTask`: 选中首个任务
  - `selectFirstNode`: 选中首个节点
- `optional`: 是否可选步骤。可选步骤目标查找超时较短。
- `nextLabel` / `prevLabel`: 预留字段（可扩展按钮文案）。

## 4. 目标锚点规范

推荐写法：

```html
<div data-tour="analysis-main">...</div>
```

约束建议：

1. 使用稳定的 `data-tour`，不要依赖容易变化的 class。
2. 一个步骤只指向一个目标（保证讲解聚焦）。
3. 目标必须在对应 `view` 中可渲染。

## 5. 已预置锚点（可直接用）

- `header-view-switch`
- `header-tutorial-button`
- `analysis-main`
- `flowchart-main`
- `search-main`
- `statistics-main`
- `analysis-process-root`
- `analysis-upload-zone`
- `analysis-task-list`
- `analysis-node-timeline`
- `analysis-node-nav`
- `flowchart-toolbar`
- `flowchart-execution-nav`
- `flowchart-canvas`
- `textsearch-root`
- `textsearch-toolbar`
- `textsearch-results`
- `textsearch-content`
- `statistics-root`
- `statistics-table`

## 6. 最小可用示例

```ts
import type { TourStep } from './types'

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'step-view-switch',
    title: '切换视图',
    content: '先看这里，四个主视图都从这里切换。',
    target: '[data-tour="header-view-switch"]',
    view: 'analysis',
    action: 'none',
  },
  {
    id: 'step-analysis',
    title: '日志分析主区域',
    content: '这里是你最常用的分析工作区。',
    target: '[data-tour="analysis-main"]',
    view: 'analysis',
    action: 'selectFirstTask',
  },
]
```

## 7. 调整步骤的推荐流程

1. 先加/确认目标区域的 `data-tour`。
2. 在 `TOUR_STEPS` 增加步骤并本地运行验证。
3. 如果是对老用户也要生效，递增 `TOUR_VERSION`。

## 8. 排障

- 现象：步骤提示“目标未出现”
  - 检查 `target` 选择器是否匹配。
  - 检查该步骤 `view` 是否正确。
  - 目标是否在异步数据加载后才渲染。

- 现象：高亮框位置偏移
  - 检查目标是否有动画/过渡导致布局抖动。
  - 可增大步骤之间的停顿（需要在 `App.vue` 引擎中调整）。

- 现象：某些步骤不需要强制成功
  - 设置 `optional: true`，允许用户继续下一步。
