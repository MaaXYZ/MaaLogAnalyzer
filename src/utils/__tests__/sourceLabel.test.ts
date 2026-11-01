import { describe, expect, it } from 'vitest'
import { describeSourceRef } from '../sourceLabel'

describe('describeSourceRef', () => {
  it('取路径最后一段作为展示文件名，并保留完整路径与行号', () => {
    expect(describeSourceRef({ path: 'C:\\logs\\maa.bak.log', line: 42, inputIndex: 1 })).toEqual({
      file: 'maa.bak.log',
      path: 'C:\\logs\\maa.bak.log',
      line: 42,
    })
    expect(describeSourceRef({ path: '/home/u/logs/maafw.log', line: 7 })).toEqual({
      file: 'maafw.log',
      path: '/home/u/logs/maafw.log',
      line: 7,
    })
  })

  it('只有输入序号时退回「输入 #N」，不编造文件名', () => {
    expect(describeSourceRef({ inputIndex: 0, line: 3 })).toEqual({ file: '输入 #1', line: 3 })
  })

  it('什么都没有时返回 null（调用方据此不渲染这一行）', () => {
    expect(describeSourceRef(null)).toBeNull()
    expect(describeSourceRef(undefined)).toBeNull()
    expect(describeSourceRef({})).toBeNull()
    expect(describeSourceRef({ line: 0 })).toBeNull()
  })

  it('行号非法就不带行号，但文件名仍然给出', () => {
    expect(describeSourceRef({ path: 'a.log', line: -1 })).toEqual({
      file: 'a.log',
      path: 'a.log',
      line: undefined,
    })
  })
})
