import { describe, expect, it } from 'vitest'
import { buildTaskIdentity, isSameTask } from '../taskIdentity'

const base = {
  task_id: 1,
  start_time: '2026-04-06 10:00:00.000',
  entry: 'T',
  hash: 'h',
  uuid: 'u',
  _startEventIndex: 5,
} as const

describe('task identity 优先使用 task_execution_id', () => {
  it('两个任务有 execution id 时，以它为准（同进程重复执行也不会混）', () => {
    const first = { ...base, task_execution_id: 'task:1:1:seq5' }
    const second = { ...base, task_execution_id: 'task:1:1:seq99' }

    expect(isSameTask(first, second)).toBe(false)
    expect(buildTaskIdentity(first)).toBe('exec:task:1:1:seq5')
    expect(buildTaskIdentity(second)).toBe('exec:task:1:1:seq99')
  })

  it('缺 execution id 的旧对象仍按原规则比较（回退路径不变）', () => {
    const legacy = { ...base }
    const legacySame = { ...base }
    expect(isSameTask(legacy, legacySame)).toBe(true)
    expect(buildTaskIdentity(legacy)).toBe('startEvent:5')
  })

  it('一边有 execution id、一边没有时退回旧规则（旧快照仍能对上同一个任务）', () => {
    const withId = { ...base, task_execution_id: 'task:1:1:seq5' }
    const withoutId = { ...base }

    // 缺字段的一侧按历史规则（_startEventIndex）比较 —— 这是回退路径存在的意义：
    // 旧快照/被裁剪的对象没有新字段时，选中同步仍要能对上。
    expect(isSameTask(withId, withoutId)).toBe(true)

    // 但只要起始事件不同，就仍然判为不同任务
    expect(isSameTask(withId, { ...withoutId, _startEventIndex: 6 })).toBe(false)
  })
})
