import { describe, expect, it } from 'vitest'
import { resolveResultStatusButtonType, resolveStatusButtonType } from '../statusButtonType'

describe('resolveStatusButtonType', () => {
  it('maps success/running/failed to success/info/warning', () => {
    expect(resolveStatusButtonType('success')).toBe('success')
    expect(resolveStatusButtonType('running')).toBe('info')
    expect(resolveStatusButtonType('failed')).toBe('warning')
  })

  it('falls back to default for unknown statuses', () => {
    expect(resolveStatusButtonType('not-recognized')).toBe('default')
    expect(resolveStatusButtonType('')).toBe('default')
  })
})

describe('resolveResultStatusButtonType', () => {
  it('maps success/running to success/warning and others to error', () => {
    expect(resolveResultStatusButtonType('success')).toBe('success')
    expect(resolveResultStatusButtonType('running')).toBe('warning')
    expect(resolveResultStatusButtonType('failed')).toBe('error')
    expect(resolveResultStatusButtonType('not-recognized')).toBe('error')
  })
})
