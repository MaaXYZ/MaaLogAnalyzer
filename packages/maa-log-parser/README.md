# @windsland52/maa-log-parser

Repository-specific parser package for MaaLogAnalyzer.

## Responsibility

- Export current `LogParser` implementation as a workspace package
- Keep parser entry stable for other internal packages
- Provide raw value transformer hooks used by parser runtime

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
- `@windsland52/maa-log-parser/image-lookup-helpers`
	- `findImageByTimestampSuffix`
	- `findWaitFreezesImages`
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

- `LogParser` entry is now owned in this package (`src/logParser.ts`).
- Remaining migration work mainly targets helper/type modules still referenced from non-package sources.
