# Maa Log Analyzer

MAA Log Analyzer is a VS Code extension for analyzing MaaFramework logs.

Maa 日志分析器是一个用于分析 MaaFramework 日志的 VS Code 扩展。

## Maa Support / 功能说明

### 中文

针对 MaaFramework 日志分析，当前扩展提供以下功能：

- 多视图分析：日志分析、文本搜索、节点统计、流程图、分屏模式
- 日志输入方式：
  - 选择日志文件（`.log`）
  - 选择日志压缩包（`.zip`）
  - 选择日志目录（自动查找并合并 `maa.log` 与 `maa.bak.log`）
- VS Code 集成：
  - 侧边栏入口（活动栏 `MAA`）
  - 资源管理器右键菜单（日志文件、文件夹）
  - 编辑器右键菜单（`.log` 文件）
- Windows 文件管理器右键菜单（可选安装）：
  - 支持 `.log`、`.zip`、文件夹、文件夹空白处
- ZIP 调试资源支持：
  - 自动读取 `on_error`、`vision`、`wait_freezes` 截图并关联显示

日志解析基于 MaaFramework v5.3+ 常见日志格式。

### English

This extension currently provides the following capabilities for MaaFramework log analysis:

- Multi-view analysis: Log Analysis, Text Search, Node Statistics, Flowchart, Split View
- Log input methods:
  - Select log files (`.log`)
  - Select log archives (`.zip`)
  - Select log folders (auto-discover and merge `maa.log` + `maa.bak.log`)
- VS Code integration:
  - Sidebar entry (Activity Bar `MAA`)
  - Explorer context menu (log files and folders)
  - Editor context menu (`.log` files)
- Optional Windows Explorer context menu installation:
  - Supports `.log`, `.zip`, folders, and folder background
- ZIP debug assets support:
  - Auto-loads and maps `on_error`, `vision`, and `wait_freezes` screenshots

Log parsing targets common MaaFramework v5.3+ log formats.

## Commands / 命令

Open Command Palette (`Ctrl+Shift+P`, macOS: `Cmd+Shift+P`) and search:

- `Maa: 打开日志分析器`
- `Maa: 选择文件/文件夹并分析`
- `Maa: 分析此日志文件`
- `Maa: 安装 Windows 右键菜单` (Windows only)
- `Maa: 卸载 Windows 右键菜单` (Windows only)

## Build / 开发与打包

```bash
# In repository root
pnpm build:vscode

# In src-vscode
npm install
npm run compile
npm run package
```

`npm run package` generates a `.vsix` package that can be installed directly in VS Code.
