# 发布指南

本文档描述 MaaLogAnalyzer 的版本管理与发布流程。所有版本操作请遵循本文档，避免 CI 发布失败或产出错误版本号。

## 版本模型

- 主项目版本为语义化版本（SemVer），以 `v*` 形式打 tag（例：`v3.6.0`）。
- 版本号由 git tag 派生，不手动修改：
  - `deploy.yml`：`git describe --tags --long --match "v*"` 派生（含 `-post.N` 后缀用于非 tag 构建）。
  - `release-vscode.yml`：tag 触发时取 tag 本身；main push 时派生 `X.Y.Z-post.N`。
- 五个 npm 包（`packages/*`）的版本号**独立维护**，与主项目 tag 无关，见下方「npm 包发布」。

## 版本同步

`scripts/sync-version.mjs` 会把一个版本号同步写入以下文件：

- `package.json`
- `src-vscode/package.json`
- `src-vscode/package-lock.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`

```bash
pnpm run version 1.2.3          # 同步版本
pnpm run version:check          # 校验各文件版本与 package.json 一致（CI 使用）
```

> 注意：`pnpm run version` 只改版本文件，不改 CHANGELOG.md。发布前请先在 CHANGELOG.md 追加精炼后的版本条目（见下）。

## CHANGELOG

CHANGELOG.md 由**人工精炼维护**：条目合并同类项、以用户视角描述（内部重构/CI 细节一般不逐条罗列）。每版发布前，可用 [git-cliff](https://git-cliff.org/) 生成草稿辅助——它是"防漏"检查表（从 git 历史列出全部提交），**不是最终条目**。

安装 git-cliff（任选其一）：

```bash
cargo install git-cliff           # 需要 Rust 工具链
winget install git-cliff          # Windows 包管理器
# 或从 GitHub Releases 下载对应平台二进制
```

常用命令：

```bash
pnpm run changelog:draft              # 生成/刷新草稿 CHANGELOG.draft.md（按全部 tag）
pnpm run changelog:draft:unreleased   # 预览未发布提交（HEAD 尚无 tag 的部分）
```

> 只读 `CHANGELOG.draft.md`，**不要用 git-cliff 覆盖正式的 `CHANGELOG.md`**。

## 发布流程

### 1. 常规发版（tag 触发）

适用于 Web / Tauri / VS Code 扩展的正式版发布：

```bash
# 前置：所有变更已合入 main，且本地已 fetch 最新 tag（CI 需要 fetch-tags）
git fetch --tags origin

# 1. 生成草稿并人工精炼（把当前 HEAD 视为目标版本）
git-cliff --tag v3.7.0 -o CHANGELOG.draft.md
# 对照草稿，把同类提交合并、改写成用户视角条目，追加到 CHANGELOG.md 的 v3.7.0 段：
#   ## [3.7.0] - <日期>
#   ### 新增 / ### 修复 / ### 变更 ...

# 2. 同步版本号（提交进 git，使 tag 指向的提交与版本文件一致）
pnpm run version 3.7.0

# 3. 提交并打标签
git add CHANGELOG.md CHANGELOG.draft.md package.json src-vscode/package.json \
  src-vscode/package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(release): v3.7.0"
git tag -a v3.7.0 -m "v3.7.0"
git push origin main v3.7.0
```

tag 推送后触发（注意 `release-vscode.yml` 的 build job 不会处理 main push 的自动发布）：

| 工作流               | 触发                              | 行为                                                                                                         |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `release-vscode.yml` | `v*` tag                          | 构建 vsix → 发布 VS Code Marketplace（`vsce publish`）→ 创建 GitHub Release（附 vsix，notes 取自 CHANGELOG） |
| `deploy.yml`         | `v*` tag / main push              | 构建并部署 Web 版到服务器                                                                                    |
| `release-npm.yml`    | main push（仅涉及 packages 路径） | 见下方「npm 包发布」                                                                                         |

prerelease tag（如 `v3.7.0-beta.1`）会被 `release-vscode.yml` 跳过（build 与 release 均不运行），仅部署 Web 版。

### 2. npm 包发布

- 触发：push 到 `main` 且变更涉及 `packages/**`、`pnpm-lock.yaml` 或该 workflow 自身。
- 版本来源：各包自己 `package.json` 的 `version`，与主项目 tag **无关**。
- 行为：逐个检查 npm 上是否已存在同版本号，不存在才 `npm publish`（`--access public --provenance`，已存在则跳过）。
- 因此发布某个包：手动 bump `packages/<pkg>/package.json` 的版本 → 提交到 main → CI 自动发布。重复提交同一版本不会重复发布。

### 3. Web 版

`deploy.yml` 在 main push 与 `v*` tag 推送时自动构建并部署（无需人工操作）。版本号由 `git describe` 派生，tag 不存在时得到 `0.0.1-post.N` 之类的预览版本。

## 回滚

- Web 版：`deploy.yml` 由 `ssh-deploy` 部署，默认不启用 `--delete`，旧文件保留在服务器；紧急回滚可手动用 `gh workflow run deploy.yml` 重跑历史上游 commit 对应的 SHA（`gh run rerun` 指定 run 或 checkout 对应 commit 后手动触发 `workflow_dispatch`）。
- VS Code 扩展：Marketplace 不支持直接下线已发布版本，只能发布更高版本覆盖；如需撤下，在 VS Code Marketplace 管理页下架。
- npm 包：`npm unpublish` 有 72 小时窗口与大版本限制（`npm unpublish pkg@ver --force` 操作前先在 npm 账号设置确认）；发布错误版本时优先发修正版本。

## 注意事项

- CI 版本派生依赖 tag 历史：`deploy.yml` 配置了 `fetch-depth: 0` + `fetch-tags: true`，`release-vscode.yml` 依赖 `fetch-depth: 0`（会一起拉取全部 tag）；如果在 tag 之前推送了 commit，tag 推送会再触发一轮带正确版本的流程。
- `release-vscode.yml` 的 publish 使用 `VSCE_PAT`，`release-npm.yml` 使用 `NPM_TOKEN`，两者缺失时对应 CI 会失败（preflight 阶段即报错）；发布前确认 secret 存在。
- GitHub Release 的 notes 由 `scripts/changelog-notes.mjs` 从 CHANGELOG.md 提取对应版本段落，因此 CHANGELOG.md 必须先提交（见发布流程第 1 步），否则 tag 推送后 Release notes 为空、工作流报错。
- `CHANGELOG.draft.md` 是草稿，可随时用 `pnpm run changelog:draft` 重跑刷新；正式的 `CHANGELOG.md` 只能人工编辑，任何脚本都不会碰它（`changelog-notes.mjs` 只读）。
- 桌面端（Tauri）目前没有自动发布安装包的 workflow；如新增，参考本仓库历史（曾有校验资产与 checksum 的 release 流程被移除）。
