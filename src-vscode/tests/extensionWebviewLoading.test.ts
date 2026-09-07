import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createVSCodeByteTransferHandler } from '../../src/views/process/composables/fileLoader/useVSCodeBridge'

const host = vi.hoisted(() => ({
  commands: new Map<string, (uri: unknown) => Promise<void>>(),
  createPanel: vi.fn(),
  showErrorMessage: vi.fn(),
}))

vi.mock('vscode', () => {
  class Uri {
    constructor(readonly path: string) {}
    get fsPath() {
      return this.path
    }
    static file(path: string) {
      return new Uri(path)
    }
    static joinPath(base: Uri, ...parts: string[]) {
      return new Uri([base.path, ...parts].join('/'))
    }
    with(change: { path: string }) {
      return new Uri(change.path)
    }
    toString() {
      return `file://${this.path}`
    }
  }
  const disposable = () => ({ dispose() {} })
  return {
    Uri,
    TreeItem: class {},
    TreeItemCollapsibleState: { None: 0 },
    ViewColumn: { One: 1 },
    FileType: { File: 1, Directory: 2 },
    RelativePattern: class {
      constructor(
        readonly base: Uri,
        readonly pattern: string,
      ) {}
    },
    l10n: { t: (message: string) => message },
    env: { language: 'en' },
    commands: {
      registerCommand: (name: string, callback: (uri: unknown) => Promise<void>) => {
        host.commands.set(name, callback)
        return disposable()
      },
    },
    window: {
      activeColorTheme: { kind: 2 },
      createWebviewPanel: host.createPanel,
      showErrorMessage: host.showErrorMessage,
      onDidChangeActiveColorTheme: disposable,
      createTreeView: disposable,
      registerUriHandler: disposable,
    },
    workspace: {
      findFiles: async ({ base, pattern }: { base: Uri; pattern: string }) =>
        pattern === '**/maa.log' ? [Uri.joinPath(base, 'maa.log')] : [],
      fs: {
        stat: async (uri: Uri) => {
          if (
            uri.path.endsWith('/vision') ||
            (uri.path.includes('/plain') && uri.path.endsWith('/on_error'))
          ) {
            throw new Error('Not found')
          }
          return { type: uri.path.endsWith('.log') ? 1 : 2, size: 3 }
        },
        readFile: async () => new TextEncoder().encode('log'),
        readDirectory: async () => [],
      },
    },
  }
})

describe('extension loading across image-resource permission changes', () => {
  let disposePanel: () => void
  let deactivate: () => void
  let analyzeFolder: (uri: unknown) => Promise<void>
  let analyzeFile: (uri: unknown) => Promise<void>
  let makeUri: (path: string) => unknown
  let onUploadContent: ReturnType<typeof vi.fn>
  let events: string[]

  beforeEach(async () => {
    vi.resetModules()
    host.commands.clear()
    host.showErrorMessage.mockClear()
    onUploadContent = vi.fn()
    events = []
    host.createPanel.mockImplementation((_kind, _title, _column, initialOptions) => {
      let options = initialOptions
      let receive = (_message: unknown) => {}
      let onDispose = () => {}
      const newReceiver = () =>
        createVSCodeByteTransferHandler(
          { onUploadContent, onFileLoadingStart: vi.fn(), onFileLoadingEnd: vi.fn() },
          (message) => receive(message),
        )
      let receiver = newReceiver()
      const ready = () =>
        queueMicrotask(() => {
          events.push('ready')
          receive({ type: 'fileReceiverReady' })
        })
      const panel = {
        reveal() {},
        onDidDispose(callback: () => void) {
          onDispose = callback
        },
        dispose() {
          receiver.dispose()
          onDispose()
        },
        webview: {
          get options() {
            return options
          },
          set options(value) {
            // The real editor recreates the document when localResourceRoots change.
            // Losing this receiver during a transfer reproduces the reported error.
            events.push('reload')
            receiver.dispose()
            receiver = newReceiver()
            options = value
            ready()
          },
          set html(_value: string) {
            ready()
          },
          asWebviewUri(uri: unknown) {
            return uri
          },
          onDidReceiveMessage(callback: typeof receive) {
            receive = callback
          },
          async postMessage(message: { type: string }) {
            events.push(message.type)
            receiver.handleMessage(message)
            return true
          },
        },
      }
      disposePanel = () => panel.dispose()
      return panel
    })
    const vscode = await import('vscode')
    const extension = await import('../src/extension')
    extension.activate({ extensionUri: vscode.Uri.file('/extension'), subscriptions: [] } as never)
    deactivate = extension.deactivate
    makeUri = vscode.Uri.file
    analyzeFolder = host.commands.get('maaLogAnalyzer.analyzeFolder')!
    analyzeFile = host.commands.get('maaLogAnalyzer.analyzeFile')!
  })

  afterEach(() => {
    disposePanel?.()
    deactivate?.()
  })

  it('finishes the permission-triggered reload before a cold folder transfer starts', async () => {
    await analyzeFolder(makeUri('/debug'))
    expect(host.showErrorMessage).not.toHaveBeenCalled()
    expect(onUploadContent).toHaveBeenCalledOnce()
    expect(events.filter((event) => event !== 'vscodeThemeChanged')).toEqual([
      'ready',
      'reload',
      'ready',
      'loadBytesStart',
      'loadBytesFileStart',
      'loadBytesChunk',
      'loadBytesFileComplete',
      'loadBytesComplete',
    ])
  })

  it('reuses unchanged image roots and survives switching to another folder or no images', async () => {
    await analyzeFolder(makeUri('/debug'))
    await analyzeFolder(makeUri('/debug'))
    expect(events.filter((event) => event === 'reload')).toHaveLength(1)
    await analyzeFolder(makeUri('/other/debug'))
    await analyzeFolder(makeUri('/plain'))
    expect(events.filter((event) => event === 'reload')).toHaveLength(3)
    expect(onUploadContent).toHaveBeenCalledTimes(4)
    expect(host.showErrorMessage).not.toHaveBeenCalled()
  })

  it('also waits for updated image permissions when opening a log file directly', async () => {
    await analyzeFile(makeUri('/debug/maa.log'))
    await analyzeFile(makeUri('/other/debug/maa.log'))
    expect(onUploadContent).toHaveBeenCalledTimes(2)
    expect(host.showErrorMessage).not.toHaveBeenCalled()
  })
})
