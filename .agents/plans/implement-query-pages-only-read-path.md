# Feature: Implement `query()` Pages-Only Read Path

The following plan should be complete, but it is important that you validate documentation, codebase patterns, and task sanity before you start implementing.

Pay special attention to tenant scoping, metadata filter reuse, result-shape alignment with `QueryResult`, and the fact that this plan is intentionally limited to the pages-only read path. Do not silently broaden scope into `synthesize` mode or range filters during implementation.

## Feature Description

Implement the read-path portion of `client.query(text, opts)` for default and explicit `"pages-only"` mode. The method should run full-text search over compiled wiki pages, apply tenant scope and page metadata filters, and return matching page excerpts plus supporting evidence fragments. This is the core browse-and-answer retrieval path described in the PRD and is the remaining major gap in Phase 3 after `listPages()` and `getPage()` landed.

## User Story

As a developer
I want to call `client.query("What is our refund policy?", { filters, tenant })`
So that I can retrieve wiki-grounded page matches and evidence scoped to the right tenant or project

## Problem Statement

The PRD defines `query()` as the main read API for natural-language lookup, but [src/client.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/client.ts:69) still throws `"not implemented"`. The codebase already persists a `search_vector` on `pgwiki_wiki_pages` and already has reusable tenant and metadata filter logic in [src/query.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:31), but there is no query execution path that turns a user question into scoped page matches and evidence. That leaves the primary read workflow incomplete.

## Solution Statement

Extend `src/query.ts` with a `query()` implementation that:

1. validates input and defaults `mode` to `"pages-only"`
2. resolves tenant scope using the same helper pattern already used by `listPages()` and `getPage()`
3. reuses the existing page metadata filter helper for filter semantics consistency
4. performs Postgres full-text search against `pgwiki_wiki_pages.search_vector`
5. returns `QueryResult` with:
   - `pages`: matched pages in deterministic relevance order with short excerpts
   - `evidence`: deduplicated supporting fragments from those matched pages
6. leaves `"synthesize"` for a later phase; if explicitly passed for this scoped feature, fail clearly rather than pretending it works

This keeps the feature aligned with the first remaining PRD gap while preserving a clean follow-on path for answer synthesis.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `src/query.ts`, `src/client.ts`, `tests/integration/query.test.ts`
**Dependencies**: existing `typeorm`, `pg`, `reflect-metadata`, `jest`, `ts-jest`, PostgreSQL full-text search

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `PRD.md` ([lines 111-121](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/PRD.md:111))
  Why: Defines the user story for `query()` and ties metadata filtering to multi-tenant usage.

- `PRD.md` ([lines 213-218](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/PRD.md:213))
  Why: Defines the intended behavior of `query()` including full-text matching, evidence return, and optional synthesis.

- `PRD.md` ([lines 335-346](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/PRD.md:335))
  Why: Defines the public `Client.query()` signature and the expected `QueryResult` payload shape.

- `PRD.md` ([lines 430-440](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/PRD.md:430))
  Why: Places `query()` in Phase 3 and makes clear that evidence retrieval and metadata filters are required parts of the read layer.

- `src/client.ts` ([lines 69-79](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/client.ts:69))
  Why: `Client.query()` is still unimplemented and must mirror the thin-delegator pattern already used by `listPages()` and `getPage()`.

- `src/client.ts` ([lines 81-105](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/client.ts:81))
  Why: Shows the existing delegation style for read methods and how `QueryContext` is assembled.

- `src/query.ts` ([lines 12-50](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:12))
  Why: Contains `QueryContext`, `TenantOpts`, `resolveTenantValue()`, and `applyPageTenantScope()`, which `query()` should reuse instead of duplicating.

- `src/query.ts` ([lines 61-193](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:61))
  Why: Contains the current `applyMetadataFilters()`, pagination validation, and `listPages()` implementation that establishes the query-module style and filter semantics.

- `src/query.ts` ([lines 195-260](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:195))
  Why: `getPage()` demonstrates current read-path conventions for evidence joins, stable ordering, and post-query normalization.

- `src/types.ts` ([lines 25-43](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/types.ts:25))
  Why: Defines `MetadataFilters` and `QueryResult`, including the exact pages/evidence shape that `query()` must return.

- `src/ingest.ts` ([lines 89-107](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/ingest.ts:89))
  Why: Shows how tenant-scoped page selection is already done during ingest; `query()` should preserve the same tenant semantics.

- `src/ingest.ts` ([lines 155-158](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/ingest.ts:155))
  Why: Confirms `search_vector` is populated from page title + content, which is the storage foundation for full-text query.

- `src/entities/WikiPage.ts` ([lines 17-39](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/entities/WikiPage.ts:17))
  Why: Confirms `content` and `searchVector` live on the page model and that `search_vector` is `select: false`, so raw/select handling matters.

- `src/entities/WikiClaim.ts` ([lines 13-35](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/entities/WikiClaim.ts:13))
  Why: Evidence joins begin from `WikiClaim.page`.

- `src/entities/ClaimEvidence.ts` ([lines 12-26](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/entities/ClaimEvidence.ts:12))
  Why: Provides the join table from claims to source fragments.

- `src/entities/SourceFragment.ts` ([lines 13-38](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/entities/SourceFragment.ts:13))
  Why: Defines the evidence fragment fields available for `QueryResult.evidence`.

- `src/migrations/1700000000000-InitialSchema.ts` ([lines 138-148](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/migrations/1700000000000-InitialSchema.ts:138))
  Why: Confirms the GIN metadata indexes and the `idx_pgwiki_wiki_pages_search` full-text index already exist.

- `tests/integration/query.test.ts` ([lines 50-290](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/query.test.ts:50))
  Why: Existing read-path integration suite already covers lifecycle setup, tenant clients, metadata manipulation, and deterministic mock LLM behavior. `query()` tests should extend this file.

- `package.json` ([lines 7-10](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/package.json:7))
  Why: Defines the build and integration test commands the implementation must validate against.

- `jest.config.js` ([lines 1-9](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/jest.config.js:1))
  Why: Confirms `jest` + `ts-jest` integration-test execution model and single-worker setup.

### Files to Update

- `src/query.ts` - add `query()` implementation and any narrow query-specific helpers
- `src/client.ts` - wire `Client.query()` to the query module
- `tests/integration/query.test.ts` - add `query()` coverage for pages-only behavior

### New Files to Create

- None expected for this scoped feature. Keep query read logic centered in `src/query.ts` and extend the existing integration suite.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [TypeORM Select Query Builder](https://typeorm.io/docs/query-builder/select-query-builder/)
  - Specific sections: `where`, `andWhere`, `orderBy`, `addOrderBy`, `getMany`, `getRawMany`, `Brackets`
  - Why: `query()` needs composable filters, ranking selects, and raw evidence retrieval.

- [PostgreSQL 15 Text Search Controls](https://www.postgresql.org/docs/15/textsearch-controls.html)
  - Specific sections: `plainto_tsquery`, `websearch_to_tsquery`, ranking functions
  - Why: `query()` must convert user input into safe full-text search conditions and order by relevance.

- [PostgreSQL 15 JSON Functions and Operators](https://www.postgresql.org/docs/15/functions-json.html)
  - Specific sections: `jsonb @>`, `?`
  - Why: `query()` should reuse the same JSONB metadata filter semantics already used by `listPages()`.

- [PostgreSQL 15 JSON Types](https://www.postgresql.org/docs/15/datatype-json.html)
  - Specific sections: containment semantics and indexing notes
  - Why: Confirms containment/existence behavior used by metadata filters and the existing GIN indexes.

### Patterns to Follow

**Thin client methods that delegate into query module**
```ts
const ctx: QueryContext<TTenant> = {
  dataSource: this.dataSource,
  schema: this.schema,
  config: this._config,
};
return listPages(ctx, opts);
```
Source: [src/client.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/client.ts:88)

**Tenant resolution and scoping helper reuse**
```ts
const tenantValue = resolveTenantValue(ctx.config, opts);
pageQuery = applyPageTenantScope(pageQuery, tenantValue);
```
Source: [src/query.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:31)

**Reusable metadata filter application**
```ts
pageQuery = applyMetadataFilters(pageQuery, opts.filters);
```
Source: [src/query.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:61)

**Stable read ordering**
```ts
.orderBy('v.created_at', 'DESC')
.addOrderBy('v.id', 'DESC')
```
Source: [src/query.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:215)

**Integration test lifecycle pattern**
```ts
beforeAll(async () => {
  if (!DATABASE_URL) {
    return;
  }
  await dropExistingTables(DATABASE_URL);
  client = await createClient({ connectionString: DATABASE_URL, llm: mockLlm });
});
```
Source: [tests/integration/query.test.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/query.test.ts:53)

**Naming Conventions**
- Read-path logic lives in `src/query.ts`
- Query aliases stay short and conventional: `p`, `c`, `ce`, `sf`, `s`
- Public client methods remain small delegators in `src/client.ts`
- Result types should align directly with `src/types.ts` rather than inventing parallel local shapes

**Error Handling**
- Current repo style favors plain `Error` with specific messages
- Use a specific runtime error if unsupported mode is passed during this scoped implementation
- Avoid custom error classes

**Testing Pattern**
- Integration-first; no separate unit test layer is required
- Tests use real Postgres with `DATABASE_URL=postgresql:///pgwiki_test`
- Distinct page titles are created through marker-driven mock LLM behavior, not by handcrafting entities

**Project-Specific Conventions**
- No `CLAUDE.md` file was found in the repo root or immediate project files during planning; rely on observed code patterns instead of assuming undocumented local rules

**Anti-Patterns to Avoid**
- Do not create a separate query helper module for this feature
- Do not silently implement `synthesize` mode as a partial stub that returns pages but no answer without documenting behavior
- Do not interpolate user search text directly into SQL
- Do not rely on natural row order; order search results deterministically after ranking
- Do not broaden `MetadataFilters` to support ranges in this task; current public type only supports exact, `$in`, `$nin`, and `null`

---

## IMPLEMENTATION PLAN

### Phase 1: Query Foundation

Add the query-layer types and helper behavior needed for pages-only search while staying aligned with the existing read-path module.

**Tasks:**

- Add a local `QueryOpts<TTenant>` type in `src/query.ts`
- Decide and document mode behavior for this scoped feature
- Add narrow validation helpers for query text and mode
- Reuse existing tenant and metadata helpers instead of duplicating them

### Phase 2: Core Pages-Only Query Implementation

Implement full-text page search, excerpt creation, and evidence retrieval.

**Tasks:**

- Add `query()` to `src/query.ts`
- Build a tenant-scoped, metadata-filtered page query over `pgwiki_wiki_pages`
- Apply Postgres full-text search using `search_vector`
- Return `QueryResult.pages` in stable relevance order
- Fetch and deduplicate supporting evidence for the matched pages

### Phase 3: Client Integration

Expose query through the public client API using the same delegation pattern as the other read methods.

**Tasks:**

- Import `query` into `src/client.ts`
- Update `Client.query()` to build `QueryContext` and delegate
- Preserve the existing public method signature and return type

### Phase 4: Testing & Validation

Extend the existing integration suite to cover default pages-only behavior, filters, tenant isolation, ranking/order stability, and unsupported mode behavior.

**Tasks:**

- Add happy-path `query()` tests
- Add metadata-filter coverage for query
- Add tenant-scope coverage for query
- Add no-match and invalid-input coverage
- Add explicit unsupported `synthesize` behavior coverage if that path is deferred

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### UPDATE `src/query.ts` foundation types

- **IMPLEMENT**: Add a local options type:
  ```ts
  type QueryOpts<TTenant extends Record<string, unknown>> =
    TenantOpts<TTenant> & {
      filters?: MetadataFilters;
      mode?: 'pages-only' | 'synthesize';
    };
  ```
- **IMPORTS**: Ensure `QueryResult` is imported from `./types`
- **PATTERN**: Keep read-path option types local to `src/query.ts`, matching `TenantOpts<TTenant>` and `ListPagesOpts<TTenant>`
- **GOTCHA**: Do not widen the public query option shape beyond the PRD/client signature
- **VALIDATE**: `npx tsc --noEmit`

### ADD query validation helper(s) in `src/query.ts`

- **IMPLEMENT**: Add a small helper to validate:
  - `text.trim().length > 0`
  - `mode` defaults to `'pages-only'`
  - explicit `'synthesize'` throws a clear error for this scoped feature, for example `new Error('synthesize mode not implemented')`
- **PATTERN**: Mirror the existing plain-error validation style from `validateListPagesOptions()`
- **GOTCHA**: Reject blank strings after trim; do not let `plainto_tsquery('english', '')` decide behavior implicitly
- **VALIDATE**: `npx tsc --noEmit`

### ADD pages-only `query()` implementation to `src/query.ts`

- **IMPLEMENT**: Export:
  ```ts
  async function query<TTenant extends Record<string, unknown> = never>(
    ctx: QueryContext<TTenant>,
    text: string,
    opts: QueryOpts<TTenant>
  ): Promise<QueryResult>
  ```
- **IMPLEMENT**: Resolve tenant using `resolveTenantValue(ctx.config, opts)`
- **IMPLEMENT**: Build the base page query from `WikiPage` alias `p`
- **IMPLEMENT**: Apply tenant scope via `applyPageTenantScope()`
- **IMPLEMENT**: Apply metadata filters via `applyMetadataFilters()`
- **IMPLEMENT**: Apply full-text search using the persisted `search_vector`
  - Recommended SQL shape:
    - `p.search_vector @@ websearch_to_tsquery('english', :text)` or `plainto_tsquery('english', :text)`
    - select a rank column via `ts_rank_cd(p.search_vector, ...)`
- **IMPLEMENT**: Select fields needed to build page excerpts:
  - `p.id`
  - `p.title`
  - `p.content`
  - computed rank
- **IMPLEMENT**: Return `QueryResult.pages` as:
  - `id`
  - `title`
  - `excerpt`
- **PATTERN**: Prefer `getRawMany()` for ranked search rows, because `search_vector` is `select: false` and the rank is a computed column
- **GOTCHA**: Use parameter binding for the search text; never interpolate directly into SQL
- **GOTCHA**: Choose one tsquery conversion and document it
  - Recommended: `websearch_to_tsquery('english', :text)` for forgiving user input
  - Acceptable fallback: `plainto_tsquery('english', :text)` if simpler or more predictable
- **GOTCHA**: Include stable tiebreak ordering after rank
  - Recommended: `ORDER BY rank DESC, p.title ASC, p.id ASC`
- **GOTCHA**: If no rows match, return `{ pages: [], evidence: [] }` with no `answer`
- **VALIDATE**: `npx tsc --noEmit`

### ADD excerpt generation in `src/query.ts`

- **IMPLEMENT**: Convert each matched page row into a short excerpt string for `QueryResult.pages`
- **RECOMMENDED**: Keep excerpt logic simple and deterministic for this phase
  - Example: first non-empty trimmed slice of `content`, capped to a reasonable length such as 200-240 chars
- **PATTERN**: Keep normalization in the query module, similar to `listPages()` metadata normalization and `getPage()` evidence dedupe
- **GOTCHA**: Do not add a new dependency or Postgres highlighting function for this scoped feature
- **GOTCHA**: If content is shorter than the cap, return it unchanged
- **VALIDATE**: `npx tsc --noEmit`

### ADD evidence retrieval for matched pages in `src/query.ts`

- **IMPLEMENT**: Query evidence rows by joining:
  - `ClaimEvidence ce`
  - `WikiClaim c`
  - `SourceFragment sf`
  - `Source s`
- **IMPLEMENT**: Restrict evidence to claims whose `c.page_id` is in the matched page ids
- **IMPLEMENT**: Select:
  - `sf.id AS fragmentId`
  - `sf.text AS text`
  - `s.id AS sourceId`
  - `sf.char_offset_start AS charOffsetStart`
  - `c.page_id AS pageId` if useful for stable ordering/grouping
- **IMPLEMENT**: Deduplicate evidence rows by `fragmentId`, matching the pattern already used in `getPage()`
- **PATTERN**: Mirror the evidence join path from [src/query.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:231)
- **GOTCHA**: Preserve deterministic evidence ordering
  - Recommended: `ORDER BY c.page_id ASC, sf.char_offset_start ASC, sf.id ASC`
- **GOTCHA**: If pages are empty, skip the evidence query entirely
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `src/client.ts`

- **ADD** import:
  ```ts
  import { getPage, listPages, query, QueryContext } from './query';
  ```
- **UPDATE** `Client.query()` body to:
  ```ts
  const ctx: QueryContext<TTenant> = {
    dataSource: this.dataSource,
    schema: this.schema,
    config: this._config,
  };
  return query(ctx, text, opts);
  ```
- **PATTERN**: Mirror `Client.listPages()` and `Client.getPage()`
- **GOTCHA**: Preserve current public method signature and `QueryResult` return type
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `tests/integration/query.test.ts` scaffolding as needed

- **IMPLEMENT**: Reuse the existing `mockLlm`, lifecycle hooks, and helper functions in the file
- **IMPLEMENT**: Add small SQL helpers only if needed for search-vector or metadata setup
- **PATTERN**: Match the current integration-test style in this file instead of creating a separate `query-pages-only.test.ts`
- **GOTCHA**: Page metadata is still not populated from ingest, so any metadata-filter query tests must continue updating `pgwiki_wiki_pages.metadata` directly
- **VALIDATE**: `npx tsc --noEmit`

### ADD `query returns matched pages and evidence` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. ingest a source whose resulting page content includes searchable terms
  2. call `client.query('typed superset', {})`
  3. assert `pages.length >= 1`
  4. assert the first page contains `id`, `title`, and `excerpt`
  5. assert `evidence.length >= 1`
  6. assert the known title is returned
- **GOTCHA**: The excerpt should be asserted as a substring/shape, not an exact full-content mirror unless the implementation intentionally returns a fixed prefix
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD `query defaults to pages-only mode` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. ingest at least one searchable page
  2. call `client.query('typescript', {})`
  3. call `client.query('typescript', { mode: 'pages-only' })`
  4. assert the same page ids are returned
  5. assert neither result includes `answer`
- **GOTCHA**: This test locks in the default mode behavior without pulling synthesis into scope
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD metadata-filter query test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. create at least two searchable pages with distinct titles
  2. update one page metadata to `{ project: 'billing' }`
  3. update the other to `{ project: 'support' }`
  4. call `query('content', { filters: { project: 'billing' } })`
  5. assert only the billing page is returned
- **PATTERN**: Mirror the metadata update approach already used by the `listPages()` tests in the same file
- **GOTCHA**: Search text must match both pages before filtering, otherwise the test does not actually verify metadata scoping
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD tenant-scope query test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. create a tenant-aware client with `tenant: { key: 'workspaceId' }`
  2. ingest one searchable page under tenant `a`
  3. ingest another searchable page under tenant `b`
  4. call `query('content', { tenant: { workspaceId: 'a' } })`
  5. assert only tenant `a` pages are returned
  6. destroy the tenant client in `finally`
- **PATTERN**: Mirror the tenant-client setup already used in the same test file
- **GOTCHA**: Use `migrations: { run: false }` for secondary clients in the same suite
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD no-match and invalid-input query tests in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  - no-match case:
    1. ingest a searchable page
    2. call `query('definitely-not-present', {})`
    3. assert `{ pages: [], evidence: [] }`
  - invalid blank text case:
    1. call `query('   ', {})`
    2. assert a clear plain error such as `Invalid query text`
- **GOTCHA**: Keep the blank-input message stable; future tests and callers will rely on it
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD unsupported `synthesize` mode test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. ingest a searchable page
  2. call `query('typescript', { mode: 'synthesize' })`
  3. assert it rejects with `synthesize mode not implemented`
- **RATIONALE**: This keeps the current feature narrowly scoped while making the boundary explicit instead of leaving ambiguous runtime behavior
- **GOTCHA**: If implementation scope changes and synthesis is added in the same branch, remove this test and replace it with real synthesis coverage
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

---

## TESTING STRATEGY

Continue using real-Postgres integration tests as the primary verification strategy. The feature is query behavior over persisted page/evidence state, so integration coverage is the right default for this codebase.

### Unit Tests

No separate unit-test layer is required for this phase. Any helper behavior such as excerpt normalization or query validation should be covered through the integration suite unless it becomes unusually complex.

### Integration Tests

Extend `tests/integration/query.test.ts` to verify:

- base pages-only query behavior
- default mode behavior
- metadata-filter scoping on query results
- tenant isolation
- no-match behavior
- blank-query validation
- explicit unsupported `synthesize` mode behavior
- evidence retrieval and deduplication

### Edge Cases

- no-tenant mode returns only pages with `tenant IS NULL`
- tenant-aware mode never leaks pages across tenants
- metadata filters reuse the exact same semantics already implemented for `listPages()`
- blank or whitespace-only query text throws a clear error
- no matches return empty arrays, not errors
- evidence rows are deduplicated by `fragmentId`
- result ordering is deterministic when ranks tie
- `answer` is absent in pages-only mode
- explicit `synthesize` mode fails clearly until that phase is implemented

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and feature correctness.

### Level 1: Syntax & Types

```bash
npx tsc --noEmit
```

### Level 2: Build

```bash
npm run build
ls dist/query.js
```

### Level 3: Targeted Integration Tests

```bash
DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts
```

### Level 4: Full Integration Suite

```bash
DATABASE_URL=postgresql:///pgwiki_test npm run test:integration
```

### Level 5: Manual Validation

```bash
DATABASE_URL=postgresql:///pgwiki_test npx jest --runTestsByPath tests/integration/query.test.ts --verbose
```

---

## ACCEPTANCE CRITERIA

- [ ] `client.query()` no longer throws `"not implemented"` for default/pages-only usage
- [ ] `query()` returns `QueryResult` with `pages` and `evidence`
- [ ] `QueryResult.pages` entries contain `id`, `title`, and `excerpt`
- [ ] `QueryResult.evidence` entries contain `fragmentId`, `text`, and `sourceId`
- [ ] Full-text search uses the existing `search_vector` path on `wiki_pages`
- [ ] Tenant scoping uses the same JSONB containment logic as ingest, `listPages()`, and `getPage()`
- [ ] Metadata filters reuse the same helper semantics already implemented for `listPages()`
- [ ] No-match queries return empty arrays without error
- [ ] Blank query text throws a clear runtime error
- [ ] Explicit `mode: 'synthesize'` behavior is handled deliberately for this scoped feature
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run build` succeeds and `dist/query.js` exists
- [ ] Query integration tests and the full integration suite pass against real Postgres

---

## COMPLETION CHECKLIST

- [ ] `src/query.ts` updated with `query()` and any required query-specific helpers
- [ ] `src/client.ts` updated to delegate `query()`
- [ ] `tests/integration/query.test.ts` updated with pages-only `query()` coverage
- [ ] Full-text search behavior verified
- [ ] Evidence retrieval verified
- [ ] Targeted integration run passes
- [ ] Full integration suite passes
- [ ] Build and type-check pass
- [ ] Acceptance criteria all met

---

## NOTES

- This plan intentionally scopes to pages-only query behavior. The PRD also wants `synthesize` mode, but implementing retrieval first keeps the feature decomposed cleanly and reduces ambiguity around prompt construction and answer grounding.
- The PRD text mentions range filters for `query()`, but the current public `MetadataFilters` type only supports exact, `$in`, `$nin`, and `null`. Do not introduce range filters in this task unless the public type contract is deliberately expanded as part of a separate design decision.
- `search_vector` is populated during ingest using `to_tsvector('english', title || ' ' || content)`, so this feature should use the same English text-search configuration unless there is a conscious schema-wide change.
- Because page metadata is not yet propagated from source ingest, query metadata tests must continue updating `pgwiki_wiki_pages.metadata` directly.

**Confidence Score**: 8.5/10 that implementation will succeed on first attempt
