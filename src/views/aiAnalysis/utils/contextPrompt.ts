import type { MemoryState } from '../types'

interface BuildFullContextPromptTextOptions {
  compact: boolean
  knowledgeBootstrap: boolean
  question: string
  focusTaskRequirementLines: string[]
  contextText: string
}

export const buildFullContextPromptText = (
  options: BuildFullContextPromptTextOptions,
): string => {
  return [
    options.compact
      ? '这是首轮或上下文变化后的分析。由于上下文较大，本轮启用压缩上下文；结论仍必须绑定明确字段证据。'
      : `这是首轮或上下文变化后的分析，必须先盘点证据再给结论。若开启知识包，本轮采用${options.knowledgeBootstrap ? '全量知识卡片（按相关性排序）' : '相关知识摘要'}。`,
    `用户问题: ${options.question}`,
    '',
    '任务要求:',
    ...options.focusTaskRequirementLines,
    '- 证据采用 E1/E2... 编号；同一证据正文只展开一次。',
    '- 结论/根因候选段只引用 E 编号，不重复粘贴证据正文。',
    '- 必须先量化长时间停留节点（使用时间线长停留统计数据）。',
    '- 必须检查识别热点（使用识别失败分布与热点组合统计数据）。',
    '- 必须检查 on_error 触发链路，明确 on_error 的触发源与后续结果。',
    '- action_failed 判定要覆盖 ActionNode.Failed 与 PipelineNode.Failed(implicit action failure)，不能只看 Action.Failed。',
    '- 若存在 nested action 诊断，必须合并判断 custom/nested action 失败热点。',
    '- 识别问题只在“整轮 next list 无命中并失败/超时”时判定为异常；前段 miss 后命中恢复不应直接定为根因。',
    '- 必须检查停止链路诊断与 next 候选可执行性诊断，区分主动停止、无可执行候选与超时未命中。',
    '- 必须检查 anchor 解析诊断与 jump_back 回跳诊断，区分锚点未解析、回跳命中后未回跳等控制流语义。',
    '- 必须额外检查 jump_back 命中后“回到父节点但命中节点疑似无后继”的复检链路，判断其是否导致长停留。',
    '- 若存在 questionNodeDiagnostics，先输出该节点的定量数据，再给结论。',
    '- 若存在 selectedNodeFocus，必须先做节点级结论（当前选中节点/流项），再给任务级结论。',
    '- 识别/动作/任务归属必须采用解析顺序规则，禁止只按时间先后推断。',
    '- 仅把 next 识别链路 / 动作失败链路作为补充证据，不可替代 on_error 触发链路。',
    '- 若存在确定性结论摘要，至少引用其中 1 条并映射到 E 证据编号。',
    '- 输出面向用户可读，禁止出现 timelineDiagnostics.xxx 这类字段路径文本。',
    '- 给出至少2个根因候选并排序。',
    '- 排查步骤必须可执行且可验证。',
    '',
    '完整上下文 JSON:',
    options.contextText,
  ].join('\n')
}

interface BuildMemoryPromptTextOptions {
  memory: MemoryState
  question: string
  followupRule: string
}

export const buildMemoryPromptText = (
  options: BuildMemoryPromptTextOptions,
): string => {
  return [
    '这是同一上下文下的追问。优先基于已有记忆回答。',
    `用户追问: ${options.question}`,
    '',
    `上下文指纹: ${options.memory.contextKey}`,
    '追问要求:',
    '- 若新问题未覆盖已知矛盾，优先处理未决风险。',
    '- 继续引用已有证据与关键数值，保持用户可读，不输出内部字段路径。',
    options.followupRule,
    '',
    '会话记忆:',
    options.memory.summary,
  ].join('\n')
}

export const buildFallbackMemory = (answer: string, questionText: string): string => {
  const compact = answer.replace(/\s+/g, ' ').trim()
  const capped = compact.length > 900 ? `${compact.slice(0, 900)}...` : compact
  return `最近问题: ${questionText}\n最近结论: ${capped}`
}
