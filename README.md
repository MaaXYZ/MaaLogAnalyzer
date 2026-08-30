<!-- markdownlint-disable MD033 MD041 -->
<p align="center">
  <img alt="MaaLogAnalyzer Logo" src="./public/logo.png" width="192" height="192" />
</p>

<div align="center">

# MaaLogAnalyzer

_✨ 可视化分析基于 MaaFramework 开发应用的用户日志 ✨_</br>
🔍 告别手翻百万行日志！用可视化+搜索的方式，高效定位、分析你的 Maa 应用运行问题 🔍

</div>

<p align="center">
  <a href="https://vuejs.org/" target="_blank"><img alt="vue" src="https://img.shields.io/badge/Vue 3-4FC08D?logo=vue.js&logoColor=fff"></a>
  <a href="https://www.typescriptlang.org/" target="_blank"><img alt="ts" src="https://img.shields.io/badge/TypeScript 5-3178C6?logo=typescript&logoColor=fff"></a>
  <a href="https://www.naiveui.com/" target="_blank"><img alt="naive-ui" src="https://img.shields.io/badge/Naive UI-5FA04E?logo=vuedotjs&logoColor=fff"></a>
  <a href="https://tauri.app/" target="_blank"><img alt="tauri" src="https://img.shields.io/badge/Tauri 2-FFC131?logo=tauri&logoColor=000"></a>
  <br/>
  <a href="https://github.com/MaaXYZ/MaaLogAnalyzer/blob/main/LICENSE" target="_blank"><img alt="license" src="https://img.shields.io/github/license/MaaXYZ/MaaLogAnalyzer"></a>
  <a href="https://github.com/MaaXYZ/MaaLogAnalyzer/commits/main/" target="_blank"><img alt="commits" src="https://img.shields.io/github/commit-activity/m/MaaXYZ/MaaLogAnalyzer?color=%23ff69b4"></a>
  <a href="https://github.com/MaaXYZ/MaaLogAnalyzer/stargazers" target="_blank"><img alt="stars" src="https://img.shields.io/github/stars/MaaXYZ/MaaLogAnalyzer?style=social"></a>
</p>

<div align="center">

[在线使用](https://mla.maafw.com) | [VSCode 插件](https://marketplace.visualstudio.com/items?itemName=Windsland52.maa-log-analyzer) | [本地使用](https://github.com/MaaXYZ/MaaLogAnalyzer/releases/latest)

</div>

## 核心功能

<div align="center">

| 模块     | 说明                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| 日志分析 | 按任务展示执行过程<br>支持识别/动作详情查看<br>支持节点导航快速定位<br>支持虚拟滚动<br>支持布局比例保存             |
| 文本搜索 | 支持关键字/正则搜索<br>支持搜索历史与快捷检索<br>支持大文件流式搜索<br>支持结果跳转上下文<br>支持布局比例保存       |
| 流程图   | 基于 ELK 的节点关系可视化<br>支持执行顺序导航与回放<br>支持回放速度与聚焦缩放持久化<br>点击节点可高亮关联节点与连线 |
| 运行统计 | 展示节点、识别/动作、Wait Freezes 的成功/失败、耗时与重试统计<br>适合做整体运行质量观察                             |
| 分屏模式 | 上半区日志分析 + 下半区文本搜索<br>便于结构与原文对照排查<br>支持布局比例保存                                       |
| 新手教程 | 首次加载样例数据后自动引导<br>按板块讲解主要功能<br>支持按教程版本增量引导<br>可在“关于 -> 快速开始”再次启动        |

</div>

## 支持的输入

- 单文件：`maa.log`、`maa.bak.log`、`maafw.log`、`maafw.bak.log`
- 文件夹：自动识别日志文件
- 压缩包：支持从 zip 中提取日志内容

## Web 示意图

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" type="image/webp" srcset="img/README-overview.webp">
    <source media="(prefers-color-scheme: dark)" srcset="img/README-overview.png">
    <source media="(prefers-color-scheme: light)" type="image/webp" srcset="img/README-overview-light.webp">
    <source media="(prefers-color-scheme: light)" srcset="img/README-overview-light.png">
    <img src="img/README-overview.png" alt="日志分析界面" width="900" loading="lazy"/>
  </picture>
</div>

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" type="image/webp" srcset="img/README-flowchart.webp">
    <source media="(prefers-color-scheme: dark)" srcset="img/README-flowchart.png">
    <source media="(prefers-color-scheme: light)" type="image/webp" srcset="img/README-flowchart-light.webp">
    <source media="(prefers-color-scheme: light)" srcset="img/README-flowchart-light.png">
    <img src="img/README-flowchart.png" alt="流程图界面" width="900" loading="lazy"/>
  </picture>
</div>

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" type="image/webp" srcset="img/README-search.webp">
    <source media="(prefers-color-scheme: dark)" srcset="img/README-search.png">
    <source media="(prefers-color-scheme: light)" type="image/webp" srcset="img/README-search-light.webp">
    <source media="(prefers-color-scheme: light)" srcset="img/README-search-light.png">
    <img src="img/README-search.png" alt="文本搜索界面" width="900" loading="lazy"/>
  </picture>
</div>

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" type="image/webp" srcset="img/README-split.webp">
    <source media="(prefers-color-scheme: dark)" srcset="img/README-split.png">
    <source media="(prefers-color-scheme: light)" type="image/webp" srcset="img/README-split-light.webp">
    <source media="(prefers-color-scheme: light)" srcset="img/README-split-light.png">
    <img src="img/README-split.png" alt="分屏模式界面" width="900" loading="lazy"/>
  </picture>
</div>

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" type="image/webp" srcset="img/README-statistics.webp">
    <source media="(prefers-color-scheme: dark)" srcset="img/README-statistics.png">
    <source media="(prefers-color-scheme: light)" type="image/webp" srcset="img/README-statistics-light.webp">
    <source media="(prefers-color-scheme: light)" srcset="img/README-statistics-light.png">
    <img src="img/README-statistics.png" alt="运行统计界面" width="900" loading="lazy"/>
  </picture>
</div>

## 本地开发

### 环境

- Node.js 18+
- pnpm 8+
- Rust（仅 Tauri 开发/打包需要）

### 安装依赖

```bash
pnpm install
```

### Web 开发 / 构建

```bash
pnpm dev
pnpm build
```

### Tauri 开发 / 打包

```bash
pnpm tauri:dev
pnpm tauri:build
```

### VS Code 插件 Webview 构建

```bash
pnpm build:vscode
```

## 仓库结构

```text
.
├─ src/                 # 前端主应用（Web/Tauri 共用）
├─ src-tauri/           # Tauri 工程
├─ src-vscode/          # VS Code 插件工程
├─ docs/                # 文档
├─ packages/            # 可复用内核/运行时/工具包
├─ sample/              # 示例日志
├─ public/              # 静态资源
└─ README.md
```

## 包结构（Workspace）

仓库内已按职责拆分为五个可复用包，位于 [packages](packages)：

- [packages/maa-log-kernel](packages/maa-log-kernel)：协议与契约层（schema/types/output builder）
- [packages/maa-log-runtime](packages/maa-log-runtime)：通用运行时编排（adapter 驱动）
- [packages/maa-log-tools](packages/maa-log-tools)：Node 输入适配与 CLI
- [packages/maa-log-parser](packages/maa-log-parser)：解析器包壳（稳定导出 LogParser）
- [packages/maa-log-adapter](packages/maa-log-adapter)：本仓实现绑定层（连接现有 parser/statistics）

常用包级命令：

```bash
pnpm typecheck:packages
pnpm build:packages
pnpm kernel:cli <path> --pretty --no-events
```

## 更多文档

- 解析器架构说明：`packages/maa-log-parser/README.md`
- 新手教程协议文档：`docs/TUTORIAL_PROTOCOL.md`
- VSCode 插件说明：`src-vscode/README.md`

## 许可证

MIT License

## 致谢

- [MaaFramework](https://github.com/MaaXYZ/MaaFramework) - 自动化框架
- [maa-support-extension](https://github.com/neko-para/maa-support-extension) - 界面设计导师
- [M9A](https://github.com/MAA1999/M9A) - 最佳实践

### 开发者

感谢以下开发者对 MaaLogAnalyzer 作出的贡献：

[![贡献者](https://contrib.rocks/image?repo=MaaXYZ/MaaLogAnalyzer&max=1000)](https://github.com/MaaXYZ/MaaLogAnalyzer/graphs/contributors)

## 沟通交流

MaaFramework 开发交流 QQ 群：595990173

欢迎开发者加入官方 QQ 群，交流集成与开发实践。群内仅讨论开发相关议题。
