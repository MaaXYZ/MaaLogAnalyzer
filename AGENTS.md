# AGENTS.md

This file is the working guide for AI coding assistants in this repository.

## Project Scope

MaaLogAnalyzer currently contains three deliverables:

1. Web app (Vue 3 + TypeScript + Vite)
2. Tauri desktop app (`src-tauri`)
3. VS Code extension (`src-vscode`)

The core purpose is to parse MaaFramework logs (`maa.log`, `maa.bak.log`, zip logs) and visualize task/node execution flow.

## Repository Map

- `src/`: main web app source
- `packages/maa-log-parser/src/core/logParser.ts`: log parsing core implementation
- `src/utils/fileDialog.ts`: cross-platform file/folder open logic (Web/Tauri)
- `src/views/ProcessView.vue`: task list + flow entry interactions
- `src/views/FlowchartView.vue`: flowchart rendering
- `src-tauri/`: desktop app (Rust + Tauri 2)
- `src-tauri/capabilities/default.json`: Tauri permissions and fs scope
- `src-vscode/src/extension.ts`: extension entry + commands + webview bridge
- `.github/workflows/`: CI/CD pipelines

## Common Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm tauri:dev
pnpm tauri:build
```

VS Code extension:

```bash
pnpm build:vscode
cd src-vscode && npm run compile
```

## Architecture Notes

### Parsing Pipeline

1. User opens file/folder/zip
2. `LogParser.parseFile()` parses in chunks (non-blocking)
3. OnEventNotify events are extracted and deduplicated
4. Protocol events are reduced into a trace tree
5. Tasks are projected from trace via `getTasksSnapshot()` or `consumeTasks()`
6. UI-specific node flow / recognition views are derived from projected task data
7. UI renders Process/Detail/Flow/Search views

### Key Data Types

- `LogLine`
- `EventNotification`
- `TaskInfo`
- `NodeInfo`
- `RecognitionAttempt`

See `src/types.ts` for canonical definitions.

Compatibility note:

- `src/types.ts` is now a compatibility type facade.
- Canonical parser-owned type definitions live in `packages/maa-log-parser/src/types.ts`.
- `LogParser#getTasksSnapshot()` is non-consuming and should be used for realtime/incremental reads.
- `LogParser#consumeTasks()` is consuming and clears buffered parser state after projection, which fits one-shot file parsing flows.

## Implementation Rules

- Keep parser performance-first (avoid expensive per-line allocations)
- Preserve string pooling behavior (`packages/maa-log-parser/src/stringPool.ts`)
- Keep Web/Tauri behavior aligned for file and folder loading
- Do not introduce platform-specific behavior unless explicitly required
- Prefer incremental fixes over broad refactors in parser/view sync code

## Tauri-Specific Guidance

- Dialog and filesystem access are gated by capability config.
- Keep `src-tauri/capabilities/default.json` in sync with frontend fs usage.
- If `plugin-fs` path checks fail, verify `fs:scope` allow rules first.
- Current app expects users to open arbitrary log paths, so scope must allow selected paths.

## VS Code Extension Guidance

- Extension commands and sidebar items are defined in `src-vscode/package.json`.
- Runtime logic is in `src-vscode/src/extension.ts`.
- Use `package.nls.json` + `package.nls.zh-cn.json` for i18n labels.
- Windows-only features (Explorer context menu install/uninstall) should be hidden on non-Windows.
- Context-menu scripts live in `src-vscode/scripts/windows/`.

## CI/CD Notes

- `deploy.yml` now supports both branch pushes and `v*` tag pushes.
- Version calculation uses `git describe --tags --match "v*"`.
- To avoid wrong version in CI, ensure tags are fetched (`fetch-depth: 0`, `fetch-tags: true`).
- If commit is pushed before tag, tag push should trigger a second run with the expected version.

## Known Pitfalls

- Task selection sync issues can happen between watchers (`selectedTask` vs `initialTask`).
- Flowchart index display must follow global task execution order, not local node order.
- In Tauri folder-open flow, selecting the `debug` folder directly must work (check current folder first, then `debug` subfolder, then recursive search).
- For VS Code webview CSP, avoid dynamic chunk loading unless nonce/CSP policy is configured for it.

## Validation Checklist Before Finishing

1. Run the smallest relevant build/check command.
2. Verify no accidental encoding corruption (especially Chinese text files).
3. Review `git diff` for unrelated edits.
4. Confirm platform-specific behavior on at least one realistic path (log file/folder/zip).

## Encoding Safety (Must Follow)

- Treat terminal-rendered `???` as potentially display-only corruption; verify file content before editing further.
- Prefer `apply_patch` for text edits, especially in files containing Chinese text.
- If scripting is required, avoid passing large non-ASCII blocks through shell strings.
- For scripted writes, use UTF-8 without BOM and verify the exact changed block after write.
- Do not perform broad block replacements when a line-level edit is enough.
- After any non-ASCII edit, always run:
  1. `git diff` on touched files
  2. direct file snippet check around changed lines
- If Chinese text appears corrupted in diff, stop and repair encoding/content before continuing any other changes.
