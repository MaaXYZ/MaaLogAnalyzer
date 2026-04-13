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
5. 多输入定位：涉及行号证据时，必须能通过 `source_key + 1-based line` 回溯原文。

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
  scope_id?: string
  occurrence_index?: number
  limit?: number
}
```

定位规则：

1. `task_id + node_id` 表示逻辑节点，不保证唯一对应某一次执行。
2. `scope_id` 优先级最高，用于唯一定位某一次节点执行实例。
3. `occurrence_index` 表示该 `task_id + node_id` 在时序上的第几次出现，使用 1-based。
4. 当 `scope_id` 与 `occurrence_index` 都缺失时，允许返回该节点的所有匹配实例，但每条结果必须带上实例标识。

补充约束：

1. `scope_id` 必须是同输入下可复现的确定性标识，不能使用随机值。
2. 建议格式为 `<scope_kind>:<task_id_or_0>:<local_id_or_0>:seq<start_seq>`。
3. `occurrence_index` 只按 `(task_id, node_id)` 对 `PipelineNode` 执行实例做计数。
4. 同一轮节点执行内的 `NextList / Recognition / Action / WaitFreezes / ActionNode / RecognitionNode` 共享该次 `occurrence_index`。

返回结构（示意）：

```ts
interface GetNodeTimelineResult {
  timeline: Array<{
    scope_id: string
    occurrence_index: number
    ts: string
    event: string
    node_id: number
    name: string
    source_key: string | null
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
  scope_id?: string
  occurrence_index?: number
  limit?: number
}
```

定位规则沿用 `get_node_timeline`。

查询语义：

1. 若仅提供 `task_id + node_id`，允许返回该逻辑节点的全部实例 history。
2. 若提供 `scope_id` 或 `occurrence_index`，则只返回对应单次节点执行实例的数据。

返回结构（示意）：

```ts
interface GetNextListHistoryResult {
  history: Array<{
    scope_id: string
    occurrence_index: number
    source_key: string | null
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
  scope_id?: string
  occurrence_index?: number
}
```

定位规则沿用 `get_node_timeline`。

查询语义：

1. `get_parent_chain` 面向单个节点执行实例。
2. 若 `task_id + node_id` 命中多个实例，且请求未提供 `scope_id` 或 `occurrence_index`，则应返回歧义错误，而不是隐式选择其中一个。

返回结构（示意）：

```ts
interface GetParentChainResult {
  chain: Array<{
    scope_id: string
    scope_kind: 'task' | 'pipeline_node' | 'recognition_node' | 'action_node' | 'next_list' | 'recognition' | 'action' | 'wait_freezes'
    task_id?: number
    node_id?: number
    name: string
    occurrence_index?: number
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
  source_key?: string
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
    source_key: string
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
    source_key?: string
    task_id?: number
    node_id?: number
    scope_id?: string
    occurrence_index?: number
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
3. 当 `line_start/line_end` 有值时，多输入场景下应同时提供 `source_key`。
4. 当证据针对某一次具体节点执行时，应优先提供 `scope_id`，必要时补充 `occurrence_index`。
5. `task_id + node_id` 在证据模型中默认表示逻辑节点；若需唯一定位单次执行，应使用 `scope_id`。

---

## 7. 错误码

| code | 含义 | retryable | 调用方建议 |
| --- | --- | --- | --- |
| `INVALID_REQUEST` | 请求体格式或字段非法 | false | 修正参数后重试 |
| `UNSUPPORTED_VERSION` | 不支持的 `api_version` | false | 切换到受支持版本 |
| `SESSION_NOT_FOUND` | 会话不存在或已过期 | false | 重新调用 `parse_log_bundle` |
| `TASK_NOT_FOUND` | `task_id` 不存在 | false | 校验任务选择 |
| `NODE_NOT_FOUND` | `node_id` 不存在 | false | 校验节点选择 |
| `SCOPE_NOT_FOUND` | `scope_id` 不存在或不属于该 `task_id/node_id` | false | 校验实例定位参数 |
| `AMBIGUOUS_SCOPE_SELECTOR` | 仅凭当前定位条件命中多个节点实例 | false | 补充 `scope_id` 或 `occurrence_index` |
| `DATA_NOT_READY` | 数据尚未就绪 | true | 指数退避重试 |
| `INTERNAL_ERROR` | 内部处理错误 | true | 有限重试并记录日志 |

---

## 8. 兼容性约束

1. 字段命名统一 `snake_case`。
2. 时间字段统一 ISO-8601 字符串。
3. 行号统一 1-based。
4. 无数据列表返回空数组，不返回 `null`。
5. 新增字段只能追加，不得改变旧字段语义。
6. `scope_id` 只要求在同一 `session_id` 内稳定唯一，不要求跨会话复用。
7. `task_id + node_id` 默认表示逻辑节点；需要精确到单次执行时，调用方应传 `scope_id` 或 `occurrence_index`。
8. 列表型接口可接受逻辑节点宽查询；单实例接口不得在多命中时隐式选取结果。

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
