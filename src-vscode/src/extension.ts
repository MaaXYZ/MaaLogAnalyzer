import * as vscode from 'vscode'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { copyFile, mkdir, rm } from 'fs/promises'
import {
  canonicalizeArchivePath,
  classifyNeededArchiveEntry,
  createArchiveSelection,
  inspectArchiveVolumes,
  isLoadOperationCancelled,
  LoadOperationCoordinator,
  readSelectedArchiveVolumes,
  type ArchiveVolumeInput,
  type LoadOperation,
} from './archiveReader'
import {
  gateExternalAnalysisUri,
  type ExternalAnalysisRequest,
  type ExternalPathKind,
} from './externalUriGate'
import {
  normalizeEditorUriScheme,
  WINDOWS_CONTEXT_MENU_KEYS,
} from './windowsContextMenu'
import {
  WebviewByteTransferAckBroker,
  WebviewByteTransferSender,
} from './webviewByteTransfer'

let currentPanel: vscode.WebviewPanel | undefined = undefined
let webviewAssetRoot: vscode.Uri | undefined
const loadOperationCoordinator = new LoadOperationCoordinator()
const byteTransferAcknowledgements = new WebviewByteTransferAckBroker()
const execFileAsync = promisify(execFile)
const t = (message: string, ...args: Array<string | number | boolean>) => (
  vscode.l10n.t(message, ...args)
)

const PRIMARY_LOG_FILE_HINT = 'maa.log / maa.bak*.log / maafw.log / maafw.bak*.log'
const MAIN_LOG_RE = /^(maa|maafw)\.log$/i
const BAK_LOG_RE = /^(maa|maafw)\.bak(?:\.(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}\.\d{1,3}))?\.log$/i

const beginLoadOperation = (): LoadOperation => {
  byteTransferAcknowledgements.cancelAll(new Error('Load operation was superseded'))
  return loadOperationCoordinator.begin()
}

const createByteTransfer = (operation: LoadOperation): WebviewByteTransferSender => {
  const webview = currentPanel?.webview
  if (!webview) throw new Error(t('The analyzer panel is not available'))
  return new WebviewByteTransferSender(webview, operation, byteTransferAcknowledgements)
}

const showLoadError = (
  prefix: string,
  error: unknown,
  operation: LoadOperation,
): void => {
  if (operation.cancelled || isLoadOperationCancelled(error)) return
  vscode.window.showErrorMessage(`${prefix}: ${error}`)
}

type PrimaryLogKind = 'main' | 'bak'

interface PrimaryLogCandidate {
  path: string
  dirPath: string
  fileName: string
  normalizedName: string
  kind: PrimaryLogKind
  rotatedTimestampHint: string | null
}

interface PrimaryLogSelectionEntry {
  path: string
  name: string
  kind: PrimaryLogKind
  rotatedTimestampHint: string | null
  size: number
}

interface PrimaryLogQuickPickItem extends vscode.QuickPickItem {
  logPath: string
}

const formatLogSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 多个主日志候选时先让用户选择，避免把数百 MB 的历史日志一次性送进 webview。
 * 默认只选择当前日志；没有当前日志时，选择最新的备份日志。
 */
async function pickPrimaryLogSelection(
  entries: PrimaryLogSelectionEntry[],
): Promise<Set<string> | null> {
  if (entries.length <= 1) {
    return new Set(entries.map(entry => entry.path))
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'main' ? -1 : 1
    return (b.rotatedTimestampHint ?? '').localeCompare(a.rotatedTimestampHint ?? '')
  })

  const mainEntries = sorted.filter(entry => entry.kind === 'main')
  const defaultEntries = mainEntries.length > 0 ? mainEntries : sorted.slice(0, 1)
  const defaultPicked = new Set(defaultEntries.map(entry => entry.path))

  const items: PrimaryLogQuickPickItem[] = sorted.map(entry => ({
    label: entry.name,
    description: entry.kind === 'main' ? t('Current log') : t('Backup log'),
    detail: `${formatLogSize(entry.size)}${entry.rotatedTimestampHint ? ` · ${entry.rotatedTimestampHint}` : ''}`,
    picked: defaultPicked.has(entry.path),
    logPath: entry.path,
  }))

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: t('Select logs to load (default {0}/{1})', defaultPicked.size, entries.length),
    placeHolder: t('Select logs to analyze; historical backup logs can be loaded as needed'),
    ignoreFocusOut: true,
  })

  if (!picked || picked.length === 0) return null
  return new Set(picked.map(item => item.logPath))
}

const normalizeTimestampMilliseconds = (value: string): string => {
  const lastDot = value.lastIndexOf('.')
  if (lastDot < 0) return value
  const ms = value.slice(lastDot + 1)
  if (!/^\d{1,3}$/.test(ms)) return value
  return `${value.slice(0, lastDot)}.${ms.padEnd(3, '0')}`
}

const getParentUri = (uri: vscode.Uri): vscode.Uri => uri.with({
  path: path.posix.dirname(uri.path),
})

const getPrimaryLogCandidate = (rawPath: string, rawName?: string): PrimaryLogCandidate | null => {
  const normalizedPath = rawPath.replace(/\\/g, '/')
  const fileName = rawName ?? path.posix.basename(normalizedPath)
  const normalizedName = fileName.trim().toLowerCase()

  const mainMatch = normalizedName.match(MAIN_LOG_RE)
  if (mainMatch) {
    return {
      path: normalizedPath,
      dirPath: path.posix.dirname(normalizedPath) === '.' ? '' : path.posix.dirname(normalizedPath),
      fileName,
      normalizedName,
      kind: 'main',
      rotatedTimestampHint: null,
    }
  }

  const bakMatch = normalizedName.match(BAK_LOG_RE)
  if (!bakMatch) return null

  return {
    path: normalizedPath,
    dirPath: path.posix.dirname(normalizedPath) === '.' ? '' : path.posix.dirname(normalizedPath),
    fileName,
    normalizedName,
    kind: 'bak',
    rotatedTimestampHint: bakMatch[2] ? normalizeTimestampMilliseconds(bakMatch[2]) : null,
  }
}

const selectPrimaryLogGroup = <T extends { path: string; name: string }>(entries: T[]) => {
  const groups = new Map<string, Array<{ item: T; candidate: PrimaryLogCandidate }>>()

  for (const item of entries) {
    const candidate = getPrimaryLogCandidate(item.path, item.name)
    if (!candidate) continue
    const bucket = groups.get(candidate.dirPath) ?? []
    bucket.push({ item, candidate })
    groups.set(candidate.dirPath, bucket)
  }

  const rankedGroups = Array.from(groups.entries()).map(([dirPath, group]) => {
    const mainCount = group.filter(entry => entry.candidate.kind === 'main').length
    const depth = dirPath ? dirPath.split('/').filter(Boolean).length : 0
    return {
      dirPath,
      group,
      hasMain: mainCount > 0,
      mainCount,
      count: group.length,
      depth,
    }
  })

  rankedGroups.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth
    if (a.hasMain !== b.hasMain) return a.hasMain ? -1 : 1
    if (a.mainCount !== b.mainCount) return b.mainCount - a.mainCount
    if (a.count !== b.count) return b.count - a.count
    return a.dirPath.localeCompare(b.dirPath)
  })

  return rankedGroups[0]?.group ?? []
}

const postThemeChangedToWebview = (panel: vscode.WebviewPanel | undefined) => {
  panel?.webview.postMessage({
    type: 'vscodeThemeChanged',
    kind: vscode.window.activeColorTheme.kind,
  })
}

class SidebarActionItem extends vscode.TreeItem {
  constructor(label: string, commandId: string, contextValue: string) {
    super(label, vscode.TreeItemCollapsibleState.None)
    this.contextValue = contextValue
    this.command = { command: commandId, title: label }
  }
}

class SidebarActionProvider implements vscode.TreeDataProvider<SidebarActionItem> {
  getTreeItem(element: SidebarActionItem): vscode.TreeItem {
    return element
  }

  getChildren(): SidebarActionItem[] {
    const items: SidebarActionItem[] = [
      new SidebarActionItem(t('Open Analyzer'), 'maaLogAnalyzer.openAnalyzer', 'openAnalyzer'),
      new SidebarActionItem(t('Analyze File/Folder'), 'maaLogAnalyzer.analyzeFolder', 'analyzeFolder'),
    ]
    if (process.platform === 'win32') {
      items.push(
        new SidebarActionItem(t('Install Windows Context Menu'), 'maaLogAnalyzer.installContextMenu', 'installContextMenu'),
        new SidebarActionItem(t('Uninstall Windows Context Menu'), 'maaLogAnalyzer.uninstallContextMenu', 'uninstallContextMenu'),
      )
    }
    return items
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Maa Log Analyzer extension is now active!')

  // 注册打开分析器命令
  const openAnalyzerCommand = vscode.commands.registerCommand('maaLogAnalyzer.openAnalyzer', () => {
    createOrShowPanel(context)
  })

  // 注册分析文件夹命令（资源管理器右键或侧边栏入口）
  const analyzeFolderCommand = vscode.commands.registerCommand(
    'maaLogAnalyzer.analyzeFolder',
    async (uri?: vscode.Uri) => {
      const targetUri = uri ?? (await pickUriForAnalysis())

      if (targetUri) {
        createOrShowPanel(context)
        await analyzeUri(targetUri)
      }
    },
  )

  const analyzeFileCommand = vscode.commands.registerCommand(
    'maaLogAnalyzer.analyzeFile',
    async (uri?: vscode.Uri) => {
      const targetUri = uri ?? getActiveFileUri() ?? await pickFileUriForAnalysis()
      if (!targetUri) return

      createOrShowPanel(context)
      await analyzeFileUri(targetUri)
    },
  )

  const installContextMenuCommand = vscode.commands.registerCommand(
    'maaLogAnalyzer.installContextMenu',
    async () => {
      await installWindowsContextMenu(context)
    },
  )

  const uninstallContextMenuCommand = vscode.commands.registerCommand(
    'maaLogAnalyzer.uninstallContextMenu',
    async () => {
      await uninstallWindowsContextMenu(context)
    },
  )
  const sidebarProvider = new SidebarActionProvider()
  const sidebarView = vscode.window.createTreeView('maaLogAnalyzer.sidebar', {
    treeDataProvider: sidebarProvider,
    showCollapseAll: false,
  })

  const uriHandler = vscode.window.registerUriHandler({
    handleUri: async (uri: vscode.Uri) => {
      try {
        const result = await gateExternalAnalysisUri(
          { path: uri.path, query: uri.query, fragment: uri.fragment },
          {
            confirm: confirmExternalAnalysisRequest,
            inspectPath: inspectExternalAnalysisTarget,
            open: async request => {
              const targetUri = vscode.Uri.file(request.targetPath)
              createOrShowPanel(context)
              if (request.route === 'analyze-file') {
                await analyzeFileUri(targetUri)
              } else {
                await analyzeFolderUri(targetUri)
              }
            },
          },
        )

        if (result.status === 'invalid') {
          vscode.window.showWarningMessage(
            t('Rejected an invalid external analysis request.'),
          )
        } else if (result.status === 'type-mismatch') {
          const expected = result.request.route === 'analyze-file'
            ? t('a log file')
            : t('a log folder')
          vscode.window.showErrorMessage(
            t('The approved path is not {0}.', expected),
          )
        }
      } catch (error) {
        vscode.window.showErrorMessage(t('Unable to handle external open request: {0}', String(error)))
      }
    },
  })

  context.subscriptions.push(openAnalyzerCommand, analyzeFolderCommand, analyzeFileCommand, installContextMenuCommand, uninstallContextMenuCommand, sidebarView, uriHandler)
}

async function confirmExternalAnalysisRequest(request: ExternalAnalysisRequest): Promise<boolean> {
  const approveLabel = t('Open and Analyze')
  const targetKind = request.route === 'analyze-file'
    ? t('file')
    : t('folder')
  const message = request.isUnc
    ? t('An external application requested access to a network {0}.', targetKind)
    : t('An external application requested access to a local {0}.', targetKind)
  const detail = request.isUnc
    ? t('Network path: {0}\n\nThis can contact a remote server. Continue only if you trust the application and network location that sent this request.', request.targetPath)
    : t('Path: {0}\n\nContinue only if you initiated or trust this request.', request.targetPath)

  const action = await vscode.window.showWarningMessage(
    message,
    { modal: true, detail },
    approveLabel,
  )
  return action === approveLabel
}

async function inspectExternalAnalysisTarget(request: ExternalAnalysisRequest): Promise<ExternalPathKind> {
  const stat = await vscode.workspace.fs.stat(vscode.Uri.file(request.targetPath))
  if ((stat.type & vscode.FileType.Directory) === vscode.FileType.Directory) return 'folder'
  if ((stat.type & vscode.FileType.File) === vscode.FileType.File) return 'file'
  return 'other'
}

function createOrShowPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  const column = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined

  // 如果已有面板，直接显示
  if (currentPanel) {
    currentPanel.reveal(column)
    postThemeChangedToWebview(currentPanel)
    return currentPanel
  }

  // 创建新面板
  webviewAssetRoot = vscode.Uri.joinPath(context.extensionUri, 'webview')
  currentPanel = vscode.window.createWebviewPanel(
    'maaLogAnalyzer',
    t('MAA Log Analyzer'),
    column || vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        webviewAssetRoot,
      ]
    }
  )

  // 设置 HTML 内容
  currentPanel.webview.html = getWebviewContent(currentPanel.webview, context.extensionUri)

  const themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme(() => {
    postThemeChangedToWebview(currentPanel)
  })

  // 初始同步一次，确保 webview 内部主题状态与宿主一致
  postThemeChangedToWebview(currentPanel)

  // 处理来自 Webview 的消息
  currentPanel.webview.onDidReceiveMessage(
    async (message: any) => {
      switch (message.type) {
        case 'loadBytesAck': {
          if (typeof message.transferId === 'string' && Number.isSafeInteger(message.sequence)) {
            byteTransferAcknowledgements.acknowledge(
              message.transferId,
              message.sequence,
              typeof message.error === 'string' ? message.error : undefined,
            )
          }
          break
        }

        case 'openFile': {
          const fileOperation = beginLoadOperation()
          // 打开文件选择对话框
          const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: {
              [t('Log Files')]: ['log', 'jsonl', 'txt', 'zip']
            },
            title: t('Select Log File')
          })

          if (fileUri && fileUri[0]) {
            await analyzeFileUri(fileUri[0], fileOperation)
          }
          break
        }

        case 'openFolder': {
          const folderOperation = beginLoadOperation()
          const folderUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            canSelectFolders: true,
            canSelectFiles: false,
            title: t('Select Log Folder'),
          })

          if (folderUri && folderUri[0]) {
            await analyzeFolderUri(folderUri[0], folderOperation)
          }
          break
        }

        case 'showError':
          vscode.window.showErrorMessage(message.message)
          break
          
        case 'showInfo':
          vscode.window.showInformationMessage(message.message)
          break

        case 'copyText':
          if (typeof message.text === 'string') {
            await vscode.env.clipboard.writeText(message.text)
          }
          break

        case 'openMseCrop': {
          if (typeof message.image !== 'string' || !message.image.startsWith('data:image/')) {
            vscode.window.showErrorMessage(t('Unable to open MSE crop tool: invalid image data'))
            break
          }

          const mseExtension = vscode.extensions.getExtension('nekosu.maa-support')
          if (!mseExtension) {
            vscode.window.showWarningMessage(t('Maa Pipeline Support is not installed or enabled'))
            break
          }

          try {
            await mseExtension.activate()
            const result = await vscode.commands.executeCommand<{ imageAccepted?: boolean }>('maa.open-crop', {
              image: message.image,
              detail: typeof message.detail === 'object' && message.detail !== null
                ? message.detail
                : undefined,
            })
            if (result?.imageAccepted !== true) {
              vscode.window.showWarningMessage(t('The current Maa Pipeline Support version cannot receive images. Update it and try again.'))
            }
          } catch (error) {
            vscode.window.showErrorMessage(t('Unable to open MSE crop tool: {0}', String(error)))
          }
          break
        }
      }
    },
    undefined,
    context.subscriptions
  )

  // 面板关闭时清理
  currentPanel.onDidDispose(
    () => {
      themeChangeDisposable.dispose()
      loadOperationCoordinator.cancelCurrent()
      byteTransferAcknowledgements.cancelAll(new Error('The analyzer panel was closed'))
      currentPanel = undefined
    },
    undefined,
    context.subscriptions
  )

  return currentPanel
}

async function analyzeFileUri(
  uri: vscode.Uri,
  operation: LoadOperation = beginLoadOperation(),
): Promise<void> {
  let transfer: WebviewByteTransferSender | undefined
  try {
    operation.throwIfCancelled()
    if (uri.fsPath.toLowerCase().endsWith('.zip')) {
      await handleZipFile(uri, operation)
      return
    }

    const fileName = path.basename(uri.fsPath)
    const fileContent = await vscode.workspace.fs.readFile(uri)
    operation.throwIfCancelled()
    const debugAssets = await collectDebugAssetsForBaseDirectory(
      vscode.Uri.file(path.dirname(uri.fsPath)),
      operation,
    )
    operation.throwIfCancelled()

    transfer = createByteTransfer(operation)
    await transfer.start({
      fileName,
      errorImages: debugAssets.errorImages,
      visionImages: debugAssets.visionImages,
      waitFreezesImages: debugAssets.waitFreezesImages,
    })
    await transfer.sendFile({
      kind: 'primary',
      path: uri.path,
      name: fileName,
      bytes: fileContent,
    })
    await transfer.complete()
  } catch (error) {
    await transfer?.abort(error instanceof Error ? error.message : String(error))
    showLoadError(t('Unable to read file'), error, operation)
  }
}

function getActiveFileUri(): vscode.Uri | undefined {
  const uri = vscode.window.activeTextEditor?.document.uri
  return uri?.scheme === 'file' ? uri : undefined
}

async function pickFileUriForAnalysis(): Promise<vscode.Uri | undefined> {
  const selected = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFolders: false,
    canSelectFiles: true,
    filters: { [t('Log Files')]: ['log', 'jsonl', 'txt', 'zip'] },
    title: t('Select Log File'),
  })

  return selected?.[0]
}

async function pickUriForAnalysis(): Promise<vscode.Uri | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: t('Log File'), value: 'file' as const },
      { label: t('Log Folder'), value: 'folder' as const },
    ],
    {
      title: t('Choose what to analyze'),
      placeHolder: t('Select file or folder'),
      ignoreFocusOut: true,
    },
  )

  if (!choice) return undefined

  if (choice.value === 'file') {
    return pickFileUriForAnalysis()
  }

  const selected = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFolders: true,
    canSelectFiles: false,
    title: t('Select Log Folder'),
  })

  return selected?.[0]
}

async function analyzeUri(
  uri: vscode.Uri,
  operation: LoadOperation = beginLoadOperation(),
): Promise<void> {
  try {
    operation.throwIfCancelled()
    const stat = await vscode.workspace.fs.stat(uri)
    operation.throwIfCancelled()
    if ((stat.type & vscode.FileType.Directory) === vscode.FileType.Directory) {
      await analyzeFolderUri(uri, operation)
      return
    }
  } catch (error) {
    if (isLoadOperationCancelled(error) || operation.cancelled) return
    // fallback to extension-based detection below
  }

  operation.throwIfCancelled()
  const lower = uri.fsPath.toLowerCase()
  const looksLikeFile = lower.endsWith('.zip') || lower.endsWith('.log') || lower.endsWith('.jsonl') || lower.endsWith('.txt')
  if (looksLikeFile) {
    await analyzeFileUri(uri, operation)
    return
  }

  await analyzeFolderUri(uri, operation)
}

async function analyzeFolderUri(
  folderUri: vscode.Uri,
  operation: LoadOperation = beginLoadOperation(),
): Promise<void> {
  let transfer: WebviewByteTransferSender | undefined
  try {
    operation.throwIfCancelled()
    const candidatePatterns = [
      '**/maa.log',
      '**/maafw.log',
      '**/maa.bak*.log',
      '**/maafw.bak*.log',
    ].map(pattern => new vscode.RelativePattern(folderUri, pattern))
    const candidateLists = await Promise.all(
      candidatePatterns.map(pattern => vscode.workspace.findFiles(pattern, '**/node_modules/**', 200)),
    )
    operation.throwIfCancelled()

    const primaryLogUris = candidateLists
      .flat()
      .filter((uri: vscode.Uri, index: number, all: vscode.Uri[]) => all.findIndex((other: vscode.Uri) => other.toString() === uri.toString()) === index)
      .filter((uri: vscode.Uri) => getPrimaryLogCandidate(uri.path, path.posix.basename(uri.path)) != null)

    const primaryLogEntries: Array<{ uri: vscode.Uri; path: string; name: string }> = primaryLogUris.map((uri: vscode.Uri) => ({
      uri,
      path: uri.path,
      name: path.posix.basename(uri.path),
    }))
    const selectedLogs = selectPrimaryLogGroup(primaryLogEntries)

    if (selectedLogs.length === 0) {
      const splitZipUri = await findFirstMxuZipVolumeUri(folderUri, operation)
      operation.throwIfCancelled()
      if (splitZipUri) {
        await handleZipFile(splitZipUri, operation)
        return
      }
      vscode.window.showErrorMessage(
        t('No log file was found in the folder ({0})', PRIMARY_LOG_FILE_HINT),
      )
      return
    }

    const selectionEntries = await Promise.all(
      selectedLogs.map(async ({ item, candidate }) => {
        const stat = await vscode.workspace.fs.stat(item.uri)
        operation.throwIfCancelled()
        return {
          path: item.path,
          name: item.name,
          kind: candidate.kind,
          rotatedTimestampHint: candidate.rotatedTimestampHint,
          size: stat.size,
        } satisfies PrimaryLogSelectionEntry
      }),
    )
    operation.throwIfCancelled()
    const selectedPaths = await pickPrimaryLogSelection(selectionEntries)
    operation.throwIfCancelled()
    if (!selectedPaths) return

    const selectedLogEntries = selectedLogs.filter(({ item }) => selectedPaths.has(item.path))

    const targetMain = selectedLogEntries.find(({ candidate }) => candidate.kind === 'main')?.item.uri
    const selectedBaseDir = selectedLogEntries[0]
      ? getParentUri(selectedLogEntries[0].item.uri)
      : folderUri
    const sourceName = targetMain
      ? path.posix.basename(getParentUri(targetMain).path)
      : path.posix.basename(selectedBaseDir.path || folderUri.path)
    const contentBaseDir = targetMain
      ? getParentUri(targetMain)
      : selectedBaseDir

    transfer = createByteTransfer(operation)
    await transfer.start({ fileName: sourceName })

    for (const { item } of selectedLogEntries) {
      operation.throwIfCancelled()
      const bytes = await vscode.workspace.fs.readFile(item.uri)
      operation.throwIfCancelled()
      await transfer.sendFile({
        kind: 'primary',
        path: item.path,
        name: item.name,
        bytes,
      })
    }

    const debugAssets = await collectDebugAssetsForBaseDirectory(
      contentBaseDir,
      operation,
    )
    operation.throwIfCancelled()

    await transfer.complete({
      errorImages: debugAssets.errorImages,
      visionImages: debugAssets.visionImages,
      waitFreezesImages: debugAssets.waitFreezesImages,
    })
  } catch (error) {
    await transfer?.abort(error instanceof Error ? error.message : String(error))
    showLoadError(t('Unable to read folder'), error, operation)
  }
}

async function pathExists(uri: vscode.Uri, operation: LoadOperation): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri)
    operation.throwIfCancelled()
    return true
  } catch (error) {
    operation.throwIfCancelled()
    return false
  }
}

type DebugImageKind = 'error' | 'vision' | 'wait-freezes'

interface DebugImageCandidate {
  uri: vscode.Uri
  name: string
  key: string
  kind: DebugImageKind
}

interface DebugImageResource {
  key: string
  url: string
}

const configureWebviewImageRoot = (imageRoot?: vscode.Uri): vscode.Webview => {
  const webview = currentPanel?.webview
  if (!webview) throw new Error(t('The analyzer panel is not available'))
  const localResourceRoots = [
    ...(webviewAssetRoot ? [webviewAssetRoot] : []),
    ...(imageRoot ? [imageRoot] : []),
  ]
  webview.options = {
    ...webview.options,
    localResourceRoots,
  }
  return webview
}

async function listImageDirectoryEntries(
  dirUri: vscode.Uri,
  classify: (fileName: string) => { key: string; kind: DebugImageKind } | null,
  operation: LoadOperation,
): Promise<DebugImageCandidate[]> {
  if (!(await pathExists(dirUri, operation))) return []
  operation.throwIfCancelled()

  const candidates: DebugImageCandidate[] = []
  const entries = await vscode.workspace.fs.readDirectory(dirUri)
  operation.throwIfCancelled()
  for (const [name, type] of entries) {
    operation.throwIfCancelled()
    if (type !== vscode.FileType.File) continue
    const classified = classify(name)
    if (!classified) continue
    const uri = vscode.Uri.joinPath(dirUri, name)
    candidates.push({ uri, name, ...classified })
  }
  return candidates
}

async function collectDebugAssetsForBaseDirectory(
  baseDirUri: vscode.Uri,
  operation: LoadOperation,
): Promise<{
  errorImages: DebugImageResource[]
  visionImages: DebugImageResource[]
  waitFreezesImages: DebugImageResource[]
}> {
  const baseName = path.posix.basename(baseDirUri.path).toLowerCase()
  const candidateDirs = baseName === 'debug'
    ? [baseDirUri]
    : [baseDirUri, vscode.Uri.joinPath(baseDirUri, 'debug')]
  let debugDirUri: vscode.Uri | undefined

  for (const candidate of candidateDirs) {
    operation.throwIfCancelled()
    const hasOnError = await pathExists(vscode.Uri.joinPath(candidate, 'on_error'), operation)
    operation.throwIfCancelled()
    const hasVision = await pathExists(vscode.Uri.joinPath(candidate, 'vision'), operation)
    operation.throwIfCancelled()
    if (hasOnError || hasVision) {
      debugDirUri = candidate
      break
    }
  }

  if (!debugDirUri) {
    configureWebviewImageRoot()
    return { errorImages: [], visionImages: [], waitFreezesImages: [] }
  }

  const candidates = await listImageDirectoryEntries(
    vscode.Uri.joinPath(debugDirUri, 'on_error'),
    (name) => {
      const key = parseErrorImageKey(name)
      return key ? { key, kind: 'error' } : null
    },
    operation,
  )
  operation.throwIfCancelled()
  const visionDirUri = vscode.Uri.joinPath(debugDirUri, 'vision')
  candidates.push(
    ...(await listImageDirectoryEntries(
      visionDirUri,
      (name) => {
        const waitFreezesKey = parseWaitFreezesKey(name)
        if (waitFreezesKey) return { key: waitFreezesKey, kind: 'wait-freezes' }
        const visionKey = parseVisionImageKey(name)
        return visionKey ? { key: visionKey, kind: 'vision' } : null
      },
      operation,
    )),
  )
  operation.throwIfCancelled()

  const webview = configureWebviewImageRoot(debugDirUri)
  const errorImages: DebugImageResource[] = []
  const visionImages: DebugImageResource[] = []
  const waitFreezesImages: DebugImageResource[] = []
  for (const candidate of candidates) {
    operation.throwIfCancelled()
    const entry = {
      key: candidate.key,
      url: webview.asWebviewUri(candidate.uri).toString(),
    }
    if (candidate.kind === 'error') errorImages.push(entry)
    else if (candidate.kind === 'vision') visionImages.push(entry)
    else waitFreezesImages.push(entry)
  }

  return {
    errorImages,
    visionImages,
    waitFreezesImages,
  }
}

async function execReg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('reg.exe', args, { windowsHide: true }) as Promise<{ stdout: string; stderr: string }>
}

async function regKeyExists(key: string): Promise<boolean> {
  try {
    await execReg(['query', key])
    return true
  } catch {
    return false
  }
}

async function prepareContextMenuAssets(context: vscode.ExtensionContext): Promise<{ helperScript: string; iconPath: string }> {
  const sourceScriptDir = path.join(context.extensionPath, 'scripts', 'windows')
  const sourceIconPath = path.join(context.extensionPath, 'webview', 'favicon.ico')

  const targetDir = path.join(context.globalStorageUri.fsPath, 'windows-context-menu')
  await mkdir(targetDir, { recursive: true })

  const sourceVbs = path.join(sourceScriptDir, 'open-folder-in-maa-analyzer.vbs')

  const targetVbs = path.join(targetDir, 'open-folder-in-maa-analyzer.vbs')
  const targetIcon = path.join(targetDir, 'favicon.ico')

  await copyFile(sourceVbs, targetVbs)
  await copyFile(sourceIconPath, targetIcon)

  return { helperScript: targetVbs, iconPath: targetIcon }
}

async function installWindowsContextMenu(context: vscode.ExtensionContext): Promise<void> {
  if (process.platform !== 'win32') {
    vscode.window.showWarningMessage(t('This feature is available only on Windows'))
    return
  }

  const installLabel = t('Install')
  const action = await vscode.window.showInformationMessage(
    t('This will install Windows context menu entries for folders, folder backgrounds, .log files, and .zip files. Continue?'),
    installLabel,
    t('Cancel'),
  )
  if (action !== installLabel) return
  const entries: Array<{ menuKey: string; arg: string }> = [
    { menuKey: WINDOWS_CONTEXT_MENU_KEYS[0], arg: '%1' },
    { menuKey: WINDOWS_CONTEXT_MENU_KEYS[1], arg: '%V' },
    { menuKey: WINDOWS_CONTEXT_MENU_KEYS[2], arg: '%1' },
    { menuKey: WINDOWS_CONTEXT_MENU_KEYS[3], arg: '%1' },
  ]

  try {
    const wscriptExe = (process.env.WINDIR || 'C:\\Windows') + '\\System32\\wscript.exe'
    const { helperScript, iconPath } = await prepareContextMenuAssets(context)
    const uriScheme = normalizeEditorUriScheme(vscode.env.uriScheme)
    const menuLabel = t('Analyze with MAA Log Analyzer')

    for (const entry of entries) {
      const commandKey = `${entry.menuKey}\\command`
      const command = `"${wscriptExe}" "${helperScript}" "${entry.arg}" "${uriScheme}"`

      await execReg(['add', entry.menuKey, '/ve', '/d', menuLabel, '/f'])
      await execReg(['add', entry.menuKey, '/v', 'Icon', '/d', iconPath, '/f'])
      await execReg(['add', commandKey, '/ve', '/d', command, '/f'])
    }

    vscode.window.showInformationMessage(t('Windows context menu entries were installed'))
  } catch (error) {
    vscode.window.showErrorMessage(t('Failed to install Windows context menu entries: {0}', String(error)))
  }
}

async function uninstallWindowsContextMenu(context: vscode.ExtensionContext): Promise<void> {
  if (process.platform !== 'win32') {
    vscode.window.showWarningMessage(t('This feature is available only on Windows'))
    return
  }

  const uninstallLabel = t('Uninstall')
  const action = await vscode.window.showInformationMessage(
    t('This will uninstall Windows context menu entries for folders, folder backgrounds, .log files, and .zip files. Continue?'),
    uninstallLabel,
    t('Cancel'),
  )
  if (action !== uninstallLabel) return

  try {
    let removed = 0
    for (const key of WINDOWS_CONTEXT_MENU_KEYS) {
      if (await regKeyExists(key)) {
        await execReg(['delete', key, '/f'])
        removed++
      }
    }

    await rm(path.join(context.globalStorageUri.fsPath, 'windows-context-menu'), {
      recursive: true,
      force: true,
    })

    if (removed === 0) {
      vscode.window.showInformationMessage(t('Windows context menu entries are not installed'))
      return
    }

    vscode.window.showInformationMessage(t('Windows context menu entries were uninstalled'))
  } catch (error) {
    vscode.window.showErrorMessage(t('Failed to uninstall Windows context menu entries: {0}', String(error)))
  }
}
/** 解析 on_error 截图文件名为标准化 key */
function parseErrorImageKey(fileName: string): string | null {
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+)\.png$/
  )
  if (!match) return null
  const [, timestamp, ms, nodeName] = match
  const paddedMs = ms.padEnd(3, '0')
  return `${timestamp}.${paddedMs}_${nodeName}`
}

/** 解析 vision 截图文件名为标准化 key */
function parseVisionImageKey(fileName: string): string | null {
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_\d{9,})\.jpg$/i,
  )
  if (!match) return null
  const [, timestamp, ms, rest] = match
  const paddedMs = ms.padEnd(3, '0')
  return `${timestamp}.${paddedMs}_${rest}`
}

/** 解析 wait_freezes 截图文件名为标准化 key */
function parseWaitFreezesKey(fileName: string): string | null {
  const match = fileName.match(
    /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\.(\d{1,3})_(.+_wait_freezes)\.jpg$/i,
  )
  if (!match) return null
  const [, timestamp, ms, rest] = match
  const paddedMs = ms.padEnd(3, '0')
  return `${timestamp}.${paddedMs}_${rest}`
}

interface MxuZipVolumeInfo {
  baseName: string
  index: number
}

function parseMxuZipVolumeName(fileName: string): MxuZipVolumeInfo | null {
  const match = fileName.match(/^(.*)-part(\d{2,})\.zip$/i)
  if (!match || !match[1]) return null
  const index = Number(match[2])
  if (!Number.isSafeInteger(index) || index < 1) return null
  return { baseName: match[1], index }
}

async function collectMxuZipVolumeUris(
  uri: vscode.Uri,
  operation: LoadOperation,
): Promise<vscode.Uri[]> {
  operation.throwIfCancelled()
  const selectedName = path.posix.basename(uri.path)
  const selectedInfo = parseMxuZipVolumeName(selectedName)
  if (!selectedInfo) return [uri]

  const directory = getParentUri(uri)
  let entries: [string, vscode.FileType][]
  try {
    entries = await vscode.workspace.fs.readDirectory(directory)
    operation.throwIfCancelled()
  } catch (error) {
    operation.throwIfCancelled()
    return [uri]
  }

  const baseName = selectedInfo.baseName.toLowerCase()
  const volumes = entries
    .filter(([, type]) => type === vscode.FileType.File)
    .map(([name]) => ({ name, info: parseMxuZipVolumeName(name) }))
    .filter(({ info }) => info?.baseName.toLowerCase() === baseName)
    .sort((left, right) => (
      left.info!.index - right.info!.index
      || left.name.localeCompare(right.name)
    ))
    .map(({ name }) => vscode.Uri.joinPath(directory, name))

  return volumes.length > 0 ? volumes : [uri]
}

async function findFirstMxuZipVolumeUri(
  directory: vscode.Uri,
  operation: LoadOperation,
): Promise<vscode.Uri | null> {
  operation.throwIfCancelled()
  const entries: [string, vscode.FileType][] = await vscode.workspace.fs.readDirectory(directory)
  operation.throwIfCancelled()
  const first = entries
    .filter(([, type]) => type === vscode.FileType.File)
    .map(([name]) => ({ name, info: parseMxuZipVolumeName(name) }))
    .filter(({ info }) => info != null)
    .sort((left, right) => (
      left.name.localeCompare(right.name)
      || left.info!.index - right.info!.index
    ))[0]

  return first ? vscode.Uri.joinPath(directory, first.name) : null
}

/**
 * 在扩展进程内按预算检查并选择性解压 ZIP。
 * Webview 只接收已筛选的文本与图片，避免完整 ZIP 的 Base64 往返副本。
 */
async function handleZipFile(
  uri: vscode.Uri,
  operation: LoadOperation,
): Promise<void> {
  let transfer: WebviewByteTransferSender | undefined
  try {
    operation.throwIfCancelled()
    const checkActive = () => operation.throwIfCancelled()
    const volumeUris = await collectMxuZipVolumeUris(uri, operation)
    operation.throwIfCancelled()
    const readVolume = (input: ArchiveVolumeInput<vscode.Uri>) =>
      vscode.workspace.fs.readFile(input.source)

    // Release the archive memory gate while the user is choosing logs. A newer
    // request can then inspect its archive without waiting for a stale dialog,
    // while both read/inflate phases remain strictly serialized.
    const inspection = await loadOperationCoordinator.runArchiveExclusive(operation, async () => {
      const volumeInputs: Array<ArchiveVolumeInput<vscode.Uri>> = await Promise.all(
        volumeUris.map(async (volumeUri) => {
          const stat = await vscode.workspace.fs.stat(volumeUri)
          operation.throwIfCancelled()
          return {
            source: volumeUri,
            name: path.posix.basename(volumeUri.path),
            size: stat.size,
          }
        }),
      )
      operation.throwIfCancelled()
      const inspectedVolumes = await inspectArchiveVolumes(
        volumeInputs,
        readVolume,
        null,
        checkActive,
      )
      operation.throwIfCancelled()
      const entrySizes = new Map<string, number>()
      for (const volume of inspectedVolumes) {
        operation.throwIfCancelled()
        for (const entry of volume.entries) {
          entrySizes.set(canonicalizeArchivePath(entry.name), entry.originalSize)
        }
      }
      return { inspectedVolumes, entrySizes }
    })
    operation.throwIfCancelled()

    const selectedLogs = selectPrimaryLogGroup(Array.from(inspection.entrySizes.keys()).map(filePath => ({
      path: filePath,
      name: filePath.replace(/\\/g, '/').split('/').pop() || filePath,
    })))
    if (selectedLogs.length === 0) {
      vscode.window.showWarningMessage(t('No log file was found in the ZIP archive ({0})', PRIMARY_LOG_FILE_HINT))
      return
    }

    const selectionEntries: PrimaryLogSelectionEntry[] = selectedLogs.map(({ item, candidate }) => ({
      path: item.path,
      name: item.name,
      kind: candidate.kind,
      rotatedTimestampHint: candidate.rotatedTimestampHint,
      size: inspection.entrySizes.get(item.path) ?? 0,
    }))
    const selectedPaths = await pickPrimaryLogSelection(selectionEntries)
    operation.throwIfCancelled()
    if (!selectedPaths) return

    transfer = createByteTransfer(operation)
    await transfer.start({
      fileName: path.posix.basename(uri.path),
    })
    let primaryLogCount = 0

    await loadOperationCoordinator.runArchiveExclusive(operation, async () => {
      const selection = createArchiveSelection(selectedPaths, selectedLogs[0].candidate.dirPath)

      await readSelectedArchiveVolumes(
        inspection.inspectedVolumes,
        selection,
        readVolume,
        async (_volume, entries) => {
          operation.throwIfCancelled()
          for (const [entryPath, bytes] of entries) {
            operation.throwIfCancelled()
            const kind = classifyNeededArchiveEntry(entryPath, selection)
            if (!kind) continue

            const normalizedPath = canonicalizeArchivePath(entryPath)
            const name = normalizedPath.split('/').pop() || normalizedPath
            if (kind === 'primary-log') {
              await transfer!.sendFile({
                kind: 'primary',
                path: normalizedPath,
                name,
                bytes,
              })
              primaryLogCount++
              continue
            }
            if (kind === 'text') {
              await transfer!.sendFile({
                kind: 'text',
                path: normalizedPath,
                name,
                bytes,
              })
              continue
            }

            const errorKey = parseErrorImageKey(name)
            if (errorKey) {
              await transfer!.sendFile({
                kind: 'image',
                path: normalizedPath,
                name,
                bytes,
                imageKey: `error:${errorKey}`,
                mimeType: 'image/png',
              })
              continue
            }
            const waitFreezesKey = parseWaitFreezesKey(name)
            if (waitFreezesKey) {
              await transfer!.sendFile({
                kind: 'image',
                path: normalizedPath,
                name,
                bytes,
                imageKey: `wait-freezes:${waitFreezesKey}`,
                mimeType: 'image/jpeg',
              })
              continue
            }
            const visionKey = parseVisionImageKey(name)
            if (visionKey) {
              await transfer!.sendFile({
                kind: 'image',
                path: normalizedPath,
                name,
                bytes,
                imageKey: `vision:${visionKey}`,
                mimeType: 'image/jpeg',
              })
            }
          }
        },
        null,
        checkActive,
      )
      operation.throwIfCancelled()
    })
    if (primaryLogCount === 0) {
      const message = t('The ZIP archive changed while it was being read, so the selected log could not be loaded')
      await transfer.abort(message)
      vscode.window.showWarningMessage(message)
      return
    }
    await transfer.complete()
  } catch (error) {
    await transfer?.abort(error instanceof Error ? error.message : String(error))
    showLoadError(t('Failed to read ZIP archive'), error, operation)
  }
}
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  // 获取 webview 资源路径
  const webviewUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'webview'))
  
  // 生成 CSP nonce
  const nonce = getNonce()
  const documentLanguage = /^[A-Za-z0-9-]+$/.test(vscode.env.language)
    ? vscode.env.language
    : 'en'
  const panelTitle = t('MAA Log Analyzer')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const loadingText = JSON.stringify(t('Loading MAA Log Analyzer...'))

  return `<!DOCTYPE html>
<html lang="${documentLanguage}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; worker-src ${webview.cspSource} blob:; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource}; connect-src ${webview.cspSource} data: blob:;">
  <title>${panelTitle}</title>
  <link rel="stylesheet" href="${webviewUri}/assets/index.css">
  <style>
    html, body {
      width: 100%;
      height: 100%;
    }
    body {
      margin: 0;
      background: var(--vscode-panel-background, #1e1e1e);
      color: var(--vscode-editor-foreground, rgba(255, 255, 255, 0.82));
      overflow: hidden;
    }
    #app {
      height: 100vh;
      overflow: hidden;
    }
    #app:empty {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vscode-panel-background, #1e1e1e);
      color: var(--vscode-descriptionForeground, rgba(255, 255, 255, 0.62));
      font-size: 12px;
      letter-spacing: 0.4px;
    }
    #app:empty::before {
      content: ${loadingText};
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}">
    // 注入 VS Code API
    const vscode = acquireVsCodeApi();
    window.vscodeApi = vscode;
    
    // 标记为 VS Code 环境
    window.isVSCode = true;
    window.vscodeThemeKind = ${vscode.window.activeColorTheme.kind};
  </script>
  <script nonce="${nonce}" type="module" src="${webviewUri}/assets/index.js"></script>
</body>
</html>`
}

function getNonce(): string {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

export function deactivate() {
  loadOperationCoordinator.cancelCurrent()
}
