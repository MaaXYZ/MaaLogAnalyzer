# AI Domain Knowledge Pack

This document describes the first local "domain knowledge pack" for AI log analysis.

## Files

- `src/ai/knowledge/maa-domain-knowledge.v1.json`
- `src/ai/knowledge/index.ts`

## Related docs

- `docs/ai/LANGCHAIN_MCP_SKILL_OVERVIEW.md`

## Purpose

The pack gives the model structured MaaFramework semantics that are not obvious from raw logs alone, including:

- callback event meanings
- pipeline protocol behaviors
- Analyzer parser-specific behaviors and caveats
- diagnosis heuristics and AI guardrails

## Source of truth

Current cards are extracted from:

- `sample/MaaFramework/docs/zh_cn/2.3-回调协议.md`
- `sample/MaaFramework/docs/zh_cn/3.1-任务流水线协议.md`
- `sample/MaaFramework/tools/pipeline.schema.json`
- `src/utils/logParser.ts`
- `src/types.ts`

Each card includes `evidence` pointing to one or more source ranges.

## Card schema (v1)

```json
{
  "id": "pipeline.anchor",
  "topic": "pipeline.protocol",
  "title": "anchor / [Anchor]",
  "rule": "...",
  "details": ["..."],
  "keywords": ["anchor", "[Anchor]"],
  "evidence": [{ "sourceId": "maafw-pipeline", "loc": "200-211" }]
}
```

## Recommended AI flow

1. Use tools to fetch runtime evidence (`overview`, `failure candidates`, `node context`).
2. Use this knowledge pack to resolve event semantics and pipeline behaviors.
3. Produce JSON conclusions with explicit evidence references.
4. If evidence is missing, output `unknowns` instead of guessing.

## Update workflow

1. Update source docs/parser first.
2. Add or revise cards in `maa-domain-knowledge.v1.json`.
3. Keep `evidence` line ranges aligned.
4. Run `pnpm -s vue-tsc --noEmit`.

## Notes

- This pack is intentionally compact and high-signal for token efficiency.
- `doc/desc` are treated as metadata context, not runtime execution evidence.
- Future versions can split by topic (`callback`, `pipeline`, `heuristic`) if card count grows.
