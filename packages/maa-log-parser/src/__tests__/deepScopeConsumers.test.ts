import { describe, expect, it } from 'vitest'
import { LogParser } from '../core/logParser'
import { getScopeEvents } from '../query/helpers'
import { createAnalyzerToolHandlers } from '../service/toolHandlers'

const DEEP_CHAIN_LENGTH = 17_000

const formatTimestamp = (eventIndex: number): string => {
  const totalSeconds = Math.floor(eventIndex / 1000)
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  const milliseconds = String(eventIndex % 1000).padStart(3, '0')
  return `2026-04-06 10:${minutes}:${seconds}.${milliseconds}`
}

const makeTaskStartingLine = (eventIndex: number, taskId: number): string =>
  `[${formatTimestamp(eventIndex)}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={"task_id":${taskId},"entry":"Task${taskId}","hash":"h-${taskId}","uuid":"u-${taskId}"}]`

const makeRecognitionStartingLine = (eventIndex: number, recoId: number): string =>
  `[${formatTimestamp(eventIndex)}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=Node.Recognition.Starting] [details={"task_id":1,"node_id":1,"reco_id":${recoId},"name":"R${recoId}"}]`

/** 连续未闭合的任务：每一层都挂在还开着的那一层下面，作用域树退化成一条链。 */
const buildDeepChainContent = (count: number): string =>
  Array.from({ length: count }, (_, index) => makeTaskStartingLine(index + 1, index + 1)).join('\n')

describe('deep scope chains in the index layer', () => {
  it('builds the trace index and parse artifacts for a 17,000-deep chain', async () => {
    // walkScopeTree 原来是递归的：17,000 层直接 RangeError，于是 getTraceIndexSnapshot /
    // getParseArtifactsSnapshot 在深链输入上整体崩掉。
    const parser = new LogParser()
    await parser.parseInputs([
      { content: buildDeepChainContent(DEEP_CHAIN_LENGTH), sourceKey: 'maafw.log', inputIndex: 0 },
    ])

    const index = parser.getTraceIndexSnapshot()
    // 每个作用域都要进索引，外加一个 trace_root
    expect(index.scopeById.size).toBe(DEEP_CHAIN_LENGTH + 1)
    expect(
      [...index.scopeById.values()].filter((scope) => scope.kind === 'task'),
    ).toHaveLength(DEEP_CHAIN_LENGTH)

    const artifacts = parser.getParseArtifactsSnapshot()
    expect(artifacts.events).toHaveLength(DEEP_CHAIN_LENGTH)
  }, 15_000)

  it('serves the scope events of a task whose subtree is the whole chain', async () => {
    // collectScopeEventEntries 里的 visit 原来也是递归的，同样是深链下的 RangeError。
    const parser = new LogParser()
    await parser.parseInputs([
      { content: buildDeepChainContent(DEEP_CHAIN_LENGTH), sourceKey: 'maafw.log', inputIndex: 0 },
    ])

    const index = parser.getTraceIndexSnapshot()
    const firstTask = [...index.scopeById.values()].find((scope) => scope.taskId === 1)
    expect(firstTask).toBeDefined()

    const events = getScopeEvents(index, firstTask?.id ?? '')
    expect(events.ok).toBe(true)
    // 子树就是整条链：17,000 个作用域的起止事件都在里面
    if (events.ok) expect(events.value.length).toBeGreaterThanOrEqual(DEEP_CHAIN_LENGTH)
  }, 15_000)
})

describe('deep scope chains in the toolkit layer', () => {
  it('answers task overview when one task holds a 17,000-deep recognition chain', async () => {
    // 任务内部的节点链同样会退化：collectScopesWithinTaskExecution 以前也是递归的。
    const content = [
      makeTaskStartingLine(1, 1),
      ...Array.from({ length: DEEP_CHAIN_LENGTH }, (_, index) =>
        makeRecognitionStartingLine(index + 2, index + 1),
      ),
    ].join('\n')

    const handlers = createAnalyzerToolHandlers({
      async resolve_input() {
        return { content, source_key: 'a.log', source_path: '/logs/a.log' }
      },
    })
    const parsed = await handlers.parse_log_bundle({
      session_id: 's-1',
      inputs: [{ path: '/logs/a.log', kind: 'file' }],
    })
    expect(parsed.ok).toBe(true)

    const overview = await handlers.get_task_overview({ session_id: 's-1', task_id: 1 })
    expect(overview.ok).toBe(true)
  }, 20_000)
})
