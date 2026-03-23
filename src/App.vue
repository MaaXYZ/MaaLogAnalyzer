<script setup lang="ts">
import { ref, computed, watch, h, defineAsyncComponent, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { NSplit, NCard, NFlex, NButton, NIcon, NDropdown, NModal, NText, NTag, NProgress, NSelect, NDrawer, NDrawerContent, NScrollbar, NList, NListItem, useMessage } from 'naive-ui'
import ProcessView from './views/ProcessView.vue'
import DetailView from './views/DetailView.vue'
import { LogParser } from './utils/logParser'
import { getErrorMessage } from './utils/errorHandler'
import type { LoadedTextFile } from './utils/fileDialog'
import type { TaskInfo, NodeInfo, UnifiedFlowItem } from './types'
import { BulbOutlined, BulbFilled, FileSearchOutlined, BarChartOutlined, ColumnHeightOutlined, InfoCircleOutlined, GithubOutlined, DashboardOutlined, SettingOutlined, MenuOutlined, ApartmentOutlined, RobotOutlined } from '@vicons/antd'
import { version } from '../package.json'
import { useIsMobile } from './composables/useIsMobile'
import { formatDuration } from './utils/formatDuration'
import { buildNodeFlowItems, buildNodeRecognitionFlowItems } from './utils/nodeFlow'
import TourOverlay from './components/TourOverlay.vue'
import { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION } from './tutorial/steps'
import tutorialSampleLog from './assets/tutorial-sample.log?raw'
import { useBridge, type BridgeController, type JsonRpcId } from './composables/useBridge'
import { resolveEmbedProfile } from './embed/profiles'
import { EMBED_MODE_VSCODE_LAUNCH, parseEmbedMode } from './utils/embedMode'

// Props
interface Props {
  isDark: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isDark: true
})

// Emits
const emit = defineEmits<{
  'toggle-theme': []
}>()

// 移动端检测
const { isMobile } = useIsMobile()

const TextSearchView = defineAsyncComponent(() => import('./views/TextSearchView.vue'))
const NodeStatisticsView = defineAsyncComponent(() => import('./views/NodeStatisticsView.vue'))
const FlowchartView = defineAsyncComponent(() => import('./views/FlowchartView.vue'))
const SettingsView = defineAsyncComponent(() => import('./views/SettingsView.vue'))
const AiAnalysisView = defineAsyncComponent(() => import('./views/AiAnalysisView.vue'))
// 移动端抽屉状态
const showTaskDrawer = ref(false)
const showDetailDrawer = ref(false)

const embedMode = typeof window !== 'undefined' ? parseEmbedMode(window.location.search) : null
const embedProfile = resolveEmbedProfile(embedMode)
const isEmbeddedContext = typeof window !== 'undefined' && window.parent !== window
const hasEmbedQueryFlag = typeof window !== 'undefined' && /(?:[?#&])embed=/.test(window.location.href)
const isVscodeLaunchEmbed = embedProfile.mode === EMBED_MODE_VSCODE_LAUNCH
const bridgeEnabled = embedProfile.bridgeEnabled
const tutorialAutoStartEnabled = embedProfile.ui.autoStartTutorial && !isEmbeddedContext && !hasEmbedQueryFlag
const showProcessThreadFilters = embedProfile.ui.showProcessThreadFilters
const showRealtimeStatus = embedProfile.ui.showRealtimeStatus
const showReloadControls = embedProfile.ui.showReloadControls
const showTextSearchView = embedProfile.ui.showTextSearchView
const showSplitView = embedProfile.ui.showSplitView
const appEmbedMode = embedProfile.mode

// 视图模式
type ViewMode = 'analysis' | 'search' | 'statistics' | 'flowchart' | 'ai' | 'split'
const viewMode = ref<ViewMode>('analysis')

// 所有视图模式选项
const allViewModeOptions = [
  {
    label: '日志分析',
    key: 'analysis' as ViewMode,
    icon: () => h(BarChartOutlined)
  },
  {
    label: '文本搜索',
    key: 'search' as ViewMode,
    icon: () => h(FileSearchOutlined)
  },
  {
    label: '节点统计',
    key: 'statistics' as ViewMode,
    icon: () => h(DashboardOutlined)
  },
  {
    label: '流程图',
    key: 'flowchart' as ViewMode,
    icon: () => h(ApartmentOutlined)
  },
  {
    label: 'AI 分析',
    key: 'ai' as ViewMode,
    icon: () => h(RobotOutlined)
  },
  {
    label: '分屏模式',
    key: 'split' as ViewMode,
    icon: () => h(ColumnHeightOutlined)
  }
]

// 视图模式选项
const isViewModeEnabled = (mode: ViewMode): boolean => {
  if (mode === 'search') return showTextSearchView
  if (mode === 'split') return showSplitView
  return true
}

const viewModeOptions = computed(() => allViewModeOptions.filter(option => isViewModeEnabled(option.key)))

// 当前视图模式的显示文本
const currentViewLabel = computed(() => {
  const option = allViewModeOptions.find(opt => opt.key === viewMode.value)
  return option?.label || '视图'
})

// 处理视图模式切换
const handleViewModeSelect = (key: string) => {
  viewMode.value = key as ViewMode
}

const APP_LAYOUT_STORAGE_KEY = 'maa-log-analyzer-app-layout'

interface AppLayoutState {
  analysisSplitSize?: number
  splitVerticalSize?: number
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

const readAppLayoutState = (): AppLayoutState => {
  try {
    const raw = localStorage.getItem(APP_LAYOUT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as AppLayoutState
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveAppLayoutState = (state: AppLayoutState) => {
  try {
    localStorage.setItem(APP_LAYOUT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore write errors
  }
}

const appLayoutState = readAppLayoutState()
const splitSize = ref(clamp(appLayoutState.analysisSplitSize, 0.4, 1, 0.65))
const splitVerticalSize = ref(clamp(appLayoutState.splitVerticalSize, 0.2, 0.8, 0.5))
const parser = new LogParser()

let activeErrorImages: Map<string, string> = new Map()
let activeVisionImages: Map<string, string> = new Map()
let activeWaitFreezesImages: Map<string, string> = new Map()

const revokeBlobUrls = (images?: Map<string, string> | null) => {
  if (!images) return
  for (const value of images.values()) {
    if (typeof value === 'string' && value.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(value)
      } catch {
        // ignore revoke failures
      }
    }
  }
}

const resetParserDebugAssets = (
  errorImages?: Map<string, string>,
  visionImages?: Map<string, string>,
  waitFreezesImages?: Map<string, string>,
) => {
  // Release previous blob URLs before replacing references.
  if (activeErrorImages !== errorImages) {
    revokeBlobUrls(activeErrorImages)
  }
  if (activeVisionImages !== visionImages) {
    revokeBlobUrls(activeVisionImages)
  }
  if (activeWaitFreezesImages !== waitFreezesImages) {
    revokeBlobUrls(activeWaitFreezesImages)
  }

  activeErrorImages = errorImages ?? new Map()
  activeVisionImages = visionImages ?? new Map()
  activeWaitFreezesImages = waitFreezesImages ?? new Map()

  // Always reset parser maps, avoid carrying stale image mappings across reloads.
  parser.setErrorImages(activeErrorImages)
  parser.setVisionImages(activeVisionImages)
  parser.setWaitFreezesImages(activeWaitFreezesImages)
}

interface TextSearchLoadedTarget {
  id: string
  label: string
  fileName: string
  content: string
}

const textSearchLoadedTargets = ref<TextSearchLoadedTarget[]>([])
const textSearchLoadedDefaultTargetId = ref<string>('')

const setTextSearchLoadedTargets = (targets: TextSearchLoadedTarget[], defaultId?: string) => {
  textSearchLoadedTargets.value = targets
  textSearchLoadedDefaultTargetId.value = defaultId ?? (targets[0]?.id ?? '')
}

interface RealtimeEventItem {
  seq: number
  at: number
  msg: string
  details: Record<string, unknown>
}

interface RealtimeSessionState {
  sessionId: string
  startedAt: number
  lastSeq: number
  lines: string[]
}

const realtimeSession = ref<RealtimeSessionState | null>(null)
let realtimeParseTimer: number | null = null
const realtimeParsing = ref(false)
const realtimeReparseRequested = ref(false)
const realtimeStreaming = ref(false)
const isRealtimeContext = computed(() => {
  return realtimeSession.value !== null || textSearchLoadedDefaultTargetId.value.startsWith('realtime:')
})

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const toFiniteNumber = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return value
}

const normalizeRealtimeMessage = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const msg = value.trim()
  if (!msg) return null
  if (msg.startsWith('Tasker.Task.') || msg.startsWith('Node.')) return msg
  if (msg.startsWith('Task.')) return `Tasker.${msg}`
  if (msg.startsWith('PipelineNode.')) return `Node.${msg}`
  if (msg.startsWith('RecognitionNode.')) return `Node.${msg}`
  if (msg.startsWith('ActionNode.')) return `Node.${msg}`
  if (msg.startsWith('NextList.')) return `Node.${msg}`
  if (msg.startsWith('Recognition.')) return `Node.${msg}`
  if (msg.startsWith('Action.')) return `Node.${msg}`
  return null
}

const toRealtimeProcessId = (details: Record<string, unknown>): string => {
  const candidates = [details.process_id, details.processId, details.pid]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.startsWith('Px') ? candidate : `Px${candidate}`
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return `Px${candidate}`
    }
  }
  return 'Px0'
}

const toRealtimeThreadId = (details: Record<string, unknown>): string => {
  const candidates = [details.thread_id, details.threadId, details.tid]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.startsWith('Tx') ? candidate : `Tx${candidate}`
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return `Tx${candidate}`
    }
  }
  return 'Tx0'
}

const toRealtimeTimestamp = (at: number): string => {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  return date.toISOString()
}

const toSyntheticEventLine = (event: RealtimeEventItem): string | null => {
  const normalizedMsg = normalizeRealtimeMessage(event.msg)
  if (!normalizedMsg) return null

  let detailsText = '{}'
  try {
    detailsText = JSON.stringify(event.details)
  } catch {
    return null
  }

  return `[${toRealtimeTimestamp(event.at)}][INF][${toRealtimeProcessId(event.details)}][${toRealtimeThreadId(event.details)}][realtime][0][on_event_notify] !!!OnEventNotify!!! [handle=realtime] [msg=${normalizedMsg}] [details=${detailsText}]`
}

const syncRealtimeLoadedTarget = (session: RealtimeSessionState) => {
  const targetId = `realtime:${session.sessionId}`
  setTextSearchLoadedTargets(
    [{
      id: targetId,
      label: `realtime/${session.sessionId}.log`,
      fileName: `realtime-${session.sessionId}.log`,
      content: session.lines.join('\n'),
    }],
    targetId,
  )
}
const pickPreferredLogTargetId = (targets: TextSearchLoadedTarget[]): string => {
  if (targets.length === 0) return ''
  const normalize = (name: string) => name.toLowerCase()
  const priority = ['maafw.log', 'maa.log', 'maafw.bak.log', 'maa.bak.log']
  for (const key of priority) {
    const hit = targets.find(
      (t) => normalize(t.fileName || '').endsWith(key) || normalize(t.label || '').endsWith(key),
    )
    if (hit) return hit.id
  }
  return targets[0].id
}

const tasks = ref<TaskInfo[]>([])
const selectedTask = ref<TaskInfo | null>(null)
const selectedNode = ref<NodeInfo | null>(null)
const selectedFlowItemId = ref<string | null>(null)
const loading = ref(false)
const pendingScrollNodeId = ref<number | null>(null)
const parseProgress = ref(0)
const showParsingModal = ref(false)
const showFileLoadingModal = ref(false)

const flattenFlowItems = (items: UnifiedFlowItem[] | undefined, output: UnifiedFlowItem[] = []): UnifiedFlowItem[] => {
  if (!items || items.length === 0) return output
  for (const item of items) {
    output.push(item)
    if (item.children && item.children.length > 0) {
      flattenFlowItems(item.children, output)
    }
  }
  return output
}

const hasMainActionFlowId = (node: NodeInfo, flowItemId: string): boolean => {
  if (/^node\.action\.\d+$/.test(flowItemId)) {
    return !!node.action_details
  }
  return false
}

const hasFlowItemId = (node: NodeInfo | null, flowItemId: string | null | undefined): boolean => {
  if (!node || !flowItemId) return false
  if (flattenFlowItems(buildNodeRecognitionFlowItems(node)).some(item => item.id === flowItemId)) return true
  if (flattenFlowItems(buildNodeFlowItems(node)).some(item => item.id === flowItemId)) return true
  if (hasMainActionFlowId(node, flowItemId)) return true
  return false
}

const pickMainActionFlowItemId = (node: NodeInfo): string | null => {
  if (!node.action_details) return null
  return `node.action.${node.action_details.action_id}`
}

const pickFlowId = (node: NodeInfo, preferredId: string): string | null => {
  if (hasFlowItemId(node, preferredId)) return preferredId
  return null
}

const resetSelectionState = () => {
  selectedTask.value = null
  selectedNode.value = null
  selectedFlowItemId.value = null
  pendingScrollNodeId.value = null
}

const resetAnalysisState = () => {
  tasks.value = []
  resetSelectionState()
  availableProcessIds.value = []
  availableThreadIds.value = []
}

const applyParsedTasks = (nextTasks: TaskInfo[], preserveSelection: boolean) => {
  const prevSelectedTaskId = preserveSelection ? selectedTask.value?.task_id : null
  const prevSelectedNodeId = preserveSelection ? selectedNode.value?.node_id : null
  const prevSelectedFlowItemId = preserveSelection ? selectedFlowItemId.value : null

  tasks.value = nextTasks
  availableProcessIds.value = parser.getProcessIds()
  availableThreadIds.value = parser.getThreadIds()

  if (nextTasks.length === 0) {
    resetSelectionState()
    return
  }

  if (prevSelectedTaskId != null) {
    const matchedTask = nextTasks.find(task => task.task_id === prevSelectedTaskId)
    if (matchedTask) {
      selectedTask.value = matchedTask
      if (prevSelectedNodeId != null) {
        selectedNode.value = matchedTask.nodes.find(node => node.node_id === prevSelectedNodeId) || null
        if (selectedNode.value && hasFlowItemId(selectedNode.value, prevSelectedFlowItemId)) {
          selectedFlowItemId.value = prevSelectedFlowItemId
        } else {
          selectedFlowItemId.value = null
        }
      } else {
        selectedNode.value = null
        selectedFlowItemId.value = null
      }
      return
    }
  }

  selectedTask.value = nextTasks[0]
  selectedNode.value = null
  selectedFlowItemId.value = null
}

const stopRealtimeSession = () => {
  realtimeSession.value = null
  realtimeReparseRequested.value = false
  realtimeParsing.value = false
  realtimeStreaming.value = false
  if (realtimeParseTimer != null) {
    window.clearTimeout(realtimeParseTimer)
    realtimeParseTimer = null
  }
}

const runRealtimeParse = async () => {
  if (realtimeParsing.value) {
    realtimeReparseRequested.value = true
    return
  }

  const session = realtimeSession.value
  if (!session) return

  realtimeParsing.value = true
  try {
    const content = session.lines.join('\n')
    await parser.parseFile(content)
    const parsedTasks = parser.getTasks()
    applyParsedTasks(parsedTasks, true)
    syncRealtimeLoadedTarget(session)
  } catch (error) {
    console.warn('[realtime] parse failed:', error)
  } finally {
    realtimeParsing.value = false
    if (realtimeReparseRequested.value) {
      realtimeReparseRequested.value = false
      if (realtimeSession.value) {
        realtimeParseTimer = window.setTimeout(() => {
          realtimeParseTimer = null
          void runRealtimeParse()
        }, 80)
      }
    }
  }
}

const scheduleRealtimeParse = () => {
  if (realtimeParseTimer != null) return
  realtimeParseTimer = window.setTimeout(() => {
    realtimeParseTimer = null
    void runRealtimeParse()
  }, 80)
}

const handleRealtimeStart = (params: unknown) => {
  const payload = asRecord(params)
  if (!payload) return

  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
  if (!sessionId) return

  if (realtimeParseTimer != null) {
    window.clearTimeout(realtimeParseTimer)
    realtimeParseTimer = null
  }
  realtimeReparseRequested.value = false

  realtimeSession.value = {
    sessionId,
    startedAt: toFiniteNumber(payload.startedAt, Date.now()),
    lastSeq: 0,
    lines: [],
  }
  realtimeStreaming.value = true

  resetParserDebugAssets()
  resetAnalysisState()
  selectedProcessId.value = ''
  selectedThreadId.value = ''
  syncRealtimeLoadedTarget(realtimeSession.value)
}

const handleRealtimePush = (params: unknown) => {
  const payload = asRecord(params)
  if (!payload) return

  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
  if (!sessionId) return

  if (!realtimeSession.value || realtimeSession.value.sessionId !== sessionId) {
    handleRealtimeStart({
      sessionId,
      startedAt: Date.now(),
    })
  }

  const session = realtimeSession.value
  if (!session) return

  const rawEvents = Array.isArray(payload.events) ? payload.events : []
  if (rawEvents.length === 0) return

  const events: RealtimeEventItem[] = []
  for (const rawEvent of rawEvents) {
    const eventRecord = asRecord(rawEvent)
    if (!eventRecord) continue
    if (typeof eventRecord.seq !== 'number' || !Number.isFinite(eventRecord.seq)) continue
    if (typeof eventRecord.msg !== 'string' || !eventRecord.msg.trim()) continue
    const details = asRecord(eventRecord.details) ?? {}
    events.push({
      seq: eventRecord.seq,
      at: toFiniteNumber(eventRecord.at, Date.now()),
      msg: eventRecord.msg,
      details,
    })
  }

  if (events.length === 0) return
  events.sort((a, b) => a.seq - b.seq)

  let appended = 0
  for (const event of events) {
    if (event.seq <= session.lastSeq) continue
    const line = toSyntheticEventLine(event)
    if (!line) continue
    session.lines.push(line)
    session.lastSeq = event.seq
    appended++
  }

  if (appended === 0) return
  syncRealtimeLoadedTarget(session)
  scheduleRealtimeParse()
}

const handleRealtimeEnd = (params: unknown) => {
  const payload = asRecord(params)
  if (!payload) return

  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
  if (!sessionId || !realtimeSession.value || realtimeSession.value.sessionId !== sessionId) return

  realtimeStreaming.value = false
  scheduleRealtimeParse()
}

const handleBridgeUpdateTheme = (params: unknown) => {
  const payload = asRecord(params)
  if (!payload) return

  if (typeof payload.htmlStyle === 'string') {
    if (payload.htmlStyle.trim()) {
      document.documentElement.setAttribute('style', payload.htmlStyle)
    } else {
      document.documentElement.removeAttribute('style')
    }
  }

  if (typeof payload.bodyClass === 'string') {
    document.body.setAttribute('class', payload.bodyClass)
  }
}

const handleBridgeKeydown = (params: unknown) => {
  const payload = asRecord(params)
  if (!payload) return

  const eventInit: KeyboardEventInit = {
    key: typeof payload.key === 'string' ? payload.key : '',
    code: typeof payload.code === 'string' ? payload.code : '',
    altKey: payload.altKey === true,
    ctrlKey: payload.ctrlKey === true,
    shiftKey: payload.shiftKey === true,
    metaKey: payload.metaKey === true,
    repeat: payload.repeat === true,
    bubbles: true,
    cancelable: true,
    composed: true,
  }
  const keydownEvent = new KeyboardEvent('keydown', eventInit)
  document.dispatchEvent(keydownEvent)
}

const handleJsonRpcMethod = async (method: string, params: unknown, id?: JsonRpcId) => {
  switch (method) {
    case 'bridge.hello':
      bridge?.sendReady()
      if (id !== undefined) bridge?.sendResult(id, { ok: true })
      return
    case 'bridge.updateTheme':
      handleBridgeUpdateTheme(params)
      if (id !== undefined) bridge?.sendResult(id, { ok: true })
      return
    case 'bridge.keydown':
      handleBridgeKeydown(params)
      if (id !== undefined) bridge?.sendResult(id, { ok: true })
      return
    case 'realtime.start':
      handleRealtimeStart(params)
      if (id !== undefined) bridge?.sendResult(id, { ok: true })
      return
    case 'realtime.push':
      handleRealtimePush(params)
      if (id !== undefined) bridge?.sendResult(id, { ok: true })
      return
    case 'realtime.end':
      handleRealtimeEnd(params)
      if (id !== undefined) bridge?.sendResult(id, { ok: true })
      return
    case 'realtime.snapshot.end':
      if (id !== undefined) bridge?.sendResult(id, { ok: true })
      return
    default:
      if (id !== undefined) {
        bridge?.sendError(id, -32601, `Method not found: ${method}`)
      }
  }
}

const bridgeCapabilities = [
  'bridge.updateTheme',
  'bridge.keydown',
  'realtime.start',
  'realtime.push',
  'realtime.end',
  'realtime.snapshot.end',
]

let bridge: BridgeController | null = null
bridge = useBridge({
  enabled: bridgeEnabled,
  from: 'maa-log-analyzer',
  capabilities: bridgeCapabilities,
  readyPayload: {
    embed: {
      mode: embedMode,
      bridgeEnabled,
    },
  },
  onMethod: async (method, params, id) => {
    await handleJsonRpcMethod(method, params, id)
  },
})
// 过滤器状态
const selectedProcessId = ref<string>('')
const selectedThreadId = ref<string>('')
const availableProcessIds = ref<string[]>([])
const availableThreadIds = ref<string[]>([])

// DetailView 折叠控制
const detailViewCollapsed = ref(false)
const detailViewSavedSize = ref(0.6)

// 切换 DetailView 折叠状态
const toggleDetailView = () => {
  if (detailViewCollapsed.value) {
    // 展开：恢复保存的大小
    splitSize.value = detailViewSavedSize.value
    detailViewCollapsed.value = false
  } else {
    // 折叠：保存当前大小，然后完全隐藏
    detailViewSavedSize.value = splitSize.value
    splitSize.value = 1  // 左侧占100%，右侧完全隐藏
    detailViewCollapsed.value = true
  }
}

// 消息提示
const message = useMessage()

// 关于对话框
const showAboutModal = ref(false)

// 设置对话框
const showSettingsModal = ref(false)

// Spotlight tutorial
const tutorialLoadingSample = ref(false)
const tutorialAutoStarted = ref(false)
const tourActive = ref(false)
const activeTourStepIndexes = ref<number[]>([])
const tourStepIndex = ref(0)
const tourTargetFound = ref(false)
const tourTargetElement = ref<HTMLElement | null>(null)
const tourTargetRect = ref<{ top: number; left: number; width: number; height: number } | null>(null)
const tourResolveRunId = ref(0)

const currentTourSteps = computed(() => activeTourStepIndexes.value.map(i => TOUR_STEPS[i]).filter(Boolean) as typeof TOUR_STEPS)
const currentTourStep = computed(() => currentTourSteps.value[tourStepIndex.value] ?? null)

const tourSections = computed(() => {
  const sections: { id: string; title: string }[] = []
  for (const step of currentTourSteps.value) {
    if (!sections.some(section => section.id === step.sectionId)) {
      sections.push({ id: step.sectionId, title: step.sectionTitle })
    }
  }
  return sections
})

const currentTourSectionIndex = computed(() => {
  const current = currentTourStep.value
  if (!current) return 0
  const index = tourSections.value.findIndex(section => section.id === current.sectionId)
  return index >= 0 ? index + 1 : 0
})

const currentTourSectionTotal = computed(() => tourSections.value.length)
const currentTourSectionTitle = computed(() => currentTourStep.value?.sectionTitle ?? '')

const currentTourSectionStepTotal = computed(() => {
  const current = currentTourStep.value
  if (!current) return 0
  return currentTourSteps.value.filter(step => step.sectionId === current.sectionId).length
})

const currentTourSectionStepIndex = computed(() => {
  const current = currentTourStep.value
  if (!current) return 0
  return currentTourSteps.value.slice(0, tourStepIndex.value + 1)
    .filter(step => step.sectionId === current.sectionId)
    .length
})

interface TutorialProgressState {
  completedVersion: number
  completedStepIds: Set<string>
  rawObject: Record<string, any> | null
}

function readTutorialProgressState(): TutorialProgressState {
  try {
    const raw = localStorage.getItem(TOUR_STORAGE_KEY)
    if (!raw) return { completedVersion: 0, completedStepIds: new Set(), rawObject: null }

    const legacy = Number(raw)
    if (Number.isFinite(legacy)) {
      return { completedVersion: legacy, completedStepIds: new Set(), rawObject: null }
    }

    const parsed = JSON.parse(raw) as any
    if (!parsed || typeof parsed !== "object") {
      return { completedVersion: 0, completedStepIds: new Set(), rawObject: null }
    }

    let completedVersion = 0
    if (typeof parsed.completedVersion === "number") {
      completedVersion = parsed.completedVersion
    }

    const completedStepIds = new Set<string>()
    if (Array.isArray(parsed.completedStepIds)) {
      parsed.completedStepIds.forEach((id: unknown) => {
        if (typeof id === "string") completedStepIds.add(id)
      })
    }

    if (parsed.versions && typeof parsed.versions === "object") {
      for (const [ver, info] of Object.entries(parsed.versions as Record<string, any>)) {
        const v = Number(ver)
        if (Number.isFinite(v) && info && typeof info === "object" && info.completed === true) {
          completedVersion = Math.max(completedVersion, v)
        }
        if (info && typeof info === "object" && Array.isArray(info.completedStepIds)) {
          info.completedStepIds.forEach((id: unknown) => {
            if (typeof id === "string") completedStepIds.add(id)
          })
        }
      }
    }

    return { completedVersion, completedStepIds, rawObject: parsed }
  } catch {
    return { completedVersion: 0, completedStepIds: new Set(), rawObject: null }
  }
}

function hasCompletedCurrentTutorialVersion(): boolean {
  const state = readTutorialProgressState()
  return state.completedVersion >= TOUR_VERSION
}

function markCurrentTutorialVersionCompleted(stepIds: string[]) {
  try {
    const state = readTutorialProgressState()
    const merged = new Set(state.completedStepIds)
    stepIds.forEach(id => merged.add(id))

    const obj = state.rawObject && typeof state.rawObject === "object" ? state.rawObject : {}
    obj.completedVersion = Math.max(state.completedVersion, TOUR_VERSION)
    obj.completedStepIds = Array.from(merged)
    obj.activeVersion = TOUR_VERSION
    if (!obj.versions || typeof obj.versions !== "object") obj.versions = {}
    const verKey = String(TOUR_VERSION)
    const prev = obj.versions[verKey] && typeof obj.versions[verKey] === "object" ? obj.versions[verKey] : {}
    obj.versions[verKey] = {
      ...prev,
      completed: true,
      completedStepIds: Array.from(merged),
      updatedAt: new Date().toISOString(),
    }

    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(obj))
  } catch {
    localStorage.setItem(TOUR_STORAGE_KEY, String(TOUR_VERSION))
  }
}

function getPendingTourStepIndexes(): number[] {
  const state = readTutorialProgressState()
  return TOUR_STEPS
    .map((step, idx) => ({ step, idx }))
    .filter(({ step }) => {
      const doneById = state.completedStepIds.has(step.id)
      const doneByVersion = (step.sinceVersion ?? 1) <= state.completedVersion
      return !(doneById || doneByVersion)
    })
    .map(item => item.idx)
}

const stopTour = () => {
  tourActive.value = false
  tourTargetFound.value = false
  tourTargetElement.value = null
  tourTargetRect.value = null
  activeTourStepIndexes.value = []
  tourStepIndex.value = 0
}
const waitForElement = async (selector: string, timeoutMs: number): Promise<HTMLElement | null> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const found = document.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    await new Promise(resolve => setTimeout(resolve, 120))
  }
  return null
}

const updateTourRectFromElement = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect()
  const padding = currentTourStep.value?.padding ?? 8
  const top = Math.max(4, rect.top - padding)
  const left = Math.max(4, rect.left - padding)
  const width = Math.max(24, rect.width + padding * 2)
  const height = Math.max(24, rect.height + padding * 2)
  tourTargetRect.value = { top, left, width, height }
}

const getTourTargetSelector = (step: { target: string; mobileTarget?: string }) => {
  return isMobile.value && step.mobileTarget ? step.mobileTarget : step.target
}

const resolveCurrentTourTarget = async () => {
  const step = currentTourStep.value
  if (!tourActive.value || !step) return

  const runId = ++tourResolveRunId.value
  const targetSelector = getTourTargetSelector(step)
  const needsAboutModal = step.id === 'tutorial-replay-entry' || targetSelector.includes('about-start-tutorial')

  if (step.view && viewMode.value !== step.view) {
    viewMode.value = step.view
  }

  if (needsAboutModal && !showAboutModal.value) {
    showAboutModal.value = true
  } else if (!needsAboutModal && showAboutModal.value) {
    showAboutModal.value = false
  }

  await nextTick()
  await new Promise(resolve => setTimeout(resolve, needsAboutModal ? 180 : 80))

  const timeout = step.optional ? 1500 : 5000
  const el = await waitForElement(targetSelector, timeout)

  if (runId !== tourResolveRunId.value || !tourActive.value) {
    return
  }

  if (!el) {
    tourTargetFound.value = false
    tourTargetElement.value = null
    tourTargetRect.value = null
    return
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  await new Promise(resolve => setTimeout(resolve, 140))

  if (runId !== tourResolveRunId.value || !tourActive.value) {
    return
  }

  tourTargetElement.value = el
  tourTargetFound.value = true
  updateTourRectFromElement(el)
}

const handleTourViewportChange = () => {
  if (!tourActive.value) return
  if (!tourTargetElement.value) return
  updateTourRectFromElement(tourTargetElement.value)
}

const startTour = async (auto = false) => {
  if (tutorialLoadingSample.value || loading.value) return
  tutorialLoadingSample.value = true
  loading.value = true

  try {
    await processLogContent(tutorialSampleLog)
    if (tasks.value.length === 0) {
      message.error('Built-in sample failed to load: no tasks parsed.')
      return
    }

    const indexes = auto
      ? getPendingTourStepIndexes()
      : TOUR_STEPS.map((_, idx) => idx)

    if (indexes.length === 0) {
      return
    }

    activeTourStepIndexes.value = indexes
    tourStepIndex.value = 0
    tourActive.value = true
    await resolveCurrentTourTarget()
  } catch (error) {
    message.error(getErrorMessage(error), { duration: 5000 })
  } finally {
    loading.value = false
    tutorialLoadingSample.value = false
  }
}

const openTutorialFromAbout = () => {
  showAboutModal.value = false
  void nextTick().then(() => startTour(false))
}

const handleTourPrev = async () => {
  if (tourStepIndex.value <= 0) return
  tourStepIndex.value -= 1
  await resolveCurrentTourTarget()
}

const handleTourNext = async () => {
  if (tourStepIndex.value >= currentTourSteps.value.length - 1) return
  tourStepIndex.value += 1
  await resolveCurrentTourTarget()
}

const handleTourRetry = async () => {
  await resolveCurrentTourTarget()
}

const handleTourFinish = () => {
  markCurrentTutorialVersionCompleted(currentTourSteps.value.map(step => step.id))
  stopTour()
}

const handleTourSkip = () => {
  markCurrentTutorialVersionCompleted(currentTourSteps.value.map(step => step.id))
  stopTour()
}

// 处理文件上传
const handleFileUpload = async (file: File) => {
  loading.value = true
  try {
    if (file.name.toLowerCase().endsWith('.zip')) {
      const { extractZipContent } = await import('./utils/zipExtractor')
      const result = await extractZipContent(file)
      if (result) {
        const loadedTargets: TextSearchLoadedTarget[] = result.textFiles.map((textFile, index) => ({
          id: 'zip:' + index + ':' + textFile.path,
          label: textFile.path,
          fileName: textFile.name,
          content: textFile.content,
        }))
        const defaultTargetId = pickPreferredLogTargetId(loadedTargets)
        await processLogContent(
          result.content,
          result.errorImages,
          result.visionImages,
          result.waitFreezesImages,
          loadedTargets,
          defaultTargetId,
        )
      } else {
        message.warning('ZIP 文件中未找到有效的日志文件')
      }
    } else {
      const content = await file.text()
      await processLogContent(content, undefined, undefined, undefined, [{ id: 'loaded:single', label: file.name, fileName: file.name, content }], 'loaded:single')
    }
  } catch (error) {
    message.error(getErrorMessage(error), { duration: 5000 })
  } finally {
    loading.value = false
  }
}

// 处理文件内容
const handleContentUpload = async (
  content: string,
  errorImages?: Map<string, string>,
  visionImages?: Map<string, string>,
  waitFreezesImages?: Map<string, string>,
  textFiles?: LoadedTextFile[],
) => {
  loading.value = true
  try {
    const explicitTargets: TextSearchLoadedTarget[] = (textFiles ?? []).map((file, index) => ({
      id: `loaded:text:${index}:${file.path}`,
      label: file.path || file.name,
      fileName: file.name,
      content: file.content,
    }))
    const loadedTargets: TextSearchLoadedTarget[] = explicitTargets.length > 0
      ? explicitTargets
      : [{ id: 'loaded:content', label: 'loaded.log', fileName: 'loaded.log', content }]
    const defaultTargetId = pickPreferredLogTargetId(loadedTargets)
    await processLogContent(content, errorImages, visionImages, waitFreezesImages, loadedTargets, defaultTargetId)
  } catch (error) {
    message.error(getErrorMessage(error), { duration: 5000 })
  } finally {
    loading.value = false
  }
}

// 处理文件内容
const processLogContent = async (
  content: string,
  errorImages?: Map<string, string>,
  visionImages?: Map<string, string>,
  waitFreezesImages?: Map<string, string>,
  loadedTargets?: TextSearchLoadedTarget[],
  loadedDefaultTargetId?: string,
) => {
  // 文件模式会接管数据源，先停止实时会话
  stopRealtimeSession()

  // 清空所有状态，确保重新上传文件时不会显示旧数据
  resetAnalysisState()

  // 先断开旧文本目标引用，避免新旧大字符串在响应式树上同时停留。
  setTextSearchLoadedTargets([])

  // 更新文本搜索默认数据源（优先使用调用方提供的目标列表）
  const fallbackTargets: TextSearchLoadedTarget[] = [{
    id: 'loaded:fallback',
    label: '已加载日志',
    fileName: 'loaded.log',
    content,
  }]
  setTextSearchLoadedTargets(
    loadedTargets && loadedTargets.length > 0 ? loadedTargets : fallbackTargets,
    loadedDefaultTargetId,
  )

  // 显示解析进度模态框
  showParsingModal.value = true
  parseProgress.value = 0

  try {
    // 统一切换并回收旧调试资源（包括 blob URL）。
    resetParserDebugAssets(errorImages, visionImages, waitFreezesImages)

    // 异步解析，带进度回调
    await parser.parseFile(content, (progress) => {
      parseProgress.value = progress.percentage
    })
    const parsedTasks = parser.getTasks()
    applyParsedTasks(parsedTasks, false)

    // 清除过滤器
    selectedProcessId.value = ''
    selectedThreadId.value = ''

    if (parsedTasks.length === 0) {
      message.warning('未能解析出有效的任务数据，请检查日志文件格式是否正确', { duration: 5000 })
    }
  } finally {
    // 关闭进度模态框
    showParsingModal.value = false
    parseProgress.value = 0
  }
}

// 选择任务
const handleSelectTask = (task: TaskInfo) => {
  selectedTask.value = task
  selectedNode.value = null
  selectedFlowItemId.value = null
}

// 从流程图定位到日志分析
const handleNavigateToNode = (task: TaskInfo, node: NodeInfo) => {
  selectedTask.value = task
  selectedNode.value = node
  selectedFlowItemId.value = null
  pendingScrollNodeId.value = node.node_id
  viewMode.value = 'analysis'
}

// 选择节点
const handleSelectNode = (node: NodeInfo) => {
  selectedNode.value = node
  selectedFlowItemId.value = null
}

// 选择动作
const handleSelectAction = (node: NodeInfo) => {
  selectedNode.value = node
  selectedFlowItemId.value = pickMainActionFlowItemId(node)
}

// 选择识别尝试
const handleSelectRecognition = (node: NodeInfo, attemptIndex: number) => {
  selectedNode.value = node
  selectedFlowItemId.value = pickFlowId(node, `node.recognition.${attemptIndex}`)
}

// 选择任意 flow item（用于深层嵌套识别）
const handleSelectFlowItem = (node: NodeInfo, flowItemId: string) => {
  selectedNode.value = node
  selectedFlowItemId.value = pickFlowId(node, flowItemId)
}

// 过滤任务列表
const filteredTasks = computed(() => {
  return tasks.value.filter(task => {
    if (selectedProcessId.value !== '') {
      const processId = parser.getTaskProcessId(task.task_id)
      if (processId !== selectedProcessId.value) return false
    }
    if (selectedThreadId.value !== '') {
      const threadId = parser.getTaskThreadId(task.task_id)
      if (threadId !== selectedThreadId.value) return false
    }
    return true
  })
})

// 清除过滤器
const clearFilters = () => {
  selectedProcessId.value = ''
  selectedThreadId.value = ''
}

// 进程ID选项（根据已选线程动态过滤）
const processIdOptions = computed(() => {
  let validProcessIds = availableProcessIds.value

  // 如果选择了线程，只显示该线程下有任务的进程
  if (selectedThreadId.value !== '') {
    validProcessIds = validProcessIds.filter(processId => {
      return tasks.value.some(task => {
        const taskProcessId = parser.getTaskProcessId(task.task_id)
        const taskThreadId = parser.getTaskThreadId(task.task_id)
        return taskProcessId === processId && taskThreadId === selectedThreadId.value
      })
    })
  }

  return [
    { label: '全部进程', value: '' },
    ...validProcessIds.map(id => ({
      label: `进程: ${id}`,
      value: id
    }))
  ]
})

// 线程ID选项（根据已选进程动态过滤）
const threadIdOptions = computed(() => {
  let validThreadIds = availableThreadIds.value

  // 如果选择了进程，只显示该进程下有任务的线程
  if (selectedProcessId.value !== '') {
    validThreadIds = validThreadIds.filter(threadId => {
      return tasks.value.some(task => {
        const taskProcessId = parser.getTaskProcessId(task.task_id)
        const taskThreadId = parser.getTaskThreadId(task.task_id)
        return taskThreadId === threadId && taskProcessId === selectedProcessId.value
      })
    })
  }

  return [
    { label: '全部线程', value: '' },
    ...validThreadIds.map(id => ({
      label: `线程: ${id}`,
      value: id
    }))
  ]
})

// 监听过滤后的任务列表变化，处理选中任务的有效性
watch(filteredTasks, (newTasks) => {
  if (selectedTask.value && !newTasks.find(t => t.task_id === selectedTask.value!.task_id)) {
    // 当前选中的任务被过滤掉了
    if (newTasks.length > 0) {
      handleSelectTask(newTasks[0])
    } else {
      selectedTask.value = null
      selectedNode.value = null
      selectedFlowItemId.value = null
    }
  }
})

// 处理文件加载开始
const handleFileLoadingStart = () => {
  // 移除当前焦点，避免 aria-hidden 警告
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }
  showFileLoadingModal.value = true
}

// 处理文件加载结束
const handleFileLoadingEnd = () => {
  showFileLoadingModal.value = false
}

// 响应式 modal 宽度
const modalWidth = computed(() => isMobile.value ? '90vw' : '600px')
const modalWidthSmall = computed(() => isMobile.value ? '90vw' : '500px')

// 移动端下选中节点/识别/动作自动打开详情抽屉
watch(
  [
    selectedNode,
    selectedFlowItemId,
  ],
  () => {
    if (isMobile.value && selectedNode.value) {
      showDetailDrawer.value = true
    }
  }
)

// 移动端汉堡菜单选项
const mobileMenuOptions = computed(() => [
  ...viewModeOptions.value.map(opt => ({
    label: opt.label,
    key: `view-${opt.key}`,
    icon: opt.icon
  })),
  { type: 'divider' as const, key: 'd1' },
  { label: '设置', key: 'settings', icon: () => h(SettingOutlined) },
  { label: '关于', key: 'about', icon: () => h(InfoCircleOutlined) },
  { label: props.isDark ? '浅色模式' : '深色模式', key: 'theme', icon: () => h(props.isDark ? BulbOutlined : BulbFilled) }
])

// isDark as ref for computed access
const isDark = computed(() => props.isDark)

const handleMobileMenuSelect = (key: string) => {
  if (key.startsWith('view-')) {
    handleViewModeSelect(key.replace('view-', ''))
  } else if (key === 'settings') {
    showSettingsModal.value = true
  } else if (key === 'about') {
    showAboutModal.value = true
  } else if (key === 'theme') {
    emit('toggle-theme')
  }
}

// 移动端任务选择（选择后关闭抽屉）
const handleMobileSelectTask = (task: TaskInfo) => {
  handleSelectTask(task)
  showTaskDrawer.value = false
}

watch(viewMode, () => {
  if (!tourActive.value) return
  void resolveCurrentTourTarget()
})

watch([splitSize, detailViewCollapsed, splitVerticalSize], ([currentSplitSize, collapsed, currentVerticalSize]) => {
  const prev = readAppLayoutState()
  const next: AppLayoutState = {
    ...prev,
    splitVerticalSize: clamp(currentVerticalSize, 0.2, 0.8, 0.5)
  }

  // 折叠状态下 splitSize 会被强制设为 1，不写回以避免刷新后丢失用户比例。
  if (!collapsed) {
    next.analysisSplitSize = clamp(currentSplitSize, 0.4, 1, 0.65)
  }

  saveAppLayoutState(next)
})
onMounted(() => {
  window.addEventListener('resize', handleTourViewportChange)
  window.addEventListener('scroll', handleTourViewportChange, true)

  if (tutorialAutoStartEnabled && !tutorialAutoStarted.value && !hasCompletedCurrentTutorialVersion()) {
    tutorialAutoStarted.value = true
    void startTour(true)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleTourViewportChange)
  window.removeEventListener('scroll', handleTourViewportChange, true)
  if (realtimeParseTimer != null) {
    window.clearTimeout(realtimeParseTimer)
    realtimeParseTimer = null
  }
  resetParserDebugAssets()
})
</script>

<template>
  <div
    class="app-root"
    :class="{ 'app-root--embed-vscode-launch': isVscodeLaunchEmbed }"
    :data-embed-mode="appEmbedMode"
    style="height: 100vh; display: flex; flex-direction: column"
  >
    <!-- 顶部菜单栏 -->
    <n-card
      size="small"
      :bordered="false"
      content-style="padding: 8px 16px"
    >
      <!-- 移动端头部 -->
      <n-flex v-if="isMobile" justify="space-between" align="center">
        <n-flex align="center" style="gap: 8px">
          <n-button
            text
            style="font-size: 22px"
            @click="showTaskDrawer = true"
          >
            <n-icon><menu-outlined /></n-icon>
          </n-button>
          <n-text strong style="font-size: 16px">MAA 日志工具</n-text>
        </n-flex>
        <n-dropdown
          :options="mobileMenuOptions"
          @select="handleMobileMenuSelect"
          trigger="click"
        >
          <n-button size="small" data-tour="header-mobile-menu">
            {{ currentViewLabel }}
          </n-button>
        </n-dropdown>
      </n-flex>

      <!-- 桌面端头部 -->
      <n-flex v-else justify="space-between" align="center">
        <n-flex align="center" style="gap: 12px">
          <n-text strong style="font-size: 16px">MAA 日志工具</n-text>

          <!-- 视图模式下拉菜单 -->
          <div data-tour="header-view-switch">
            <n-dropdown
              :options="viewModeOptions"
              @select="handleViewModeSelect"
              trigger="click"
            >
              <n-button size="small">
                <template #icon>
                  <n-icon>
                    <bar-chart-outlined v-if="viewMode === 'analysis'" />
                    <file-search-outlined v-else-if="viewMode === 'search'" />
                    <dashboard-outlined v-else-if="viewMode === 'statistics'" />
                    <apartment-outlined v-else-if="viewMode === 'flowchart'" />
                    <robot-outlined v-else-if="viewMode === 'ai'" />
                    <column-height-outlined v-else />
                  </n-icon>
                </template>
                {{ currentViewLabel }}
              </n-button>
            </n-dropdown>
          </div>

          <!-- 进程过滤器 -->
          <n-select
            v-if="showProcessThreadFilters"
            v-model:value="selectedProcessId"
            :options="processIdOptions"
            placeholder="选择进程"
            clearable
            size="small"
            style="width: 150px"
          />

          <!-- 线程过滤器 -->
          <n-select
            v-if="showProcessThreadFilters"
            v-model:value="selectedThreadId"
            :options="threadIdOptions"
            placeholder="选择线程"
            clearable
            size="small"
            style="width: 150px"
          />

          <!-- 清除过滤按钮 -->
          <n-button
            v-if="showProcessThreadFilters && (selectedProcessId || selectedThreadId)"
            @click="clearFilters"
            size="small"
            secondary
          >
            清除过滤
          </n-button>
        </n-flex>

        <!-- 右侧按钮组 -->
        <n-flex align="center" style="gap: 8px">
          <!-- 设置按钮 -->
          <n-button
            text
            style="font-size: 20px"
            data-tour="header-settings-button"
            @click="showSettingsModal = true"
          >
            <n-icon>
              <setting-outlined />
            </n-icon>
          </n-button>

          <!-- 关于按钮 -->
          <n-button
            text
            style="font-size: 20px"
            @click="showAboutModal = true"
          >
            <n-icon>
              <info-circle-outlined />
            </n-icon>
          </n-button>

          <!-- 主题切换按钮 -->
          <n-button
            text
            style="font-size: 20px"
            data-tour="header-theme-button"
            @click="emit('toggle-theme')"
          >
            <n-icon>
              <bulb-filled v-if="isDark" />
              <bulb-outlined v-else />
            </n-icon>
          </n-button>
        </n-flex>
      </n-flex>
    </n-card>
    
    <!-- 主内容区域 -->
    <div style="flex: 1; min-height: 0">
      <!-- 日志分析模式 -->
      <div v-show="viewMode === 'analysis'" data-tour="analysis-main" style="height: 100%">
        <!-- 移动端布局 -->
        <template v-if="isMobile">
          <process-view
            :tasks="filteredTasks"
            :selected-task="selectedTask"
            :loading="loading"
            :parser="parser"
            :is-mobile="true"
            :pending-scroll-node-id="pendingScrollNodeId"
            :is-realtime-streaming="isRealtimeContext"
            :show-realtime-status="showRealtimeStatus"
            :show-reload-controls="showReloadControls"
            @select-task="handleSelectTask"
            @upload-file="handleFileUpload"
            @upload-content="handleContentUpload"
            @select-node="handleSelectNode"
            @select-action="handleSelectAction"
            @select-recognition="handleSelectRecognition"
            @select-flow-item="handleSelectFlowItem"
            @file-loading-start="handleFileLoadingStart"
            @file-loading-end="handleFileLoadingEnd"
            @open-task-drawer="showTaskDrawer = true"
            @scroll-done="pendingScrollNodeId = null"
          />

          <!-- 左侧任务抽屉 -->
          <n-drawer
            v-model:show="showTaskDrawer"
            placement="left"
            :width="280"
          >
            <n-drawer-content title="任务列表">
              <n-scrollbar style="height: 100%">
                <n-list hoverable clickable>
                  <n-list-item
                    v-for="(task, index) in filteredTasks"
                    :key="task.task_id"
                    @click="handleMobileSelectTask(task)"
                    :style="{
                      backgroundColor: selectedTask?.task_id === task.task_id ? 'var(--n-color-target)' : 'transparent',
                      cursor: 'pointer',
                      padding: '12px 16px'
                    }"
                  >
                    <n-flex vertical style="gap: 8px">
                      <n-flex align="center" justify="space-between">
                        <n-text strong style="font-size: 15px">{{ task.entry }}</n-text>
                        <n-tag size="small" :type="task.status === 'succeeded' ? 'success' : task.status === 'failed' ? 'error' : 'warning'">
                          #{{ index + 1 }}
                        </n-tag>
                      </n-flex>
                      <n-flex vertical style="gap: 4px">
                        <n-text depth="3" style="font-size: 12px">
                          状态:
                          <n-text :type="task.status === 'succeeded' ? 'success' : task.status === 'failed' ? 'error' : 'warning'">
                            {{ task.status === 'succeeded' ? '成功' : task.status === 'failed' ? '失败' : '运行中' }}
                          </n-text>
                        </n-text>
                        <n-text depth="3" style="font-size: 12px">
                          节点: {{ task.nodes.length }} 个
                        </n-text>
                        <n-text depth="3" style="font-size: 12px" v-if="task.duration">
                          耗时: {{ formatDuration(task.duration) }}
                        </n-text>
                      </n-flex>
                    </n-flex>
                  </n-list-item>
                </n-list>
              </n-scrollbar>
            </n-drawer-content>
          </n-drawer>

          <!-- 底部详情抽屉 -->
          <n-drawer
            v-model:show="showDetailDrawer"
            placement="bottom"
            :default-height="400"
            resizable
          >
            <n-drawer-content title="详细信息">
              <detail-view
                :selected-node="selectedNode"
                :selected-flow-item-id="selectedFlowItemId"
                style="height: 100%"
              />
            </n-drawer-content>
          </n-drawer>
        </template>

        <!-- 桌面端布局 -->
        <n-split
          v-else
          v-model:size="splitSize"
          :max="1"
          :min="0.4"
          style="height: 100%"
        >
          <template #1>
            <process-view
              :tasks="filteredTasks"
              :selected-task="selectedTask"
              :loading="loading"
              :parser="parser"
              :detail-view-collapsed="detailViewCollapsed"
              :on-expand-detail-view="toggleDetailView"
              :pending-scroll-node-id="pendingScrollNodeId"
              :is-realtime-streaming="isRealtimeContext"
              :show-realtime-status="showRealtimeStatus"
              :show-reload-controls="showReloadControls"
              @select-task="handleSelectTask"
              @upload-file="handleFileUpload"
              @upload-content="handleContentUpload"
              @select-node="handleSelectNode"
              @select-action="handleSelectAction"
              @select-recognition="handleSelectRecognition"
              @select-flow-item="handleSelectFlowItem"
              @file-loading-start="handleFileLoadingStart"
              @file-loading-end="handleFileLoadingEnd"
              @scroll-done="pendingScrollNodeId = null"
            />
          </template>
          <template #2>
            <n-card size="small" title="详细信息" style="height: 100%; display: flex; flex-direction: column; position: relative" content-style="padding: 0; flex: 1; min-height: 0; overflow: hidden">
              <!-- 折叠按钮 - 左边缘中间 -->
              <n-button
                circle
                size="small"
                @click="toggleDetailView"
                style="position: absolute; left: -12px; top: 50%; transform: translateY(-50%); z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15)"
              >
                <template #icon>
                  <n-icon>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <!-- 展开时显示向右箭头，表示点击后向右折叠 -->
                      <path fill="currentColor" d="M8.59 16.59L10 18l6-6l-6-6l-1.41 1.41L13.17 12z"/>
                    </svg>
                  </n-icon>
                </template>
              </n-button>
              <detail-view
                :selected-node="selectedNode"
                :selected-flow-item-id="selectedFlowItemId"
                style="height: 100%"
              />
            </n-card>
          </template>
        </n-split>
      </div>
      <!-- 文本搜索模式（独立显示，占据整个屏幕） -->
      <div v-show="viewMode === 'search'" data-tour="search-main" style="height: 100%">
        <text-search-view :is-dark="isDark" :loaded-targets="textSearchLoadedTargets" :loaded-default-target-id="textSearchLoadedDefaultTargetId" style="height: 100%" />
      </div>

      <!-- 节点统计模式（独立显示，占据整个屏幕） -->
      <div v-if="viewMode === 'statistics'" data-tour="statistics-main" style="height: 100%">
        <node-statistics-view :tasks="tasks" style="height: 100%" />
      </div>

      <!-- 流程图模式 -->
      <div v-if="viewMode === 'flowchart'" data-tour="flowchart-main" style="height: 100%">
        <flowchart-view
          :tasks="filteredTasks"
          :parser="parser"
          :initial-task="selectedTask"
          style="height: 100%"
          @select-task="handleSelectTask"
          @navigate-to-node="handleNavigateToNode"
          @upload-file="handleFileUpload"
          @upload-content="handleContentUpload"
        />
      </div>

      <!-- AI 分析模式 -->
      <div v-if="viewMode === 'ai'" data-tour="ai-main" style="height: 100%">
        <ai-analysis-view
          :tasks="tasks"
          :selected-task="selectedTask"
          :selected-node="selectedNode"
          :selected-flow-item-id="selectedFlowItemId"
          :loaded-targets="textSearchLoadedTargets"
          :loaded-default-target-id="textSearchLoadedDefaultTargetId"
          style="height: 100%"
        />
      </div>

      <!-- 分屏模式 -->
      <div v-show="viewMode === 'split'" data-tour="split-main" style="height: 100%">
        <template v-if="isMobile">
          <div style="height: 100%; display: flex; flex-direction: column; gap: 8px; padding: 8px; box-sizing: border-box;">
            <n-flex align="center" justify="space-between" style="gap: 8px">
              <n-text depth="3" style="font-size: 12px">分屏比例</n-text>
              <n-flex align="center" style="gap: 6px">
                <n-button size="tiny" @click="splitVerticalSize = 0.72">分析优先</n-button>
                <n-button size="tiny" @click="splitVerticalSize = 0.5">均分</n-button>
                <n-button size="tiny" @click="splitVerticalSize = 0.28">搜索优先</n-button>
              </n-flex>
            </n-flex>

            <n-split
              direction="vertical"
              v-model:size="splitVerticalSize"
              :min="0.15"
              :max="0.85"
              style="flex: 1; min-height: 0"
            >
              <template #1>
                <process-view
                  :tasks="filteredTasks"
                  :selected-task="selectedTask"
                  :loading="loading"
                  :parser="parser"
                  :is-mobile="true"
                  :pending-scroll-node-id="pendingScrollNodeId"
                  :is-realtime-streaming="isRealtimeContext"
                  :show-realtime-status="showRealtimeStatus"
                  :show-reload-controls="showReloadControls"
                  style="height: 100%"
                  @select-task="handleSelectTask"
                  @upload-file="handleFileUpload"
                  @upload-content="handleContentUpload"
                  @select-node="handleSelectNode"
                  @select-action="handleSelectAction"
                  @select-recognition="handleSelectRecognition"
                  @select-flow-item="handleSelectFlowItem"
                  @file-loading-start="handleFileLoadingStart"
                  @file-loading-end="handleFileLoadingEnd"
                  @open-task-drawer="showTaskDrawer = true"
                  @scroll-done="pendingScrollNodeId = null"
                />
              </template>
              <template #2>
                <text-search-view
                  :is-dark="isDark"
                  :loaded-targets="textSearchLoadedTargets"
                  :loaded-default-target-id="textSearchLoadedDefaultTargetId"
                  style="height: 100%"
                />
              </template>
            </n-split>
          </div>

          <!-- 左侧任务抽屉 -->
          <n-drawer
            v-model:show="showTaskDrawer"
            placement="left"
            :width="280"
          >
            <n-drawer-content title="任务列表">
              <n-scrollbar style="height: 100%">
                <n-list hoverable clickable>
                  <n-list-item
                    v-for="(task, index) in filteredTasks"
                    :key="task.task_id"
                    @click="handleMobileSelectTask(task)"
                    :style="{
                      backgroundColor: selectedTask?.task_id === task.task_id ? 'var(--n-color-target)' : 'transparent',
                      cursor: 'pointer',
                      padding: '12px 16px'
                    }"
                  >
                    <n-flex vertical style="gap: 8px">
                      <n-flex align="center" justify="space-between">
                        <n-text strong style="font-size: 15px">{{ task.entry }}</n-text>
                        <n-tag size="small" :type="task.status === 'succeeded' ? 'success' : task.status === 'failed' ? 'error' : 'warning'">
                          #{{ index + 1 }}
                        </n-tag>
                      </n-flex>
                      <n-flex vertical style="gap: 4px">
                        <n-text depth="3" style="font-size: 12px">
                          状态:
                          <n-text :type="task.status === 'succeeded' ? 'success' : task.status === 'failed' ? 'error' : 'warning'">
                            {{ task.status === 'succeeded' ? '成功' : task.status === 'failed' ? '失败' : '运行中' }}
                          </n-text>
                        </n-text>
                        <n-text depth="3" style="font-size: 12px">
                          节点: {{ task.nodes.length }} 个
                        </n-text>
                        <n-text depth="3" style="font-size: 12px" v-if="task.duration">
                          耗时: {{ formatDuration(task.duration) }}
                        </n-text>
                      </n-flex>
                    </n-flex>
                  </n-list-item>
                </n-list>
              </n-scrollbar>
            </n-drawer-content>
          </n-drawer>

          <!-- 底部详情抽屉 -->
          <n-drawer
            v-model:show="showDetailDrawer"
            placement="bottom"
            :default-height="400"
            resizable
          >
            <n-drawer-content title="详细信息">
              <detail-view
                :selected-node="selectedNode"
                :selected-flow-item-id="selectedFlowItemId"
                style="height: 100%"
              />
            </n-drawer-content>
          </n-drawer>
        </template>

        <n-split
          v-else
          direction="vertical"
          v-model:size="splitVerticalSize"
          :min="0.2"
          :max="0.8"
          style="height: 100%"
        >
          <!-- 上半部分：日志分析 -->
          <template #1>
            <n-split
              v-model:size="splitSize"
              :max="1"
              :min="0.4"
              style="height: 100%"
            >
              <template #1>
                <process-view
                  :tasks="filteredTasks"
                  :selected-task="selectedTask"
                  :loading="loading"
                  :parser="parser"
                  :detail-view-collapsed="detailViewCollapsed"
                  :on-expand-detail-view="toggleDetailView"
                  :pending-scroll-node-id="pendingScrollNodeId"
                  :is-realtime-streaming="isRealtimeContext"
                  :show-realtime-status="showRealtimeStatus"
                  :show-reload-controls="showReloadControls"
                  @select-task="handleSelectTask"
                  @upload-file="handleFileUpload"
                  @upload-content="handleContentUpload"
                  @select-node="handleSelectNode"
                  @select-action="handleSelectAction"
                  @select-recognition="handleSelectRecognition"
                  @select-flow-item="handleSelectFlowItem"
                  @file-loading-start="handleFileLoadingStart"
                  @file-loading-end="handleFileLoadingEnd"
                  @scroll-done="pendingScrollNodeId = null"
                />
              </template>
              <template #2>
                <n-card size="small" title="节点详情" style="height: 100%; display: flex; flex-direction: column; position: relative" content-style="padding: 0; flex: 1; min-height: 0; overflow: hidden">
                  <!-- 折叠按钮 - 左边缘中间 -->
                  <n-button
                    circle
                    size="small"
                    @click="toggleDetailView"
                    style="position: absolute; left: -12px; top: 50%; transform: translateY(-50%); z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15)"
                  >
                    <template #icon>
                      <n-icon>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                          <!-- 展开时显示向右箭头，表示点击后向右折叠 -->
                          <path fill="currentColor" d="M8.59 16.59L10 18l6-6l-6-6l-1.41 1.41L13.17 12z"/>
                        </svg>
                      </n-icon>
                    </template>
                  </n-button>
                  <detail-view
                    :selected-node="selectedNode"
                    :selected-flow-item-id="selectedFlowItemId"
                    style="height: 100%"
                  />
                </n-card>
              </template>
            </n-split>
          </template>

          <!-- 下半部分：文本搜索 -->
          <template #2>
            <text-search-view v-if="viewMode === 'split'" :is-dark="isDark" :loaded-targets="textSearchLoadedTargets" :loaded-default-target-id="textSearchLoadedDefaultTargetId" style="height: 100%" />
          </template>
        </n-split>
      </div>
    </div>
    <!-- 设置对话框 -->
    <n-modal
      v-model:show="showSettingsModal"
      preset="card"
      title="设置"
      :style="{ width: modalWidth }"
      :bordered="false"
    >
      <settings-view />
    </n-modal>

    <TourOverlay
      :active="tourActive"
      :step="currentTourStep"
      :step-index="tourStepIndex"
      :total-steps="currentTourSteps.length"
      :section-title="currentTourSectionTitle"
      :section-index="currentTourSectionIndex"
      :section-total="currentTourSectionTotal"
      :section-step-index="currentTourSectionStepIndex"
      :section-step-total="currentTourSectionStepTotal"
      :target-rect="tourTargetRect"
      :target-found="tourTargetFound"
      @prev="handleTourPrev"
      @next="handleTourNext"
      @retry="handleTourRetry"
      @finish="handleTourFinish"
      @skip="handleTourSkip"
    />

    <!-- 关于对话框 -->
    <n-modal
      v-model:show="showAboutModal"
      preset="card"
      title="关于"
      :style="{ width: modalWidth }"
      :bordered="false"
    >
      <n-flex vertical style="gap: 14px">
        <n-card size="small" :bordered="true">
          <n-flex vertical style="gap: 10px">
            <n-text strong style="font-size: 18px">MAA 日志分析工具 | MaaLogAnalyzer</n-text>
            <n-text depth="3">MaaFramework 日志分析与可视化工具，觉得好用可以点点 star！</n-text>
          </n-flex>
        </n-card>

        <n-card size="small" :bordered="true">
          <n-flex vertical style="gap: 10px">
            <n-text strong>项目与技术栈</n-text>
            <n-flex wrap style="gap: 8px">
              <n-tag type="info">Vue 3</n-tag>
              <n-tag type="info">TypeScript</n-tag>
              <n-tag type="info">Naive UI</n-tag>
              <n-tag type="info">Vite</n-tag>
              <n-tag type="info">Tauri</n-tag>
            </n-flex>
            <n-button
              text
              tag="a"
              href="https://github.com/MaaXYZ/MaaLogAnalyzer"
              target="_blank"
              type="primary"
              style="padding: 0; justify-content: flex-start"
            >
              <template #icon>
                <n-icon><github-outlined /></n-icon>
              </template>
              GitHub: Maa Log Analyzer
            </n-button>
          </n-flex>
        </n-card>

        <n-card size="small" :bordered="true">
          <n-flex vertical style="gap: 10px">
            <n-text strong>快速开始</n-text>
            <n-text depth="3" style="font-size: 13px">首次使用建议先跑一遍新手教程，了解大致功能。</n-text>
            <n-button data-tour="about-start-tutorial" type="primary" :loading="tutorialLoadingSample" @click="openTutorialFromAbout">
              开始新手教程
            </n-button>
          </n-flex>
        </n-card>

        <n-flex justify="space-between" align="center" style="padding: 0 4px">
          <n-text depth="3" style="font-size: 12px">Version {{ version }}</n-text>
          <n-text depth="3" style="font-size: 12px">© 2025 MaaXYZ</n-text>
        </n-flex>
      </n-flex>
    </n-modal>

    <!-- 文件读取加载对话框 -->
    <n-modal
      v-model:show="showFileLoadingModal"
      preset="card"
      title="正在读取日志文件"
      :style="{ width: modalWidthSmall }"
      :bordered="false"
      :closable="false"
      :mask-closable="false"
      :close-on-esc="false"
    >
      <n-flex vertical style="gap: 20px; padding: 20px 0">
        <n-text style="text-align: center; font-size: 16px">
          正在读取文件内容...
        </n-text>
        <n-progress
          type="line"
          :percentage="100"
          :show-indicator="false"
          :height="24"
          status="info"
          processing
        />
        <n-text depth="3" style="text-align: center; font-size: 13px">
          请稍候，文件读取完成后将开始解析
        </n-text>
      </n-flex>
    </n-modal>

    <!-- 解析进度对话框 -->
    <n-modal
      v-model:show="showParsingModal"
      preset="card"
      title="正在解析日志文件"
      :style="{ width: modalWidthSmall }"
      :bordered="false"
      :closable="false"
      :mask-closable="false"
      :close-on-esc="false"
    >
      <n-flex vertical style="gap: 20px; padding: 20px 0">
        <n-text style="text-align: center; font-size: 16px">
          解析进度：{{ parseProgress }}%
        </n-text>
        <n-progress
          type="line"
          :percentage="parseProgress"
          :show-indicator="false"
          :height="24"
          status="success"
        />
        <n-text depth="3" style="text-align: center; font-size: 13px">
          正在分块处理日志，请稍候...
        </n-text>
      </n-flex>
    </n-modal>
  </div>
</template>
