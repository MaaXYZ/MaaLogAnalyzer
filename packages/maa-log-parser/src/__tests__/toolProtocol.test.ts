import { describe, expect, it, vi } from 'vitest'
import { ANALYZER_TOOL_API_VERSION, createAnalyzerToolDispatcher } from '../service/toolProtocol'

describe('Analyzer tool protocol dispatcher', () => {
  it('preserves request metadata around a successful tool call', async () => {
    const dispatcher = createAnalyzerToolDispatcher({
      resolve_input() {
        return { content: '', source_key: 'empty.log' }
      },
    })

    const response = await dispatcher.dispatch({
      request_id: 'req-success',
      api_version: ANALYZER_TOOL_API_VERSION,
      tool: 'parse_log_bundle',
      args: {
        session_id: 'session-success',
        inputs: [{ path: '/logs/empty.log', kind: 'file' }],
      },
    })

    expect(response).toMatchObject({
      request_id: 'req-success',
      api_version: ANALYZER_TOOL_API_VERSION,
      ok: true,
      data: {
        session_id: 'session-success',
        task_count: 0,
        event_count: 0,
      },
    })
  })

  it('rejects unsupported versions before invoking a tool', async () => {
    const resolveInput = vi.fn()
    const dispatcher = createAnalyzerToolDispatcher({ resolve_input: resolveInput })

    const response = await dispatcher.dispatch({
      request_id: 'req-version',
      api_version: 'v2',
      tool: 'parse_log_bundle',
      args: { session_id: 'session-version', inputs: [] },
    })

    expect(response).toMatchObject({
      request_id: 'req-version',
      api_version: ANALYZER_TOOL_API_VERSION,
      ok: false,
      error: {
        code: 'UNSUPPORTED_VERSION',
        retryable: false,
      },
    })
    expect(resolveInput).not.toHaveBeenCalled()
  })

  it.each([
    {
      request: null,
      requestId: null,
      message: 'request must be an object',
    },
    {
      request: { api_version: 'v1', tool: 'get_task_overview', args: {} },
      requestId: null,
      message: 'request_id must be a non-empty string',
    },
    {
      request: { request_id: 'req-tool', api_version: 'v1', tool: 'missing', args: {} },
      requestId: 'req-tool',
      message: 'tool is not supported',
    },
    {
      request: { request_id: 'req-args', api_version: 'v1', tool: 'get_task_overview', args: null },
      requestId: 'req-args',
      message: 'args must be an object',
    },
  ])('rejects malformed envelopes: $message', async ({ request, requestId, message }) => {
    const response = await createAnalyzerToolDispatcher().dispatch(request)

    expect(response).toMatchObject({
      request_id: requestId,
      api_version: ANALYZER_TOOL_API_VERSION,
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message,
        retryable: false,
      },
    })
  })
})
