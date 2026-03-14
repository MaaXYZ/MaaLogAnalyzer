/**
 * 应用设置管理
 */

import { reactive } from 'vue'

export type DisplayMode = 'detailed' | 'compact' | 'tree'
export type FlowchartEdgeStyle = 'orthogonal' | 'default'

export interface AppSettings {
  // 默认折叠根部识别列表
  defaultCollapseRecognition: boolean
  // 默认折叠识别中嵌套的识别节点
  defaultCollapseNestedRecognition: boolean
  // 默认折叠动作部分
  defaultCollapseAction: boolean
  // 默认展开原始 JSON 数据
  defaultExpandRawJson: boolean
  // 节点显示模式
  displayMode: DisplayMode

  // 流程图连线样式
  flowchartEdgeStyle: FlowchartEdgeStyle
  // 流程图顺序回放速度（ms）
  flowchartPlaybackIntervalMs: number
  // 流程图聚焦缩放
  flowchartFocusZoom: number
}

const SETTINGS_KEY = 'maa-log-analyzer-settings'

const defaultSettings: AppSettings = {
  defaultCollapseRecognition: false,
  defaultCollapseNestedRecognition: false,
  defaultCollapseAction: false,
  defaultExpandRawJson: false,
  displayMode: 'tree',

  flowchartEdgeStyle: 'orthogonal',
  flowchartPlaybackIntervalMs: 900,
  flowchartFocusZoom: 1.0,
}

let settingsInstance: AppSettings | null = null

/**
 * 获取设置（reactive 单例）
 */
export function getSettings(): AppSettings {
  if (settingsInstance) return settingsInstance

  let stored: Partial<AppSettings> = {}
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) stored = JSON.parse(raw)
  } catch (error) {
    console.error('读取设置失败:', error)
  }

  settingsInstance = reactive<AppSettings>({ ...defaultSettings, ...stored })
  return settingsInstance
}

/**
 * 保存设置
 */
export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('保存设置失败:', error)
  }
  // 同步更新 reactive 单例
  if (settingsInstance && settingsInstance !== settings) {
    Object.assign(settingsInstance, settings)
  }
}
