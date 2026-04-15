import { describe, expect, it } from 'vitest'
import {
  buildActionFocusCardData,
  buildNodeFocusCardData,
  buildRecognitionFocusCardData,
} from './focus'

describe('focus detail builders', () => {
  it('shows both starting and terminal focus entries for action details', () => {
    const result = buildActionFocusCardData(
      {
        id: 'action-1',
        type: 'action',
        name: 'FocusNode',
        status: 'success',
        ts: '2026-04-15 00:00:00.000',
        action_id: 2,
        focus: {
          'Node.Action.Starting': '{name} start #{action_id}',
          'Node.Action.Succeeded': {
            content: '{name} -> {action_details.action}',
            display: ['log', 'toast'],
          },
        },
        action_details: {
          action_id: 2,
          action: 'Click',
          box: [0, 0, 0, 0],
          detail: {},
          name: 'FocusNode',
          success: true,
        },
      },
      {
        node_id: 1,
        name: 'FocusNode',
        ts: '2026-04-15 00:00:00.000',
        status: 'success',
        task_id: 1,
        next_list: [],
      },
    )

    expect(result?.entries).toEqual([
      {
        message: 'Node.Action.Starting',
        phase: 'starting',
        display: ['log'],
        resolvedContent: 'FocusNode start #2',
      },
      {
        message: 'Node.Action.Succeeded',
        phase: 'succeeded',
        display: ['log', 'toast'],
        resolvedContent: 'FocusNode -> Click',
      },
    ])
  })

  it('keeps only the matching starting entry when terminal focus is absent', () => {
    const result = buildActionFocusCardData(
      {
        id: 'action-2',
        type: 'action',
        name: 'FocusNode',
        status: 'success',
        ts: '2026-04-15 00:00:00.000',
        action_id: 2,
        focus: {
          'Node.Action.Starting': '{name} start #{action_id}',
        },
        action_details: {
          action_id: 2,
          action: 'Click',
          box: [0, 0, 0, 0],
          detail: {},
          name: 'FocusNode',
          success: true,
        },
      },
      {
        node_id: 1,
        name: 'FocusNode',
        ts: '2026-04-15 00:00:00.000',
        status: 'success',
        task_id: 1,
        next_list: [],
      },
    )

    expect(result?.entries).toEqual([
      {
        message: 'Node.Action.Starting',
        phase: 'starting',
        display: ['log'],
        resolvedContent: 'FocusNode start #2',
      },
    ])
  })

  it('does not show node focus card for unrelated action messages', () => {
    const result = buildNodeFocusCardData({
      node_id: 1,
      name: 'FocusNode',
      ts: '2026-04-15 00:00:00.000',
      status: 'success',
      task_id: 1,
      focus: {
        'Node.Action.Starting': 'Only action',
      },
      next_list: [],
    })

    expect(result).toBeNull()
  })

  it('supports generic focus strings for recognition details', () => {
    const result = buildRecognitionFocusCardData(
      {
        id: 'reco-1',
        type: 'recognition',
        name: 'FocusNode',
        status: 'success',
        ts: '2026-04-15 00:00:00.000',
        reco_id: 3,
        focus: 'Recognition {name}',
        reco_details: {
          reco_id: 3,
          algorithm: 'OCR',
          box: null,
          detail: {},
          name: 'FocusNode',
        },
      },
      {
        node_id: 1,
        name: 'FocusNode',
        ts: '2026-04-15 00:00:00.000',
        status: 'success',
        task_id: 1,
        next_list: [],
      },
    )

    expect(result?.entries).toEqual([
      {
        message: undefined,
        phase: undefined,
        display: ['log'],
        resolvedContent: 'Recognition FocusNode',
      },
    ])
  })

  it('falls back to the selected node_id for top-level recognition focus templates', () => {
    const result = buildRecognitionFocusCardData(
      {
        id: 'reco-2',
        type: 'recognition',
        name: 'FocusNode',
        status: 'success',
        ts: '2026-04-15 00:00:00.000',
        reco_id: 3,
        focus: {
          'Node.Recognition.Starting': 'Recognition node #{node_id}',
        },
        reco_details: {
          reco_id: 3,
          algorithm: 'OCR',
          box: null,
          detail: {},
          name: 'FocusNode',
        },
      },
      {
        node_id: 42,
        name: 'FocusNode',
        ts: '2026-04-15 00:00:00.000',
        status: 'success',
        task_id: 1,
        next_list: [],
      },
    )

    expect(result?.entries).toEqual([
      {
        message: 'Node.Recognition.Starting',
        phase: 'starting',
        display: ['log'],
        resolvedContent: 'Recognition node #42',
      },
    ])
  })

  it('falls back to the selected node_id for top-level action focus templates', () => {
    const result = buildActionFocusCardData(
      {
        id: 'action-3',
        type: 'action',
        name: 'FocusNode',
        status: 'success',
        ts: '2026-04-15 00:00:00.000',
        action_id: 2,
        focus: {
          'Node.Action.Starting': 'Action node #{node_id}',
        },
        action_details: {
          action_id: 2,
          action: 'Click',
          box: [0, 0, 0, 0],
          detail: {},
          name: 'FocusNode',
          success: true,
        },
      },
      {
        node_id: 42,
        name: 'FocusNode',
        ts: '2026-04-15 00:00:00.000',
        status: 'success',
        task_id: 1,
        next_list: [],
      },
    )

    expect(result?.entries).toEqual([
      {
        message: 'Node.Action.Starting',
        phase: 'starting',
        display: ['log'],
        resolvedContent: 'Action node #42',
      },
    ])
  })
})
