# Maa Log Parser 重构架构设计

本文档用于固定 MaaLogAnalyzer 日志解析器的下一阶段重构设计，目标是把当前“协议解析、运行时推导、UI 组装”混杂在一起的实现，拆成清晰稳定的三段式结构，便于后续持续重构和对照实现。

## 1. 设计目标

本次重构的目标不是改变 UI 表现，而是改变内部结构。

约束：

1. 现有 UI 的任务列表、节点详情、流程图、子任务嵌套、截图关联等显示效果保持不变。
2. 允许内部字段、内部中间模型、内部模块划分发生变化。
3. 优先建立清晰的协议层和中间语义层，再做 UI 投影。
4. 去重逻辑必须保留，并从“散落在各层的补偿逻辑”收敛为明确的输入去重策略。

## 2. 上游协议范围

协议来源：

- `sample/MaaFramework/include/MaaFramework/MaaMsg.h`

当前解析器需要完整覆盖 4 个 domain 的回调消息：

1. `Resource.Loading.*`
2. `Controller.Action.*`
3. `Tasker.Task.*`
4. `Node.*`

其中 `Node.*` 继续细分为：

1. `Node.PipelineNode.*`
2. `Node.RecognitionNode.*`
3. `Node.ActionNode.*`
4. `Node.NextList.*`
5. `Node.Recognition.*`
6. `Node.Action.*`
7. `Node.WaitFreezes.*`

协议层只负责确认：

1. 事件属于哪个 domain
2. 事件属于哪个 kind
3. 事件 phase 是 `Starting` / `Succeeded` / `Failed`
4. 对应 `details_json` 中有哪些确定字段

协议层不负责推断：

1. 某个事件应属于哪个 UI 节点
2. 某个 recognition 是顶层识别还是动作内识别
3. 某个子任务应挂到哪一层 flow 下
4. 某张截图应该关联到哪个展示项

这些全部属于后续语义归约或 UI 投影。

## 3. 三段式总体架构

重构后解析主链路固定为三段：

1. `raw line -> ProtocolEvent`
2. `ProtocolEvent[] -> ScopeTree`
3. `ScopeTree -> UIProjection`

对应职责如下。

### 3.1 第一段：协议事件提取

输入：

- 原始日志行

输出：

- 强类型 `ProtocolEvent`

职责：

1. 只识别 `!!!OnEventNotify!!!` 行
2. 解析时间戳、进程号、线程号、消息名、原始 JSON、来源定位信息
3. 执行输入去重
4. 生成统一强类型协议事件

不做：

1. task/node/flow 归属判断
2. 子任务推断
3. recognition/action 补挂
4. UI 结构拼装

### 3.2 第二段：统一语义归约

输入：

- `ProtocolEvent[]`

输出：

- `ScopeTree`

职责：

1. 按事件顺序推进解析状态
2. 为 `Starting` / `Succeeded` / `Failed` 建立和闭合 scope
3. 把事件组织成稳定的树状执行结构
4. 保留足够的时序与层级信息，供后续 UI 投影

这一步不直接产出 `TaskInfo` / `NodeInfo`，避免 reducer 再次和 UI 数据结构耦合。

### 3.3 第三段：UI 投影

输入：

- `ScopeTree`

输出：

- 现有 UI 继续消费的 `TaskInfo[]`
- 后续可选的系统级视图数据（如 resource/controller trace）

职责：

1. 把语义树投影成当前页面需要的数据结构
2. 恢复现有 `node_flow`、`child_tasks`、`next_list`、`recognitions` 等展示结构
3. 做截图增强、fallback 补偿和少量 UI 兼容整理

补充说明：

- 三段式主链路仍然保持不变
- 面向其他项目的精细化查询，不通过 `UIProjection` 完成，而是基于第二段 `ScopeTree` 构建只读索引和查询 API

## 4. 第一段设计：ProtocolEvent

第一段输出统一的 `ProtocolEvent` union。

为支持外部工具做证据回溯，协议事件从第一段开始就必须携带稳定的来源定位信息。

建议增加：

```ts
type SourceRef = {
  sourceKey: string
  sourcePath?: string
  inputIndex: number
  line: number
}
```

建议基类字段：

```ts
type ProtocolEventBase = {
  seq: number
  ts: string
  tsMs: number
  processId: string
  threadId: string
  source: SourceRef
  rawMessage: string
  phase: 'starting' | 'succeeded' | 'failed'
  rawDetails: Record<string, unknown>
}
```

建议完整 union：

```ts
type ProtocolEvent =
  | ResourceLoadingEvent
  | ControllerActionEvent
  | TaskEvent
  | PipelineNodeEvent
  | RecognitionNodeEvent
  | ActionNodeEvent
  | NextListEvent
  | RecognitionEvent
  | ActionEvent
  | WaitFreezesEvent
```

建议的 payload 关注点：

1. `ResourceLoadingEvent`
   - `resId`
   - `path`
   - `resourceType`
   - `hash`

2. `ControllerActionEvent`
   - `ctrlId`
   - `uuid`
   - `action`
   - `param`
   - `info`

3. `TaskEvent`
   - `taskId`
   - `entry`
   - `uuid`
   - `hash`

4. `PipelineNodeEvent`
   - `taskId`
   - `nodeId`
   - `name`
   - `focus`
   - `nodeDetails`
   - `recoDetails`
   - `actionDetails`

5. `RecognitionNodeEvent`
   - `taskId`
   - `nodeId`
   - `name`
   - `focus`
   - `nodeDetails`
   - `recoDetails`

6. `ActionNodeEvent`
   - `taskId`
   - `nodeId`
   - `name`
   - `focus`
   - `nodeDetails`
   - `actionDetails`

7. `NextListEvent`
   - `taskId`
   - `name`
   - `list`
   - `focus`

8. `RecognitionEvent`
   - `taskId`
   - `recoId`
   - `name`
   - `focus`
   - `anchor`
   - `recoDetails`

9. `ActionEvent`
   - `taskId`
   - `actionId`
   - `name`
   - `focus`
   - `actionDetails`

10. `WaitFreezesEvent`
    - `taskId`
    - `wfId`
    - `name`
    - `waitPhase`
    - `roi`
    - `param`
    - `recoIds`
    - `elapsed`
    - `focus`

## 5. 输入去重设计

去重只发生在第一段输入层，不在 reducer 中混杂传输层补偿。

### 5.1 去重原则

输入层只处理“几乎确定是重复投递”的事件，不处理业务语义重复。

语义重复示例：

1. 重复的 `Tasker.Task.Starting`
2. 同一 task 内的异常重试
3. 同名节点多轮识别

这些都留给第二段或第三段做幂等和兼容。

### 5.2 规则一：exact replay dedup

条件：

- `timestampMs + source.sourceKey + message + rawDetailsHash` 完全相同

目的：

- 解决实时增量和全量重扫重叠
- 解决同一批日志行被重复喂入解析器

### 5.3 规则二：cross-source mirror dedup

条件：

- `message + rawDetailsHash` 相同
- 时间差在很小窗口内
- `source.sourceKey` 不同

建议默认时间窗口：

- `10ms`

目的：

- 解决同一通知被不同线程或来源镜像写出

### 5.4 规则三：业务语义重复不在输入层处理

例如：

- 相同 `task_id + uuid` 的二次 `Tasker.Task.Starting`
- 相同 `node_id` 的上游异常重发

这些不能简单按输入去重抹掉，否则容易误伤真实执行事件。

## 6. 第二段设计：ScopeTree

第二段的目标不是直接生成 UI 结构，而是先形成一个稳定的中间语义树。

### 6.1 Scope 类型

内部 scope 建议统一为：

1. `TraceRoot`
2. `ResourceLoading`
3. `ControllerAction`
4. `Task`
5. `PipelineNode`
6. `RecognitionNode`
7. `ActionNode`
8. `NextList`
9. `Recognition`
10. `Action`
11. `WaitFreezes`

### 6.2 Scope 节点建议结构

```ts
type ScopeNode = {
  id: string
  kind: ScopeKind
  status: 'running' | 'succeeded' | 'failed'
  ts: string
  endTs?: string
  seq: number
  endSeq?: number
  taskId?: number
  payload: unknown
  children: ScopeNode[]
}
```

说明：

1. `payload` 存原始强类型业务数据
2. `children` 只保存直接语义子节点，不平铺整棵子树；更深层级继续递归存放在子节点自己的 `children` 中
3. `seq/endSeq` 用于后续稳定排序和调试
4. `taskId` 作为快速索引字段，不代表所有 scope 都一定有 task

### 6.3 Reducer 核心状态

建议最小状态集：

```ts
type ReducerState = {
  root: ScopeNode
  openScopes: ScopeNode[]
  scopeIndexByKey: Map<string, ScopeNode>
  taskRootsById: Map<number, ScopeNode>
  currentPipelineNodeByTaskId: Map<number, ScopeNode>
  currentNextListByTaskId: Map<number, ScopeNode>
}
```

各状态作用：

1. `root`
   - 整棵 trace 的统一根节点

2. `openScopes`
   - 维护当前所有未终态 scope
   - 用于从最近上下文中找父 scope

3. `scopeIndexByKey`
   - 通过 id 快速找到对应 open scope
   - 用于终态事件回填和闭合

4. `taskRootsById`
   - 快速拿到 task 根 scope

5. `currentPipelineNodeByTaskId`
   - 为 `NextList` 和大量当前 task 内事件提供默认容器

6. `currentNextListByTaskId`
   - 让 `Recognition` 在 next-list 轮次中优先挂到当前 `NextList`

### 6.4 Scope key 规则

建议统一 key 规则：

1. `ResourceLoading`
   - `resource:${resId}`

2. `ControllerAction`
   - `controller:${ctrlId}`

3. `Task`
   - `task:${taskId}`

4. `PipelineNode`
   - `task:${taskId}:pipeline:${nodeId}`

5. `RecognitionNode`
   - `task:${taskId}:reco-node:${nodeId}`

6. `ActionNode`
   - `task:${taskId}:action-node:${nodeId}`

7. `Recognition`
   - `task:${taskId}:reco:${recoId}`

8. `Action`
   - `task:${taskId}:action:${actionId}`

9. `WaitFreezes`
   - `task:${taskId}:wf:${wfId}`

说明：

- `NextList` 没稳定唯一 id，不放入全局 `scopeIndexByKey`
- `NextList` 使用 `currentNextListByTaskId`

## 7. 父子挂载规则

统一原则：

1. `Starting` 事件创建新 scope
2. 找到父 scope
3. 挂入父节点
4. 进入 `openScopes`
5. `Succeeded/Failed` 事件按 key 回填并闭合

父子关系不是“前一个事件就是父节点”，而是：

- 优先找最近一个仍未终态且允许接收该类型子事件的 scope

### 7.1 固定规则

1. `ResourceLoading`
   - 永远挂在 `TraceRoot`

2. `PipelineNode`
   - 挂在对应 `taskId` 的 `Task`

3. `NextList`
   - 挂在当前 `PipelineNode`

### 7.2 顺序规则

以下几类优先按“最近未终态业务 scope”挂载：

1. `ControllerAction`
2. `Task`
3. `Recognition`
4. `Action`
5. `WaitFreezes`

如果没有找到合适的业务 scope：

- `ControllerAction` 和 `Task` 可以回退挂到 `TraceRoot`

### 7.3 业务 scope 定义

“业务 scope”包括：

1. `Task`
2. `PipelineNode`
3. `RecognitionNode`
4. `ActionNode`
5. `NextList`
6. `Recognition`
7. `Action`
8. `WaitFreezes`

不属于业务 scope 的节点：

1. `TraceRoot`
2. `ResourceLoading`
3. `ControllerAction`

说明：

1. `ControllerAction` 可以挂在业务 scope 下，也可以直接挂 `TraceRoot`
2. `ResourceLoading` 不参与 task/node 级业务挂载

## 8. 关于 Recognition、WaitFreezes、ControllerAction 的特别说明

### 8.1 Recognition 不只属于 NextList

`Recognition` 不应被限制为只能挂在 `NextList` 下。

原因：

1. `RecognitionNode` 本身内部也会产生 `Recognition`
2. custom recognition / custom action 可以在上下文中继续调用识别
3. 语义上应允许 recognition 挂在当前任意合适的未终态业务 scope 下

因此：

- 若当前存在 `NextList`，`Recognition` 优先挂在 `NextList`
- 否则挂最近的未终态业务 scope

### 8.2 WaitFreezes 不强绑 Action

`WaitFreezes` 只表达“按顺序发生了一个等待画面静止的 span”，不在 reducer 中强行绑定到 `Action`。

原因：

1. 上游消息本身只提供 `wf_id / phase / task_id / name`
2. 它与 action 在 UI 里的关联是后续投影层的问题
3. 协议层和 reducer 层只需要保留稳定的顺序与父子上下文

因此：

- `WaitFreezes` 挂最近的未终态业务 scope
- 若当前存在更明确的业务容器，自然就会落在合适位置

### 8.3 ControllerAction 与 WaitFreezes 类似

`Controller.Action.*` 没有 `task_id`，但它具备明确的时序位置。

因此 reducer 处理策略为：

1. 优先挂最近的未终态业务 scope
2. 若当前没有合适业务 scope，则挂到 `TraceRoot`

这样可以自然区分：

1. 任务前的 `connect`
2. 任务中的 `screencap`
3. 动作中的 `click/swipe`

## 9. 第三段设计：UIProjection

第三段负责把 `ScopeTree` 投影成 UI 继续使用的数据结构。

### 9.1 输出方向

建议至少分成两类输出：

1. `TaskProjection`
   - 生成当前 UI 使用的 `TaskInfo[]`

2. `SystemProjection`
   - 保留 `ResourceLoading` 和 `ControllerAction` 的系统级 trace
   - 第一阶段可以先不接入 UI，但模型上应保留

### 9.2 TaskProjection 规则

建议投影方式：

1. `Task` scope -> `TaskInfo`
2. `PipelineNode / RecognitionNode / ActionNode` -> `NodeInfo`
3. `NextList` -> `next_list`
4. `Recognition / Action / WaitFreezes / Task` 子树 -> `node_flow`

附加策略：

1. 保持原有 UI 顺序不变，统一按 `seq` 排序
2. 通过 tree 天然父子关系恢复 `child_tasks`
3. 对缺失的终态或缺失的子 scope 做有限 fallback
4. 截图关联和视图补偿不进入 reducer，放在 projector 或后置 enrich 阶段

### 9.3 面向外部调用的 Query 能力

如果该包后续需要作为独立解析工具供其他项目调用，并支持“查询某个 task / node / reco / action / wait-freezes 的细节”，则不能只输出 `TaskInfo[]`。

需要把第二段产物作为正式对外能力的一部分保留下来。

建议解析结果至少包含：

```ts
type ParseArtifacts = {
  events: ProtocolEvent[]
  trace: ScopeNode
  index: TraceIndex
  rawLines?: RawLineStore
}
```

其中：

1. `events`
   - 保留协议事件序列
   - 适合做原始排查、调试、回放和精确区间定位

2. `trace`
   - 保留完整 `ScopeTree`
   - 适合按父子关系、时序范围、上下文位置做结构化查询

3. `index`
   - 是基于 `ScopeTree` 建立的只读索引
   - 用于高效查找目标 scope，而不是每次全树扫描

4. `rawLines`
   - 是可选的原始行存储
   - 用于 `line/source` 级证据回捞
   - 默认可关闭；面向外部工具协议时应开启

建议原始行存储至少包含：

```ts
type RawLineStore = {
  sources: Map<string, {
    sourcePath?: string
    inputIndex: number
    lines: string[]
  }>
}
```

说明：

1. `sourceKey` 是多输入场景下的稳定源标识
2. `line` 统一使用 1-based，实际从 `lines[index]` 回捞时按 `line - 1` 访问
3. 原始行文本不建议直接挂在每个 `ProtocolEvent` 上，避免额外内存放大
4. 需要证据回捞时，通过 `event.source + RawLineStore` 组合定位原文

建议索引至少包含：

```ts
type TraceIndex = {
  taskScopesByTaskId: Map<number, ScopeNode[]>
  pipelineNodeScopesByTaskIdAndNodeId: Map<string, ScopeNode[]>
  recognitionScopesByTaskIdAndRecoId: Map<string, ScopeNode[]>
  actionScopesByTaskIdAndActionId: Map<string, ScopeNode[]>
  waitFreezesScopesByTaskIdAndWfId: Map<string, ScopeNode[]>
  controllerScopes: ScopeNode[]
  resourceScopes: ScopeNode[]
}
```

说明：

1. 索引值建议使用数组，而不是假设所有 id 全局唯一
2. 上游在异常重试、重复投递、边界 case 下，某些 id 可能出现多次
3. 真正唯一的定位应优先依赖 `scope.id` 或 `seq/endSeq`

建议补充统一 locator 规则：

1. `task_id + node_id` 表示逻辑节点，不表示唯一执行实例
2. 单次节点执行实例的唯一标识使用 `scope.id`
3. 节点实例的顺序定位使用 `occurrenceIndex`

建议 `scope.id` 采用可复现的确定性格式：

```ts
type ScopeIdFormat =
  `${ScopeKind}:${taskIdOrZero}:${localIdOrZero}:seq${startSeq}`
```

建议取值规则：

1. `taskIdOrZero`
   - 有 `taskId` 时使用真实 `taskId`
   - 无 `taskId` 时使用 `0`

2. `localIdOrZero`
   - `Task` 使用 `taskId`
   - `PipelineNode / RecognitionNode / ActionNode` 使用 `nodeId`
   - `Recognition` 使用 `recoId`
   - `Action` 使用 `actionId`
   - `WaitFreezes` 使用 `wfId`
   - `ResourceLoading` 使用 `resId`
   - `ControllerAction` 使用 `ctrlId`
   - `NextList` 没稳定业务 id，使用 `0`

3. `startSeq`
   - 优先使用该 scope 的 `Starting` 事件 `seq`
   - 若缺失 `Starting`，则使用首次观测到该 scope 的事件 `seq`

示例：

1. `pipeline_node:12:38:seq42`
2. `recognition:12:5001:seq44`
3. `next_list:12:0:seq43`
4. `controller_action:0:7:seq6`

关于 `occurrenceIndex`：

1. `occurrenceIndex` 只用于“逻辑节点”的执行实例排序
2. 它按 `(taskId, nodeId)` 分组，并按 `PipelineNode` 的 `startSeq` 做 1-based 计数
3. 同一轮 `PipelineNode` 下的 `NextList / Recognition / Action / WaitFreezes / ActionNode / RecognitionNode` 都属于该次节点执行，不单独拥有自己的 node occurrence
4. 因此外部接口里的 `occurrenceIndex` 语义应解释为“该逻辑节点在该 task 中第几次执行”

建议对外提供两类查询：

1. 便捷查询
   - `findTask(taskId)`
   - `findRecognition(taskId, recoId)`
   - `findAction(taskId, actionId)`
   - `findWaitFreezes(taskId, wfId)`

2. 严格查询
   - `findScopeById(scopeId)`
   - `findScopesInSeqRange(startSeq, endSeq)`
   - `findScopesByLocator({ kind, taskId, localId, seq })`

建议：

- `findScopesByLocator` 同时支持 `{ taskId, nodeId, occurrenceIndex }`
- 当 locator 命中多个节点实例时，由 service/tool 层决定返回全集还是抛出歧义错误

其中“严格查询”更适合做：

1. 外部工具跳转到具体一次识别
2. 调试某次 action 的完整上下文
3. 比对协议事件与归约结果是否一致

设计约束：

1. `ScopeNode.payload` 必须保留足够完整的业务字段，不能只保留 UI 需要的字段
2. `ScopeNode` 应保留 `seq/endSeq`，必要时还可补充 `startEventSeq/endEventSeq`
3. projector 是 `ScopeTree` 的消费者，不是解析包的唯一出口
4. 对外查询默认基于 `ScopeTree + TraceIndex`，而不是基于 `TaskInfo[]`

### 9.3.1 TraceIndex 落地结构建议

前面的 `TraceIndex` 只是最小能力说明。真正实现时，建议把“按 id 查 scope”“按逻辑节点查执行实例”“按 seq 查事件”三类能力一次建全。

建议结构：

```ts
type TaskNodeKey = `${number}:${number}`
type TaskLocalKey = `${number}:${number}`

type NodeExecutionRef = {
  taskId: number
  nodeId: number
  occurrenceIndex: number
  pipelineScopeId: string
  startSeq: number
  endSeq?: number
}

type TraceIndex = {
  scopeById: Map<string, ScopeNode>
  eventBySeq: Map<number, ProtocolEvent>
  parentScopeIdByScopeId: Map<string, string | null>
  childScopeIdsByScopeId: Map<string, string[]>

  taskScopesByTaskId: Map<number, ScopeNode[]>
  pipelineNodeScopesByTaskIdAndNodeId: Map<TaskNodeKey, ScopeNode[]>
  recognitionScopesByTaskIdAndRecoId: Map<TaskLocalKey, ScopeNode[]>
  actionScopesByTaskIdAndActionId: Map<TaskLocalKey, ScopeNode[]>
  waitFreezesScopesByTaskIdAndWfId: Map<TaskLocalKey, ScopeNode[]>

  nodeExecutionsByTaskIdAndNodeId: Map<TaskNodeKey, NodeExecutionRef[]>
  nodeExecutionByPipelineScopeId: Map<string, NodeExecutionRef>

  controllerScopes: ScopeNode[]
  resourceScopes: ScopeNode[]
}
```

说明：

1. `scopeById`
   - 所有严格查询的第一入口

2. `eventBySeq`
   - 用于 timeline、evidence、raw line 回捞

3. `parentScopeIdByScopeId / childScopeIdsByScopeId`
   - 避免查询父链时反复扫描整棵树

4. `nodeExecutionsByTaskIdAndNodeId`
   - 直接服务 `task_id + node_id + occurrence_index`

5. `nodeExecutionByPipelineScopeId`
   - 把单次逻辑节点执行实例稳定锚定到对应 `PipelineNode` 根 scope

实现建议：

1. 先 DFS/BFS 一次整棵 `ScopeTree`
2. 同步填充 `scopeById / parent / children / eventBySeq`
3. 遇到 `PipelineNode` 时，再按 `(taskId, nodeId)` 归档到 node execution 索引
4. 每个 `(taskId, nodeId)` 桶最终按 `startSeq` 排序后回填 `occurrenceIndex`

### 9.3.2 Locator 类型建议

建议把查询定位分成“宽查询 locator”和“唯一定位 locator”两层。

```ts
type ScopeLocator =
  | { scopeId: string }
  | { kind: ScopeKind; taskId?: number; localId?: number; startSeq?: number }

type NodeExecutionLocator = {
  taskId: number
  nodeId: number
  occurrenceIndex?: number
  scopeId?: string
}

type UniqueScopeLocator =
  | { scopeId: string }
  | { taskId: number; nodeId: number; occurrenceIndex: number }
```

语义：

1. `ScopeLocator`
   - 面向任意 scope 的通用查询

2. `NodeExecutionLocator`
   - 面向逻辑节点执行实例
   - 允许宽查询，也允许单实例查询

3. `UniqueScopeLocator`
   - 强约束必须只命中一个实例
   - 适用于 `get_parent_chain` 这类单实例接口

规则：

1. 如果传入 `scopeId`，则忽略同一请求里的 `occurrenceIndex`
2. `scopeId` 找不到，返回 `not_found`
3. `taskId + nodeId + occurrenceIndex` 找不到，返回 `not_found`
4. `taskId + nodeId` 命中多个实例而调用方要求唯一，返回 `ambiguous`

### 9.3.3 Query Helper API 建议

建议 query helpers 不直接抛异常，而返回统一结果对象；tool/service 层再把它翻译成协议错误码。

```ts
type QueryErrorCode = 'not_found' | 'ambiguous' | 'invalid_locator'

type QueryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: QueryErrorCode; message: string }
```

建议 helper：

```ts
type QueryHelpers = {
  findScopeById(scopeId: string): ScopeNode | null
  findScopesByLocator(locator: ScopeLocator): ScopeNode[]

  findNodeExecutions(taskId: number, nodeId: number): NodeExecutionRef[]
  findNodeExecution(locator: UniqueScopeLocator): QueryResult<NodeExecutionRef>

  getParentChain(locator: UniqueScopeLocator): QueryResult<ScopeNode[]>
  getNodeTimeline(locator: NodeExecutionLocator, limit?: number): QueryResult<ScopeTimeline[]>
  getNextListHistory(locator: NodeExecutionLocator, limit?: number): QueryResult<NextListHistory[]>

  getScopeEvents(scopeId: string): ProtocolEvent[]
  getRawLinesBySeqRange(startSeq: number, endSeq: number): QueryResult<Array<{
    sourceKey: string
    line: number
    text: string
  }>>
}
```

说明：

1. `getNodeTimeline`
   - 默认返回逻辑节点下所有匹配实例
   - 若 locator 足够精确，则只返回单实例 timeline

2. `getNextListHistory`
   - 语义与 `getNodeTimeline` 一致

3. `getParentChain`
   - 必须使用 `UniqueScopeLocator`
   - 不接受模糊多实例结果

4. `getScopeEvents`
   - 从 `scope.seq ~ scope.endSeq` 以及 scope 子树聚合协议事件
   - 是很多上层查询的基础能力

### 9.3.4 Timeline 组装建议

建议把 timeline 输出构建成独立 helper，不直接散在 tool handler 里。

```ts
type ScopeTimeline = {
  scopeId: string
  occurrenceIndex: number
  ts: string
  seq: number
  event: string
  scopeKind: ScopeKind
  taskId?: number
  nodeId?: number
  name?: string
  sourceKey?: string
  line?: number
}
```

组装规则：

1. 先确定目标 `NodeExecutionRef`
2. 以该 `PipelineNode` scope 为根遍历其子树
3. 收集所有落在该执行实例里的协议事件
4. 按 `seq` 升序输出
5. 每条 timeline item 都补上 `scopeId + occurrenceIndex`

这样 `get_node_timeline`、调试视图、证据构造都能复用同一条链路。

### 9.4 面向外部工具的 SessionStore

如果解析包需要直接承接外部工具协议，则还需要在 `ParseArtifacts` 之上加一层只读会话封装。

建议：

```ts
type AnalyzerSession = {
  sessionId: string
  artifacts: ParseArtifacts
  warnings: string[]
  createdAt: string
}

type AnalyzerSessionStore = Map<string, AnalyzerSession>
```

作用：

1. 让 `parse_log_bundle` 先建立查询会话
2. 后续工具方法通过 `sessionId` 复用已解析 artifacts
3. 把 session 生命周期、缓存、告警与 parser core 解耦

边界：

1. `SessionStore` 属于工具服务层，不属于 reducer
2. `SessionStore` 不参与 UI 投影
3. parser core 负责产出 `ParseArtifacts`
4. tool/service 层负责管理 `sessionId -> ParseArtifacts`

## 10. 模块拆分建议

### 10.1 新目录

建议新增：

1. `packages/maa-log-parser/src/protocol/`
2. `packages/maa-log-parser/src/trace/`
3. `packages/maa-log-parser/src/query/`
4. `packages/maa-log-parser/src/service/`
5. `packages/maa-log-parser/src/projector/`

### 10.2 推荐文件

`protocol/`

1. `types.ts`
2. `lineParser.ts`
3. `deduper.ts`
4. `eventFactory.ts`

`trace/`

1. `scopeTypes.ts`
2. `scopeKeys.ts`
3. `parentResolver.ts`
4. `state.ts`
5. `reducer.ts`

`query/`

1. `traceIndex.ts`
2. `locator.ts`
3. `queryTypes.ts`
4. `queryHelpers.ts`
5. `timeline.ts`

`service/`

1. `sessionStore.ts`
2. `evidenceBuilders.ts`
3. `toolHandlers.ts`

`projector/`

1. `taskProjector.ts`
2. `flowProjector.ts`
3. `systemProjector.ts`
4. `imageEnricher.ts`

### 10.3 核心入口

`packages/maa-log-parser/src/core/logParser.ts` 最终只保留：

1. 文本读取
2. 行遍历
3. 调用第一段
4. 调用第二段
5. 构建查询索引与可选 `RawLineStore`
6. 调用第三段
7. 对外暴露严格语义 API 与中间层 artifacts API

补充：

- 如需承接 Orchestrator/Tool 协议，`session` 管理与工具方法分发放在 `service/` 层，不放入 `core/logParser.ts`

## 11. 严格语义要求

第一阶段收敛后，以解析语义清晰为优先，要求如下：

1. `getTasksSnapshot()` / `consumeTasks()` 直接返回严格 projector 结果
2. 不再为旧 UI 伪造 `action` 根、running 占位或启发式重挂子任务
3. `NextList.Failed` 带 `list` 时，列表仍保留
4. `PipelineNode/RecognitionNode/ActionNode` 终态直接携带的 `reco_details/action_details` 仍可被 projector 正确消费
5. 子任务嵌套、recognition node、action node、wait freezes 按真实作用域树投影
6. 对外新增的 artifacts/query API 与严格 projector 语义保持一致

## 12. 实施步骤

建议按下面顺序落地：

### Step 1

新增 `ProtocolEvent`、`lineParser`、`deduper`，先替换输入层。

### Step 2

实现 `ScopeTreeReducer`，先只接 `Tasker.Task.*` 和 `Node.*`。

### Step 3

把 `Resource.Loading.*` 与 `Controller.Action.*` 纳入同一 reducer。

### Step 4

实现 `TraceIndex`、`SourceRef/RawLineStore` 与基础 query helpers，对外提供 artifacts 查询能力。

其中优先级建议为：

1. `scopeById / eventBySeq / parent-child index`
2. `nodeExecutionsByTaskIdAndNodeId`
3. `locator` 解析与 `QueryResult`
4. timeline / parent-chain / raw-line 回捞 helper

### Step 5

实现 `TaskProjector`，对齐现有 `TaskInfo / NodeInfo / node_flow` 输出。

### Step 6

对比现有 golden 测试，切换主入口。

### Step 7

如需承接外部工具协议，再在 artifacts 之上实现 `SessionStore + tool handlers`。

### Step 8

确认新链路稳定后，再逐步删除旧的多 helper 分发体系。

## 13. 测试建议

第一阶段至少保留并新增以下测试：

1. 现有 `parser.golden`
2. 现有 `parser.subTaskScope`
3. 现有 `parser.actionFallback`
4. 输入去重测试
5. `ResourceLoading` reducer 测试
6. `ControllerAction` 挂业务 scope / 挂 `TraceRoot` 测试
7. `Recognition` 在非 `NextList` 下挂载测试
8. `TraceIndex` 查询命中测试
9. `findRecognition(taskId, recoId)` 多实例返回测试
10. `RawLineStore` 按 `sourceKey + line` 回捞测试
11. `SessionStore` 查询会话复用测试
12. `scopeId` 确定性生成测试
13. `(taskId, nodeId) -> occurrenceIndex` 排序测试
14. `UniqueScopeLocator` 歧义错误测试

## 14. 当前结论

本次重构的核心原则已经固定为：

1. 先协议化，再语义化，最后投影到 UI
2. 去重属于输入层，不属于 UI 组装层
3. reducer 只维护稳定的 ScopeTree，不直接拼 UI DTO
4. 面向外部工具的精细化查询，基于 `ScopeTree + TraceIndex` 提供，不基于 `TaskInfo[]`
5. 证据回溯依赖 `SourceRef + RawLineStore`，不把原始行文本散落复制到各业务结构里
6. 外部工具会话管理由 `SessionStore` 承接，不混入 reducer/projector
7. `Recognition`、`WaitFreezes`、`ControllerAction` 的归属以时序和最近未终态业务 scope 为主
8. `ResourceLoading` 作为顶层系统事件保留在 `TraceRoot`

后续编码实现应以本文档为准，如有调整，应先更新本文档再修改实现。
