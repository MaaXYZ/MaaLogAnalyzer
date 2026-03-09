import * as vscode from 'vscode'
import * as path from 'path'

let currentPanel: vscode.WebviewPanel | undefined = undefined

export function activate(context: vscode.ExtensionContext) {
  console.log('MAA Log Analyzer extension is now active!')

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
              'Log Files': ['log', 'jsonl', 'txt']
            },
            title: '选择日志文件'
          })

          if (fileUri && fileUri[0]) {
            try {
              const fileContent = await vscode.workspace.fs.readFile(fileUri[0])
              const content = new TextDecoder('utf-8').decode(fileContent)

              currentPanel?.webview.postMessage({
                type: 'loadFile',
                content: content,
                fileName: path.basename(fileUri[0].fsPath)
              })
            } catch (error) {
              vscode.window.showErrorMessage(`无法读取文件: ${error}`)
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
