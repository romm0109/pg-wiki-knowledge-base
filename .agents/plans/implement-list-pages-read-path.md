# Feature: Implement `listPages()` Read Path

The following plan should be complete, but it is important that you validate documentation, codebase patterns, and task sanity before you start implementing.

Pay special attention to tenant scoping, metadata filter semantics, and the fact that page metadata is not currently populated by `ingestSource()`. The tests for metadata filters must account for that explicitly.

## Feature Description

Implement `client.listPages(opts)` so callers can retrieve page summaries with tenant scoping, metadata filtering, and pagination. This is the lighter-weight read API that complements `getPage()` and establishes reusable metadata filter logic for the later `query()` implementation.

## User Story

As a developer  
I want to call `client.listPages({ filters, tenant, limit, offset })`  
So that I can browse the wiki pages relevant to a tenant or project without fetching full page detail

## Problem Statement

The PRD defines `listPages()` as a core read API with metadata filters and pagination, but [src/client.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/client.ts:81) still throws `"not implemented"`. The library can ingest data and fetch a single page, but it cannot yet return a filtered page index, which blocks common browse/use-list workflows and leaves the metadata-filtering story incomplete.

## Solution Statement

Extend `src/query.ts` with a `listPages()` implementation and reusable metadata-filter helpers. `listPages()` should:

1. scope results by tenant using the same JSONB tenant pattern already used by ingest and `getPage()`
2. support page metadata filters for:
   - exact match
   - `$in`
   - `$nin`
   - `null`
3. return `PageSummary[]` with stable ordering
4. support optional `limit` and `offset` pagination

Because page metadata is not currently populated by ingest, the integration tests should update `pgwiki_wiki_pages.metadata` directly after ingest to create realistic filter scenarios. This keeps the feature focused on the read path instead of silently widening ingest scope.

## Feature Metadata

**Feature Type**: New Capability  
**Estimated Complexity**: Medium  
**Primary Systems Affected**: `src/query.ts` (update), `src/client.ts` (update), `tests/integration/query.test.ts` (update)  
**Dependencies**: existing `typeorm`, `pg`, `reflect-metadata`, `jest`, `ts-jest` only

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `PRD.md` ([lines 121-125](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/PRD.md:121))  
  Why: Defines the product requirement that `listPages()` and `query()` must support arbitrary metadata filtering in multi-tenant apps.

- `PRD.md` ([lines 220-222](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/PRD.md:220))  
  Why: Defines `listPages()` as returning page summaries and supporting metadata filters and pagination.

- `PRD.md` ([lines 348-357](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/PRD.md:348))  
  Why: Shows the intended public API shape and return payload for `listPages()`.

- `PRD.md` ([lines 430-440](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/PRD.md:430))  
  Why: Places `listPages()` inside Phase 3 and explicitly calls out metadata filter application.

- `src/client.ts` ([lines 27-100](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/client.ts:27))  
  Why: `Client` already uses the local `TenantArg<TTenant>` pattern and delegates `getPage()` through `QueryContext`. `listPages()` should follow the same design.

- `src/query.ts` ([lines 12-44](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:12))  
  Why: Contains the current `QueryContext`, local `TenantOpts<TTenant>`, `resolveTenantValue()`, and `applyPageTenantScope()` helpers. `listPages()` should reuse or extend these rather than duplicating them.

- `src/query.ts` ([lines 46-130](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:46))  
  Why: Shows the current query-module style: read-only logic, explicit selects, stable ordering, and post-query normalization.

- `src/types.ts` ([lines 25-27](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/types.ts:25))  
  Why: Defines `MetadataFilters`, which currently supports exact values, `$in`, `$nin`, and `null`.

- `src/types.ts` ([lines 45-51](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/types.ts:45))  
  Why: Defines the target `PageSummary` return shape for `listPages()`.

- `src/entities/WikiPage.ts` ([lines 12-48](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/entities/WikiPage.ts:12))  
  Why: `listPages()` should only return fields already available on `WikiPage`: `id`, `title`, `type`, `status`, `metadata`, and tenant.

- `src/migrations/1700000000000-InitialSchema.ts` ([lines 138-148](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/migrations/1700000000000-InitialSchema.ts:138))  
  Why: Confirms the `idx_pgwiki_wiki_pages_metadata` GIN index exists, which is the DB-level foundation for metadata filtering.

- `tests/integration/query.test.ts` ([lines 50-243](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/query.test.ts:50))  
  Why: Existing read-path integration test suite already handles DB setup, teardown, deterministic LLM behavior, and tenant-scoped clients. `listPages()` tests should extend this file instead of creating a parallel scaffold.

- `tests/integration/ingest.test.ts` ([lines 127-168](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/ingest.test.ts:127))  
  Why: Shows the style for direct SQL assertions against Postgres tables after ingest.

### Files to Update

- `src/query.ts` - add `listPages()` and metadata-filter helpers
- `src/client.ts` - wire `Client.listPages()` to the query module
- `tests/integration/query.test.ts` - extend the read-path suite with `listPages()` coverage

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [TypeORM Select Query Builder](https://typeorm.io/docs/query-builder/select-query-builder/)  
  Specific sections: `where`, `andWhere`, `orderBy`, `addOrderBy`, `getMany`, `getRawMany`, `Brackets`  
  Why: `listPages()` needs composable SQL conditions for filters and deterministic ordering.

- [TypeORM Find Options](https://typeorm.io/docs/working-with-entity-manager/find-options/)  
  Specific sections: `where`, `order`, `take`, `skip`  
  Why: If you choose repository `find()` for simple listing, these options define the supported pagination primitives.

- [TypeORM SQL Tag](https://dev.typeorm.io/docs/guides/sql-tag/)  
  Specific section: parameter handling  
  Why: Useful fallback if a metadata filter edge case is awkward in QueryBuilder and you need safe raw SQL composition.

- [PostgreSQL JSON Functions and Operators](https://www.postgresql.org/docs/current/functions-json.html)  
  Specific sections: `jsonb @>` containment, `?` existence operator  
  Why: These are the core operators for exact match and null/missing-key semantics.

- [PostgreSQL JSON Types](https://www.postgresql.org/docs/15/datatype-json.html)  
  Specific sections: containment semantics and top-level key existence  
  Why: Clarifies what `@>` and `?` mean when filtering page metadata.

### Patterns to Follow

**Thin `Client` methods that delegate into query module**
```ts
const ctx: QueryContext<TTenant> = {
  dataSource: this.dataSource,
  schema: this.schema,
  config: this._config,
};
return getPage(ctx, id, opts);
```
Source: [src/client.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/client.ts:90)

**Tenant resolution and tenant scoping helpers already exist in `query.ts`**
```ts
function resolveTenantValue<TTenant extends Record<string, unknown>>(
  config: ClientConfig<TTenant>,
  input: TenantOpts<TTenant>
): TenantValue { ... }

function applyPageTenantScope(
  queryBuilder: SelectQueryBuilder<WikiPage>,
  tenantValue: TenantValue
): SelectQueryBuilder<WikiPage> { ... }
```
Source: [src/query.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:24)

**Stable read ordering**
```ts
.orderBy('v.created_at', 'DESC')
.addOrderBy('v.id', 'DESC')
```
Source: [src/query.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:66)

**Integration test lifecycle pattern**
```ts
beforeAll(async () => {
  if (!DATABASE_URL) return;
  await dropExistingTables(DATABASE_URL);
  client = await createClient({ connectionString: DATABASE_URL, llm: mockLlm });
});
```
Source: [tests/integration/query.test.ts](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/query.test.ts:53)

**Naming Conventions**
- Read-path logic lives in `src/query.ts`
- Integration coverage for read APIs is consolidated in `tests/integration/query.test.ts`
- Query aliases use short names (`p` for `WikiPage`)
- Public client methods remain small delegators

**Error Handling**
- Current repo pattern favors plain `Error` with specific messages for invalid or missing inputs.
- Mirror that style if pagination inputs are invalid rather than inventing a custom error class.

**Metadata Filter Design Pattern**
- Prefer building filter clauses on `p.metadata` with JSONB containment (`@>`) and existence (`?`) so logic stays database-native.
- Construct unique parameter names per filter key to avoid `QueryBuilder` parameter collisions.
- Group `$in` conditions with `OR` and `$nin` conditions with `AND NOT (...)`.

**Anti-Patterns to Avoid**
- Do not create a second query helper file; keep Phase 3 read-path logic centered in `src/query.ts`.
- Do not assume page metadata is populated by ingest. It currently is not.
- Do not use natural row ordering; `listPages()` must specify deterministic `ORDER BY`.
- Do not rely on exported `WithTenant<never>` as the new input surface. Keep using the local conditional tenant arg pattern already established in `Client`/`query.ts`.

---

## IMPLEMENTATION PLAN

### Phase 1: Read-Path Foundation

Extend the query module with reusable metadata filtering and list-options typing.

**Tasks:**

- Add a local `ListPagesOpts<TTenant>` type in `src/query.ts`
- Add a reusable `applyMetadataFilters()` helper for `WikiPage` queries
- Decide and encode exact semantics for `null`, `$in`, and `$nin`

### Phase 2: Core `listPages()` Implementation

Implement page listing with explicit selection, tenant scoping, metadata filters, ordering, and pagination.

**Tasks:**

- Add `listPages()` to `src/query.ts`
- Select only the `PageSummary` fields
- Apply tenant scope and metadata filters
- Apply stable ordering and optional pagination
- Return typed `PageSummary[]`

### Phase 3: Client Integration

Expose the list API through `Client.listPages()`.

**Tasks:**

- Import `listPages` into `src/client.ts`
- Update the method body to delegate via `QueryContext`
- Expand the public method signature to include optional pagination args if implementing PRD-complete pagination

### Phase 4: Testing & Validation

Add integration coverage for filter semantics, pagination, and tenant isolation.

**Tasks:**

- Add no-filter happy-path coverage
- Add exact-match, `$in`, `$nin`, and `null` filter tests
- Add tenant-scope tests
- Add pagination tests

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### UPDATE `src/query.ts` foundation types

- **IMPLEMENT**: Add a local options type for page listing:
  ```ts
  type ListPagesOpts<TTenant extends Record<string, unknown>> =
    TenantOpts<TTenant> & {
      filters?: MetadataFilters;
      limit?: number;
      offset?: number;
    };
  ```
- **IMPORTS**: Add `MetadataFilters` and `PageSummary` from `./types`
- **PATTERN**: Keep all read-path option types local to `src/query.ts`, matching the current `TenantOpts<TTenant>` pattern in [src/query.ts:18](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:18)
- **GOTCHA**: `limit` and `offset` do not exist in the current `Client.listPages()` signature, but the PRD explicitly requires pagination. Decide the API shape here and carry it through consistently.
- **VALIDATE**: `npx tsc --noEmit`

### ADD metadata filter helper(s) in `src/query.ts`

- **IMPLEMENT**: Add `applyMetadataFilters(queryBuilder, filters)` targeting `WikiPage` alias `p`
- **IMPLEMENT**: Support these semantics:
  - exact value: `filters.project = 'billing'`
    - use `p.metadata @> :param::jsonb` with `JSON.stringify({ project: 'billing' })`
  - inclusion: `filters.project = { $in: ['billing', 'support'] }`
    - build an `OR` group of containment checks
  - exclusion: `filters.project = { $nin: ['internal', 'deprecated'] }`
    - build `AND`ed negated containment checks
  - null check: `filters.project = null`
    - treat this as “missing key OR explicit JSON null”
    - use `NOT (p.metadata ? :key)` OR `p.metadata @> :nullParam::jsonb`
- **PATTERN**: Mirror the tenant-scope helper pattern from [src/query.ts:33](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:33) by returning the same `SelectQueryBuilder<WikiPage>`
- **GOTCHA**: Use unique parameter names like `metadataExact0`, `metadataIn0_1`, `metadataKey0` to avoid collisions
- **GOTCHA**: `$nin: []` and `$in: []` should not generate broken SQL. Decide one behavior and document it:
  - Recommended: skip empty `$nin`
  - Recommended: empty `$in` makes the query return no rows
- **GOTCHA**: Do not use string interpolation for JSON values; bind all params
- **VALIDATE**: `npx tsc --noEmit`

### ADD `listPages()` implementation to `src/query.ts`

- **IMPLEMENT**: Export:
  ```ts
  async function listPages<TTenant extends Record<string, unknown> = never>(
    ctx: QueryContext<TTenant>,
    opts: ListPagesOpts<TTenant>
  ): Promise<PageSummary[]>
  ```
- **IMPLEMENT**: Resolve tenant with `resolveTenantValue(ctx.config, opts)`
- **IMPLEMENT**: Build a `WikiPage` query selecting only:
  - `p.id`
  - `p.title`
  - `p.type`
  - `p.status`
  - `p.metadata`
- **IMPLEMENT**: Apply tenant scope using `applyPageTenantScope()`
- **IMPLEMENT**: Apply metadata filters using the new helper
- **IMPLEMENT**: Apply deterministic ordering
  - Recommended: `ORDER BY p.title ASC, p.id ASC`
  - Rationale: makes browse results predictable and human-friendly
- **IMPLEMENT**: Apply pagination
  - if `limit` is provided, use `.take(limit)`
  - if `offset` is provided, use `.skip(offset)`
- **IMPLEMENT**: Return `PageSummary[]`
- **PATTERN**: Stay fully read-only, matching the style in [src/query.ts:46](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/query.ts:46)
- **GOTCHA**: Validate pagination inputs before passing them to TypeORM
  - `limit` must be an integer >= 1
  - `offset` must be an integer >= 0
  - throw `new Error('Invalid pagination options')` on invalid values
- **GOTCHA**: `metadata` is nullable in the DB model shape? The entity default is `{}` and the `PageSummary` type expects `Record<string, unknown>`. Normalize `page.metadata ?? {}`
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `src/client.ts`

- **ADD** import:
  ```ts
  import { getPage, listPages, QueryContext } from './query';
  ```
- **UPDATE** `Client.listPages()` body to:
  ```ts
  const ctx: QueryContext<TTenant> = {
    dataSource: this.dataSource,
    schema: this.schema,
    config: this._config,
  };
  return listPages(ctx, opts);
  ```
- **UPDATE** `Client.listPages()` signature to include pagination if implementing the PRD-complete version:
  ```ts
  async listPages(
    opts: {
      filters?: MetadataFilters;
      limit?: number;
      offset?: number;
    } & TenantArg<TTenant>
  ): Promise<PageSummary[]>
  ```
- **PATTERN**: Mirror `Client.getPage()` in [src/client.ts:90](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/src/client.ts:90)
- **GOTCHA**: If you add pagination to `Client.listPages()`, keep the inline opts type aligned with `src/query.ts`
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `tests/integration/query.test.ts` scaffolding as needed

- **IMPLEMENT**: Reuse the existing test file and helper functions instead of creating a new file
- **IMPLEMENT**: Add a small helper for directly updating `pgwiki_wiki_pages.metadata` rows in tests
- **PATTERN**: Use the current lifecycle hooks in [tests/integration/query.test.ts:53](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/query.test.ts:53)
- **GOTCHA**: Ingest currently sets page metadata to `{}`, so direct SQL updates are required to create filterable metadata states
- **VALIDATE**: `npx tsc --noEmit`

### ADD `listPages returns page summaries` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. ingest at least one source
  2. call `client.listPages({})`
  3. assert an array of `PageSummary`
  4. assert each item has `id`, `title`, `type`, `status`, `metadata`
  5. assert the known page title is returned
- **GOTCHA**: If the deterministic mock only produces one page title, that is fine for the base happy-path test
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD exact metadata filter test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. ingest two or more pages
  2. update their `pgwiki_wiki_pages.metadata` rows directly so one has `{ project: 'billing' }` and another has `{ project: 'support' }`
  3. call `listPages({ filters: { project: 'billing' } })`
  4. assert only the billing page is returned
- **PATTERN**: Use direct SQL assertions/updates like [tests/integration/ingest.test.ts:139](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/ingest.test.ts:139)
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD `$in` and `$nin` filter tests in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  - `$in` test: pages with `project = billing`, `support`, `internal`; query `$in: ['billing', 'support']`; expect two results
  - `$nin` test: same setup; query `$nin: ['internal']`; expect billing and support only
- **GOTCHA**: Because the current mock LLM returns the same title by default, create distinct pages by using a test-specific LLM or by updating titles directly in SQL after ingest
- **RECOMMENDED**: Use a test-specific LLM in this file that returns different page titles depending on prompt markers such as `BillingMarker`, `SupportMarker`, `InternalMarker`
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD null filter semantics test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. create one page with `metadata = { project: null }`
  2. create one page with `metadata = {}`
  3. create one page with `metadata = { project: 'billing' }`
  4. call `listPages({ filters: { project: null } })`
  5. assert the first two pages match and the third does not
- **GOTCHA**: This test locks in the chosen semantics: null means “missing or explicit null”
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD tenant-scope test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. create a tenant-aware client with `tenant: { key: 'workspaceId' }`
  2. ingest one page under tenant `a` and another under tenant `b`
  3. call `listPages({ tenant: { workspaceId: 'a' } })`
  4. assert only tenant `a` pages are returned
  5. destroy the secondary client after the test
- **PATTERN**: Mirror the tenant client setup from [tests/integration/query.test.ts:171](/Users/rwmmtzqy/Documents/pg-wiki-knowledge-base/tests/integration/query.test.ts:171)
- **GOTCHA**: Use `migrations: { run: false }` for secondary clients in the same suite
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD pagination test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. create at least three pages with distinct titles
  2. call `listPages({ limit: 2, offset: 0 })`
  3. call `listPages({ limit: 2, offset: 2 })`
  4. assert page counts and ordering are deterministic across both calls
- **IMPLEMENT**: Add a validation test for invalid pagination options
  - `limit: 0`
  - `offset: -1`
  - non-integer values if TypeScript can be bypassed in test
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

---

## TESTING STRATEGY

### Integration Tests

Continue using real-Postgres integration tests as the primary verification strategy. Extend the existing `tests/integration/query.test.ts` suite rather than introducing a second suite for the same module.

The integration tests should verify:
- base page listing shape
- metadata filter behavior for exact, `$in`, `$nin`, and `null`
- tenant isolation
- pagination semantics

### Unit Tests

No separate unit-test layer is required for this phase. If an `applyMetadataFilters()` helper becomes complex enough, unit tests would be reasonable, but the current repo standard is integration-first and the feature can be fully covered that way.

### Edge Cases

- no-tenant mode returns only pages with `tenant IS NULL`
- tenant-aware mode never leaks pages across tenants
- `filters` omitted returns all in-scope pages
- empty `$in` produces no rows without SQL errors
- empty `$nin` does not alter the result set
- `null` filter matches missing or explicit null metadata
- invalid pagination values throw a clear error
- returned metadata is always an object, never `null`

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

- [ ] `client.listPages()` no longer throws `"not implemented"`
- [ ] `listPages()` returns `PageSummary[]` with `id`, `title`, `type`, `status`, and `metadata`
- [ ] Tenant scoping uses the same JSONB containment logic as ingest and `getPage()`
- [ ] Metadata filters support exact match, `$in`, `$nin`, and `null`
- [ ] `null` filter semantics are explicitly tested and documented
- [ ] Optional pagination via `limit` and `offset` works with deterministic ordering
- [ ] Invalid pagination options throw a clear error
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run build` succeeds and `dist/query.js` exists
- [ ] Query integration tests and the full integration suite pass against real Postgres

---

## COMPLETION CHECKLIST

- [ ] `src/query.ts` updated with `listPages()` and metadata-filter helpers
- [ ] `src/client.ts` updated to delegate `listPages()`
- [ ] `tests/integration/query.test.ts` updated with full `listPages()` coverage
- [ ] Metadata filter tests pass
- [ ] Pagination tests pass
- [ ] Targeted integration run passes
- [ ] Full integration suite passes
- [ ] Build and type-check pass
- [ ] Acceptance criteria all met

---

## NOTES

- The current public API and PRD are slightly misaligned: PRD requires pagination, while the current inline `Client.listPages()` signature only exposes `filters`. This plan recommends adding optional `limit` and `offset` now so the implementation matches the PRD rather than hardcoding an incomplete interim API.
- This feature is the right place to introduce reusable page metadata filtering helpers, because `query()` will need the same filter semantics next.
- Keep the feature focused on page-level metadata filtering. Cross-entity metadata filtering across sources/claims/links belongs in the broader `query()` read path.
- Page metadata is currently not propagated from ingest. This is not a blocker for `listPages()`, but it is a notable gap in the overall PRD if metadata-aware query workflows are expected to be usable immediately from ingest outputs.

**Confidence Score**: 8.5/10 that implementation will succeed on first attempt
