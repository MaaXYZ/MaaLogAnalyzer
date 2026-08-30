/**
 * 应用设置管理
 */

import { reactive } from 'vue'

export type DisplayMode = 'detailed' | 'compact' | 'tree'
export type FlowchartEdgeStyle = 'orthogonal' | 'default'

export interface AppSettings {
  // 是否显示未识别节点（next_list 中未命中的占位项）
  showNotRecognizedNodes: boolean
  // 默认折叠根部识别列表
  defaultCollapseRecognition: boolean
  // 默认折叠根部动作列表
  defaultCollapseRootActionList: boolean
  // 默认折叠识别中嵌套的识别节点
  defaultCollapseNestedRecognition: boolean
  // 默认折叠动作列表中嵌套的动作节点（详细/树形）
  defaultCollapseNestedActionNodes: boolean
  // 默认展开原始 JSON 数据
  defaultExpandRawJson: boolean
  // 节点显示模式
  displayMode: DisplayMode

  // 流程图连线样式
  flowchartEdgeStyle: FlowchartEdgeStyle
  // 流程图连线流动动画
  flowchartEdgeFlowEnabled: boolean
  // 流程图顺序回放速度（ms）
  flowchartPlaybackIntervalMs: number
  // 流程图聚焦缩放
  flowchartFocusZoom: number
  // 拖动节点后是否自动重算布局
  flowchartRelayoutAfterDrag: boolean
  // 是否忽略未经过节点（仅保留已执行节点参与流程图）
  flowchartIgnoreUnexecutedNodes: boolean
}

const SETTINGS_KEY = 'maa-log-analyzer-settings'

const defaultSettings: AppSettings = {
  showNotRecognizedNodes: true,
  defaultCollapseRecognition: false,
  defaultCollapseRootActionList: false,
  defaultCollapseNestedRecognition: true,
  defaultCollapseNestedActionNodes: true,
  defaultExpandRawJson: false,
  displayMode: 'tree',

  flowchartEdgeStyle: 'orthogonal',
  flowchartEdgeFlowEnabled: true,
  flowchartPlaybackIntervalMs: 900,
  flowchartFocusZoom: 1.0,
  flowchartRelayoutAfterDrag: true,
  flowchartIgnoreUnexecutedNodes: false,
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

const isFiniteNumberInRange = (
  value: unknown,
  minimum: number,
  maximum: number,
): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

const normalizeSettings = (value: unknown): AppSettings => {
  const normalized = { ...defaultSettings }
  if (!isRecord(value)) return normalized

  const booleanKeys = [
    'showNotRecognizedNodes',
    'defaultCollapseRecognition',
    'defaultCollapseRootActionList',
    'defaultCollapseNestedRecognition',
    'defaultCollapseNestedActionNodes',
    'defaultExpandRawJson',
    'flowchartEdgeFlowEnabled',
    'flowchartRelayoutAfterDrag',
    'flowchartIgnoreUnexecutedNodes',
  ] as const
  for (const key of booleanKeys) {
    if (isBoolean(value[key])) normalized[key] = value[key]
  }

  if (
    value.displayMode === 'detailed' ||
    value.displayMode === 'compact' ||
    value.displayMode === 'tree'
  ) {
    normalized.displayMode = value.displayMode
  }
  if (value.flowchartEdgeStyle === 'orthogonal' || value.flowchartEdgeStyle === 'default') {
    normalized.flowchartEdgeStyle = value.flowchartEdgeStyle
  }
  if (isFiniteNumberInRange(value.flowchartPlaybackIntervalMs, 50, 60_000)) {
    normalized.flowchartPlaybackIntervalMs = value.flowchartPlaybackIntervalMs
  }
  if (isFiniteNumberInRange(value.flowchartFocusZoom, 0.1, 5)) {
    normalized.flowchartFocusZoom = value.flowchartFocusZoom
  }

  return normalized
}

export function getDefaultSettings(): AppSettings {
  return { ...defaultSettings }
}

let settingsInstance: AppSettings | null = null

/**
 * 获取设置（reactive 单例）
 */
export function getSettings(): AppSettings {
  if (settingsInstance) return settingsInstance

  let stored: unknown = null
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) stored = JSON.parse(raw)
  } catch (error) {
    console.error('读取设置失败:', error)
  }

  settingsInstance = reactive<AppSettings>(normalizeSettings(stored))
  return settingsInstance
}

/**
 * 保存设置
 */
export function saveSettings(settings: AppSettings): void {
  const normalized = normalizeSettings(settings)
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized))
  } catch (error) {
    console.error('保存设置失败:', error)
  }
  Object.assign(settings, normalized)
  // 同步更新 reactive 单例
  if (settingsInstance && settingsInstance !== settings) {
    Object.assign(settingsInstance, normalized)
  }
}
