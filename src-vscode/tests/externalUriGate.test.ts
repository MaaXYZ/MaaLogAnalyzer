import { describe, expect, it, vi } from 'vitest'
import {
  gateExternalAnalysisUri,
  parseExternalAnalysisUri,
  type ExternalAnalysisRoute,
} from '../src/externalUriGate'

const encodePath = (targetPath: string, withBom = false): string => {
  const content = Buffer.from(targetPath, 'utf8')
  const bytes = withBom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), content]) : content
  return bytes.toString('base64')
}

const makeUri = (route: ExternalAnalysisRoute, targetPath: string, withBom = false) => ({
  path: `/open/${route}/${encodePath(targetPath, withBom)}`,
})

describe('parseExternalAnalysisUri', () => {
  it('accepts exact routes and canonical UTF-8 Base64 paths', () => {
    expect(parseExternalAnalysisUri(makeUri('analyze-file', 'C:\\logs\\maa.log'), 'win32')).toEqual(
      {
        ok: true,
        request: {
          route: 'analyze-file',
          targetPath: 'C:\\logs\\maa.log',
          isUnc: false,
        },
      },
    )

    expect(parseExternalAnalysisUri(makeUri('analyze-folder', '/var/log/maa'), 'linux')).toEqual({
      ok: true,
      request: {
        route: 'analyze-folder',
        targetPath: '/var/log/maa',
        isUnc: false,
      },
    })
  })

  it('strips one leading UTF-8 BOM emitted by the Windows helper', () => {
    const result = parseExternalAnalysisUri(
      makeUri('analyze-file', 'C:\\日志\\maa.log', true),
      'win32',
    )

    expect(result).toMatchObject({
      ok: true,
      request: { targetPath: 'C:\\日志\\maa.log' },
    })
  })

  it('rejects query fallback, fuzzy routes, queries, and fragments', () => {
    const encoded = encodePath('C:\\logs\\maa.log')

    expect(
      parseExternalAnalysisUri(
        {
          path: '/anything',
          query: `route=analyze-file&path=${encoded}`,
        },
        'win32',
      ),
    ).toEqual({ ok: false, kind: 'unrelated' })
    expect(
      parseExternalAnalysisUri(
        {
          path: `/open/analyze/${encoded}`,
        },
        'win32',
      ),
    ).toEqual({ ok: false, kind: 'invalid' })
    expect(
      parseExternalAnalysisUri(
        {
          path: `/open/analyze-file/${encoded}`,
          query: 'ignored=true',
        },
        'win32',
      ),
    ).toEqual({ ok: false, kind: 'invalid' })
    expect(
      parseExternalAnalysisUri(
        {
          path: `/open/analyze-file/${encoded}`,
          fragment: 'ignored',
        },
        'win32',
      ),
    ).toEqual({ ok: false, kind: 'invalid' })
  })

  it('rejects non-canonical Base64 and malformed UTF-8', () => {
    const malformedUtf8 = Buffer.from([0xc3, 0x28]).toString('base64')

    expect(
      parseExternalAnalysisUri(
        {
          path: '/open/analyze-file/not_base64',
        },
        'win32',
      ),
    ).toEqual({ ok: false, kind: 'invalid' })
    expect(
      parseExternalAnalysisUri(
        {
          path: `/open/analyze-file/${malformedUtf8}`,
        },
        'win32',
      ),
    ).toEqual({ ok: false, kind: 'invalid' })
  })

  it.each([
    ['relative path', 'logs\\maa.log'],
    ['unsupported file extension', 'C:\\logs\\maa.exe'],
    ['NUL', 'C:\\logs\\maa.log\0hidden'],
    ['newline', 'C:\\logs\\maa.log\r\nspoofed'],
    ['bidirectional control', 'C:\\logs\\safe\u202egol.aam'],
    ['device namespace', '\\\\?\\C:\\logs\\maa.log'],
    ['NT UNC device namespace', '\\\\??\\UNC\\server\\share\\maa.log'],
    ['reserved device component', 'C:\\NUL.log'],
    ['parent path alias', 'C:\\logs\\..\\maa.log'],
    ['trailing-space component', 'C:\\logs \\maa.log'],
    ['trailing-dot component', 'C:\\logs.\\maa.log'],
    ['alternate data stream', 'C:\\logs\\maa.log:payload'],
    ['embedded BOM', 'C:\\logs\\\ufeffmaa.log'],
  ])('rejects unsafe Windows %s', (_label, targetPath) => {
    expect(parseExternalAnalysisUri(makeUri('analyze-file', targetPath), 'win32')).toEqual({
      ok: false,
      kind: 'invalid',
    })
  })

  it('marks UNC targets for an explicit network warning', () => {
    expect(
      parseExternalAnalysisUri(makeUri('analyze-folder', '\\\\server\\share\\debug'), 'win32'),
    ).toEqual({
      ok: true,
      request: {
        route: 'analyze-folder',
        targetPath: '\\\\server\\share\\debug',
        isUnc: true,
      },
    })
  })

  it('rejects POSIX path aliases that obscure the approved target', () => {
    expect(
      parseExternalAnalysisUri(makeUri('analyze-file', '/var/log/../maa.log'), 'linux'),
    ).toEqual({ ok: false, kind: 'invalid' })
  })
})

describe('gateExternalAnalysisUri', () => {
  it('performs no inspection or open when approval is cancelled', async () => {
    const inspectPath = vi.fn(async () => 'file' as const)
    const open = vi.fn(async () => undefined)

    await expect(
      gateExternalAnalysisUri(
        makeUri('analyze-file', 'C:\\logs\\maa.log'),
        {
          confirm: vi.fn(async () => false),
          inspectPath,
          open,
        },
        'win32',
      ),
    ).resolves.toEqual({ status: 'cancelled' })

    expect(inspectPath).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('does not prompt or touch the filesystem for unrelated requests', async () => {
    const confirm = vi.fn(async () => true)
    const inspectPath = vi.fn(async () => 'file' as const)
    const open = vi.fn(async () => undefined)

    await expect(
      gateExternalAnalysisUri(
        { path: '/unrelated', query: 'path=C%3A%5Clogs%5Cmaa.log' },
        { confirm, inspectPath, open },
        'win32',
      ),
    ).resolves.toEqual({ status: 'unrelated' })

    expect(confirm).not.toHaveBeenCalled()
    expect(inspectPath).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('validates the actual type only after approval and before opening', async () => {
    const calls: string[] = []

    const result = await gateExternalAnalysisUri(
      makeUri('analyze-file', 'C:\\logs\\maa.log'),
      {
        confirm: vi.fn(async () => {
          calls.push('confirm')
          return true
        }),
        inspectPath: vi.fn(async () => {
          calls.push('inspect')
          return 'file' as const
        }),
        open: vi.fn(async () => {
          calls.push('open')
        }),
      },
      'win32',
    )

    expect(result.status).toBe('opened')
    expect(calls).toEqual(['confirm', 'inspect', 'open'])
  })

  it('does not open a target whose approved route disagrees with its type', async () => {
    const open = vi.fn(async () => undefined)

    const result = await gateExternalAnalysisUri(
      makeUri('analyze-file', 'C:\\logs\\maa.log'),
      {
        confirm: vi.fn(async () => true),
        inspectPath: vi.fn(async () => 'folder' as const),
        open,
      },
      'win32',
    )

    expect(result).toMatchObject({ status: 'type-mismatch', actualKind: 'folder' })
    expect(open).not.toHaveBeenCalled()
  })
})
