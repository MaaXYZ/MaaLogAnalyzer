# Maa Support <-> MaaLogAnalyzer JSON-RPC 协议（V1）

本文档定义 `maa-support-extension` 与 `maa-log-analyzer` 在 iframe 场景下的实时联动协议。

目标：

1. 保留 Support 插件上方控制区（断点、暂停、继续、停止）。
2. 下方展示区切换为 Analyzer iframe。
3. 双方统一使用 JSON-RPC 2.0 通信。

---

## 1. 分工

### 1.1 Support 插件负责

1. 采集运行时事件（已有 `pushNotify` 链路）。
2. 批量发送实时事件给 Analyzer。
3. 发送主题同步消息，并接收 Analyzer 的按键透传消息。
4. 提供反向查询（详情查询、快照回放）。

### 1.2 Analyzer 插件负责

1. 接收并处理 Support 的 JSON-RPC 通知。
2. 发起 JSON-RPC 请求（详情查询、快照请求）。
3. 监听 iframe 内快捷键并按需透传给 Support。
4. 做消息名规范化并增量更新 UI 状态。

---

## 2. 传输层

1. 通道：`window.postMessage`（Launch Webview <-> Analyzer iframe）。
2. 建议消息体：JSON 字符串，内容为 JSON-RPC 2.0 对象。
3. 发送前后均应校验 `event.source`，避免串台。

---

## 3. JSON-RPC 2.0 基础

### 3.1 Notification（单向通知，无返回）

```json
{
  "jsonrpc": "2.0",
  "method": "realtime.push",
  "params": { }
}
```

### 3.2 Request / Response（有返回）

请求：

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "method": "query.detail",
  "params": { }
}
```

成功返回：

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "result": { }
}
```

失败返回：

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "error": {
    "code": -32001,
    "message": "detail not found"
  }
}
```

---

## 4. 方法清单

### 4.1 Support -> Analyzer（Notification）

1. `bridge.hello`
2. `bridge.updateTheme`
3. `realtime.start`
4. `realtime.push`
5. `realtime.end`
6. `realtime.snapshot.end`

### 4.2 Analyzer -> Support（Request）

1. `query.detail`
2. `query.node`
3. `query.taskDoc`
4. `command.reveal`
5. `command.openCrop`
6. `realtime.snapshot.request`

### 4.3 Analyzer -> Support（Notification）

1. `bridge.ready`
2. `bridge.keydown`

---

## 5. 参数定义

### 5.1 bridge.hello（Notification）

Support -> Analyzer，iframe 初始化后发送。

```ts
interface BridgeHelloParams {
  protocolVersion: 1
  from: 'maa-support-extension'
  supportVersion?: string
}
```

### 5.2 bridge.ready（Notification）

Analyzer -> Support，准备好接收实时消息后发送。

```ts
interface BridgeReadyParams {
  protocolVersion: 1
  from: 'maa-log-analyzer'
  capabilities: string[]
}
```

### 5.3 bridge.updateTheme（Notification）

Support -> Analyzer，主题样式透传。

```ts
interface BridgeUpdateThemeParams {
  htmlStyle: string
  bodyClass: string
}
```

Analyzer 收到后执行：

1. `document.documentElement.setAttribute('style', htmlStyle)`
2. `document.body.setAttribute('class', bodyClass)`

### 5.4 bridge.keydown（Notification）

Analyzer -> Support，按键透传。

```ts
interface BridgeKeydownParams {
  key: string
  code: string
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
  repeat: boolean
}
```

实现约束（当前版本）：

1. Analyzer 仅向 Support 透传 `Ctrl/Cmd + W/P/T`。
2. `Ctrl/Cmd + C/X/V/A/Z` 由 iframe 内本地处理（例如复制、粘贴、全选、撤销），不透传给 Support。
3. Analyzer 在命中上述快捷键后会调用 `preventDefault()`，避免同一按键在内外层重复处理。

### 5.5 realtime.start（Notification）

Support -> Analyzer，会话开始。

```ts
interface RealtimeStartParams {
  sessionId: string
  instanceId: string
  source: 'maa-support-extension'
  supportVersion?: string
  maaVersion?: string
  startedAt: number
}
```

### 5.6 realtime.push（Notification）

Support -> Analyzer，批量事件（核心）。

```ts
interface RealtimeEventItem {
  seq: number
  at: number
  msg: string
  details: Record<string, unknown>
}

interface RealtimePushParams {
  sessionId: string
  mode: 'live' | 'snapshot'
  seqStart: number
  seqEnd: number
  events: RealtimeEventItem[]
}
```

### 5.7 realtime.end（Notification）

Support -> Analyzer，会话结束。

```ts
interface RealtimeEndParams {
  sessionId: string
  reason: 'finished' | 'stopped' | 'disposed' | 'error'
  finalSeq: number
  endedAt: number
}
```

### 5.8 query.detail（Request）

Analyzer -> Support，按需查询详情（图片懒加载）。

请求参数：

```ts
interface QueryDetailParams {
  sessionId: string
  target: 'reco' | 'action' | 'cached_image'
  id: number
  taskId?: number
  task_id?: number
}
```

字段语义：

1. `target='reco'`：`id` 是 `reco_id`。
2. `target='action'`：`id` 是 `action_id`。
3. `target='cached_image'`：`id` 是图片引用 id（不是 `reco_id` / `action_id`）。
4. `taskId/task_id`：用于跨 task 同 id 场景下精确命中。
   - 约定：`target='reco'|'action'` 时应至少提供其一（`taskId` 或 `task_id`）。
   - `target='cached_image'` 可不传；若传入则用于额外校验上下文。
5. `target='cached_image'` 查询时，`id` 必须来自上一跳 `reco/action` 返回的 `cached_image` 引用。

返回：

```ts
interface QueryDetailResult {
  target: 'reco' | 'action' | 'cached_image'
  id: number
  data: unknown
}
```

`data` 建议结构：

```ts
interface QueryDetailRecoData {
  info: Record<string, unknown>
  cached_image?: {
    raw?: number
    draws?: number[]
  }
}

interface QueryDetailActionData {
  info: Record<string, unknown>
}

interface QueryDetailCachedImageData {
  dataUrl: string // 例如 data:image/png;base64,...
}
```

约束：

1. `reco/action` 默认不返回 `raw/draw` 图片正文，只返回 `cached_image` 引用 id。
2. 图片正文仅通过 `target='cached_image'` 获取，避免实时推送阶段提前占用 Analyzer 内存。
3. Support 侧按 `sessionId + taskId + (reco_id/action_id)` 维护详情缓存，避免跨 task 串数据。
4. Analyzer 推荐调用顺序：
   1) `query.detail(target='reco', id=reco_id, taskId=task_id)`
   2) 读取 `data.cached_image.raw/draws`
   3) 对每个图片引用 id 调 `query.detail(target='cached_image', id=<refId>, taskId=task_id)`
5. `cached_image.id` 与 `reco_id/action_id` 语义不同，禁止混用。

### 5.9 query.node（Request）

Analyzer -> Support，查询任务节点定义数据。

请求参数：

```ts
interface QueryNodeParams {
  sessionId: string
  task: string
}
```

返回：

```ts
interface QueryNodeResult {
  task: string
  data: string | null
}
```

### 5.10 query.taskDoc（Request）

Analyzer -> Support，查询任务文档文本（同旧版 TaskDoc 展示逻辑）。

请求参数：

```ts
interface QueryTaskDocParams {
  sessionId: string
  task: string
}
```

返回：

```ts
interface QueryTaskDocResult {
  task: string
  doc: string
}
```

### 5.11 command.reveal（Request）

Analyzer -> Support，请求在工程中定位并跳转任务（旧版 `gotoTask`）。

请求参数：

```ts
interface CommandRevealParams {
  sessionId: string
  task: string
}
```

返回：

```ts
interface CommandRevealResult {
  ok: true
}
```

### 5.12 command.openCrop（Request）

Analyzer -> Support，请求打开 Crop 工具并展示图像（可选附带 reco 详情）。

请求参数：

```ts
interface CommandOpenCropParams {
  sessionId: string
  cachedImageId?: number
  cached_image_id?: number
  dataUrl?: string
  data_url?: string
  taskId?: number
  task_id?: number
  recoId?: number
  reco_id?: number
}
```

字段语义：

1. `cachedImageId/cached_image_id` 与 `dataUrl/data_url` 至少提供一组。
2. 两种图片来源同时提供时，以 `cachedImageId/cached_image_id` 为准。
3. 传 `cachedImageId/cached_image_id` 时，若同时传 `taskId/task_id`，Support 可做上下文校验。
4. `recoId/reco_id` 用于附带 reco 详情到 Crop；传该字段时必须同时提供 `taskId/task_id` 以避免串数据。

返回：

```ts
interface CommandOpenCropResult {
  ok: true
  detailAttached: boolean
}
```

### 5.13 realtime.snapshot.request（Request）

Analyzer -> Support，请求断线恢复。

请求参数：

```ts
interface SnapshotRequestParams {
  sessionId: string
  lastSeq: number
  maxBatchSize?: number
}
```

返回：

```ts
interface SnapshotRequestResult {
  accepted: boolean
  sessionId: string
  fromSeq: number
  toSeq: number
  totalEvents: number
}
```

返回 `accepted=true` 后，Support 通过多次 `realtime.push(mode='snapshot')` 回放，再发送 `realtime.snapshot.end`。

### 5.14 realtime.snapshot.end（Notification）

Support -> Analyzer，快照回放结束。

```ts
interface SnapshotEndParams {
  sessionId: string
  fromSeq: number
  toSeq: number
  pushedBatches: number
  pushedEvents: number
}
```

---

## 6. 消息名规范化（Analyzer 端）

Support 侧消息可能是去前缀格式（例如 `Task.Starting`）。

Analyzer 应映射为标准名：

| 输入 | 标准化后 |
| --- | --- |
| `Task.*` | `Tasker.Task.*` |
| `PipelineNode.*` | `Node.PipelineNode.*` |
| `RecognitionNode.*` | `Node.RecognitionNode.*` |
| `ActionNode.*` | `Node.ActionNode.*` |
| `NextList.*` | `Node.NextList.*` |
| `Recognition.*` | `Node.Recognition.*` |
| `Action.*` | `Node.Action.*` |

未命中映射：记录 warning 并忽略。

---

## 7. 性能与批量建议

1. Support 批量周期：`50~100ms`。
2. `realtime.push` 单批建议上限：`200` 事件。
3. `realtime.end` 前强制 flush。
4. 快照回放同样分批，不要单包全量。
5. Analyzer 端按 `sessionId + seq` 去重。

---

## 8. 错误码建议（JSON-RPC error.code）

1. `-32001`：NOT_FOUND（详情不存在）
2. `-32002`：SESSION_NOT_FOUND
3. `-32003`：SNAPSHOT_NOT_AVAILABLE（保留码，可用于快照不可用场景）
4. `-32004`：INVALID_PARAMS
5. `-32005`：INTERNAL_ERROR

---

## 9. 最小验收标准

1. Support 发 `realtime.start/push/end` 后，Analyzer 能实时显示任务与节点变化。
2. `bridge.updateTheme` 生效，iframe 主题与 VS Code 保持一致。
3. `bridge.keydown` 生效，iframe 内快捷键可透传给 Support 且不影响本地复制。
4. `query.detail` 可按 `reco/action/cached_image` 返回结果。
5. `realtime.snapshot.request` 可触发分批回放并以 `realtime.snapshot.end` 收尾。
6. `query.node / query.taskDoc` 可返回任务定义与文档文本。
7. `command.reveal / command.openCrop` 可触发 Support 侧跳转与打开 Crop。

---

双方统一按本文档实现。

---

## 10. 联调最小消息样例（start / push / end）

以下是最小可跑通的一组 JSON-RPC Notification。

### 10.1 realtime.start

```json
{
  "jsonrpc": "2.0",
  "method": "realtime.start",
  "params": {
    "sessionId": "demo-session-1",
    "instanceId": "instance-1",
    "source": "maa-support-extension",
    "startedAt": 1760000000000
  }
}
```

### 10.2 realtime.push

```json
{
  "jsonrpc": "2.0",
  "method": "realtime.push",
  "params": {
    "sessionId": "demo-session-1",
    "mode": "live",
    "seqStart": 1,
    "seqEnd": 3,
    "events": [
      {
        "seq": 1,
        "at": 1760000000100,
        "msg": "Task.Starting",
        "details": {
          "task_id": 200000001,
          "uuid": "demo-uuid-1",
          "entry": "Psychube"
        }
      },
      {
        "seq": 2,
        "at": 1760000000200,
        "msg": "PipelineNode.Succeeded",
        "details": {
          "task_id": 200000001,
          "node_id": 1,
          "name": "Start"
        }
      },
      {
        "seq": 3,
        "at": 1760000000300,
        "msg": "Task.Succeeded",
        "details": {
          "task_id": 200000001,
          "uuid": "demo-uuid-1"
        }
      }
    ]
  }
}
```

说明：Analyzer 会把 `Task.*`、`PipelineNode.*` 自动规范化为标准前缀消息。

### 10.3 realtime.end

```json
{
  "jsonrpc": "2.0",
  "method": "realtime.end",
  "params": {
    "sessionId": "demo-session-1",
    "reason": "finished",
    "finalSeq": 3,
    "endedAt": 1760000000400
  }
}
```
