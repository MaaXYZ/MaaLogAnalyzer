# @windsland52/maa-log-tools

Node tools package for Maa log analysis.

## Responsibility

- Provide Node input adapters (zip/file/folder)
- Provide high-level helpers:
  - `analyzeZipBuffer`
  - `analyzeZipFile`
  - `analyzeDirectory`
- Provide CLI entry (`mla-log-tools`)

`analyzeLogContent` is delegated to `@windsland52/maa-log-runtime` with a local parser/statistics adapter.
The concrete adapter is provided by `@windsland52/maa-log-adapter`.

## Exports

- `@windsland52/maa-log-tools`
  - `analyzeLogContent`
  - `analyzeZipBuffer`
  - `analyzeZipFile`
  - `analyzeDirectory`
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
pnpm kernel:cli <path> [--pretty] [--no-events]
```

`<path>` can be a log file, a zip file, or a log directory.
