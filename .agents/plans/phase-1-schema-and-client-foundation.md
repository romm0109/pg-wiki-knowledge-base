# Feature: Phase 1 — Schema & Client Foundation

The following plan should be complete, but validate documentation and codebase patterns before implementing. This is a greenfield TypeScript npm library — there are no existing patterns to mirror; follow the conventions defined here.

## Feature Description

Bootstrap the `pg-wiki-knowledge-base` npm library from zero. Define all 9 TypeORM entities (`pgwiki_` prefix), write the initial migration, implement `createClient()` that connects to Postgres, runs migrations, and returns a typed `Client` instance. Validate with an integration test against a real Postgres database.

## User Story

As a developer  
I want to call `createClient({ connectionString, llm })` once  
So that all `pgwiki_` tables and indexes are created in my Postgres database and I get back a working `Client` instance

## Problem Statement

No code exists yet. The library needs a stable Postgres schema foundation before ingest, query, or LLM pipeline work can begin.

## Solution Statement

Scaffold the npm package, define TypeORM entities for all 9 tables (with JSONB metadata, GIN indexes, full-text search columns), write one initial migration, and implement `createClient()` that runs migrations on startup and returns a `Client<TTenant>` instance.

## Feature Metadata

**Feature Type**: New Capability  
**Estimated Complexity**: Medium  
**Primary Systems Affected**: `src/entities/`, `src/client.ts`, `src/types.ts`, `src/index.ts`  
**Dependencies**: `typeorm`, `pg`, `reflect-metadata`, `typescript`, `jest`, `ts-jest`

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ BEFORE IMPLEMENTING

- `PRD.md` (lines 134–181) — Directory structure, entity list, table names, and `ClientConfig` interface shape
- `PRD.md` (lines 255–298) — `ClientConfig` TypeScript interface and tenant generic pattern
- `PRD.md` (lines 306–375) — Full public API surface: all method signatures with generics
- `PRD.md` (lines 484–497) — Definitive table name list (`pgwiki_sources`, `pgwiki_source_fragments`, etc.)

### New Files to Create

```
package.json                        # npm package config, scripts, dependencies
tsconfig.json                       # TypeScript compiler config (target: ES2020, decorators enabled)
tsconfig.build.json                 # Build-only config (excludes tests)
jest.config.ts                      # Jest config with ts-jest
src/
  index.ts                          # Public exports
  types.ts                          # Shared TypeScript interfaces and types
  llm.ts                            # LLMAdapter and EmbeddingAdapter interfaces
  client.ts                         # createClient(), Client class
  entities/
    Source.ts                       # pgwiki_sources
    SourceFragment.ts               # pgwiki_source_fragments
    WikiPage.ts                     # pgwiki_wiki_pages
    WikiPageVersion.ts              # pgwiki_wiki_page_versions
    WikiLink.ts                     # pgwiki_wiki_links
    WikiClaim.ts                    # pgwiki_wiki_claims
    ClaimEvidence.ts                # pgwiki_claim_evidence
    Job.ts                          # pgwiki_jobs — tracks each ingest/delete operation as an auditable record
    JobEvent.ts                     # pgwiki_job_events — structured log events emitted within a job (LLM calls, page actions, errors)
    index.ts                        # Re-export all entities
  migrations/
    1700000000000-InitialSchema.ts  # Single initial migration creating all tables
tests/
  integration/
    setup.ts                        # DB connection setup/teardown helpers
    client.test.ts                  # createClient integration test
```

### Relevant Documentation — READ BEFORE IMPLEMENTING

- [TypeORM Entities](https://typeorm.io/entities) — `@Entity`, `@Column`, `@PrimaryGeneratedColumn`, relationship decorators
- [TypeORM Migrations](https://typeorm.io/migrations) — `MigrationInterface`, `QueryRunner`, running migrations programmatically
- [TypeORM Data Source](https://typeorm.io/data-source) — `DataSource`, `DataSourceOptions`, `dataSource.initialize()`, `dataSource.runMigrations()`
- [TypeORM JSONB](https://typeorm.io/entities#column-types-for-postgres) — `type: 'jsonb'` column type
- [TypeORM Indices](https://typeorm.io/indices) — `@Index`, GIN index with `{ synchronize: false }` for custom index types
- [pg driver](https://node-postgres.com/) — used by TypeORM under the hood; no direct use needed

### Patterns to Follow

**Entity Naming:**
- Class name: PascalCase singular (`WikiPage`)
- Table name: `pgwiki_` prefix + snake_case plural (`pgwiki_wiki_pages`)
- Column names: snake_case (`created_at`, `source_id`)

**Primary Keys:**
```ts
@PrimaryGeneratedColumn('uuid')
id: string;
```

**Timestamps:**
```ts
@CreateDateColumn({ name: 'created_at' })
createdAt: Date;

@UpdateDateColumn({ name: 'updated_at' })
updatedAt: Date;
```

**JSONB Metadata (on every major entity):**
```ts
@Column({ type: 'jsonb', nullable: true, default: () => "'{}'" })
metadata: Record<string, unknown>;
```

**GIN Index on JSONB (must be raw SQL in migration, not decorator — TypeORM does not support GIN via @Index):**
```sql
CREATE INDEX idx_pgwiki_sources_metadata ON pgwiki_sources USING GIN (metadata);
```

**Full-Text Search Column (on wiki_pages):**
```ts
// Store as tsvector — populated via trigger or explicit update
@Column({ type: 'tsvector', nullable: true, select: false })
searchVector: any;
```

**Tenant Column (on sources and wiki_pages):**
```ts
@Column({ type: 'jsonb', nullable: true, name: 'tenant' })
tenant: Record<string, unknown> | null;
```

**TypeORM DataSource pattern:**
```ts
const dataSource = new DataSource({
  type: 'postgres',
  url: config.connectionString,
  entities: [Source, SourceFragment, WikiPage, ...],
  migrations: [InitialSchema],
  migrationsRun: false,  // we control when migrations run
  synchronize: false,    // never use synchronize in production
  logging: false,
});
await dataSource.initialize();
await dataSource.runMigrations();
```

**Tenant generic pattern:**
```ts
// TTenant = never means no tenant mode (all tenant params absent)
// TTenant = { userId: string } means tenant-required mode
export function createClient<TTenant extends Record<string, unknown> = never>(
  config: ClientConfig<TTenant>
): Client<TTenant>
```

**Conditional type for requiring tenant:**
```ts
// Makes tenant param required when TTenant is not never, absent otherwise
type WithTenant<TTenant> = [TTenant] extends [never]
  ? {}
  : { tenant: TTenant };
```

---

## IMPLEMENTATION PLAN

### Phase 1: Package Scaffold

Set up the Node.js package, TypeScript, and test runner so every subsequent file can be compiled and tested.

**Tasks:**
- Create `package.json` with all required dependencies
- Create `tsconfig.json` with decorator support
- Create `jest.config.ts` for ts-jest integration

### Phase 2: Types and Interfaces

Define shared types first so entities and client code can import them cleanly.

**Tasks:**
- `src/llm.ts` — `LLMAdapter` and `EmbeddingAdapter` interfaces
- `src/types.ts` — `ClientConfig`, `MetadataFilters`, `WithTenant`, and return type interfaces

### Phase 3: TypeORM Entities

Define all 9 entities. Each entity should be self-contained (no circular imports between entities — use string-based relation targets when needed).

**Tasks:**
- `src/entities/Source.ts`
- `src/entities/SourceFragment.ts`
- `src/entities/WikiPage.ts`
- `src/entities/WikiPageVersion.ts`
- `src/entities/WikiLink.ts`
- `src/entities/WikiClaim.ts`
- `src/entities/ClaimEvidence.ts`
- `src/entities/Job.ts`
- `src/entities/JobEvent.ts`
- `src/entities/index.ts`

### Phase 4: Initial Migration

One migration that creates all tables and all indexes (GIN, tsvector, standard B-tree FKs). This is the source of truth for schema — never use `synchronize: true`.

**Tasks:**
- `src/migrations/1700000000000-InitialSchema.ts`

### Phase 5: Client

Wire the DataSource, run migrations, return the Client instance. Stubs for `ingestSource`, `deleteSource`, `query`, `listPages`, `getPage` that throw `"not implemented"` — Phase 2 and 3 will fill them in.

**Tasks:**
- `src/client.ts`
- `src/index.ts`

### Phase 6: Integration Test

One test: call `createClient()`, assert all 9 tables exist, destroy the DataSource after.

**Tasks:**
- `tests/integration/client.test.ts`

---

## STEP-BY-STEP TASKS

### CREATE `package.json`

- **IMPLEMENT**: npm package named `pg-wiki-knowledge-base`, version `0.1.0`, `"main": "dist/index.js"`, `"types": "dist/index.d.ts"`
- **SCRIPTS**: `"build": "tsc -p tsconfig.build.json"`, `"test": "jest"`, `"test:integration": "jest --testPathPattern=integration"`
- **DEPENDENCIES**: `typeorm`, `pg`, `reflect-metadata`
- **DEV DEPENDENCIES**: `typescript`, `ts-jest`, `@types/jest`, `@types/node`, `@types/pg`, `jest`
- **VALIDATE**: `npm install` completes without errors

### CREATE `tsconfig.json`

- **IMPLEMENT**: `target: "ES2020"`, `module: "commonjs"`, `strict: true`, `experimentalDecorators: true`, `emitDecoratorMetadata: true`, `outDir: "dist"`, `rootDir: "src"`, `declaration: true`
- **GOTCHA**: `emitDecoratorMetadata: true` is required for TypeORM decorators to work — without it, column type inference fails at runtime
- **GOTCHA**: Also include `tests/` in the `include` array so tests can import from `src/`
- **VALIDATE**: `npx tsc --noEmit` passes

### CREATE `tsconfig.build.json`

- **IMPLEMENT**: Extends `./tsconfig.json`, sets `exclude: ["tests", "**/*.test.ts", "jest.config.ts"]`
- **VALIDATE**: `npm run build` produces output in `dist/`

### CREATE `jest.config.ts`

- **IMPLEMENT**: Use `ts-jest` preset, `testEnvironment: "node"`, `testMatch: ["**/tests/**/*.test.ts"]`
- **IMPLEMENT**: Set `globals: { 'ts-jest': { tsconfig: 'tsconfig.json' } }`
- **VALIDATE**: `npm test` runs without configuration errors

### CREATE `src/llm.ts`

- **IMPLEMENT**: Export `LLMAdapter` interface with `complete(prompt: string): Promise<string>` and optional `embed?(text: string): Promise<number[]>`
- **IMPLEMENT**: Export `EmbeddingAdapter` interface with `embed(text: string): Promise<number[]>`
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/types.ts`

- **IMPLEMENT**: Export `ClientConfig<TTenant>` interface matching PRD section 9, plus add `schema?: string` — the Postgres schema name, defaults to `'public'` when omitted
- **IMPLEMENT**: Export `MetadataFilters` interface: `{ [key: string]: unknown | { $in: unknown[] } | { $nin: unknown[] } | null }`
- **IMPLEMENT**: Export conditional helper `type WithTenant<TTenant> = [TTenant] extends [never] ? {} : { tenant: TTenant }`
- **IMPLEMENT**: Export return type interfaces: `IngestResult`, `DeleteResult`, `QueryResult`, `PageSummary`, `PageDetail`
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/entities/Source.ts`

- **IMPLEMENT**: `@Entity('pgwiki_sources')`, UUID PK, columns: `content: text`, `type: varchar` (enum: text/markdown/html/pdf/url/record), `tenant: jsonb nullable`, `metadata: jsonb`, `createdAt`, `updatedAt`
- **IMPLEMENT**: `@OneToMany(() => SourceFragment, f => f.source)` relation
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/entities/SourceFragment.ts`

- **IMPLEMENT**: `@Entity('pgwiki_source_fragments')`, UUID PK, columns: `text: text`, `charOffsetStart: int`, `charOffsetEnd: int`, `metadata: jsonb`
- **IMPLEMENT**: `@ManyToOne(() => Source, s => s.fragments, { onDelete: 'CASCADE' })` + `@JoinColumn({ name: 'source_id' })`
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/entities/WikiPage.ts`

- **IMPLEMENT**: `@Entity('pgwiki_wiki_pages')`, UUID PK, columns: `title: varchar`, `content: text`, `type: varchar`, `status: varchar` (enum: draft/published/stale/conflicted), `tenant: jsonb nullable`, `metadata: jsonb`, `currentVersionId: uuid nullable`, `searchVector: tsvector nullable (select: false)`, `createdAt`, `updatedAt`
- **IMPLEMENT**: `@OneToMany(() => WikiPageVersion, v => v.page)` relation
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/entities/WikiPageVersion.ts`

- **IMPLEMENT**: `@Entity('pgwiki_wiki_page_versions')`, UUID PK, columns: `content: text`, `changeSummary: varchar nullable`, `createdAt`
- **IMPLEMENT**: `@ManyToOne(() => WikiPage, p => p.versions, { onDelete: 'CASCADE' })` + `@JoinColumn({ name: 'page_id' })`
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/entities/WikiLink.ts`

- **IMPLEMENT**: `@Entity('pgwiki_wiki_links')`, UUID PK, columns: `type: varchar`, `metadata: jsonb`, `createdAt`
- **IMPLEMENT**: `@ManyToOne(() => WikiPage, { onDelete: 'CASCADE' })` for `fromPage` and `toPage` with `@JoinColumn({ name: 'from_page_id' })` / `@JoinColumn({ name: 'to_page_id' })`
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/entities/WikiClaim.ts`

- **IMPLEMENT**: `@Entity('pgwiki_wiki_claims')`, UUID PK, columns: `text: text`, `status: varchar`, `metadata: jsonb`, `createdAt`, `updatedAt`
- **IMPLEMENT**: `@ManyToOne(() => WikiPage, { onDelete: 'CASCADE' })` + `@JoinColumn({ name: 'page_id' })`
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/entities/ClaimEvidence.ts`

- **IMPLEMENT**: `@Entity('pgwiki_claim_evidence')`, UUID PK, `createdAt`
- **IMPLEMENT**: `@ManyToOne(() => WikiClaim, { onDelete: 'CASCADE' })` + `@ManyToOne(() => SourceFragment, { onDelete: 'CASCADE' })`
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/entities/Job.ts`

- **IMPLEMENT**: `@Entity('pgwiki_jobs')`, UUID PK, columns: `type: varchar`, `status: varchar` (enum: pending/running/succeeded/failed), `errorMessage: text nullable`, `tenant: jsonb nullable`, `metadata: jsonb`, `createdAt`, `updatedAt`
- **IMPLEMENT**: `@OneToMany(() => JobEvent, e => e.job)` relation
- **NOTE on failure handling**: If the main transaction fails (LLM error, DB error, etc.) it rolls back **completely** — source, fragments, and page updates are all discarded, nothing is persisted. The source is NOT saved. Only the `Job` row (written in its own separate short transaction) survives, updated to `status=failed` with `errorMessage`. This is the atomicity guarantee from the PRD: "if the LLM step fails, nothing is written."
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/entities/JobEvent.ts`

- **IMPLEMENT**: `@Entity('pgwiki_job_events')`, UUID PK, columns: `type: varchar`, `data: jsonb nullable`, `createdAt`
- **IMPLEMENT**: `@ManyToOne(() => Job, j => j.events, { onDelete: 'CASCADE' })` + `@JoinColumn({ name: 'job_id' })`
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/entities/index.ts`

- **IMPLEMENT**: Re-export all 9 entity classes
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/migrations/1700000000000-InitialSchema.ts`

- **IMPLEMENT**: `MigrationInterface` with `up(queryRunner: QueryRunner)` and `down(queryRunner: QueryRunner)`
- **IMPLEMENT** `up()`: CREATE TABLE statements for all 9 tables, then GIN indexes, then tsvector index, then B-tree FK indexes
- **GOTCHA**: Write raw SQL in `queryRunner.query(...)` — do not rely on TypeORM schema sync
- **GOTCHA**: Use `CREATE INDEX ... USING GIN` for all `metadata` JSONB columns — one per table that has metadata
- **IMPLEMENT**: GIN indexes needed: `pgwiki_sources`, `pgwiki_source_fragments`, `pgwiki_wiki_pages`, `pgwiki_wiki_claims`, `pgwiki_jobs`, `pgwiki_job_events`, `pgwiki_wiki_links`
- **IMPLEMENT**: Full-text index on `pgwiki_wiki_pages.search_vector`: `CREATE INDEX idx_pgwiki_wiki_pages_search ON pgwiki_wiki_pages USING GIN (search_vector)`
- **IMPLEMENT** `down()`: DROP TABLE statements in reverse dependency order (child tables first)
- **VALIDATE**: Migration runs cleanly against a real Postgres DB (verified via integration test below)

Full `up()` SQL order:
```sql
-- 1. pgwiki_sources
-- 2. pgwiki_source_fragments (FK -> sources)
-- 3. pgwiki_wiki_pages
-- 4. pgwiki_wiki_page_versions (FK -> wiki_pages)
-- 5. pgwiki_wiki_links (FK -> wiki_pages x2)
-- 6. pgwiki_wiki_claims (FK -> wiki_pages)
-- 7. pgwiki_claim_evidence (FK -> wiki_claims, source_fragments)
-- 8. pgwiki_jobs
-- 9. pgwiki_job_events (FK -> jobs)
-- Then: all GIN indexes
-- Then: tsvector GIN index on wiki_pages
-- Then: B-tree indexes on FK columns
```

### CREATE `src/client.ts`

- **IMPLEMENT**: `createClient<TTenant>(config: ClientConfig<TTenant>): Promise<Client<TTenant>>`
- **IMPLEMENT**: Build `DataSource` from config, call `dataSource.initialize()`, call `dataSource.runMigrations()` when `config.migrations?.run !== false`
- **IMPLEMENT**: Resolve `schema = config.schema ?? 'public'` — pass it as `schema` in `DataSourceOptions` so TypeORM scopes all queries and migrations to the correct Postgres schema
- **IMPLEMENT**: Store the resolved `schema` string on the `Client` instance (e.g. `this.schema`) so ingest and query methods (Phase 2/3) can reference it when building raw SQL (e.g. `information_schema` lookups, tsvector update triggers)
- **IMPLEMENT**: `Client<TTenant>` class with `dataSource` and `schema` properties, and stub methods that throw `new Error('not implemented')`
- **IMPLEMENT**: Stub method signatures must exactly match PRD API spec (section 10), with tenant conditional type applied
- **GOTCHA**: `createClient` must be `async` — DataSource initialization is async
- **GOTCHA**: TypeORM `DataSourceOptions.schema` sets the default Postgres search_path — when non-`'public'`, the schema must already exist in Postgres before `initialize()` is called; document this requirement in the integration test
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/index.ts`

- **IMPLEMENT**: Export `createClient`, `Client`, `ClientConfig`, `LLMAdapter`, `EmbeddingAdapter`, `MetadataFilters` and all return-type interfaces
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `tests/integration/client.test.ts`

- **IMPLEMENT**: Requires `DATABASE_URL` env var pointing at a real Postgres instance
- **IMPLEMENT**: `beforeAll` — call `createClient({ connectionString: process.env.DATABASE_URL!, llm: mockLlm })`
- **IMPLEMENT**: `afterAll` — drop all `pgwiki_` tables and call `dataSource.destroy()`
- **TEST**: Assert all 9 tables exist by querying `information_schema.tables WHERE table_schema = (resolved schema, default 'public') AND table_name LIKE 'pgwiki_%'`
- **TEST**: Assert `client.schema` equals `'public'` when no `schema` is provided in config
- **TEST**: Assert GIN indexes exist by querying `pg_indexes WHERE indexname LIKE 'idx_pgwiki_%'`
- **IMPLEMENT**: Mock LLM adapter: `{ complete: async () => '{}' }`
- **GOTCHA**: Use a test-only Postgres database — do not use a shared or production DB
- **VALIDATE**: `DATABASE_URL=postgres://localhost/pgwiki_test npm run test:integration`

---

## TESTING STRATEGY

### Integration Tests

All tests run against a real Postgres instance. No mocking of the database. This is explicitly required by the PRD quality criteria:

> "Integration tests run against a real Postgres instance (no mocks)"

**Required env var:** `DATABASE_URL=postgres://user:pass@localhost/pgwiki_test`

**Setup:** Each test suite creates its own DataSource in `beforeAll` and tears it down in `afterAll`. Use a dedicated test database.

**Coverage:** Phase 1 integration test scope:
- `createClient()` succeeds against a fresh DB
- All 9 `pgwiki_*` tables exist after migration
- GIN indexes exist on metadata columns
- `dataSource.destroy()` cleans up without error

### Edge Cases

- `createClient()` called twice on same DB — second `runMigrations()` should be a no-op (TypeORM tracks ran migrations in `typeorm_migrations` table)
- `migrations.run: false` in config — tables should NOT be created automatically
- Missing `DATABASE_URL` — test should skip gracefully with a clear message

---

## VALIDATION COMMANDS

### Level 1: Type Checking

```bash
npx tsc --noEmit
```

### Level 2: Build

```bash
npm run build
# Verify dist/ output exists
ls dist/index.js dist/index.d.ts
```

### Level 3: Integration Tests

```bash
# Start a local Postgres instance first (or use existing)
DATABASE_URL=postgres://localhost/pgwiki_test npm run test:integration
```

### Level 4: Manual Schema Check

```bash
# After running integration tests, inspect tables
psql $DATABASE_URL -c "\dt pgwiki_*"
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_pgwiki_%';"
```

---

## ACCEPTANCE CRITERIA

- [ ] `npm install` completes without errors
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run build` produces `dist/index.js` and `dist/index.d.ts`
- [ ] `createClient()` runs migrations and returns a `Client` instance
- [ ] All 9 `pgwiki_*` tables exist in Postgres after `createClient()`
- [ ] GIN indexes exist on all `metadata` JSONB columns
- [ ] Full-text GIN index exists on `pgwiki_wiki_pages.search_vector`
- [ ] Integration test passes against a real Postgres instance
- [ ] Calling `createClient()` twice on the same DB does not fail or duplicate tables
- [ ] All public exports are typed — no `any` in public API surface

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] `npx tsc --noEmit` passes after each entity file
- [ ] Migration `up()` and `down()` both complete without SQL errors
- [ ] Integration test passes end-to-end
- [ ] `npm run build` produces clean output

---

## NOTES

**Why `Job` and `JobEvent` entities are in Phase 1:**  
Every `ingestSource()` call in Phase 2 needs to write a `Job` row (tracks the operation) and `JobEvent` rows (LLM calls made, pages created/updated, errors). Creating those tables now means Phase 2 can start writing job records immediately — and if we deferred them to Phase 2 we'd need a second migration mid-ingest work. Including them in the initial schema keeps the migration count minimal and avoids retrofitting foreign keys later.

**Why `schema` defaults to `'public'` and is stored on the client:**  
Developers running multi-tenant Postgres setups often isolate workloads into named schemas. Storing the resolved schema on `Client` means every subsequent method (ingest, query, raw SQL for tsvector updates) can reference `this.schema` consistently rather than re-reading config on every call. The `'public'` default preserves zero-config behavior for the majority of users.

**Why raw SQL in migration instead of TypeORM `synchronize`:**  
TypeORM `synchronize: true` is unsafe for production and cannot create GIN indexes or tsvector columns correctly. All DDL goes through the migration file so schema changes are explicit, versioned, and auditable.

**Why `createClient` is async:**  
TypeORM `DataSource.initialize()` is async (opens the connection pool). Returning a promise from `createClient` is cleaner than exposing an uninitialized client that requires a separate `.connect()` call.

**Why stub methods throw instead of returning empty results:**  
Stubs that silently return `[]` or `null` can hide integration bugs during Phase 2/3 development. A thrown `"not implemented"` error immediately surfaces any accidental call to an unimplemented method during testing.

**Confidence Score: 8/10**  
This is a well-scoped greenfield task with clear PRD requirements. The main implementation risk is TypeORM decorator metadata emission — `emitDecoratorMetadata: true` must be set in both `tsconfig.json` and confirmed working before entity code is written. The other risk is GIN index syntax — these must be raw SQL in the migration, not TypeORM `@Index` decorators.
