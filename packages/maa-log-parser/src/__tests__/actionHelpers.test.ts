import { describe, expect, it } from 'vitest'
import {
  resolveActionDetailsActionId,
  resolveActionEventName,
  resolveActionNodeEventId,
  resolveRuntimeStatusFromPhase,
  resolveSubTaskActionKey,
} from '../action/helpers'

describe('ActionHelpers', () => {
  it('maps known phase to runtime status', () => {
    expect(resolveRuntimeStatusFromPhase('Starting')).toBe('running')
    expect(resolveRuntimeStatusFromPhase('Succeeded')).toBe('success')
    expect(resolveRuntimeStatusFromPhase('Failed')).toBe('failed')
  })

  it('resolves action ids from details payload by priority', () => {
    expect(resolveActionDetailsActionId({
      action_details: { action_id: 101 },
      node_details: { action_id: 202 },
    })).toBe(101)
    expect(resolveActionDetailsActionId({
      node_details: { action_id: 202 },
    })).toBe(202)
    expect(resolveActionDetailsActionId({})).toBeUndefined()

    expect(resolveActionNodeEventId({
      action_details: { action_id: 303 },
      action_id: 404,
      node_id: 505,
    })).toBe(303)
    expect(resolveActionNodeEventId({
      action_id: 404,
      node_id: 505,
    })).toBe(404)
    expect(resolveActionNodeEventId({
      node_id: 505,
    })).toBe(505)
  })

  it('builds sub-task action key only when action id exists', () => {
    expect(resolveSubTaskActionKey(7, 10)).toBe('7:10')
    expect(resolveSubTaskActionKey(7, null)).toBeNull()
    expect(resolveSubTaskActionKey(7, undefined)).toBeNull()
  })

  it('resolves action display name and supports intern hook', () => {
    const interned = resolveActionEventName(
      { action_details: { name: 'ActionFromDetails' } },
      {
        fallbackName: 'Fallback',
        intern: (name) => `intern:${name}`,
      }
    )
    expect(interned).toBe('intern:ActionFromDetails')

    expect(resolveActionEventName({}, { fallbackName: 'Fallback' })).toBe('Fallback')
  })
})
