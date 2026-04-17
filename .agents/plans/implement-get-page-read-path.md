# Feature: Implement `getPage()` Read Path

The following plan should be complete, but it is important that you validate documentation, codebase patterns, and task sanity before you start implementing.

Pay special attention to relation field names, nullable DB columns, and the current tenant typing workaround already in `Client` and `ingest.ts`.

## Feature Description

Implement `client.getPage(id, opts)` so callers can retrieve a single wiki page together with its version history, claims, and supporting evidence fragments. The method must respect tenant isolation, return the exact `PageDetail` shape already defined in `src/types.ts`, and fit the repo’s emerging pattern of moving non-trivial client logic into a dedicated module rather than embedding it in `Client`.

## User Story

As a developer  
I want to call `client.getPage(pageId, opts)`  
So that I can inspect a compiled wiki page with its version history, claims, and source-backed evidence

## Problem Statement

The PRD defines `getPage()` as a core read-path API, but [src/client.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/client.ts:89) still throws `"not implemented"`. The library can ingest and maintain wiki pages, but there is currently no supported way to read one page back with provenance, which blocks the MVP’s auditability and inspectability story.

## Solution Statement

Create a new `src/query.ts` module that owns read-path logic starting with `getPage()`. Implement `getPage()` as a tenant-scoped read operation that:

1. fetches the target `WikiPage`
2. fetches its `WikiPageVersion` rows
3. fetches its `WikiClaim` rows
4. fetches distinct evidence fragments by joining `ClaimEvidence -> WikiClaim -> SourceFragment -> Source`
5. assembles the result into the existing `PageDetail` type

Wire `Client.getPage()` to call this module using the same context-passing pattern already used for ingest/delete.

## Feature Metadata

**Feature Type**: New Capability  
**Estimated Complexity**: Medium  
**Primary Systems Affected**: `src/query.ts` (new), `src/client.ts` (update), `tests/integration/query.test.ts` (new)  
**Dependencies**: existing `typeorm`, `pg`, `reflect-metadata`, `jest`, `ts-jest` only

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/client.ts` ([lines 26-132](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/client.ts:26))  
  Why: `Client` already uses a local `TenantArg<TTenant>` conditional type and forwards ingest/delete through context objects. `getPage()` should mirror this wiring pattern instead of implementing DB access inline.

- `src/ingest.ts` ([lines 21-52](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/ingest.ts:21))  
  Why: Defines `IngestContext`, local no-tenant/tenant input typing, and the `resolveTenantValue()` helper pattern. `getPage()` should use the same tenant resolution strategy and not rely on exported `WithTenant<never>`.

- `src/ingest.ts` ([lines 89-100](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/ingest.ts:89))  
  Why: Shows the current tenant scoping convention for pages: `p.tenant @> :tenant::jsonb` in tenant mode, `p.tenant IS NULL` in no-tenant mode.

- `src/ingest.ts` ([lines 330-379](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/ingest.ts:330))  
  Why: Shows how claims and evidence are currently written. Every claim is linked to every fragment from the ingested source, which means read-path evidence queries must dedupe fragment rows.

- `src/types.ts` ([lines 21-60](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/types.ts:21))  
  Why: Contains the currently exported `WithTenant<TTenant>` type plus the target `PageDetail` shape. `PageDetail.versions[].changeSummary` is typed as `string`, but the DB column is nullable, so the implementation must normalize nulls.

- `src/entities/WikiPage.ts` ([lines 12-48](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/entities/WikiPage.ts:12))  
  Why: Core page entity fields and tenant column definition.

- `src/entities/WikiPageVersion.ts` ([lines 12-28](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/entities/WikiPageVersion.ts:12))  
  Why: Version row structure. `changeSummary` is nullable at the entity level.

- `src/entities/WikiClaim.ts` ([lines 13-35](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/entities/WikiClaim.ts:13))  
  Why: Claim row shape and `page_id` relation.

- `src/entities/ClaimEvidence.ts` ([lines 12-26](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/entities/ClaimEvidence.ts:12))  
  Why: Evidence join table. `claim_id` and `fragment_id` are the key read-path join points.

- `src/entities/SourceFragment.ts` ([lines 13-38](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/entities/SourceFragment.ts:13))  
  Why: Fragment fields required by the `PageDetail.evidence` payload.

- `src/entities/Source.ts` ([lines 12-36](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/entities/Source.ts:12))  
  Why: `source.id` is required in the evidence payload and `tenant` is stored here as well.

- `src/migrations/1700000000000-InitialSchema.ts` ([lines 36-108](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/migrations/1700000000000-InitialSchema.ts:36))  
  Why: Confirms actual table names and FK column names: `page_id`, `claim_id`, `fragment_id`, and `source_id`.

- `tests/integration/client.test.ts` ([lines 26-175](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/client.test.ts:26))  
  Why: Base integration-test lifecycle pattern. Tests guard on `DATABASE_URL`, create the client in `beforeAll`, clean/drop tables, and destroy the DataSource in `afterAll`.

- `tests/integration/ingest.test.ts` ([lines 64-342](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/ingest.test.ts:64))  
  Why: Current integration-test style for feature workflows, DB assertions, deterministic mock LLM behavior, and cleanup helpers.

- `src/index.ts` ([lines 1-12](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/index.ts:1))  
  Why: Confirms public exports do not need changes for this feature because `getPage()` is exposed through `Client`, not a new top-level export.

### New Files to Create

- `src/query.ts` - read-path module containing `QueryContext` and `getPage()`
- `tests/integration/query.test.ts` - integration tests for the `getPage()` workflow

### Files to Update

- `src/client.ts` - wire `Client.getPage()` to the new query module

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [TypeORM Select Query Builder](https://typeorm.io/docs/query-builder/select-query-builder/)  
  Specific sections: `getOne`, `getMany`, `getRawOne`, `getRawMany`, partial selects, joins  
  Why: `getPage()` needs entity reads for page/versions/claims and raw reads for deduplicated evidence rows.

- [TypeORM Find Options](https://typeorm.io/docs/working-with-entity-manager/find-options/)  
  Specific sections: nested `where`, `order`, `relations`  
  Why: Useful for simple `find`-based reads on versions and claims if you choose repository APIs instead of query builders for those subqueries.

- [TypeORM EntityManager API](https://typeorm.io/docs/working-with-entity-manager/entity-manager-api)  
  Specific sections: `createQueryBuilder`, raw `query`, repository access  
  Why: Confirms the read-path module can safely use `dataSource.manager` and repositories without a transaction.

- [PostgreSQL JSON Functions and Operators](https://www.postgresql.org/docs/current/functions-json.html)  
  Specific section: `jsonb @>` containment operator  
  Why: This repo already uses `@>` for tenant scoping. Keep the read path consistent with the ingest path.

- [PostgreSQL SELECT](https://www.postgresql.org/docs/current/sql-select.html)  
  Specific sections: `DISTINCT`, `DISTINCT ON`, ordering behavior  
  Why: The evidence query must avoid duplicate fragments caused by the current MVP evidence model.

### Patterns to Follow

**Thin `Client` methods that delegate to feature modules**
```ts
const ctx: IngestContext<TTenant> = {
  dataSource: this.dataSource,
  schema: this.schema,
  config: this._config,
};
return ingestSource(ctx, source);
```
Source: [src/client.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/client.ts:41)

**Tenant resolution helper pattern**
```ts
function resolveTenantValue<TTenant extends Record<string, unknown>>(
  config: ClientConfig<TTenant>,
  input: WithTenant<TTenant>
): Record<string, unknown> | null {
  return config.tenant != null && 'tenant' in input
    ? ((input as { tenant: TTenant }).tenant as Record<string, unknown>)
    : null;
}
```
Source: [src/ingest.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/ingest.ts:39)

**Tenant-scoped page query pattern**
```ts
if (tenantValue !== null) {
  pageQuery = pageQuery.where('p.tenant @> :tenant::jsonb', {
    tenant: JSON.stringify(tenantValue),
  });
} else {
  pageQuery = pageQuery.where('p.tenant IS NULL');
}
```
Source: [src/ingest.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/ingest.ts:93)

**Integration test lifecycle pattern**
```ts
beforeAll(async () => {
  if (!DATABASE_URL) return;
  await dropExistingTables(DATABASE_URL);
  client = await createClient({ connectionString: DATABASE_URL, llm: mockLlm });
});
```
Source: [tests/integration/client.test.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/client.test.ts:29)

**DB assertions use direct SQL in integration tests**
```ts
const versions = await client.dataSource.query<{ id: string }[]>(
  'SELECT id FROM pgwiki_wiki_page_versions WHERE page_id = $1 ORDER BY created_at ASC',
  [second.pages[0].id]
);
```
Source: [tests/integration/ingest.test.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/ingest.test.ts:190)

**Naming Conventions**
- Modules: `src/<domain>.ts` for non-trivial client logic (`ingest.ts`, planned `query.ts`)
- Entities: PascalCase files/classes
- Tests: `tests/integration/<feature>.test.ts`
- DB aliases: short single-letter aliases in QueryBuilder (`p`, `c`, `ce`, `sf`, `s`)

**Error Handling**
- Current repo pattern is plain `Error` with specific messages, e.g. `Source not found: ${id}` in [src/ingest.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/ingest.ts:211)
- Mirror that for not-found page reads: `throw new Error(\`Page not found: ${id}\`)`

**Read-path Pattern**
- `getPage()` is read-only. Do not use `QueryRunner` or transactions.
- Use `dataSource.manager` or repositories directly.
- Prefer explicit selects and stable ordering rather than loading whole relation graphs implicitly.

**Anti-Patterns to Avoid**
- Do not use exported `WithTenant<never>` directly for the public `getPage()` implementation surface; it currently resolves to `Record<string, never>` and is not callable in no-tenant mode.
- Do not rely on `leftJoinAndSelect` to magically shape evidence into `PageDetail.evidence`; the result shape is not an entity and should be built from raw rows.
- Do not return nullable `changeSummary` values directly because `PageDetail` requires `string`.

---

## IMPLEMENTATION PLAN

### Phase 1: Read-Path Foundation

Create the dedicated query module and establish shared context and typing for read APIs.

**Tasks:**

- Create `QueryContext<TTenant>` carrying `dataSource`, `schema`, and `config`
- Add local conditional tenant arg type for read methods
- Add internal tenant resolution helper mirroring ingest

### Phase 2: `getPage()` Core Read Logic

Implement the page fetch and related subqueries needed to assemble `PageDetail`.

**Tasks:**

- Fetch the tenant-scoped page by `id`
- Fetch versions with stable ordering
- Fetch claims for the page
- Fetch deduplicated evidence fragments joined to sources
- Normalize nullable values to match `PageDetail`

### Phase 3: Client Integration

Expose the new read-path implementation through `Client.getPage()`.

**Tasks:**

- Import `getPage` and `QueryContext` into `src/client.ts`
- Replace the current stub body with context delegation
- Keep `Client` thin and consistent with ingest/delete

### Phase 4: Testing & Validation

Add end-to-end integration tests against real Postgres.

**Tasks:**

- Add success-path `getPage` integration coverage
- Add version-history coverage after multiple ingests
- Add missing-page behavior coverage
- Add tenant-isolation coverage

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### CREATE `src/query.ts`

- **IMPLEMENT**: Import `DataSource` from `typeorm`; import `WikiPage`, `WikiPageVersion`, `WikiClaim`, `ClaimEvidence`, `SourceFragment`, and `Source` from `./entities`; import `ClientConfig` and `PageDetail` from `./types`
- **IMPLEMENT**: Export `interface QueryContext<TTenant extends Record<string, unknown> = never> { dataSource: DataSource; schema: string; config: ClientConfig<TTenant> }`
- **IMPLEMENT**: Add a local conditional input type for `getPage` options:
  ```ts
  type TenantOpts<TTenant extends Record<string, unknown>> = [TTenant] extends [never]
    ? {}
    : { tenant: TTenant };
  ```
- **PATTERN**: Mirror the context shape from [src/ingest.ts:21](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/ingest.ts:21)
- **GOTCHA**: Do not use exported `WithTenant<TTenant>` directly for the no-tenant path
- **VALIDATE**: `npx tsc --noEmit`

### ADD tenant resolution helpers in `src/query.ts`

- **IMPLEMENT**: Add `resolveTenantValue()` mirroring [src/ingest.ts:39](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/ingest.ts:39)
- **IMPLEMENT**: Add a small helper for applying tenant conditions to a `WikiPage` query:
  - tenant mode: `p.tenant @> :tenant::jsonb`
  - no-tenant mode: `p.tenant IS NULL`
- **PATTERN**: Mirror the page scoping logic from [src/ingest.ts:89](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/ingest.ts:89)
- **GOTCHA**: Keep the alias fixed to `p` if you hardcode the tenant SQL snippet
- **VALIDATE**: `npx tsc --noEmit`

### ADD `getPage()` implementation to `src/query.ts`

- **IMPLEMENT**: Export:
  ```ts
  async function getPage<TTenant extends Record<string, unknown> = never>(
    ctx: QueryContext<TTenant>,
    id: string,
    opts: TenantOpts<TTenant>
  ): Promise<PageDetail>
  ```
- **IMPLEMENT**: Fetch the target page with `createQueryBuilder(WikiPage, 'p')`
  - select only `p.id`, `p.title`, `p.content`
  - filter on `p.id = :id`
  - apply tenant scope before `getOne()`
- **IMPLEMENT**: If page not found, throw `new Error(\`Page not found: ${id}\`)`
- **IMPLEMENT**: Fetch versions for `page.id`
  - select `id`, `createdAt`, `changeSummary`
  - order by `created_at DESC, id DESC` for deterministic results
  - normalize `changeSummary ?? ''` before returning
- **IMPLEMENT**: Fetch claims for `page.id`
  - select `id`, `text`, `status`
  - use a stable order such as `created_at ASC, id ASC`
- **IMPLEMENT**: Fetch evidence rows using QueryBuilder joins:
  ```ts
  ClaimEvidence ce
    -> WikiClaim c ON c.id = ce.claim_id
    -> SourceFragment sf ON sf.id = ce.fragment_id
    -> Source s ON s.id = sf.source_id
  ```
  - filter on `c.page_id = :pageId`
  - select raw aliases:
    - `sf.id AS "fragmentId"`
    - `sf.text AS "text"`
    - `s.id AS "sourceId"`
  - dedupe rows via `distinct(true)` or code-level dedupe keyed by `fragmentId`
  - order evidence by `sf.char_offset_start ASC, sf.id ASC`
- **IMPLEMENT**: Return assembled `PageDetail`
- **PATTERN**: Use QueryBuilder raw selects following the TypeORM docs for `getRawMany`
- **GOTCHA**: Because ingest currently links every claim to every fragment, evidence duplicates are expected unless you dedupe them
- **GOTCHA**: `WikiPageVersion.changeSummary` is nullable in the entity and DB, but not in `PageDetail`
- **GOTCHA**: The current versioning model stores historical snapshots; after updates, `page.content` is the latest body while older `versions[].content` is not returned by `PageDetail`
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `src/client.ts`

- **ADD** imports:
  ```ts
  import { getPage, QueryContext } from './query';
  ```
- **UPDATE** `Client.getPage()` to:
  ```ts
  const ctx: QueryContext<TTenant> = {
    dataSource: this.dataSource,
    schema: this.schema,
    config: this._config,
  };
  return getPage(ctx, id, opts);
  ```
- **PATTERN**: Mirror `Client.ingestSource()` and `Client.deleteSource()` in [src/client.ts:41](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/client.ts:41)
- **GOTCHA**: Do not widen or change the `TenantArg<TTenant>` type already used by `Client`
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `tests/integration/query.test.ts`

- **IMPLEMENT**: Use the same integration test scaffolding as [tests/integration/ingest.test.ts:64](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/ingest.test.ts:64)
- **IMPLEMENT**: Reuse a deterministic mock LLM that produces:
  - a stable page title (`TypeScript`)
  - one claim
  - one or more fragments via source content length if needed
- **IMPLEMENT**: Add `beforeAll` that drops tables and creates a client
- **IMPLEMENT**: Add `beforeEach` that truncates all `pgwiki_*` tables
- **IMPLEMENT**: Add `afterAll` that drops `pgwiki_*` tables and destroys the DataSource
- **PATTERN**: Mirror cleanup helpers from [tests/integration/client.test.ts:151](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/client.test.ts:151) and [tests/integration/ingest.test.ts:324](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/ingest.test.ts:324)
- **GOTCHA**: Keep DB-backed integration suites serialized via existing Jest config `maxWorkers: 1`
- **VALIDATE**: `npx tsc --noEmit`

### ADD `getPage returns full page detail` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. ingest a source
  2. call `client.getPage(result.pages[0].id, {})`
  3. assert `id`, `title`, and `content`
  4. assert `versions.length >= 1`
  5. assert `claims.length >= 1`
  6. assert `evidence.length >= 1`
  7. assert the first evidence item has `fragmentId`, `text`, and `sourceId`
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD `getPage returns stable version history after second ingest` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. ingest the same logical page twice using the deterministic mock title
  2. call `getPage(pageId, {})`
  3. assert `versions.length === 2`
  4. assert all `versions[].changeSummary` values are strings
- **GOTCHA**: Do not assert that `versions[0]` content equals current page content; `PageDetail` does not include version content and the write path stores prior snapshots on update
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD `getPage throws for missing page` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  - call `client.getPage('00000000-0000-0000-0000-000000000000', {})`
  - assert rejection with `Page not found`
- **PATTERN**: Mirror not-found assertion style from [tests/integration/ingest.test.ts:313](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/ingest.test.ts:313)
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD `getPage enforces tenant scope` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. create a tenant-scoped client:
     ```ts
     const tenantClient = await createClient<{ workspaceId: string }>({
       connectionString: DATABASE_URL!,
       llm: mockLlm,
       tenant: { key: 'workspaceId' },
       migrations: { run: false },
     });
     ```
  2. ingest under `{ tenant: { workspaceId: 'a' } }`
  3. fetch under tenant `a` and assert success
  4. fetch same page id under tenant `b` and assert `Page not found`
  5. destroy `tenantClient` at the end of the test
- **GOTCHA**: Use `migrations.run: false` for secondary clients in the same suite to avoid migration conflicts
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

---

## TESTING STRATEGY

### Integration Tests

This repo currently relies on real-Postgres integration tests rather than isolated unit tests for feature work. Follow that standard here.

- Add a dedicated `tests/integration/query.test.ts`
- Use deterministic mock LLM output so `getPage()` assertions remain stable
- Verify both API return shapes and underlying database facts where useful

### Unit Tests

No dedicated unit test layer is required for this feature unless you extract a pure normalization helper worth testing independently. If you do not create a unit test, keep coverage in integration tests only, consistent with the current codebase pattern.

### Edge Cases

- Missing page id returns a clear error
- Wrong tenant cannot read an existing page
- Page with multiple claims pointing to the same fragment returns deduplicated evidence
- Null `change_summary` values are normalized to strings in the returned payload
- Page with no claims or no evidence returns empty arrays rather than throwing

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

- [ ] `client.getPage(id, opts)` no longer throws `"not implemented"`
- [ ] `getPage()` returns the exact `PageDetail` shape from `src/types.ts`
- [ ] Page lookup is tenant-scoped using the same JSONB containment pattern as ingest
- [ ] Missing pages raise a clear `Page not found: <id>` error
- [ ] Returned versions are ordered deterministically and contain non-null `changeSummary` strings
- [ ] Returned evidence items are deduplicated by fragment despite many-to-many claim evidence links
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run build` produces `dist/query.js`
- [ ] Integration tests pass against real Postgres

---

## COMPLETION CHECKLIST

- [ ] `src/query.ts` created
- [ ] `src/client.ts` updated to delegate `getPage()`
- [ ] `tests/integration/query.test.ts` created
- [ ] Targeted `getPage` integration tests pass
- [ ] Full integration suite passes
- [ ] Build output includes `dist/query.js`
- [ ] No type errors remain
- [ ] Acceptance criteria all met

---

## NOTES

- `schema` is already part of the context pattern even though current ingest code does not use it directly. Keep it in `QueryContext` for consistency and future read-path expansion.
- The repo is converging on feature modules (`ingest.ts`, next `query.ts`) rather than large `Client` methods. Preserve that direction.
- The exported `WithTenant<TTenant>` type is currently awkward for no-tenant mode. This feature should avoid depending on it internally, but a future cleanup pass should likely fix the exported type itself before implementing `query()` and `listPages()`.
- `PageDetail` intentionally does not include page metadata, type, or status today. Do not expand the response shape during this feature unless the user explicitly changes the public API.

**Confidence Score**: 9/10 that implementation will succeed on first attempt
