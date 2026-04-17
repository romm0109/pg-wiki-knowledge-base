# Feature: Implement conflictResolution Config, conflicted Page Status, and README

## Feature Description

Three PRD gaps closed in one pass:

1. **`conflictResolution` config is ignored** — `ClientConfig` accepts `conflictResolution: 'flag' | 'auto-resolve'` but `ingest.ts` never reads it. Every page update silently overwrites the previous content regardless of the setting.
2. **`conflicted` page status is never written** — `WikiPage.status` has four values: `draft`, `published`, `stale`, `conflicted`. Only `published` and `stale` are ever set. `conflicted` is dead code.
3. **No README** — Phase 4 of the PRD requires a README with a quickstart example. Only `PRD.md` exists.

## Problem Statement

### Conflict resolution

When a second source is ingested that causes the LLM to update an existing page, `updateExistingPage` in `src/ingest.ts` always sets `status = 'published'` regardless of `conflictResolution` config. The default PRD behavior should be `"flag"`: mark the page `conflicted` and log a `conflict` job event so developers can inspect or review it. `"auto-resolve"` should preserve the current overwrite-and-publish behavior.

### README

There is no entry point for new users. The PRD is not a substitute — it is an internal design doc.

## Solution Statement

- In `updateExistingPage`, read `conflictResolution` from the ingest context config. When content changes and `conflictResolution !== 'auto-resolve'`, set `status = 'conflicted'` (flag mode, the default). When `conflictResolution === 'auto-resolve'`, set `status = 'published'` (current behavior).
- Log a `conflict` job event in `job_events` when a page is flagged.
- Write a README with: one-paragraph intro, install command, quickstart example, LLM adapter interface snippet, tenant-aware example, and brief API reference.

---

## CONTEXT REFERENCES

### Files to Read Before Implementing

- `src/ingest.ts` (lines 282-328) — `createNewPage` and `updateExistingPage`; this is the only place to add the conflict flag logic.
- `src/ingest.ts` (lines 48-175) — `ingestSource` main loop; shows how `ctx.config` is available and how `JobEvent` records are saved.
- `src/types.ts` (lines 3-15) — `ClientConfig`; confirms `conflictResolution?: 'flag' | 'auto-resolve'` is already declared.
- `src/entities/WikiPage.ts` — confirm `status` column accepts `'conflicted'`.
- `src/entities/Job.ts` and `src/entities/JobEvent.ts` — confirm shape of job event records.
- `tests/integration/ingest.test.ts` — existing integration test patterns and mock adapter shape.
- `PRD.md` (sections 7, 9, 12) — API and config spec for reference while writing README.

### Files to Update

- `src/ingest.ts` — pass config into `updateExistingPage`, add conflict flag logic and job event
- `tests/integration/ingest.test.ts` — add conflict resolution integration tests

### Files to Create

- `README.md` — library quickstart and API reference

---

## IMPLEMENTATION PLAN

### Phase 1: Conflict flag in ingest

Change `updateExistingPage` signature to accept `conflictResolution` and set `status` accordingly. Log a job event when flagging.

### Phase 2: Integration tests

Extend `tests/integration/ingest.test.ts` with:
- flag mode marks conflicted page on second ingest with changed content
- auto-resolve mode publishes updated page normally
- no-change ingest does not flag (content unchanged)

### Phase 3: README

Write `README.md` covering install, quickstart, adapter interface, tenant-aware config, and API summary.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order.

### UPDATE `src/entities/WikiPage.ts`

- **VERIFY** that the `status` column's allowed values include `'conflicted'`.
- If the column uses a union type or enum, add `'conflicted'` if missing.
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `src/ingest.ts` — change `updateExistingPage` signature

- **REFACTOR**: Add a third parameter `conflictResolution: 'flag' | 'auto-resolve' | undefined` to `updateExistingPage`.
- **PATTERN**: Same shape as how `deleteOrphanPages` is read in `deleteSource` at line 250: `ctx.config.deleteOrphanPages === 'delete'`.
- **GOTCHA**: The function is only called from the `ingestSource` main loop where `ctx.config` is in scope — pass `ctx.config.conflictResolution` at the call site.
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `src/ingest.ts` — apply flag logic in `updateExistingPage`

- **IMPLEMENT**: When `existingPage.content !== pageAction.content`:
  - If `conflictResolution === 'auto-resolve'`: set `status = 'published'` (current behavior, unchanged)
  - Otherwise (default `'flag'` behavior): set `status = 'conflicted'`
- **IMPLEMENT**: When content is unchanged, set `status = 'published'` unconditionally (a re-ingest of identical content resolves any prior conflict).
- **PATTERN**: Mirror the `deleteOrphanPages` branch at line 250-254.
- **GOTCHA**: Do not change `createNewPage` — new pages always start as `'published'`.
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `src/ingest.ts` — log conflict job event

- **IMPLEMENT**: After saving the updated page in `updateExistingPage`, when `status === 'conflicted'`, save a `JobEvent` with `type: 'conflict'` and `data: { pageId: page.id }`.
- **GOTCHA**: The `queryRunner` and `job` must be passed to `updateExistingPage` or the event must be logged at the call site in the main loop. Logging at the call site is simpler — return the resolved status from `updateExistingPage` and emit the event in the loop if `page.status === 'conflicted'`.
- **PATTERN**: Mirror existing `page_action` event saves at lines 139-143.
- **VALIDATE**: `npx tsc --noEmit`

### ADD integration tests in `tests/integration/ingest.test.ts`

- **READ** `tests/integration/ingest.test.ts` first to understand lifecycle and existing mock adapter.
- **IMPLEMENT**: `conflictResolution: "flag" (default) marks page as conflicted on content change`
  1. Create a client with no `conflictResolution` set (tests default behavior)
  2. Ingest a source — page created as `published`
  3. Ingest a second source that the LLM uses to update the same page title with different content
  4. Fetch the page via `getPage` and assert `status` — but `getPage` doesn't return status. Instead query the DB directly or use `listPages` which returns `status`.
  5. Assert `listPages` returns the page with `status: 'conflicted'`
- **IMPLEMENT**: `conflictResolution: "auto-resolve" publishes updated page normally`
  1. Create client with `conflictResolution: 'auto-resolve'`
  2. Same two-ingest flow
  3. Assert `listPages` returns page with `status: 'published'`
- **IMPLEMENT**: `re-ingesting identical content clears conflicted status`
  1. Get page to conflicted state
  2. Re-ingest same content that produces no change
  3. Assert page status is back to `'published'`
- **PATTERN**: Mirror existing test lifecycle in `ingest.test.ts`.
- **GOTCHA**: The mock LLM must generate the same page title for both ingests so the second ingest triggers `updateExistingPage`, not `createNewPage`. Use a deterministic title in the content.
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/ingest.test.ts`

### CREATE `README.md`

- **IMPLEMENT**: Write `README.md` with the following sections, in order:
  1. **One-line description** (what the library is)
  2. **Install** — `npm install pg-wiki-knowledge-base`
  3. **Quickstart** — TypeScript snippet: `createClient`, `ingestSource`, `query`. Keep to ~20 lines.
  4. **LLM Adapter** — show the `LLMAdapter` interface and a minimal adapter stub so users know what to implement.
  5. **Tenant-aware clients** — show the generic `createClient<{ workspaceId: string }>` pattern.
  6. **API reference** — one-paragraph summary per public method: `createClient`, `ingestSource`, `deleteSource`, `query`, `listPages`, `getPage`.
  7. **Configuration** — table of `ClientConfig` fields with types and defaults.
- **PATTERN**: Match the package name from `package.json`: `pg-wiki-knowledge-base`.
- **GOTCHA**: The `LLMAdapter` interface now has three methods — `complete`, optional `embed`, and optional `respondWithTools`. Show all three in the interface snippet.
- **GOTCHA**: Do not copy the PRD verbatim — the README is user-facing, the PRD is internal.

---

## TESTING STRATEGY

Integration tests are the primary validation layer, consistent with the rest of the repo.

### Integration Tests to Add

- flag mode (default): second ingest with changed content → `status: 'conflicted'`
- auto-resolve mode: second ingest with changed content → `status: 'published'`
- no-change re-ingest: identical content on second ingest → `status: 'published'` (not conflicted)

### Edge Cases

- `conflictResolution` is `undefined` (omitted from config) — must behave as `'flag'`
- Content that changes type but not body — still a conflict in flag mode
- First-ever ingest of a page — always `'published'`, never `'conflicted'`

---

## VALIDATION COMMANDS

```bash
# Level 1: Types
npx tsc --noEmit

# Level 2: Build
npm run build

# Level 3: Ingest tests
DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/ingest.test.ts

# Level 4: Full suite
DATABASE_URL=postgresql:///pgwiki_test npm run test:integration
```

---

## ACCEPTANCE CRITERIA

- [ ] Second ingest that changes page content sets `status: 'conflicted'` when `conflictResolution` is omitted or `'flag'`
- [ ] Second ingest that changes page content sets `status: 'published'` when `conflictResolution: 'auto-resolve'`
- [ ] Re-ingesting identical content on a conflicted page restores `status: 'published'`
- [ ] A `conflict` job event is saved in `job_events` when a page is flagged
- [ ] `createNewPage` is unaffected — new pages are always `'published'`
- [ ] All existing ingest and query tests still pass
- [ ] README exists at repo root with quickstart, adapter interface, tenant example, and config table
- [ ] All validation commands pass with zero errors
