# Maa Log Analyzer External Tool API 协议（V1）

本文档定义 Maa Log Analyzer 对外提供的日志解析与证据查询接口契约。

目标：让外部编排项目（Agent/Workflow）可以稳定、可追溯地调用分析能力。

---

## 1. 术语与边界

1. `Caller`：外部编排方（例如 Orchestrator）。
2. `Analyzer`：本项目导出的工具能力层。
3. 本协议只覆盖工具接口，不包含 LLM 选择、Prompt 策略、前端 AI 对话。

---

## 2. 设计原则

1. 确定性：相同输入得到相同结构输出。
2. 可追溯：输出可回溯到 task/node/line 等证据源。
3. 可演进：通过 `api_version` 做版本管理。
4. 低耦合：协议不依赖 UI 状态与会话 API Key。

---

## 3. 传输封装

协议层可承载在 JSON-RPC 2.0 或等价调用总线之上。

统一请求体（逻辑结构）：

```json
{
  "request_id": "req-001",
  "api_version": "v1",
  "tool": "get_node_timeline",
  "args": {
    "session_id": "s-001",
    "task_id": 12,
    "node_id": 38,
    "limit": 200
  }
}
```

统一响应体（成功）：

```json
{
  "request_id": "req-001",
  "api_version": "v1",
  "ok": true,
  "data": {},
  "meta": {
    "duration_ms": 21,
    "warnings": []
  },
  "error": null
}
```

统一响应体（失败）：

```json
{
  "request_id": "req-001",
  "api_version": "v1",
  "ok": false,
  "data": null,
  "meta": {
    "duration_ms": 5,
    "warnings": []
  },
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "task_id=12 not found",
    "retryable": false
  }
}
```

---

## 4. 方法清单

### 4.1 Caller -> Analyzer（Request）

| 方法名 | 用途 | 必填参数 |
| --- | --- | --- |
| `parse_log_bundle` | 解析日志输入并建立查询会话 | `session_id`, `inputs` |
| `get_task_overview` | 返回任务级统计与热点摘要 | `session_id` |
| `get_node_timeline` | 返回节点时序事件 | `session_id`, `task_id`, `node_id` |
| `get_next_list_history` | 返回 next_list 候选变化轨迹 | `session_id`, `task_id`, `node_id` |
| `get_parent_chain` | 返回节点父子链路 | `session_id`, `task_id`, `node_id` |
| `get_raw_lines` | 回捞原始日志行作为事实证据 | `session_id`, `task_id` |

---

## 5. 方法定义

### 5.1 parse_log_bundle

用途：载入并解析日志集合，创建可复用查询上下文。

请求参数：

```ts
interface ParseLogBundleArgs {
  session_id: string
  inputs: Array<{
    path: string
    kind: 'file' | 'folder' | 'zip'
  }>
}
```

返回结构：

```ts
interface ParseLogBundleResult {
  session_id: string
  task_count: number
  event_count: number
  warnings: string[]
}
```

---

### 5.2 get_task_overview

用途：返回任务级状态、耗时、失败热点等聚合信息。

请求参数：

```ts
interface GetTaskOverviewArgs {
  session_id: string
  task_id?: number
}
```

返回结构（示意）：

```ts
interface GetTaskOverviewResult {
  task: {
    task_id: number
    entry: string
    status: 'success' | 'failed' | 'running'
    duration_ms: number
  } | null
  summary: {
    node_count: number
    failed_node_count: number
    reco_failed_count: number
  }
  evidences: Evidence[]
}
```

---

### 5.3 get_node_timeline

用途：返回指定节点的执行时序（事件、时间、行号）。

请求参数：

```ts
interface GetNodeTimelineArgs {
  session_id: string
  task_id: number
  node_id: number
  limit?: number
}
```

返回结构（示意）：

```ts
interface GetNodeTimelineResult {
  timeline: Array<{
    ts: string
    event: string
    node_id: number
    name: string
    line: number | null
  }>
  evidences: Evidence[]
}
```

---

### 5.4 get_next_list_history

用途：返回 next_list 候选、anchor/jump_back 标记与结果轨迹。

请求参数：

```ts
interface GetNextListHistoryArgs {
  session_id: string
  task_id: number
  node_id: number
  limit?: number
}
```

返回结构（示意）：

```ts
interface GetNextListHistoryResult {
  history: Array<{
    line: number | null
    candidates: Array<{
      name: string
      anchor: boolean
      jump_back: boolean
    }>
    outcome: 'succeeded' | 'failed' | 'unknown'
  }>
  evidences: Evidence[]
}
```

---

### 5.5 get_parent_chain

用途：返回节点父链与祖先链，辅助定位上游影响。

请求参数：

```ts
interface GetParentChainArgs {
  session_id: string
  task_id: number
  node_id: number
}
```

返回结构（示意）：

```ts
interface GetParentChainResult {
  chain: Array<{
    node_id: number
    name: string
    relation: 'self' | 'parent' | 'ancestor'
  }>
  evidences: Evidence[]
}
```

---

### 5.6 get_raw_lines

用途：按条件回捞原始日志行，作为最终事实依据。

请求参数：

```ts
interface GetRawLinesArgs {
  session_id: string
  task_id: number
  keywords?: string[]
  line_start?: number
  line_end?: number
  limit?: number
}
```

返回结构（示意）：

```ts
interface GetRawLinesResult {
  lines: Array<{
    line: number
    text: string
  }>
  evidences: Evidence[]
}
```

---

## 6. 证据模型

```ts
interface Evidence {
  evidence_id: string
  source_tool: string
  source_range: {
    session_id: string
    task_id?: number
    node_id?: number
    line_start?: number
    line_end?: number
  }
  payload: Record<string, unknown>
  confidence: number
}
```

约束：

1. 工具层事实证据默认 `confidence=1.0`。
2. `source_range` 必须可用于回溯原始来源。

---

## 7. 错误码

| code | 含义 | retryable | 调用方建议 |
| --- | --- | --- | --- |
| `INVALID_REQUEST` | 请求体格式或字段非法 | false | 修正参数后重试 |
| `UNSUPPORTED_VERSION` | 不支持的 `api_version` | false | 切换到受支持版本 |
| `SESSION_NOT_FOUND` | 会话不存在或已过期 | false | 重新调用 `parse_log_bundle` |
| `TASK_NOT_FOUND` | `task_id` 不存在 | false | 校验任务选择 |
| `NODE_NOT_FOUND` | `node_id` 不存在 | false | 校验节点选择 |
| `DATA_NOT_READY` | 数据尚未就绪 | true | 指数退避重试 |
| `INTERNAL_ERROR` | 内部处理错误 | true | 有限重试并记录日志 |

---

## 8. 兼容性约束

1. 字段命名统一 `snake_case`。
2. 时间字段统一 ISO-8601 字符串。
3. 行号统一 1-based。
4. 无数据列表返回空数组，不返回 `null`。
5. 新增字段只能追加，不得改变旧字段语义。

---

## 9. 最小验收标准（V1）

1. `parse_log_bundle` 可建立会话并返回 task/event 数量。
2. 六个工具接口均可独立调用并返回结构化结果。
3. 工具返回可构造 `Evidence`，并能回溯到 task/node/line。
4. 错误场景使用标准错误码并带 `retryable`。
5. 多次调用结果在同输入下结构一致。

---

## 10. Changelog

### V1

1. 定义统一请求/响应封装。
2. 定义六个基础工具接口。
3. 定义证据模型、错误码与兼容性规则。
