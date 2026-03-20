import type { TourStep } from './types'

export const TOUR_VERSION = 3
export const TOUR_STORAGE_KEY = 'maa-log-analyzer-tutorial-version'

// Boarded by sections: overall intro first, then each feature area.
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'view-switch',
    sectionId: 'overview',
    sectionTitle: '整体介绍',
    title: '切换模式',
    content: '这里可以在日志分析、文本搜索、流程图和统计之间切换。',
    target: '[data-tour="header-view-switch"]',
    mobileTarget: '[data-tour="header-mobile-menu"]',
    view: 'analysis',
    placement: 'bottom',
    nextLabel: '下一步',
    sinceVersion: 1
  },
  {
    id: 'settings-entry',
    sectionId: 'overview',
    sectionTitle: '整体介绍',
    title: '设置',
    content: '点击这里打开设置面板，调整显示和交互行为。',
    target: '[data-tour="header-settings-button"]',
    mobileTarget: '[data-tour="header-mobile-menu"]',
    view: 'analysis',
    placement: 'bottom',
    nextLabel: '下一步',
    sinceVersion: 1
  },
  {
    id: 'theme-toggle',
    sectionId: 'overview',
    sectionTitle: '整体介绍',
    title: '深色 / 浅色模式',
    content: '点击这里可在深色与浅色主题之间切换。',
    target: '[data-tour="header-theme-button"]',
    mobileTarget: '[data-tour="header-mobile-menu"]',
    view: 'analysis',
    placement: 'bottom',
    nextLabel: '进入日志分析板块',
    sinceVersion: 1
  },
  {
    id: 'analysis-main',
    sectionId: 'analysis',
    sectionTitle: '日志分析',
    title: '日志分析主区域',
    content: '这是排查问题的主工作区，任务列表、节点链路和详情都在这里。',
    target: '[data-tour="analysis-process-root"]',
    view: 'analysis',
    placement: 'right',
    nextLabel: '进入流程图板块',
    sinceVersion: 1
  },
  {
    id: 'flowchart-main',
    sectionId: 'flowchart',
    sectionTitle: '流程图',
    title: '流程图视图',
    content: '流程图用于观察节点连接关系、执行路径和关键跳转。',
    target: '[data-tour="flowchart-main"]',
    view: 'flowchart',
    placement: 'left',
    nextLabel: '下一步',
    sinceVersion: 1
  },
  {
    id: 'flowchart-playback',
    sectionId: 'flowchart',
    sectionTitle: '流程图',
    title: '流程回放',
    content: '这里可以顺序回放执行流程，并调整回放速度和聚焦缩放。',
    target: '[data-tour="flowchart-toolbar"]',
    view: 'flowchart',
    placement: 'bottom',
    nextLabel: '进入文本搜索板块',
    sinceVersion: 1
  },
  {
    id: 'search-main',
    sectionId: 'search',
    sectionTitle: '文本搜索',
    title: '全文搜索',
    content: '在这里做关键字或正则检索，快速定位日志片段。',
    target: '[data-tour="search-main"]',
    view: 'search',
    placement: 'left',
    nextLabel: '进入节点统计板块',
    sinceVersion: 1
  },
  {
    id: 'statistics-main',
    sectionId: 'statistics',
    sectionTitle: '节点统计',
    title: '节点统计视图',
    content: '这里用于查看节点耗时、成功率和分布，适合做整体健康度分析。',
    target: '[data-tour="statistics-main"]',
    view: 'statistics',
    placement: 'left',
    nextLabel: '进入 AI 分析板块',
    sinceVersion: 1
  },
  {
    id: 'ai-main',
    sectionId: 'ai',
    sectionTitle: 'AI 分析',
    title: 'AI 分析视图',
    content: '这里可以让 AI 基于当前任务上下文做诊断，并支持多轮追问。',
    target: '[data-tour="ai-main"]',
    view: 'ai',
    placement: 'left',
    nextLabel: '下一步',
    sinceVersion: 3
  },
  {
    id: 'ai-input-panel',
    sectionId: 'ai',
    sectionTitle: 'AI 分析',
    title: '连接与提问区',
    content: '在这里填写 API Key、查看记忆摘要、使用快捷提问，并编辑问题输入。',
    target: '[data-tour="ai-input-panel"]',
    view: 'ai',
    placement: 'right',
    nextLabel: '下一步',
    sinceVersion: 3
  },
  {
    id: 'ai-analyze-action',
    sectionId: 'ai',
    sectionTitle: 'AI 分析',
    title: '发起分析',
    content: '点击“分析当前任务”发送请求。建议先用默认问题跑一轮，再进行追问。',
    target: '[data-tour="ai-analyze-action"]',
    view: 'ai',
    placement: 'right',
    nextLabel: '下一步',
    sinceVersion: 3
  },
  {
    id: 'ai-output-panel',
    sectionId: 'ai',
    sectionTitle: 'AI 分析',
    title: '查看输出结果',
    content: '右侧会显示诊断结论、多轮对话和证据链摘要，可用于快速定位问题。',
    target: '[data-tour="ai-output-panel"]',
    view: 'ai',
    placement: 'left',
    nextLabel: '看分屏模式',
    sinceVersion: 3
  },
  {
    id: 'split-main',
    sectionId: 'split',
    sectionTitle: '分屏模式',
    title: '分屏模式',
    content: '这里可以上下分屏，同时查看日志分析和文本搜索，提高对照效率。',
    target: '[data-tour="split-main"]',
    view: 'split',
    placement: 'left',
    nextLabel: '下一步',
    sinceVersion: 1
  },
  {
    id: 'tutorial-replay-entry',
    sectionId: 'ending',
    sectionTitle: '结束',
    title: '再次观看教程',
    content: '以后想重看教程，可以在“关于”里的“快速开始”区域点击“开始新手教程”。',
    target: '[data-tour="about-start-tutorial"]',
    view: 'split',
    placement: 'left',
    nextLabel: '完成教程',
    sinceVersion: 2
  }
]
