import { computed, nextTick, ref, watch, type Ref } from 'vue'
import type { TaskInfo } from '../../../types'
import type { ConversationTurn } from '../types'
import { renderMarkdown } from '../utils/markdown'
import { buildExportStamp, formatExportTime, sanitizeFilenameSegment } from '../utils/export'
import { saveFile } from '../../../utils/fileDialog'

interface ConversationTurnView extends ConversationTurn {
  answerHtml: string
}

interface UseConversationViewOptions {
  analyzing: Ref<boolean>
  analyzingStage: Ref<'idle' | 'streaming' | 'postprocess'>
  streamingRenderText: Ref<string>
  activeRoundQuestion: Ref<string>
  conversationTurns: Ref<ConversationTurn[]>
  currentContextKey: Ref<string>
  selectedTask: Ref<TaskInfo | null>
  selectedTaskTitle: Ref<string>
  sourceLabel: Ref<string>
  resultText: Ref<string>
  message: {
    warning: (content: string) => void
    success: (content: string) => void
  }
}

type ScrollbarRef = {
  scrollTo: (options: { top?: number; left?: number; behavior?: ScrollBehavior }) => void
} | null

export const useConversationView = (options: UseConversationViewOptions) => {
  const conversationFollowMode = ref(true)
  const turnListRef = ref<HTMLElement | null>(null)
  const aiOutputScrollbarRef = ref<ScrollbarRef>(null)

  const renderedResultHtml = computed(() => renderMarkdown(options.resultText.value))
  const streamingAnswerHtml = computed(() => renderMarkdown(options.streamingRenderText.value))
  const showStreamingTurn = computed(() =>
    options.analyzing.value
    && options.analyzingStage.value !== 'idle'
    && !!options.streamingRenderText.value.trim()
    && !!options.activeRoundQuestion.value.trim()
  )

  const conversationTurnViews = computed<ConversationTurnView[]>(() => {
    return [...options.conversationTurns.value]
      .filter(item => item.contextKey === options.currentContextKey.value)
      .sort((a, b) => a.turn - b.turn)
      .map(item => ({
        ...item,
        answerHtml: renderMarkdown(item.answer),
      }))
  })

  const buildConversationExportText = () => {
    const turns = conversationTurnViews.value
    if (!turns.length && !showStreamingTurn.value) return ''

    const lines: string[] = []
    lines.push('MAA Log Analyzer - AI Conversation Export')
    lines.push(`导出时间: ${formatExportTime(Date.now())}`)
    lines.push(`任务: ${options.selectedTaskTitle.value}`)
    lines.push(`日志源: ${options.sourceLabel.value}`)
    lines.push(`上下文Key: ${options.currentContextKey.value}`)
    lines.push(`已完成轮数: ${turns.length}`)
    lines.push('')
    lines.push('============================================================')
    lines.push('')

    for (const turn of turns) {
      lines.push(`[第 ${turn.turn} 轮] ${formatExportTime(turn.timestamp)} | ${turn.usedMemory ? '记忆上下文' : '全量上下文'}`)
      lines.push('[用户]')
      lines.push(turn.question || '(空)')
      lines.push('')
      lines.push('[助手]')
      lines.push(turn.answer || '(空)')
      lines.push('')
      lines.push('------------------------------------------------------------')
      lines.push('')
    }

    if (showStreamingTurn.value) {
      lines.push('[进行中轮次]')
      lines.push('[用户]')
      lines.push(options.activeRoundQuestion.value || '(空)')
      lines.push('')
      lines.push('[助手-流式片段]')
      lines.push(options.streamingRenderText.value || '(空)')
      lines.push('')
    }

    return lines.join('\n')
  }

  const handleExportConversation = async () => {
    const content = buildConversationExportText()
    if (!content) {
      options.message.warning('当前没有可导出的对话内容')
      return
    }

    const task = options.selectedTask.value
    const taskIdPart = task ? `task-${task.task_id}` : 'task-none'
    const taskNamePart = sanitizeFilenameSegment(task?.entry ?? 'unknown')
    const filename = `ai-conversation-${taskIdPart}-${taskNamePart}-${buildExportStamp()}.txt`
    const ok = await saveFile(content, filename)
    if (ok) {
      options.message.success('对话导出成功')
    } else {
      options.message.warning('对话导出已取消')
    }
  }

  const scrollConversationToBottom = async (behavior: ScrollBehavior = 'auto') => {
    if (!conversationFollowMode.value) return
    await nextTick()
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

    const turnListEl = turnListRef.value
    if (turnListEl) {
      turnListEl.scrollTop = turnListEl.scrollHeight
      if (behavior === 'smooth') {
        turnListEl.scrollTo({ top: turnListEl.scrollHeight, behavior })
      }
    }

    aiOutputScrollbarRef.value?.scrollTo?.({ top: Number.MAX_SAFE_INTEGER, behavior })
  }

  watch(
    () => [conversationTurnViews.value.length, showStreamingTurn.value, options.currentContextKey.value],
    () => {
      void scrollConversationToBottom('auto')
    },
    { immediate: true, flush: 'post' }
  )

  watch(options.streamingRenderText, () => {
    if (!options.analyzing.value) return
    void scrollConversationToBottom('auto')
  }, { flush: 'post' })

  watch(conversationFollowMode, (enabled) => {
    if (!enabled) return
    void scrollConversationToBottom('smooth')
  })

  return {
    conversationFollowMode,
    turnListRef,
    aiOutputScrollbarRef,
    renderedResultHtml,
    streamingAnswerHtml,
    showStreamingTurn,
    conversationTurnViews,
    handleExportConversation,
  }
}
