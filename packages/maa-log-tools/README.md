# @windsland52/maa-log-tools

Node tools package for Maa log analysis.

## Responsibility

- Provide Node input adapters (zip/file/folder)
- Provide high-level helpers:
  - `analyzeZipBuffer`
  - `analyzeZipFile`
  - `analyzeDirectory`
- Extract MaaFramework runtime sessions and version evidence from core Logger headers
- Provide CLI entry (`mla-log-tools`)

`analyzeLogContent` is delegated to `@windsland52/maa-log-runtime` with a local parser/statistics adapter.
The concrete adapter is provided by `@windsland52/maa-log-adapter`.

## Exports

- `@windsland52/maa-log-tools`
  - `analyzeLogContent`
  - `analyzeZipBuffer`
  - `analyzeZipFile`
  - `analyzeDirectory`
  - `loadFrameworkLogSources`
  - `extractFrameworkSessions`
  - `resolveFrameworkSessionForTimestamp`
  - `buildRuntimeInspection`
  - `DEFAULT_CORE_PARSE_OPTIONS`
- `@windsland52/maa-log-tools/node-input`
  - Node file/zip/folder extraction helpers
  - `LogBundleFocus`
- `@windsland52/maa-log-tools/cli`
  - CLI entry module

## Focused Loading

`analyzeZipBuffer`, `analyzeZipFile`, `analyzeDirectory`, `extractZipContentFromNodeBuffer`, `extractZipContentFromNodeFile`, and `loadNodeLogDirectory` all accept an optional `focus` selector:

```ts
{
  keywords?: string[]
  started_after?: string
  started_before?: string
}
```

When `focus` is provided, the helpers scan candidate primary and history log files and only merge files whose content matches the keywords and/or timestamp boundaries. If `focus` is omitted, the previous default loading behavior is preserved.

## CLI

```bash
pnpm kernel:cli <path> [--pretty] [--no-events] [--preflight|--runtime-inspection]
```

`<path>` can be a log file, a zip file, or a log directory.

The `--preflight` option emits a compact `mla-preflight/v1` compatibility result. It exits
with 0 when Notify events produce at least one task lifecycle, 3 for an unsupported log format,
and 2 when the input contains no analyzable log content.

Preflight also emits `frameworkVersionSummary` and `frameworkSessions`. A session starts at an
exact `[Logger] MAA Process Start` header and gets its version only from `[Logger] Version ...`
evidence in that session. Every boundary and version occurrence retains its source reference and
line number. Multiple versions are preserved instead of collapsed, conflicts produce warnings,
and content before a process-start marker is explicitly marked as a partial file segment.

Use the session containing the relevant failure timestamp when selecting version-matched source.
`resolveFrameworkSessionForTimestamp` returns a session only when exactly one resolved,
process-start-bounded interval contains the timestamp; otherwise it returns `null`.

## Runtime inspection

`buildRuntimeInspection(kernelOutput, frameworkExtraction, sourceSegments)` emits
`mla-runtime-inspection/v1`. It nests task executions under their runtime session and keeps three
different semantics separate:

- `failures`: direct `next_list_timeout` and `action_failed` facts.
- `outcomes`: failed or still-running pipeline nodes and tasks, with direct-failure references
  when the propagation can be linked deterministically.
- `signals`: useful non-failure behavior such as recognition succeeding after earlier misses and
  repeated completed-node sequences.

An unsuccessful recognition attempt is retry telemetry, not a failure. A next-list failure is
reported only when the node finishes without matching a candidate. Repeated recognition attempts
inside one node are not treated as pipeline loops.

Tasks are assigned to a process-start session by timestamp. A file segment without a
`MAA Process Start` marker can also contain tasks when it is the only matching partial interval;
ambiguous tasks remain in `unscopedTasks` and produce a warning.

Use `--runtime-inspection` to emit this result directly from a file, zip, or directory. It is a
separate output mode from `--preflight`; the two flags are mutually exclusive.

Each evidence position carries `source`, `path`, and `localLine` describing which original log
file the evidence came from and its 1-based line within that file. Segments are built by the Node
extraction helpers (`loadNodeLogDirectory`, `extractZipContentFromNodeFile`) when merging multiple
log files and are required by `buildRuntimeInspection`; `localLine` is the offset within the
individual source file, not the merged parser input line.
