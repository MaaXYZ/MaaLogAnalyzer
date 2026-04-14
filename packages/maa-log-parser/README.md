# @windsland52/maa-log-parser

Repository-specific parser package for MaaLogAnalyzer.

## Responsibility

- Export current `LogParser` implementation as a workspace package
- Keep parser entry stable for other internal packages
- Provide raw value transformer hooks used by parser runtime
- Project parsed protocol/trace state into UI-facing task trees

Architecture design:

- `../../docs/LOG_PARSER_ARCHITECTURE.md`

## Exports

- `LogParser`
- `ParseFileOptions`
- `ParseProgress`
- `setRawValueTransformer`
- `resetRawValueTransformer`
- `wrapRaw`

Subpath export:

- `@windsland52/maa-log-parser/raw-value`
  - `setRawValueTransformer`
  - `resetRawValueTransformer`
  - `wrapRaw`
- `@windsland52/maa-log-parser/protocol-types`
  - `SourceRef`
  - `ProtocolEvent`
  - protocol event kind/type exports
- `@windsland52/maa-log-parser/protocol-event-factory`
  - `createSourceRef`
  - `createProtocolEvent`
- `@windsland52/maa-log-parser/trace-scope-types`
  - `ScopeKind`
  - `ScopeNode`
- `@windsland52/maa-log-parser/trace-scope-id`
  - `buildScopeId`
  - `createScopeId`
  - `resolveScopeLocalId`
- `@windsland52/maa-log-parser/trace-reducer`
  - `buildTraceTree`
  - `TraceScopePayload`
- `@windsland52/maa-log-parser/query-types`
  - `NodeExecutionRef`
  - `QueryResult`
- `@windsland52/maa-log-parser/query-locator`
  - `ScopeLocator`
  - `NodeExecutionLocator`
  - `UniqueScopeLocator`
  - `buildTaskNodeKey`
- `@windsland52/maa-log-parser/trace-index`
  - `TraceIndex`
  - `createEmptyTraceIndex`
  - `buildTraceIndex`
- `@windsland52/maa-log-parser/query-helpers`
  - `findScopeById`
  - `findScopesByLocator`
  - `findNodeExecution`
  - `getParentChain`
  - `getNodeTimeline`
  - `getNextListHistory`
  - `createQueryHelpers`
- `@windsland52/maa-log-parser/raw-line-store`
  - `createRawLineStore`
  - `getRawLine`
  - `getRawLinesByRefs`
- `@windsland52/maa-log-parser/service-session-store`
  - `AnalyzerSessionStore`
  - `createAnalyzerSessionStore`
- `@windsland52/maa-log-parser/service-evidence-builders`
  - `buildEvidence`
  - `buildLineEvidence`
- `@windsland52/maa-log-parser/service-tool-handlers`
  - `createAnalyzerToolHandlers`
- `@windsland52/maa-log-parser/types`
  - Type re-exports for parser-related data structures
- `@windsland52/maa-log-parser/log-event-decoders`
  - `readNumberField`
  - `readStringField`
  - `decodeTaskLifecycleEventDetails`
  - `decodeEventIdentityIds`
- `@windsland52/maa-log-parser/node-flow`
  - `buildRecognitionFlowItems`
  - `buildActionFlowItems`
  - `buildNodeFlowItems`
  - `buildNodeFlowGroups`
- `@windsland52/maa-log-parser/timestamp`
  - `toTimestampMs`
- `@windsland52/maa-log-parser/node-statistics`
  - `NodeStatisticsAnalyzer`
  - `NodeStatistics`
  - `RecognitionActionStatistics`

## Notes

- `LogParser` runtime implementation lives at `src/core/logParser.ts`.
- `getTasksSnapshot()` projects the current parser state without clearing buffered events. Use it for realtime/incremental views that need repeated reads.
- `consumeTasks()` projects tasks and then clears the buffered parse state. Use it for one-shot file parsing when the parsed result has already been handed off.
- `imageLookupHelpers.ts` is an internal low-level timestamp/suffix matcher used by the projector to attach error, vision, and `wait_freezes` screenshots. Most callers should prefer `LogParser#setErrorImages()`, `setVisionImages()`, and `setWaitFreezesImages()` instead of calling those helpers directly.
