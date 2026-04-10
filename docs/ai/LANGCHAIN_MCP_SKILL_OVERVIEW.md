# LangChain + MCP + Skill 诊断架构总览

## 1. 文档目的

本文件用于统一 MAALogAnalyzer 在 AI 分析能力上的架构方向、术语定义和实现规范，避免后续出现以下问题：

- 分析流程在不同页面或分支实现不一致
- 工具调用协议不统一，导致模型行为不可控
- 输出格式不稳定，后处理和前端展示频繁补丁
- Prompt/Skill 演进缺少统一基线

本文件建议作为 AI 诊断能力的查阅入口（overview）和一致性约束文档（single source of conventions）。

---

## 2. 当前问题与目标

### 2.1 当前问题（单轮大上下文）

现有模式主要是一次性提供大量上下文，期望模型一轮完成结论。该模式常见问题：

- 上下文过大，模型注意力分散，关键证据被淹没
- 证据不足时模型会猜测，难以稳定复现
- 依赖后置修复（repair）补格式，根因诊断能力仍不稳定

### 2.2 目标模式（多轮取证）

目标是改为“先总览，再按需取证”的分析闭环：

1. 先生成全局态势（overview）
2. 提出可验证假设（hypotheses）
3. 主动请求具体证据（tool requests）
4. 基于工具结果迭代收敛
5. 给出可追溯结论（带证据指针）

该模式天然适配 MCP 工具与 Skill 诊断模板。

---

## 3. LangChain 模块总览（面向本项目）

### 3.1 Agents

- 负责 ReAct 循环：模型推理 -> 请求工具 -> 获取观察 -> 再推理
- 适合承载多轮诊断主流程
- 对本项目意义：从单轮问答升级为“逐步排查代理”

### 3.2 Models

- 统一不同 provider 的模型调用接口
- 常用调用：invoke / stream / batch
- 对本项目意义：便于后续做模型路由、降级和 A/B

### 3.3 Tools

- 让模型通过结构化参数请求外部能力
- 可接本地函数、MCP 服务、数据库、检索模块
- 对本项目意义：把日志分析中的关键查询能力工具化

### 3.4 Middleware

- 在模型调用前后和工具调用环节注入控制逻辑
- 典型能力：动态工具选择、动态模型选择、消息裁剪、护栏
- 对本项目意义：把“诊断策略”从 prompt 文本升级为可编排逻辑

### 3.5 Memory

- Short-term memory：线程内状态
- Long-term memory：跨会话记忆
- 对本项目意义：多轮诊断过程中的中间结论、已证伪假设可持续保存

### 3.6 Structured Output

- 让输出强制符合 schema，而不是自由文本
- 对本项目意义：减少 JSON 解析/修复补丁，提升流程稳定性

### 3.7 Context Engineering

- 核心思想：可靠性来自“正确上下文 + 正确时机 + 正确工具”
- 对本项目意义：避免一次性灌太多信息，按步骤精准注入

---

## 4. 与当前代码的映射

当前仓库中可复用的基础（这里的“可复用”主要指领域语义与数据资产，不是沿用旧编排流程）：

- 请求层与重试：src/ai/client.ts
- 领域上下文构建：src/ai/contextBuilder.ts
- 结构化解析：src/ai/structuredOutput.ts
- 请求执行主流程：src/views/aiAnalysis/composables/useAiRequestRunner.ts
- Prompt 运行时：src/views/aiAnalysis/composables/useAiPromptRuntime.ts
- 修复链路：src/views/aiAnalysis/utils/repair.ts

说明：

- 领域可复用层（建议保留）：
  - 日志解析与节点语义（log parser / node_flow / next_list 语义）
  - 领域知识包（knowledge cards）
  - 评估样本与回归规则
- 编排可重写层（建议 LangChain 重实现）：
  - 请求调度与多轮状态机
  - 工具调用路由与执行循环
  - 输出结构化与错误重试策略
  - prompt/memory/middleware 组合策略

结论（更新）：能用 LangChain 实现的编排层，优先重实现；领域语义与数据资产保持复用。

---

## 5. 目标架构（建议）

```
User Question
  -> Planner Agent (LangChain)
      -> decide next step
      -> request tool(s)
  -> Tool Router
      -> local tools / MCP tools
  -> Evidence Pack
      -> structured observations
  -> Planner Agent (next step)
      -> update hypotheses
      -> ask next evidence or finish
  -> Final structured diagnosis + human-readable answer
```

核心原则：

- 模型只做“决策与解释”，证据由工具提供
- 每一步输出都要可验证、可追溯
- 所有中间状态结构化存储，便于 UI 展示与调试

---

## 6. 多轮诊断协议（v1）

### 6.1 阶段定义

- phase = overview：给出全局态势与风险点
- phase = hypothesis：提出待验证假设
- phase = evidence_request：请求具体工具和参数
- phase = synthesis：汇总证据，更新结论
- phase = final：输出最终结论与建议

### 6.2 停止条件

满足任一即可停止：

- 关键假设被充分证据支持
- 关键假设被证伪且无新可行路径
- 达到最大轮次（建议 4~6 轮）
- 工具证据不足，输出 unknowns 与建议采样点

### 6.3 证据约束

- 结论必须绑定 evidence_refs
- 若证据不足，明确输出 unknowns，不允许硬猜
- 每轮最多请求有限工具（建议 1~3 个）避免爆炸调用

---

## 7. Structured Output 统一规范（v1）

建议统一输出对象（可映射到 Zod）：

```json
{
  "phase": "overview|hypothesis|evidence_request|synthesis|final",
  "hypotheses": [
    {
      "id": "H1",
      "statement": "...",
      "confidence": 0.0,
      "status": "pending|supported|rejected"
    }
  ],
  "evidence_requests": [
    {
      "tool": "get_node_timeline",
      "args": { "task_id": 0, "node_id": 0 },
      "reason": "...",
      "priority": "high|medium|low"
    }
  ],
  "findings": [
    {
      "claim": "...",
      "evidence_refs": ["E1", "E2"],
      "confidence": 0.0
    }
  ],
  "answer": "...",
  "unknowns": ["..."],
  "memory_update": "...",
  "next_action": "request_more_evidence|finalize"
}
```

约束：

- confidence 统一 0~1
- tool 必须来自白名单
- evidence_refs 必须对应本轮或历史工具结果 ID

---

## 8. 工具设计规范（MCP/本地）

### 8.1 命名规范

- snake_case
- 动词 + 领域对象，如 get_node_timeline
- 避免泛命名（query_data、analyze_log 之类）

### 8.2 最小工具集合（建议起步）

- get_task_overview：任务级统计和失败热点
- get_node_timeline：节点事件时间线
- get_recognition_rounds：识别轮次与状态
- get_next_list_history：next_list 变化历史
- get_parent_chain：父子节点/子任务链路
- get_raw_lines：按条件返回原始日志片段（最后兜底）

### 8.3 工具返回约束

- 返回结构化 JSON，不返回散乱文本
- 包含 evidence_id 与来源范围信息（行号、事件序号等）
- 错误返回标准格式：
  - error_code
  - message
  - retryable

---

## 9. Skill 规范（诊断模板）

Skill 的作用：把高频诊断路径固化为可复用策略，减少模型随意发挥。

建议首批 Skill：

- recognition_failure_diagnosis
- next_list_loop_diagnosis
- parent_child_nesting_diagnosis
- timeout_vs_nohit_diagnosis

每个 Skill 至少定义：

- 适用条件（when to use）
- 推荐工具序列（tool playbook）
- 常见误判（pitfalls）
- 最终输出格式要求

---

## 10. 一致性检查清单（开发必看）

每次改动 AI 分析链路前后，检查：

1. 是否仍使用统一 structured schema
2. 是否所有结论都附 evidence_refs
3. 是否存在“无证据猜测”路径
4. 工具名、参数、错误格式是否符合规范
5. 多轮状态是否可恢复（中断后继续）
6. UI 是否可展示中间步骤（phase/hypothesis/evidence）

---

## 11. 分阶段落地计划

### 阶段 A（LangChain 基线）

- 定义统一 Agent state、Tool schema、Structured Output schema
- 建立 LangChain 版本主链路（invoke + tool loop + middleware）
- 保留旧链路作为 fallback（feature flag）

### 阶段 B（重实现编排层）

- 将原 useAiRequestRunner / requestClient 职责迁移到 LangChain Agent Runner
- 将原 structuredOutput + repair 主路径迁移为 responseFormat 主路径
- 接入 MCP 工具路由 + Skill 模板驱动

### 阶段 C（收敛与下线旧链路）

- 增加自动评估与回归集
- 做模型路由与成本优化
- 对齐行为后逐步下线旧编排实现

---

## 12. 评估指标（建议）

- 证据覆盖率：结论中带证据引用的比例
- 误报率：结论被人工判定错误的比例
- 平均轮次：完成一次诊断的平均回合数
- 工具有效率：工具调用后被用于结论的比例
- 分析耗时：端到端延迟

---

## 13. 版本与维护

- 文档版本：v1
- 更新原则：先更新规范，再更新实现
- 变更要求：涉及协议字段、工具协议、Skill 行为时必须更新本文件

建议在相关 PR 描述中附：

- 变更的协议字段
- 变更的工具契约
- 对旧流程兼容策略

---

## 14. 附录：实施建议（与当前仓库）

优先改造顺序建议：

1. 抽象统一 agent state（phase/hypothesis/evidence）与 response schema
2. 新建 LangChain Agent Runner（不要在旧 runner 上继续堆逻辑）
3. 将 contextBuilder 重构为“overview + tool payload builders”
4. 引入工具路由层（本地 + MCP）并接 Skill 模板
5. 将 repair 链路降级为兼容兜底，最终移出主路径

这一路径会重实现可 LangChain 化的编排层，同时复用领域逻辑资产，最终达到“可控、可追溯、多轮取证”的诊断模式。
