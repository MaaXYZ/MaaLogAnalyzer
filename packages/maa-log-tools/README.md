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
pnpm kernel:cli <path> [--pretty] [--no-events] [--preflight]
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
