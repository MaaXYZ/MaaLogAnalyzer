import { describe, expect, it } from 'vitest'
import { mlaRuntimeAdapter } from '../index'

const line = (index: number, message: string, details: Record<string, unknown>): string =>
  `[2026-04-06 10:00:00.${String(index).padStart(3, '0')}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`

const content = [
  line(1, 'Tasker.Task.Starting', { task_id: 1, entry: 'T', hash: 'h', uuid: 'u' }),
  line(2, 'Node.PipelineNode.Starting', { task_id: 1, node_id: 101, name: 'N' }),
].join('\n')

describe('adapter 的来源透传', () => {
  it('给了 sourcePath 时，事件与节点都带上来源文件与行号', async () => {
    const result = await mlaRuntimeAdapter.parse({
      content,
      sourcePath: 'C:/logs/maa.log',
      sourceKey: 'C:/logs/maa.log',
    })

    expect(result.events[0]?.source?.path).toBe('C:/logs/maa.log')
    expect(result.events[0]?.source?.line).toBe(1)
    expect(result.tasks[0]?.nodes[0]?.source?.path).toBe('C:/logs/maa.log')
    expect(result.tasks[0]?.nodes[0]?.source?.line).toBe(2)
  })

  it('没给 sourcePath 时不编造路径，只保留行号（合并输入时调用方应主动留空）', async () => {
    const result = await mlaRuntimeAdapter.parse({ content })

    expect(result.events[0]?.source?.path).toBeUndefined()
    expect(result.events[0]?.source?.line).toBe(1)
    expect(result.tasks[0]?.nodes[0]?.source?.path).toBeUndefined()
  })

  it('来源透传不改变任务身份字段', async () => {
    const result = await mlaRuntimeAdapter.parse({ content, sourcePath: 'C:/logs/maa.log' })
    const [task] = result.tasks

    expect(task?.process_id).toBe('Px1')
    expect(task?.process_ids).toEqual(['Px1'])
    expect(task?.entry_source).toBe('field')
    expect(task?.has_starting_event).toBe(true)
    expect(task?.rotation_gap).toBe(false)
    expect(task?.truncated_start).toBe(false)
    expect(task?.task_execution_id).toBeTruthy()
  })
})
