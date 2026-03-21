import * as vscode from 'vscode'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { copyFile, mkdir } from 'fs/promises'
import { unzipSync } from 'fflate'

let currentPanel: vscode.WebviewPanel | undefined = undefined
const execFileAsync = promisify(execFile)
const isZh = vscode.env.language.toLowerCase().startsWith('zh')
const t = (en: string, zh: string) => (isZh ? zh : en)

const MAIN_LOG_CANDIDATES = ['maa.log', 'maafw.log'] as const
const BAK_LOG_CANDIDATES = ['maa.bak.log', 'maafw.bak.log'] as const

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
      new SidebarActionItem(t('Open Analyzer', '\u6253\u5f00\u5206\u6790\u9762\u677f'), 'maaLogAnalyzer.openAnalyzer', 'openAnalyzer'),
      new SidebarActionItem(t('Analyze File/Folder', '\u9009\u62e9\u6587\u4ef6/\u6587\u4ef6\u5939\u5e76\u5206\u6790'), 'maaLogAnalyzer.analyzeFolder', 'analyzeFolder'),
    ]
    if (process.platform === 'win32') {
      items.push(
        new SidebarActionItem(t('Install Windows Context Menu', '\u5b89\u88c5\u7cfb\u7edf\u53f3\u952e\u83dc\u5355'), 'maaLogAnalyzer.installContextMenu', 'installContextMenu'),
        new SidebarActionItem(t('Uninstall Windows Context Menu', '\u5378\u8f7d\u7cfb\u7edf\u53f3\u952e\u83dc\u5355'), 'maaLogAnalyzer.uninstallContextMenu', 'uninstallContextMenu'),
      )
    }
    return items
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Maa Log Analyzer extension is now active!')

  // 注册打开分析器命令
  const openAnalyzerCommand = vscode.commands.registerCommand(
    'maaLogAnalyzer.openAnalyzer',
    () => {
      createOrShowPanel(context)
    }
  )

  // 注册分析文件夹命令（资源管理器右键或侧边栏入口）
  const analyzeFolderCommand = vscode.commands.registerCommand(
    'maaLogAnalyzer.analyzeFolder',
    async (_uri?: vscode.Uri) => {
      const targetUri = await pickUriForAnalysis()

      if (targetUri) {
        createOrShowPanel(context)
        await analyzeUri(targetUri)
      }
    }
  )

  const analyzeFileCommand = vscode.commands.registerCommand(
    'maaLogAnalyzer.analyzeFile',
    async (uri: vscode.Uri) => {
      createOrShowPanel(context)
      await analyzeFileUri(uri)
    }
  )

  const installContextMenuCommand = vscode.commands.registerCommand(
    'maaLogAnalyzer.installContextMenu',
    async () => {
      await installWindowsContextMenu(context)
    }
  )

  const uninstallContextMenuCommand = vscode.commands.registerCommand(
    'maaLogAnalyzer.uninstallContextMenu',
    async () => {
      await uninstallWindowsContextMenu()
    }
  )
  const sidebarProvider = new SidebarActionProvider()
  const sidebarView = vscode.window.createTreeView('maaLogAnalyzer.sidebar', {
    treeDataProvider: sidebarProvider,
    showCollapseAll: false,
  })

  const uriHandler = vscode.window.registerUriHandler({
    handleUri: async (uri: vscode.Uri) => {
      let targetPath: string | null = null
      let targetRoute: 'analyze-file' | 'analyze-folder' | null = null

      // New format: vscode://publisher.extension/open/<route>/<base64Path>
      const parts = uri.path.replace(/^\/+/, '').split('/')
      if (parts[0] === 'open' && parts.length >= 3) {
        if (parts[1] === 'analyze-file' || parts[1] === 'analyze-folder') {
          targetRoute = parts[1]
        }
        const encoded = parts.slice(2).join('/')
        try {
          targetPath = Buffer.from(encoded, 'base64').toString('utf8')
        } catch {
          targetPath = null
        }
      }

      // Backward compatibility: ?path=...
      if (!targetPath) {
        const qs = new URLSearchParams(uri.query)
        targetPath = qs.get('path')
        const route = qs.get('route')
        if (route === 'analyze-file' || route === 'analyze-folder') {
          targetRoute = route
        }
      }

      // Ignore unrelated URI opens silently.
      if (!targetPath) return

      try {
        const normalizedPath = targetPath.trim().replace(/^"(.*)"$/, '$1')
        const targetUri = vscode.Uri.file(normalizedPath)
        createOrShowPanel(context)

        if (targetRoute === 'analyze-file') {
          await analyzeFileUri(targetUri)
          return
        }
        if (targetRoute === 'analyze-folder') {
          await analyzeFolderUri(targetUri)
          return
        }

        const lower = normalizedPath.toLowerCase()
        const looksLikeFile = lower.endsWith('.zip') || lower.endsWith('.log') || lower.endsWith('.jsonl') || lower.endsWith('.txt')

        if (looksLikeFile) {
          await analyzeFileUri(targetUri)
        } else {
          await analyzeFolderUri(targetUri)
        }
      } catch (error) {
        vscode.window.showErrorMessage(`无法处理外部打开请求: ${error}`)
      }
    },
  })

  context.subscriptions.push(openAnalyzerCommand, analyzeFolderCommand, analyzeFileCommand, installContextMenuCommand, uninstallContextMenuCommand, sidebarView, uriHandler)
}

function createOrShowPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  const column = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined

  // 如果已有面板，直接显示
  if (currentPanel) {
    currentPanel.reveal(column)
    return currentPanel
  }

  // 创建新面板
  currentPanel = vscode.window.createWebviewPanel(
    'maaLogAnalyzer',
    'MAA 日志分析器',
    column || vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'webview')
      ]
    }
  )

  // 设置 HTML 内容
  currentPanel.webview.html = getWebviewContent(currentPanel.webview, context.extensionUri)

  // 处理来自 Webview 的消息
  currentPanel.webview.onDidReceiveMessage(
    async (message: any) => {
      switch (message.type) {
        case 'openFile':
          // 打开文件选择对话框
          const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: {
              'Log Files': ['log', 'jsonl', 'txt', 'zip']
            },
            title: '选择日志文件'
          })

          if (fileUri && fileUri[0]) {
            const filePath = fileUri[0].fsPath
            if (filePath.toLowerCase().endsWith('.zip')) {
              await handleZipFile(fileUri[0])
            } else {
              try {
                const fileContent = await vscode.workspace.fs.readFile(fileUri[0])
                const content = new TextDecoder('utf-8').decode(fileContent)

                currentPanel?.webview.postMessage({
                  type: 'loadFile',
                  content: content,
                  fileName: path.basename(filePath)
                })
              } catch (error) {
                vscode.window.showErrorMessage(`无法读取文件: ${error}`)
              }
            }
          }
          break

        case 'openFolder':
          // Open file or folder picker
          const targetUri = await pickUriForAnalysis()

          if (targetUri) {
            await analyzeUri(targetUri)
          }
          break

        case 'showError':
          vscode.window.showErrorMessage(message.message)
          break
          
        case 'showInfo':
          vscode.window.showInformationMessage(message.message)
          break
      }
    },
    undefined,
    context.subscriptions
  )

  // 面板关闭时清理
  currentPanel.onDidDispose(
    () => {
      currentPanel = undefined
    },
    undefined,
    context.subscriptions
  )

  return currentPanel
}

async function analyzeFileUri(uri: vscode.Uri): Promise<void> {
  if (uri.fsPath.toLowerCase().endsWith('.zip')) {
    await handleZipFile(uri)
    return
  }

  try {
    const fileContent = await vscode.workspace.fs.readFile(uri)
    const content = new TextDecoder('utf-8').decode(fileContent)

    currentPanel?.webview.postMessage({
      type: 'loadFile',
      content,
      fileName: path.basename(uri.fsPath),
    })
  } catch (error) {
    vscode.window.showErrorMessage(`无法读取文件: ${error}`)
  }
}
async function pickUriForAnalysis(): Promise<vscode.Uri | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: t('Log File', '\u65e5\u5fd7\u6587\u4ef6'), value: 'file' as const },
      { label: t('Log Folder', '\u65e5\u5fd7\u6587\u4ef6\u5939'), value: 'folder' as const },
    ],
    {
      title: t('Choose what to analyze', '\u9009\u62e9\u8981\u5206\u6790\u7684\u7c7b\u578b'),
      placeHolder: t('Select file or folder', '\u9009\u62e9\u6587\u4ef6\u6216\u6587\u4ef6\u5939'),
      ignoreFocusOut: true,
    },
  )

  if (!choice) return undefined

  const selected = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFolders: choice.value === 'folder',
    canSelectFiles: choice.value === 'file',
    filters: choice.value === 'file' ? { 'Log Files': ['log', 'jsonl', 'txt', 'zip'] } : undefined,
    title: choice.value === 'file'
      ? t('Select Log File', '\u9009\u62e9\u65e5\u5fd7\u6587\u4ef6')
      : t('Select Log Folder', '\u9009\u62e9\u65e5\u5fd7\u6587\u4ef6\u5939'),
  })

  return selected?.[0]
}

async function analyzeUri(uri: vscode.Uri): Promise<void> {
  try {
    const stat = await vscode.workspace.fs.stat(uri)
    if ((stat.type & vscode.FileType.Directory) === vscode.FileType.Directory) {
      await analyzeFolderUri(uri)
      return
    }
  } catch {
    // fallback to extension-based detection below
  }

  const lower = uri.fsPath.toLowerCase()
  const looksLikeFile = lower.endsWith('.zip') || lower.endsWith('.log') || lower.endsWith('.jsonl') || lower.endsWith('.txt')
  if (looksLikeFile) {
    await analyzeFileUri(uri)
    return
  }

  await analyzeFolderUri(uri)
}

async function analyzeFolderUri(folderUri: vscode.Uri): Promise<void> {
  try {
    const mainPatterns = MAIN_LOG_CANDIDATES.map(name => new vscode.RelativePattern(folderUri, `**/${name}`))
    const bakPatterns = BAK_LOG_CANDIDATES.map(name => new vscode.RelativePattern(folderUri, `**/${name}`))

    const [mainLists, bakLists] = await Promise.all([
      Promise.all(mainPatterns.map(p => vscode.workspace.findFiles(p, '**/node_modules/**', 100))),
      Promise.all(bakPatterns.map(p => vscode.workspace.findFiles(p, '**/node_modules/**', 100))),
    ])

    const mainLogs = mainLists.flat()
    const bakLogs = bakLists.flat()

    if (mainLogs.length === 0 && bakLogs.length === 0) {
      vscode.window.showErrorMessage('文件夹中未找到日志文件（maa.log / maa.bak.log / maafw.log / maafw.bak.log）')
      return
    }

    const sortByDepth = (a: vscode.Uri, b: vscode.Uri) => {
      const da = a.path.split('/').length
      const db = b.path.split('/').length
      return da - db
    }

    const sortedMain = [...mainLogs].sort(sortByDepth)
    const targetMain = sortedMain[0]

    let targetBak: vscode.Uri | undefined
    if (targetMain) {
      const mainDir = path.posix.dirname(targetMain.path).toLowerCase()
      targetBak = bakLogs.find(b => path.posix.dirname(b.path).toLowerCase() === mainDir)
    }
    if (!targetBak && bakLogs.length > 0) {
      targetBak = [...bakLogs].sort(sortByDepth)[0]
    }

    let combinedContent = ''

    if (targetBak) {
      const bakContent = await vscode.workspace.fs.readFile(targetBak)
      combinedContent += new TextDecoder('utf-8').decode(bakContent)
    }

    if (targetMain) {
      const mainContent = await vscode.workspace.fs.readFile(targetMain)
      if (combinedContent && !combinedContent.endsWith('\n')) {
        combinedContent += '\n'
      }
      combinedContent += new TextDecoder('utf-8').decode(mainContent)
    }

    if (!combinedContent) {
      vscode.window.showErrorMessage('未能读取到有效日志内容')
      return
    }

    const sourceName = targetMain ? path.basename(path.dirname(targetMain.fsPath)) : path.basename(folderUri.fsPath)

    currentPanel?.webview.postMessage({
      type: 'loadFile',
      content: combinedContent,
      fileName: sourceName,
    })
  } catch (error) {
    vscode.window.showErrorMessage(`无法读取文件夹: ${error}`)
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
    vscode.window.showWarningMessage('该功能仅支持 Windows')
    return
  }

  const action = await vscode.window.showInformationMessage(
    '将安装 Windows 右键菜单（文件夹、文件夹空白处、.log、.zip）：用 MAA Log Analyzer 分析。是否继续？',
    '安装',
    '取消',
  )
  if (action !== '安装') return
  const entries: Array<{ menuKey: string; arg: string }> = [
    { menuKey: 'HKCU\\Software\\Classes\\Directory\\shell\\MaaLogAnalyzer', arg: '%1' },
    { menuKey: 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\MaaLogAnalyzer', arg: '%V' },
    { menuKey: 'HKCU\\Software\\Classes\\SystemFileAssociations\\.log\\shell\\MaaLogAnalyzer', arg: '%1' },
    { menuKey: 'HKCU\\Software\\Classes\\SystemFileAssociations\\.zip\\shell\\MaaLogAnalyzer', arg: '%1' },
  ]

  try {
    const wscriptExe = (process.env.WINDIR || 'C:\\Windows') + '\\System32\\wscript.exe'
    const { helperScript, iconPath } = await prepareContextMenuAssets(context)

    for (const entry of entries) {
      const commandKey = `${entry.menuKey}\\command`
      const command = `"${wscriptExe}" "${helperScript}" "${entry.arg}"`

      await execReg(['add', entry.menuKey, '/ve', '/d', '用 MAA Log Analyzer 分析', '/f'])
      await execReg(['add', entry.menuKey, '/v', 'Icon', '/d', iconPath, '/f'])
      await execReg(['add', commandKey, '/ve', '/d', command, '/f'])
    }

    vscode.window.showInformationMessage('已安装 Windows 右键菜单（文件夹/空白处/.log/.zip）')
  } catch (error) {
    vscode.window.showErrorMessage(`安装右键菜单失败: ${error}`)
  }
}

async function uninstallWindowsContextMenu(): Promise<void> {
  if (process.platform !== 'win32') {
    vscode.window.showWarningMessage('该功能仅支持 Windows')
    return
  }

  const action = await vscode.window.showInformationMessage(
    '将卸载 Windows 右键菜单（文件夹、文件夹空白处、.log、.zip）。是否继续？',
    '卸载',
    '取消',
  )
  if (action !== '卸载') return

  const menuKeys = [
    'HKCU\\Software\\Classes\\Directory\\shell\\MaaLogAnalyzer',
    'HKCU\\Software\\Classes\\Directory\\Background\\shell\\MaaLogAnalyzer',
    'HKCU\\Software\\Classes\\SystemFileAssociations\\.log\\shell\\MaaLogAnalyzer',
    'HKCU\\Software\\Classes\\SystemFileAssociations\\.zip\\shell\\MaaLogAnalyzer',
  ]

  try {
    let removed = 0
    for (const key of menuKeys) {
      if (await regKeyExists(key)) {
        await execReg(['delete', key, '/f'])
        removed++
      }
    }

    if (removed === 0) {
      vscode.window.showInformationMessage('右键菜单未安装，无需卸载')
      return
    }

    vscode.window.showInformationMessage('已卸载 Windows 右键菜单')
  } catch (error) {
    vscode.window.showErrorMessage(`卸载右键菜单失败: ${error}`)
  }
}
/** 判断某个路径是否是需要解压的文件 */
function isNeededFile(filePath: string): boolean {
  const lower = filePath.replace(/\\/g, '/').toLowerCase()
  const name = lower.substring(lower.lastIndexOf('/') + 1)
  if (MAIN_LOG_CANDIDATES.includes(name as (typeof MAIN_LOG_CANDIDATES)[number]) || BAK_LOG_CANDIDATES.includes(name as (typeof BAK_LOG_CANDIDATES)[number])) return true
  if (lower.includes('/on_error/') && lower.endsWith('.png')) return true
  if (lower.includes('/vision/') && lower.endsWith('.jpg')) return true
  return false
}

/** 找到主日志（maa.log / maafw.log）所在的 base 目录 */
function findBaseDirectory(paths: string[]): string | null {
  for (const p of paths) {
    const normalized = p.replace(/\\/g, '/')
    const lower = normalized.toLowerCase()
    if (lower.endsWith('/maa.log') || lower === 'maa.log' || lower.endsWith('/maafw.log') || lower === 'maafw.log') {
      const lastSlash = normalized.lastIndexOf('/')
      return lastSlash === -1 ? '' : normalized.substring(0, lastSlash)
    }
  }
  return null
}

/** 拼接路径 */
function joinZipPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name
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

/** 处理 ZIP 文件：Node.js 侧解压 */
async function handleZipFile(uri: vscode.Uri): Promise<void> {
  try {
    const fileContent = await vscode.workspace.fs.readFile(uri)
    const zipData = new Uint8Array(fileContent)

    const files = unzipSync(zipData, {
      filter: (file) => isNeededFile(file.name),
    })

    const paths = Object.keys(files)
    const basePath = findBaseDirectory(paths)
    if (basePath === null) {
      vscode.window.showWarningMessage('ZIP 文件中未找到主日志文件（maa.log / maafw.log）')
      return
    }

    let content = ''

    // 读取 bak 日志（maa.bak.log / maafw.bak.log）
    for (const bakName of BAK_LOG_CANDIDATES) {
      const bakLogPath = joinZipPath(basePath, bakName)
      for (const p of paths) {
        if (p.replace(/\\/g, '/').toLowerCase() === bakLogPath.toLowerCase()) {
          content += new TextDecoder('utf-8').decode(files[p])
          break
        }
      }
    }

    // 读取主日志（maa.log / maafw.log）
    for (const mainName of MAIN_LOG_CANDIDATES) {
      const mainLogPath = joinZipPath(basePath, mainName)
      for (const p of paths) {
        if (p.replace(/\\/g, '/').toLowerCase() === mainLogPath.toLowerCase()) {
          if (content && !content.endsWith('\n')) {
            content += '\n'
          }
          content += new TextDecoder('utf-8').decode(files[p])
          break
        }
      }
    }

    if (!content) {
      vscode.window.showWarningMessage('ZIP 文件中未找到有效的日志内容')
      return
    }

    // 提取 on_error 截图转为 base64
    const errorImages: { key: string; base64: string }[] = []
    const onErrorPrefix = joinZipPath(basePath, 'on_error/').toLowerCase()

    // 提取 vision 调试截图转为 base64
    const visionImages: { key: string; base64: string }[] = []
    const visionPrefix = joinZipPath(basePath, 'vision/').toLowerCase()

    // 提取 wait_freezes 调试截图转为 base64
    const waitFreezesImages: { key: string; base64: string }[] = []

    for (const p of paths) {
      const normalized = p.replace(/\\/g, '/')
      const lower = normalized.toLowerCase()
      if (lower.startsWith(onErrorPrefix) && lower.endsWith('.png')) {
        const fileName = normalized.substring(normalized.lastIndexOf('/') + 1)
        const key = parseErrorImageKey(fileName)
        if (key) {
          const base64 = Buffer.from(files[p]).toString('base64')
          errorImages.push({ key, base64 })
        }
      } else if (lower.startsWith(visionPrefix) && lower.endsWith('.jpg')) {
        const fileName = normalized.substring(normalized.lastIndexOf('/') + 1)
        const wfKey = parseWaitFreezesKey(fileName)
        if (wfKey) {
          const base64 = Buffer.from(files[p]).toString('base64')
          waitFreezesImages.push({ key: wfKey, base64 })
        } else {
          const key = parseVisionImageKey(fileName)
          if (key) {
            const base64 = Buffer.from(files[p]).toString('base64')
            // 同一 key 覆盖（取最后出现的）
            const existing = visionImages.findIndex(v => v.key === key)
            if (existing >= 0) {
              visionImages[existing].base64 = base64
            } else {
              visionImages.push({ key, base64 })
            }
          }
        }
      }
    }

    currentPanel?.webview.postMessage({
      type: 'loadZipFile',
      content,
      errorImages,
      visionImages,
      waitFreezesImages,
    })
  } catch (error) {
    vscode.window.showErrorMessage(`解压 ZIP 文件失败: ${error}`)
  }
}
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  // 获取 webview 资源路径
  const webviewUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'webview'))
  
  // 生成 CSP nonce
  const nonce = getNonce()

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
  <title>MAA 日志分析器</title>
  <link rel="stylesheet" href="${webviewUri}/assets/index.css">
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}">
    // 注入 VS Code API
    const vscode = acquireVsCodeApi();
    window.vscodeApi = vscode;
    
    // 标记为 VS Code 环境
    window.isVSCode = true;
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

export function deactivate() {}
