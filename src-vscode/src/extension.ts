import * as vscode from 'vscode'
import * as path from 'path'
import { unzipSync } from 'fflate'

let currentPanel: vscode.WebviewPanel | undefined = undefined

export function activate(context: vscode.ExtensionContext) {
  console.log('Maa Log Analyzer extension is now active!')

  // 注册打开分析器命令
  const openAnalyzerCommand = vscode.commands.registerCommand(
    'maaLogAnalyzer.openAnalyzer',
    () => {
      createOrShowPanel(context)
    }
  )

  // 注册分析文件命令（右键菜单）
  const analyzeFileCommand = vscode.commands.registerCommand(
    'maaLogAnalyzer.analyzeFile',
    async (uri: vscode.Uri) => {
      const panel = createOrShowPanel(context)

      if (uri.fsPath.toLowerCase().endsWith('.zip')) {
        await handleZipFile(uri)
      } else {
        // 读取文件内容
        try {
          const fileContent = await vscode.workspace.fs.readFile(uri)
          const content = new TextDecoder('utf-8').decode(fileContent)

          // 发送文件内容到 Webview
          panel.webview.postMessage({
            type: 'loadFile',
            content: content,
            fileName: path.basename(uri.fsPath)
          })
        } catch (error) {
          vscode.window.showErrorMessage(`无法读取文件: ${error}`)
        }
      }
    }
  )

  context.subscriptions.push(openAnalyzerCommand, analyzeFileCommand)
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
          // 打开文件夹选择对话框
          const folderUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            canSelectFolders: true,
            canSelectFiles: false,
            title: '选择日志文件夹'
          })

          if (folderUri && folderUri[0]) {
            try {
              const folderPath = folderUri[0]
              const bakLogUri = vscode.Uri.joinPath(folderPath, 'maa.bak.log')
              const mainLogUri = vscode.Uri.joinPath(folderPath, 'maa.log')

              let combinedContent = ''

              // 尝试读取 maa.bak.log
              try {
                const bakContent = await vscode.workspace.fs.readFile(bakLogUri)
                combinedContent += new TextDecoder('utf-8').decode(bakContent)
              } catch {
                // 文件不存在，忽略
              }

              // 尝试读取 maa.log
              try {
                const mainContent = await vscode.workspace.fs.readFile(mainLogUri)
                if (combinedContent && !combinedContent.endsWith('\n')) {
                  combinedContent += '\n'
                }
                combinedContent += new TextDecoder('utf-8').decode(mainContent)
              } catch {
                // 文件不存在，忽略
              }

              if (!combinedContent) {
                vscode.window.showErrorMessage('文件夹中未找到 maa.log 或 maa.bak.log 文件')
                break
              }

              currentPanel?.webview.postMessage({
                type: 'loadFile',
                content: combinedContent,
                fileName: path.basename(folderPath.fsPath)
              })
            } catch (error) {
              vscode.window.showErrorMessage(`无法读取文件夹: ${error}`)
            }
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

/** 判断某个路径是否是需要解压的文件 */
function isNeededFile(filePath: string): boolean {
  const lower = filePath.replace(/\\/g, '/').toLowerCase()
  const name = lower.substring(lower.lastIndexOf('/') + 1)
  if (name === 'maa.log' || name === 'maa.bak.log') return true
  if (lower.includes('/on_error/') && lower.endsWith('.png')) return true
  if (lower.includes('/vision/') && lower.endsWith('.jpg')) return true
  return false
}

/** 找到 maa.log 所在的 base 目录 */
function findBaseDirectory(paths: string[]): string | null {
  for (const p of paths) {
    const normalized = p.replace(/\\/g, '/')
    const lower = normalized.toLowerCase()
    if (lower.endsWith('/maa.log') || lower === 'maa.log') {
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
      filter: (file) => isNeededFile(file.name)
    })

    const paths = Object.keys(files)
    const basePath = findBaseDirectory(paths)
    if (basePath === null) {
      vscode.window.showWarningMessage('ZIP 文件中未找到 maa.log 文件')
      return
    }

    let content = ''

    // 读取 maa.bak.log
    const bakLogPath = joinZipPath(basePath, 'maa.bak.log')
    for (const p of paths) {
      if (p.replace(/\\/g, '/').toLowerCase() === bakLogPath.toLowerCase()) {
        content += new TextDecoder('utf-8').decode(files[p])
        break
      }
    }

    // 读取 maa.log
    const mainLogPath = joinZipPath(basePath, 'maa.log')
    for (const p of paths) {
      if (p.replace(/\\/g, '/').toLowerCase() === mainLogPath.toLowerCase()) {
        if (content && !content.endsWith('\n')) {
          content += '\n'
        }
        content += new TextDecoder('utf-8').decode(files[p])
        break
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
      waitFreezesImages
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
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
