# Feature: Phase 2 — Ingest Pipeline

The following plan should be complete, but validate documentation and codebase patterns before implementing. Read every referenced file before writing any code.

## Feature Description

Implement `ingestSource()` and `deleteSource()` on the `Client` class. `ingestSource()` accepts raw content, fragments it by character offsets, calls the LLM adapter to determine which wiki pages to create or update, then commits everything atomically in a single Postgres transaction. `deleteSource()` removes a source and its fragments, then re-evaluates affected pages (marking them stale or deleting them per config). Every operation is tracked via a `Job` row written outside the main transaction so it survives rollback.

## User Story

As a developer  
I want to call `client.ingestSource({ content, type, metadata })` once  
So that the content is fragmented, wiki pages are created or updated by the LLM, and I get back a typed result with the affected page IDs and actions

## Problem Statement

Phase 1 left `ingestSource()` and `deleteSource()` as stubs throwing `"not implemented"`. No content can enter the knowledge base until these are wired up with fragmentation, LLM integration, and transactional writes.

## Solution Statement

Implement `src/ingest.ts` with two exported functions (`ingestSource`, `deleteSource`) that are called from `Client`. Fragment content into overlapping character-offset chunks. Use a structured LLM prompt that returns a typed JSON payload describing pages to create/update. Wrap source + fragments + page writes in a single TypeORM `QueryRunner` transaction. Write the `Job` record in a separate short transaction before and after (so it survives rollback). Update `search_vector` via raw SQL after page writes.

## Feature Metadata

**Feature Type**: New Capability  
**Estimated Complexity**: High  
**Primary Systems Affected**: `src/ingest.ts` (new), `src/fragment.ts` (new), `src/prompts.ts` (new), `src/client.ts` (update)  
**Dependencies**: existing `typeorm`, `pg`, `reflect-metadata` — no new packages needed

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ BEFORE IMPLEMENTING

- `src/client.ts` — Full file. Contains `Client<TTenant>` class, `WithTenant<TTenant>` usage, stub method signatures, `dataSource` and `schema` properties. The ingest functions receive `this.dataSource`, `this.schema`, and the resolved `ClientConfig` at call time.
- `src/types.ts` — Full file. Contains `ClientConfig`, `WithTenant`, `IngestResult`, `DeleteResult`, `TenantConfig`. `WithTenant<TTenant>` resolves to `Record<string, never>` when `TTenant = never` (no-tenant mode) or `{ tenant: TTenant }` in tenant mode.
- `src/entities/Source.ts` — Fields: `id`, `content`, `type`, `tenant`, `metadata`, `createdAt`, `updatedAt`, `fragments`. Table: `pgwiki_sources`.
- `src/entities/SourceFragment.ts` — Fields: `id`, `text`, `charOffsetStart`, `charOffsetEnd`, `metadata`, `createdAt`, `updatedAt`, `source`. Column names: `char_offset_start`, `char_offset_end`. Table: `pgwiki_source_fragments`.
- `src/entities/WikiPage.ts` — Fields: `id`, `title`, `content`, `type`, `status` (`draft|published|stale|conflicted`), `tenant`, `metadata`, `currentVersionId`, `searchVector` (not selected by default), `createdAt`, `updatedAt`, `versions`. Table: `pgwiki_wiki_pages`.
- `src/entities/WikiPageVersion.ts` — Fields: `id`, `content`, `changeSummary`, `createdAt`, `page`. Column: `change_summary`, `page_id`. Table: `pgwiki_wiki_page_versions`.
- `src/entities/WikiLink.ts` — Fields: `id`, `type`, `metadata`, `createdAt`, `fromPage`, `toPage`. Columns: `from_page_id`, `to_page_id`. Table: `pgwiki_wiki_links`.
- `src/entities/WikiClaim.ts` — Fields: `id`, `text`, `status`, `metadata`, `createdAt`, `updatedAt`, `page`. Column: `page_id`. Table: `pgwiki_wiki_claims`.
- `src/entities/ClaimEvidence.ts` — Fields: `id`, `createdAt`, `claim`, `fragment`. Columns: `claim_id`, `fragment_id`. Table: `pgwiki_claim_evidence`.
- `src/entities/Job.ts` — Fields: `id`, `type`, `status` (`pending|running|succeeded|failed`), `errorMessage`, `tenant`, `metadata`, `createdAt`, `updatedAt`, `events`. Column: `error_message`. Table: `pgwiki_jobs`.
- `src/entities/JobEvent.ts` — Fields: `id`, `type`, `data`, `createdAt`, `job`. Column: `job_id`. Table: `pgwiki_job_events`.
- `src/entities/index.ts` — Barrel export for all 9 entities.
- `src/llm.ts` — `LLMAdapter.complete(prompt: string): Promise<string>`.
- `tests/integration/client.test.ts` — Pattern for integration tests: `beforeAll` creates client, `afterAll` drops tables and destroys dataSource, each test guards on `DATABASE_URL`.

### New Files to Create

```
src/
  fragment.ts         # fragmentContent(): splits text into overlapping char-offset chunks
  prompts.ts          # buildIngestPrompt(): returns the LLM prompt string; parseLLMResponse(): parses JSON response
  ingest.ts           # ingestSource() and deleteSource() implementations
tests/
  integration/
    ingest.test.ts    # Integration tests for ingestSource and deleteSource
```

### Files to Update

- `src/client.ts` — Replace `ingestSource` and `deleteSource` stub bodies with calls to imported functions from `src/ingest.ts`. Pass `this.dataSource`, `this.schema`, and a resolved config object.

### Relevant Documentation — READ BEFORE IMPLEMENTING

- [TypeORM QueryRunner](https://typeorm.io/query-runner) — `dataSource.createQueryRunner()`, `queryRunner.connect()`, `queryRunner.startTransaction()`, `queryRunner.commitTransaction()`, `queryRunner.rollbackTransaction()`, `queryRunner.release()`. Use QueryRunner (not EntityManager) for explicit transaction control.
- [TypeORM Repository](https://typeorm.io/working-with-repository) — `dataSource.getRepository(Entity)` for simple saves outside transactions; `queryRunner.manager.getRepository(Entity)` for saves inside a transaction.
- [TypeORM save vs insert](https://typeorm.io/repository-api#repositorysave) — `.save()` does upsert; `.insert()` is insert-only and faster. Prefer `.save()` for new entities.
- [Postgres tsvector update](https://www.postgresql.org/docs/current/textsearch-controls.html) — `to_tsvector('english', title || ' ' || content)`. Update via raw `queryRunner.query()` after page write.

### Patterns to Follow

**QueryRunner transaction pattern (mandatory — use this exactly):**
```ts
const queryRunner = dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
try {
  // all writes via queryRunner.manager.save(Entity, data)
  await queryRunner.commitTransaction();
} catch (err) {
  await queryRunner.rollbackTransaction();
  throw err;
} finally {
  await queryRunner.release();
}
```

**Job written outside the main transaction (short transaction via repository):**
```ts
// Before main tx — own short implicit transaction
const jobRepo = dataSource.getRepository(Job);
const job = jobRepo.create({ type: 'ingest', status: 'running', tenant: ..., metadata: {} });
await jobRepo.save(job);

// After main tx succeeds
job.status = 'succeeded';
await jobRepo.save(job);

// In catch after rollback
job.status = 'failed';
job.errorMessage = err instanceof Error ? err.message : String(err);
await jobRepo.save(job);
```

**Entity save inside transaction:**
```ts
const source = queryRunner.manager.create(Source, {
  content: input.content,
  type: input.type,
  tenant: tenant ?? null,
  metadata: input.metadata ?? {},
});
await queryRunner.manager.save(Source, source);
```

**Raw SQL inside transaction (tsvector update):**
```ts
await queryRunner.query(
  `UPDATE pgwiki_wiki_pages SET search_vector = to_tsvector('english', $1 || ' ' || $2) WHERE id = $3`,
  [page.title, page.content, page.id]
);
```

**Tenant resolution:**
```ts
// 'tenant' key comes from ClientConfig<TTenant>.tenant.key
// The tenant value comes from the method argument (when TTenant != never)
// When TTenant = never, no tenant key exists on the arg — tenant is null
const tenantValue = config.tenant && 'tenant' in source
  ? (source as { tenant: TTenant }).tenant
  : null;
```

**JobEvent emission pattern:**
```ts
await queryRunner.manager.save(JobEvent, {
  type: 'llm_call',
  data: { promptLength: prompt.length, responseLength: response.length },
  job,
});
```

**Fragment naming — field vs column:**
- TypeScript field: `charOffsetStart` / `charOffsetEnd`
- DB column: `char_offset_start` / `char_offset_end`
- Use TS field names when constructing entity objects.

---

## IMPLEMENTATION PLAN

### Phase 1: Fragmentation Utility

Pure function, no DB, no LLM. Split `content` into overlapping text chunks with character offsets.

### Phase 2: LLM Prompt + Response Parser

Build the prompt string and parse the LLM JSON response. Keep all prompt logic isolated here so it can be iterated independently.

### Phase 3: ingestSource Implementation

Wire fragmentation → LLM call → transactional DB writes. Handle tenant resolution, Job lifecycle, tsvector update, ClaimEvidence linking.

### Phase 4: deleteSource Implementation

Identify affected pages, delete source (cascade handles fragments/evidence), re-evaluate orphaned pages per `deleteOrphanPages` config.

### Phase 5: Client Wiring

Replace stubs in `Client.ingestSource` and `Client.deleteSource` with calls to the new functions.

### Phase 6: Integration Tests

End-to-end tests against real Postgres verifying full ingest and delete flows.

---

## STEP-BY-STEP TASKS

### CREATE `src/fragment.ts`

- **IMPLEMENT**: Export `interface Fragment { text: string; charOffsetStart: number; charOffsetEnd: number }`
- **IMPLEMENT**: Export `function fragmentContent(content: string, chunkSize = 1000, chunkOverlap = 200): Fragment[]`
  - If `content.length <= chunkSize`, return a single fragment covering the whole string
  - Otherwise slide a window: start at 0, advance by `chunkSize - chunkOverlap` each step
  - Each fragment: `text = content.slice(start, end)`, `charOffsetStart = start`, `charOffsetEnd = end`
  - Last fragment: extend `end` to `content.length` (no truncation)
  - Minimum chunk advance of 1 to prevent infinite loops when `chunkOverlap >= chunkSize`
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/prompts.ts`

- **IMPLEMENT**: Export interface `LLMClaimAction { text: string; status: string }`
- **IMPLEMENT**: Export interface `LLMLinkAction { toPageTitle: string; type: string }`
- **IMPLEMENT**: Export interface `LLMPageAction { title: string; type: string; content: string; changeSummary?: string; claims?: LLMClaimAction[]; links?: LLMLinkAction[] }`
- **IMPLEMENT**: Export interface `LLMIngestResponse { pages: LLMPageAction[] }`
- **IMPLEMENT**: Export `function buildIngestPrompt(params: { fragments: string[]; existingPageTitles: string[]; sourceType: string }): string`
  - Prompt instructs the LLM to return **only** a JSON object (no markdown fences, no prose)
  - JSON shape must match `LLMIngestResponse`
  - Prompt includes the fragment texts, existing page titles (for deciding create vs update), and source type
  - Instruct: each page must have `title`, `type` (e.g. "concept", "procedure", "reference"), `content` (full markdown page body), optional `changeSummary`, optional `claims` array, optional `links` array
  - Instruct: claims should be atomic factual assertions extractable from the content; `status` should be `"verified"`
  - Instruct: if content is not meaningful enough to create a page, return `{ "pages": [] }`
- **IMPLEMENT**: Export `function parseLLMResponse(raw: string): LLMIngestResponse`
  - Parse `JSON.parse(raw)` inside try/catch
  - On parse failure, throw `new Error(\`LLM returned invalid JSON: \${raw.slice(0, 200)}\`)`
  - Validate that result has a `pages` array; if not, throw `new Error('LLM response missing pages array')`
  - Return the typed object
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/ingest.ts`

- **IMPLEMENT**: Import `DataSource` from `'typeorm'`; import all entity classes from `'./entities'`; import `fragmentContent` from `'./fragment'`; import `buildIngestPrompt`, `parseLLMResponse`, `LLMIngestResponse`, `LLMPageAction` from `'./prompts'`; import `ClientConfig`, `IngestResult`, `DeleteResult`, `WithTenant` from `'./types'`
- **IMPLEMENT**: Export `interface IngestContext<TTenant extends Record<string, unknown> = never> { dataSource: DataSource; schema: string; config: ClientConfig<TTenant> }`
- **IMPLEMENT**: Export `async function ingestSource<TTenant extends Record<string, unknown> = never>(ctx: IngestContext<TTenant>, input: { content: string; type: 'text' | 'markdown' | 'html' | 'pdf' | 'url' | 'record'; metadata?: Record<string, unknown> } & WithTenant<TTenant>): Promise<IngestResult>`

  **Inside `ingestSource`:**

  1. Resolve tenant value:
     ```ts
     const tenantValue: Record<string, unknown> | null =
       ctx.config.tenant != null && 'tenant' in input
         ? (input as { tenant: TTenant }).tenant as Record<string, unknown>
         : null;
     ```

  2. Create Job row (short transaction via `dataSource.getRepository(Job).save(...)`):
     ```ts
     const jobRepo = ctx.dataSource.getRepository(Job);
     const job = jobRepo.create({ type: 'ingest', status: 'running', tenant: tenantValue, metadata: {} });
     await jobRepo.save(job);
     ```

  3. Create QueryRunner and start main transaction.

  4. Inside transaction:
     a. Save `Source` entity via `queryRunner.manager.save(Source, { content, type, tenant: tenantValue, metadata: input.metadata ?? {} })`
     b. Fragment content: `const chunks = fragmentContent(input.content)`
     c. Save all `SourceFragment` entities via `queryRunner.manager.save(SourceFragment, chunks.map(c => ({ text: c.text, charOffsetStart: c.charOffsetStart, charOffsetEnd: c.charOffsetEnd, metadata: {}, source })))`
     d. Fetch existing wiki page titles (scoped by tenant if present):
        ```ts
        const pageQuery = queryRunner.manager.createQueryBuilder(WikiPage, 'p')
          .select(['p.id', 'p.title', 'p.content', 'p.status'])
        if (tenantValue !== null) {
          pageQuery.where('p.tenant @> :t::jsonb', { t: JSON.stringify(tenantValue) });
        }
        const existingPages = await pageQuery.getMany();
        ```
     e. Build and call LLM:
        ```ts
        const prompt = buildIngestPrompt({
          fragments: fragments.map(f => f.text),
          existingPageTitles: existingPages.map(p => p.title),
          sourceType: input.type,
        });
        const raw = await ctx.config.llm.complete(prompt);
        ```
     f. Emit JobEvent for LLM call: `{ type: 'llm_call', data: { promptLength: prompt.length, responseLength: raw.length }, job }`
     g. Parse response: `const llmResponse = parseLLMResponse(raw)` — if this throws, the catch block will roll back
     h. For each `pageAction` in `llmResponse.pages`:
        - Look up existing page by `title` (case-insensitive) among `existingPages`
        - **If creating new page**: save `WikiPage { title, content, type, status: 'published', tenant: tenantValue, metadata: {} }`; save initial `WikiPageVersion { content: pageAction.content, changeSummary: 'Initial version', page }`; set `page.currentVersionId = version.id`; save page again
        - **If updating existing page**: save new `WikiPageVersion { content: existingPage.content, changeSummary: existingPage.content !== pageAction.content ? (pageAction.changeSummary ?? 'Updated') : 'No change', page: existingPage }`; update `existingPage.content = pageAction.content`; `existingPage.currentVersionId = version.id`; save page
        - Save `WikiClaim` rows for each claim in `pageAction.claims ?? []`
        - Save `ClaimEvidence` linking each claim to the first fragment (MVP: link all claims to all fragments from this source — Phase 3 can refine to semantic matching)
        - Emit JobEvent `{ type: 'page_action', data: { pageId: page.id, action: isNew ? 'created' : 'updated' }, job }`
     i. Save `WikiLink` rows for `pageAction.links`: look up `toPage` by title, create `WikiLink { type: link.type, fromPage: page, toPage, metadata: {} }` — skip links whose target page title was not found
     j. Update `search_vector` for each affected page:
        ```ts
        await queryRunner.query(
          `UPDATE pgwiki_wiki_pages SET search_vector = to_tsvector('english', $1 || ' ' || $2) WHERE id = $3`,
          [page.title, page.content, page.id]
        );
        ```

  5. Commit transaction.
  6. Update job: `job.status = 'succeeded'; await jobRepo.save(job)`
  7. Return `{ sourceId: source.id, pages: [...] }` where pages are `{ id, title, action: 'created' | 'updated' }`

  **In catch:**
  - Rollback transaction
  - Update job: `job.status = 'failed'; job.errorMessage = err instanceof Error ? err.message : String(err); await jobRepo.save(job)`
  - Re-throw error (so caller sees it)

  **In finally:** `await queryRunner.release()`

- **GOTCHA**: `queryRunner.manager.save()` accepts the entity class as the first argument and the plain object (or partial entity) as the second. Do NOT call `new Source()` — pass a plain object and let TypeORM hydrate it.
- **GOTCHA**: The `WithTenant<TTenant>` type resolves to `Record<string, never>` when `TTenant = never`. TypeScript will not allow accessing `.tenant` on it directly. Use `'tenant' in input` guard to narrow the type before accessing.
- **GOTCHA**: `parseLLMResponse` can throw. This throw will be caught by the QueryRunner catch block, causing rollback. This is the desired behavior per PRD: "if the LLM step fails, nothing is written."
- **GOTCHA**: TypeORM `save()` inside a transaction requires using `queryRunner.manager`, not `dataSource.getRepository()`. The latter opens its own connection and is NOT part of the transaction.
- **VALIDATE**: `npx tsc --noEmit`

### IMPLEMENT `deleteSource` in `src/ingest.ts`

- **IMPLEMENT**: Export `async function deleteSource<TTenant extends Record<string, unknown> = never>(ctx: IngestContext<TTenant>, id: string, opts: WithTenant<TTenant>): Promise<DeleteResult>`

  **Inside `deleteSource`:**

  1. Resolve tenant value (same pattern as `ingestSource`).
  2. Create Job row: `{ type: 'delete', status: 'running', tenant: tenantValue, metadata: { sourceId: id } }`
  3. Create QueryRunner and start transaction.
  4. Inside transaction:
     a. Find all wiki pages that had claims evidenced by fragments of this source:
        ```ts
        const affectedPages = await queryRunner.manager
          .createQueryBuilder(WikiPage, 'p')
          .innerJoin(WikiClaim, 'c', 'c.page_id = p.id')
          .innerJoin(ClaimEvidence, 'ce', 'ce.claim_id = c.id')
          .innerJoin(SourceFragment, 'sf', 'sf.id = ce.fragment_id')
          .where('sf.source_id = :sourceId', { sourceId: id })
          .select(['p.id', 'p.title', 'p.status'])
          .distinct(true)
          .getMany();
        ```
     b. Delete the source: `await queryRunner.manager.delete(Source, { id })` — cascades to `SourceFragment`, `ClaimEvidence` (via fragments)
     c. For each affected page: check if it still has any remaining `ClaimEvidence` rows:
        ```ts
        const remainingEvidence = await queryRunner.manager
          .createQueryBuilder(ClaimEvidence, 'ce')
          .innerJoin(WikiClaim, 'c', 'c.id = ce.claim_id')
          .where('c.page_id = :pageId', { pageId: page.id })
          .getCount();
        ```
     d. If `remainingEvidence === 0`:
        - If `ctx.config.deleteOrphanPages === 'delete'`: `await queryRunner.manager.delete(WikiPage, { id: page.id })`; action = `'deleted'`
        - Otherwise (default `'stale'`): `await queryRunner.manager.update(WikiPage, { id: page.id }, { status: 'stale' })`; action = `'updated'`
     e. Emit JobEvent `{ type: 'page_action', data: { pageId: page.id, action }, job }`
  5. Commit transaction.
  6. Update job to `succeeded`.
  7. Return `{ sourceId: id, pages: [...] }`

  **In catch:** rollback, update job to `failed`, re-throw.
  **In finally:** release queryRunner.

- **GOTCHA**: `queryRunner.manager.delete(Source, { id })` will trigger the CASCADE defined in the migration. The `SourceFragment` rows (and via them, the `ClaimEvidence` rows) will be deleted by Postgres — no need to delete them manually.
- **GOTCHA**: `ClaimEvidence` rows linked to claims of OTHER sources on the same page are NOT deleted — only those linked to this source's fragments (handled by the cascade). The remaining evidence count check accounts for this.
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `src/client.ts`

- **ADD** imports at top: `import { ingestSource, deleteSource, IngestContext } from './ingest';`
- **UPDATE** `Client<TTenant>` class: add a private field `private readonly _config: ClientConfig<TTenant>` and update the constructor to accept and store it: `constructor(dataSource: DataSource, schema: string, config: ClientConfig<TTenant>)`
- **UPDATE** `createClient`: pass `config` to `new Client(dataSource, schema, config)`
- **UPDATE** `ingestSource` method body: replace `throw new Error('not implemented')` with:
  ```ts
  const ctx: IngestContext<TTenant> = { dataSource: this.dataSource, schema: this.schema, config: this._config };
  return ingestSource(ctx, source);
  ```
- **UPDATE** `deleteSource` method body: replace stub with:
  ```ts
  const ctx: IngestContext<TTenant> = { dataSource: this.dataSource, schema: this.schema, config: this._config };
  return deleteSource(ctx, id, opts);
  ```
- **GOTCHA**: The `ClientConfig` type is generic — store it as `ClientConfig<TTenant>` on the client to preserve the type parameter. This is needed so `IngestContext<TTenant>` is correctly typed.
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `tests/integration/ingest.test.ts`

- **IMPLEMENT**: Import `createClient`, `Client` from `'../../src/index'`; import `LLMAdapter` from `'../../src/llm'`
- **IMPLEMENT**: Guard on `DATABASE_URL` — skip all tests with `console.warn` if not set (same pattern as `client.test.ts`)
- **IMPLEMENT**: `beforeAll` — `createClient({ connectionString: DATABASE_URL!, llm: mockLlm })`
- **IMPLEMENT**: `afterAll` — drop all `pgwiki_*` tables plus `typeorm_migrations`, destroy dataSource (same pattern as `client.test.ts`)

- **TEST: `ingestSource creates source, fragments, wiki page, and job`**
  ```ts
  const result = await client.ingestSource({
    content: 'TypeScript is a typed superset of JavaScript. It adds static types to JS.',
    type: 'text',
    metadata: { source: 'test' },
  });
  ```
  - Assert `result.sourceId` is a valid UUID string
  - Assert `result.pages.length >= 1`
  - Assert each page has `id`, `title`, `action` of `'created'`
  - Query `SELECT * FROM pgwiki_sources WHERE id = $1` — assert row exists with correct `content` and `type`
  - Query `SELECT * FROM pgwiki_source_fragments WHERE source_id = $1` — assert at least 1 fragment
  - Query `SELECT * FROM pgwiki_wiki_pages WHERE id = $1` for first page id — assert `status = 'published'`
  - Query `SELECT * FROM pgwiki_wiki_page_versions WHERE page_id = $1` — assert at least 1 version
  - Query `SELECT * FROM pgwiki_jobs WHERE type = 'ingest' AND status = 'succeeded'` — assert at least 1 job

- **TEST: `ingestSource updates existing page on second ingest`**
  - Call `ingestSource` twice with different content that should affect the same page (use titles that the mock LLM will return consistently)
  - After second call: query `pgwiki_wiki_page_versions WHERE page_id = ?` — assert 2 version rows
  - Assert second result has `action: 'updated'` for the overlapping page

- **TEST: `ingestSource rolls back on LLM failure`**
  - Create a failing mock LLM: `{ complete: async () => { throw new Error('LLM down') } }`
  - Create a second client with the failing LLM
  - Call `ingestSource` and expect it to throw
  - Query `pgwiki_sources` — assert NO new source row was persisted (rollback succeeded)
  - Query `pgwiki_jobs WHERE type = 'ingest' AND status = 'failed'` — assert at least 1 failed job (job survived rollback)

- **TEST: `deleteSource removes source and marks orphaned pages stale`**
  - First ingest a source via `ingestSource`
  - Then call `deleteSource(result.sourceId, {})`
  - Assert `result.pages` has entries with `action: 'updated'` or `'deleted'`
  - Query `pgwiki_sources WHERE id = ?` — assert 0 rows
  - Query `pgwiki_source_fragments WHERE source_id = ?` — assert 0 rows (cascade)
  - Query `pgwiki_wiki_pages WHERE id = ?` for each affected page — assert `status = 'stale'` (default config)
  - Query `pgwiki_jobs WHERE type = 'delete' AND status = 'succeeded'` — assert at least 1 job

- **IMPLEMENT**: Mock LLM for tests:
  ```ts
  const mockLlm: LLMAdapter = {
    async complete(): Promise<string> {
      return JSON.stringify({
        pages: [{
          title: 'TypeScript',
          type: 'concept',
          content: 'TypeScript is a typed superset of JavaScript.',
          changeSummary: 'Initial version',
          claims: [{ text: 'TypeScript adds static types to JavaScript.', status: 'verified' }],
          links: [],
        }],
      });
    },
  };
  ```
  - This deterministic mock ensures consistent page titles across ingest calls, enabling the "second ingest updates" test.

- **GOTCHA**: Each `deleteSource` test should use a freshly ingested source (stored in a `let` variable in `beforeEach` or within the test itself) to avoid cross-test contamination.
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration`

---

## TESTING STRATEGY

### Integration Tests (only — no unit tests needed for this phase)

All tests run against a real Postgres instance per PRD quality criteria. The mock LLM is deterministic and returns a fixed JSON payload — this lets us assert exact page titles and counts without flakiness from real LLM responses.

**Required env var:** `DATABASE_URL=postgresql:///pgwiki_test` (Unix socket, no password, Homebrew Postgres 16)

**Setup:** `beforeAll` creates the client (which runs migrations). `afterAll` drops all `pgwiki_*` tables and `typeorm_migrations`, then destroys the DataSource.

**Rollback test:** uses a separate `Client` instance with a failing mock LLM — created and destroyed within the test itself.

### Edge Cases to Test

- Empty content (length 0) — `fragmentContent` should return one empty fragment
- Content shorter than `chunkSize` — single fragment
- LLM returns `{ "pages": [] }` — no pages created, source and fragments are still persisted, job succeeds
- LLM returns invalid JSON — rollback, job fails, no source persisted
- `deleteSource` called on non-existent ID — should propagate the TypeORM `EntityNotFoundError` or equivalent (document expected behavior in test)

---

## VALIDATION COMMANDS

### Level 1: Type Checking

```bash
npx tsc --noEmit
```

### Level 2: Build

```bash
npm run build
ls dist/ingest.js dist/fragment.js dist/prompts.js
```

### Level 3: Integration Tests

```bash
DATABASE_URL=postgresql:///pgwiki_test npm run test:integration
```

### Level 4: Manual Schema Check (after tests run)

```bash
# Re-run integration tests with --verbose for full output
DATABASE_URL=postgresql:///pgwiki_test npx jest --testPathPattern=integration --verbose
```

---

## ACCEPTANCE CRITERIA

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run build` produces `dist/ingest.js`, `dist/fragment.js`, `dist/prompts.js`
- [ ] `ingestSource()` saves source, fragments, wiki pages, versions, claims, evidence, and job in a single transaction
- [ ] `ingestSource()` rolls back completely (source not persisted) when LLM throws; Job row persists with `status='failed'`
- [ ] `ingestSource()` called twice with same page title creates a second `WikiPageVersion` row
- [ ] `search_vector` column is updated after each page write
- [ ] `deleteSource()` removes source and fragments via cascade
- [ ] `deleteSource()` marks orphaned pages as `stale` by default
- [ ] All integration tests pass against a real Postgres instance

---

## COMPLETION CHECKLIST

- [ ] `src/fragment.ts` created and type-checks
- [ ] `src/prompts.ts` created and type-checks
- [ ] `src/ingest.ts` created and type-checks
- [ ] `src/client.ts` updated — stubs replaced, `_config` stored and passed
- [ ] `tests/integration/ingest.test.ts` created with all 4 tests
- [ ] `npx tsc --noEmit` passes after each file
- [ ] Integration test suite passes end-to-end

---

## NOTES

**Why `ingestSource` and `deleteSource` live in `src/ingest.ts` not `src/client.ts`:**  
Keeping the Client class thin (only wires DataSource + config to ingest functions) means the ingest logic is testable without instantiating a full Client. `IngestContext` is the minimal dependency surface.

**Why the Job is written outside the main transaction:**  
Per PRD atomicity guarantee: if the LLM call fails, the source and all page writes roll back — but we still need an auditable record that the operation was attempted and failed. Writing the Job in its own short transaction (via `getRepository`, not QueryRunner) ensures it survives the rollback.

**Why `parseLLMResponse` throws on bad JSON:**  
A throw inside the QueryRunner `try` block triggers `rollbackTransaction()`. This is the cleanest way to enforce "bad LLM output = nothing persisted." No special error type needed — the caller just sees the error message.

**Why claims are linked to ALL fragments (MVP simplification):**  
Semantically, each claim should be linked only to the fragments that support it. That requires embedding-based similarity or a second LLM call. For Phase 2 MVP, all claims are linked to all fragments of the ingested source. Phase 3 (query layer) can refine this when it needs precise evidence retrieval.

**Why the LLM prompt asks for `type` per page:**  
`WikiPage.type` is a free-form `varchar` in the schema. Letting the LLM classify page type ("concept", "procedure", "reference", "entity", etc.) keeps the schema open while enabling downstream filtering by metadata and type in Phase 3.

**deleteSource and re-synthesis:**  
When a source is deleted and a page still has some remaining evidence, we leave the page content unchanged (just not deleting/staling it). Full re-synthesis of page content from remaining evidence requires the query layer (Phase 3). Marking it as needing re-synthesis is out of scope for Phase 2.

**Confidence Score: 8/10**  
The implementation is well-scoped with clear transaction boundaries. Main risk: LLM prompt quality — the mock LLM in tests bypasses this entirely, but real-world usage depends on the caller providing a capable LLM adapter. Second risk: the `WithTenant<TTenant>` conditional type narrowing in `ingestSource` requires a `'tenant' in input` guard to satisfy TypeScript — this is a subtle TS pattern that the execution agent must get right.
