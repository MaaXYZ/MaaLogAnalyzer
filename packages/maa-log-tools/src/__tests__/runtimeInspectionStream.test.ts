import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeLogSources, iterateTaskDetails } from '../index'
import { loadNodeLogSources } from '../nodeInput'
import { buildRuntimeInspection, createRuntimeInspectionBuilder } from '../runtimeInspection'
import type { FrameworkSessionExtraction } from '../frameworkVersion'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0, tempRoots.length).map((root) => rm(root, { recursive: true, force: true })),
  )
})

const emptyFramework: FrameworkSessionExtraction = {
  sessions: [],
  summary: { status: 'none', versions: [] },
  warnings: [],
}

const makeEventLine = (index: number, message: string, details: Record<string, unknown>): string => {
  const second = Math.floor(index / 1000)
  const millisecond = index % 1000
  return `[2026-04-06 10:00:${String(second).padStart(2, '0')}.${String(millisecond).padStart(3, '0')}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`
}

const buildLog = (): string =>
  [
    makeEventLine(1, 'Tasker.Task.Starting', { task_id: 1, entry: '任务一', hash: 'h', uuid: 'u' }),
    makeEventLine(2, 'Node.PipelineNode.Starting', { task_id: 1, node_id: 101, name: '节点A' }),
    makeEventLine(3, 'Node.PipelineNode.Failed', { task_id: 1, node_id: 101, name: '节点A' }),
    makeEventLine(4, 'Tasker.Task.Failed', { task_id: 1, entry: '任务一', hash: 'h', uuid: 'u' }),
    makeEventLine(5, 'Tasker.Task.Starting', { task_id: 2, entry: '任务二', hash: 'h2', uuid: 'u2' }),
    makeEventLine(6, 'Node.PipelineNode.Starting', { task_id: 2, node_id: 201, name: '节点B' }),
    makeEventLine(7, 'Node.PipelineNode.Succeeded', { task_id: 2, node_id: 201, name: '节点B' }),
    makeEventLine(8, 'Tasker.Task.Succeeded', { task_id: 2, entry: '任务二', hash: 'h2', uuid: 'u2' }),
  ].join('\n')

describe('runtime inspection builder integration', () => {
  it('matches the whole-tree inspection when built from iterateTaskDetails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mla-rt-stream-'))
    tempRoots.push(root)
    await writeFile(path.join(root, 'maafw.log'), `${buildLog()}\n`)

    const loaded = await loadNodeLogSources(root)
    expect(loaded).not.toBeNull()

    // 整树参考：解析完成后再取 segments
    const aggregated = await analyzeLogSources({ sources: loaded!.sources })
    const whole = buildRuntimeInspection(
      aggregated,
      emptyFramework,
      loaded!.getSourceSegments(),
    )
    expect(whole.unscopedTasks).toHaveLength(2)

    // 流式：segments 的行数只有在解析完成后才存在，所以 builder 必须在 skeletons 条目时创建
    let builder: ReturnType<typeof createRuntimeInspectionBuilder> | null = null
    const stream = iterateTaskDetails({ sources: loaded!.sources })
    while (true) {
      const next = await stream.next()
      if (next.done) break
      const item = next.value
      if (item.type === 'skeletons') {
        builder = createRuntimeInspectionBuilder(emptyFramework, loaded!.getSourceSegments())
      } else if (item.type === 'task') {
        builder!.addTask(item.task)
      }
    }

    expect(builder).not.toBeNull()
    expect(JSON.stringify(builder!.finish())).toBe(JSON.stringify(whole))
  })
})
