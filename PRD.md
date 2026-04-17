# Product Requirements Document

## Postgres Wiki Knowledge Base

**Status:** Draft v1  
**Date:** 2026-04-17

---

## 1. Executive Summary

Postgres Wiki Knowledge Base is a TypeScript npm library that gives developers a persistent, auditable, incrementally-maintained knowledge layer for LLM applications. Instead of re-running retrieval pipelines on every query, the library ingests raw sources, compiles them into canonical wiki pages using an LLM, and serves answers from that maintained knowledge layer.

The core abstraction is a wiki — not a vector store. Every piece of knowledge is synthesized, versioned, linked, and traceable back to source evidence. The library is Postgres-native, uses TypeORM for schema management, and is LLM-provider-agnostic.

**MVP goal:** Ship a minimal TypeScript npm package that a developer can drop into any Node.js project, point at a Postgres database, and immediately start ingesting sources and querying a self-maintaining knowledge base.

---

## 2. Mission

Enable developers to build LLM applications on top of a persistent, auditable knowledge base that behaves more like a maintained internal wiki than a retrieval stack.

### Core Principles

1. **Compiled knowledge over repeated retrieval** — synthesize understanding once, query it many times.
2. **Provenance by default** — every answer traces back to source evidence.
3. **Version everything** — pages, claims, and ingestion runs are append-only or versioned.
4. **Wiki-first, evidence-second, source-last** — query answering prefers canonical pages, then fragments, then raw sources.
5. **Postgres as the source of truth** — no external services required for the core data model.

---

## 3. Target Users

### Primary Users

**Software engineers building LLM-powered products**
- Comfortable with TypeScript and Node.js
- Familiar with Postgres
- Frustrated by inconsistent RAG results or brittle retrieval pipelines
- Want a library they can `npm install` and integrate in an afternoon

**AI platform teams building internal knowledge systems**
- Need auditable, traceable knowledge
- Operating across multiple tenants or workspaces
- Want metadata-aware filtering without building it themselves

### Key Pain Points

- RAG systems re-discover the same information on every query
- Inconsistent answers depending on what gets retrieved
- No natural accumulation of structured understanding over time
- Provenance and contradiction handling require significant custom work
- Too many components to stitch together (vector store, chunker, prompt logic)

---

## 4. MVP Scope

### Core Functionality

- ✅ TypeScript npm library
- ✅ Postgres schema setup and migrations via TypeORM (auto-run on `createClient`)
- ✅ Raw source ingestion with metadata (text, markdown, HTML, PDF text, URLs, records)
- ✅ Source fragmentation into passages for citation mapping
- ✅ LLM-powered wiki page creation and updates at ingest time (atomic — if LLM step fails, source is not saved)
- ✅ Typed page-to-page link management
- ✅ Claim extraction and evidence tracking
- ✅ Wiki page versioning (full snapshot per change)
- ✅ `query()` with wiki-first answering and optional LLM synthesis mode
- ✅ Metadata-aware filtering across sources, pages, claims, and links
- ✅ Source deletion with cascading page updates

### Technical

- ✅ TypeORM for schema and migrations
- ✅ LLM provider-agnostic interface (developer supplies the LLM adapter)
- ✅ JSONB metadata on all major entities with GIN indexing
- ✅ Full-text search on wiki pages
- ✅ Optional embedding support (pluggable)
- ✅ TypeScript generics for developer-defined tenant shape
- ✅ Tenant isolation enforced at ingest time (LLM only sees pages within same tenant) and query time
- ✅ No-tenant mode: single shared wiki when no tenant is configured

### Out of Scope for MVP

- ❌ Built-in UI or wiki editor
- ❌ Complex permissioning beyond tenant/application metadata scoping
- ❌ Real-time collaborative updates
- ❌ Background reconciliation jobs (contradiction detection, stale page sweeps)
- ❌ Internet-scale indexing
- ❌ Built-in LLM provider implementations (Anthropic, OpenAI, etc.)
- ❌ Graph analytics suite
- ❌ Autonomous write access to production systems

---

## 5. User Stories

**As a developer**, I want to call `createClient()` once and have all tables and indexes created automatically, so that I don't need to manage database migrations manually.

> Example: `const client = createClient({ connectionString: process.env.DATABASE_URL, llm: myAdapter })`

**As a developer**, I want to call `ingestSource()` with raw text and metadata, so that the library handles fragmentation and wiki page compilation without me writing any pipeline logic.

> Example: Ingesting a Slack thread with `{ content, metadata: { workspaceId, channelId } }` and receiving back which pages were created or updated.

**As a developer**, I want `ingestSource()` to be atomic — if the LLM step fails, nothing is written — so that I never end up with partial or corrupt state.

**As a developer**, I want to call `query()` with a natural language question and metadata filters, so that I get a wiki-grounded answer scoped to the relevant tenant or project.

> Example: `client.query("What is our refund policy?", { tenant: { userId: "acme" }, filters: { project: "billing" } })`

**As a developer**, I want `query()` to support a `synthesize` mode where the library calls my LLM adapter to generate a natural language answer from matched pages, so that I can build a full Q&A experience without extra orchestration.

**As a developer**, I want to call `getPage()` to retrieve a wiki page with its full version history, claims, and source evidence, so that I can display provenance in my application.

**As a developer**, I want to call `deleteSource()` and have the library automatically update or remove any wiki pages that depended on that source, so that the knowledge base stays consistent.

**As a developer**, I want to filter `listPages()` and `query()` by custom metadata fields, so that I can build multi-tenant applications without managing separate databases.

**As a developer building a multi-user app**, I want to define my own tenant shape (e.g. `{ userId: string }`) as a TypeScript generic so that the compiler prevents me from accidentally querying or ingesting without a tenant scope.

> Example: `createClient<{ userId: string }>({ ... })` — every subsequent call to `ingestSource`, `query`, `listPages`, and `getPage` requires `{ userId: "..." }` or TypeScript raises an error.

**As a developer**, I want tenant isolation to be enforced at ingest time — not just query time — so that wiki pages from different users can never be linked together or influence each other's knowledge graph.

---

## 6. Core Architecture & Patterns

### High-Level Architecture

```
Developer App
     │
     ▼
createClient(config)          ← TypeORM migrations run here
     │
     ├── ingestSource()        ← write path
     │     ├── store raw source
     │     ├── fragment content
     │     ├── run LLM update workflow (atomic)
     │     └── publish new page versions
     │
     ├── deleteSource()        ← write path
     │     ├── remove source + fragments
     │     └── re-evaluate affected pages
     │
     ├── query()               ← read path
     │     ├── match wiki pages (full-text / semantic)
     │     ├── fetch evidence fragments
     │     └── optionally synthesize answer via LLM adapter
     │
     ├── listPages()           ← read path
     └── getPage()             ← read path
```

### Directory Structure

```
src/
  client.ts            # createClient, Client class
  ingest.ts            # ingestSource, deleteSource logic
  query.ts             # query, listPages, getPage logic
  llm.ts               # LLMAdapter interface
  entities/            # TypeORM entities
    Source.ts
    SourceFragment.ts
    WikiPage.ts
    WikiPageVersion.ts
    WikiLink.ts
    WikiClaim.ts
    ClaimEvidence.ts
    Job.ts
    JobEvent.ts
  migrations/          # TypeORM migrations
  types.ts             # shared TypeScript types
  index.ts             # public exports
```

### Key Design Patterns

- **Atomic ingest transactions** — source storage, fragmentation, and LLM page update run in a single Postgres transaction. If any step fails, the transaction rolls back and nothing is persisted.
- **LLM adapter interface** — the library defines a `LLMAdapter` interface; the developer provides an implementation. No vendor lock-in.
- **Metadata as JSONB** — all major entities carry a `metadata: JSONB` column. Common fields can be indexed with generated columns. Filtering is composable.
- **Append-only versioning** — wiki page changes create new `WikiPageVersion` rows. The `WikiPage` row holds a pointer to the current version.
- **Wiki-first query resolution** — `query()` always checks compiled pages first, then evidence fragments, then raw sources as fallback.
- **Tenant isolation** — when a tenant generic is provided, all reads and writes are scoped to that tenant. Cross-tenant page links are impossible. Contradictions are only detected within a tenant. When no tenant is configured, the client operates in single shared wiki mode.

---

## 7. Features / Tools

### `createClient(config)`
- Accepts Postgres connection string, LLM adapter, and optional settings
- Runs TypeORM migrations on startup
- Returns a `Client` instance with all methods bound

### `ingestSource(source, opts?)`
- Accepts raw content, source type, and metadata
- Runs in a transaction: save source → fragment → determine affected pages → LLM update → publish version
- Returns `{ sourceId, pages: [{ id, title, action }] }`
- If LLM update fails, the entire transaction rolls back

### `deleteSource(id)`
- Removes source and all fragments
- Re-evaluates all wiki pages that cited this source
- Pages with no remaining evidence are marked `stale` or deleted based on config
- Returns `{ sourceId, pages: [{ id, title, action }] }`

### `query(text, filters?, opts?)`
- Matches wiki pages by full-text search (and optionally by embedding similarity)
- Returns matched pages and their supporting evidence fragments
- When `opts.mode === "synthesize"`, calls the LLM adapter to generate a natural language `answer`
- Supports metadata filters (exact match, inclusion, range, null checks)
- Returns `{ answer?, pages: [...], evidence: [...] }`

### `listPages(filters?)`
- Returns a list of wiki pages with title, type, status, and metadata
- Supports metadata filters and pagination

### `getPage(id)`
- Returns the full page: content, version history, claims, and evidence fragments

---

## 8. Technology Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Distribution | npm package |
| Database | PostgreSQL (≥ 14) |
| ORM / Migrations | TypeORM |
| Metadata storage | JSONB with GIN indexes |
| Full-text search | Postgres `tsvector` / `to_tsquery` |
| LLM integration | Provider-agnostic adapter interface |
| Optional embeddings | Pluggable via `EmbeddingAdapter` interface |

### LLM Adapter Interface

```ts
interface LLMAdapter {
  complete(prompt: string): Promise<string>
  embed?(text: string): Promise<number[]>  // optional, for semantic search
}
```

Developers supply their own implementation (Anthropic SDK, OpenAI SDK, LangChain, etc.).

---

## 9. Security & Configuration

### Configuration

```ts
interface ClientConfig<TTenant extends Record<string, unknown> = never> {
  connectionString: string          // Postgres connection string
  llm: LLMAdapter                   // developer-supplied LLM adapter
  tenant?: TenantConfig<TTenant>    // omit for single shared wiki mode
  conflictResolution?: "flag" | "auto-resolve"  // default: "flag"
  deleteOrphanPages?: "stale" | "delete"        // default: "stale"
  embeddings?: EmbeddingAdapter     // optional for semantic search
  migrations?: {
    run?: boolean                   // default: true
    tableName?: string              // default: "typeorm_migrations"
  }
}

// TTenant is the developer-defined shape, e.g. { userId: string }
// When provided, all client methods require a matching tenant value
// When omitted (TTenant = never), all methods operate on a single shared wiki

// Example: tenant-aware client
const client = createClient<{ userId: string }>({
  connectionString: "...",
  llm: myAdapter,
  tenant: { key: "userId" }
})

// Every call now requires tenant value — TypeScript enforces this
client.ingestSource({ content, tenant: { userId: "123" }, metadata: { ... } })
client.query("question", { tenant: { userId: "123" } })

// TypeScript error if tenant is missing on any call
client.query("question")  // TS error: tenant is required
// Runtime error too, as a safety net
```

### Security Scope

- ✅ Metadata-based tenant scoping (application responsibility to pass correct filters)
- ✅ Parameterized queries via TypeORM (SQL injection prevention)
- ❌ Row-level security (out of scope for MVP — application must filter by metadata)
- ❌ Built-in auth or API key management

---

## 10. API Specification

### Public Exports

```ts
export function createClient<TTenant extends Record<string, unknown> = never>(
  config: ClientConfig<TTenant>
): Client<TTenant>

// When TTenant is provided, all methods require { tenant: TTenant }
// When TTenant is never (no tenant configured), tenant param is absent

interface Client<TTenant extends Record<string, unknown> = never> {
  ingestSource(
    source: {
      content: string
      type: "text" | "markdown" | "html" | "pdf" | "url" | "record"
      tenant: TTenant                    // required when tenant-aware
      metadata?: Record<string, unknown>
    }
  ): Promise<{
    sourceId: string
    pages: { id: string; title: string; action: "created" | "updated" }[]
  }>

  deleteSource(
    id: string,
    opts: { tenant: TTenant }            // required when tenant-aware
  ): Promise<{
    sourceId: string
    pages: { id: string; title: string; action: "updated" | "deleted" }[]
  }>

  query(
    text: string,
    opts: {
      tenant: TTenant                    // required when tenant-aware
      filters?: MetadataFilters
      mode?: "pages-only" | "synthesize" // default: "pages-only"
    }
  ): Promise<{
    answer?: string
    pages: { id: string; title: string; excerpt: string }[]
    evidence: { fragmentId: string; text: string; sourceId: string }[]
  }>

  listPages(opts: {
    tenant: TTenant                      // required when tenant-aware
    filters?: MetadataFilters
  }): Promise<{
    id: string
    title: string
    type: string
    status: "draft" | "published" | "stale" | "conflicted"
    metadata: Record<string, unknown>
  }[]>

  getPage(
    id: string,
    opts: { tenant: TTenant }            // required when tenant-aware
  ): Promise<{
    id: string
    title: string
    content: string
    versions: { id: string; createdAt: Date; changeSummary: string }[]
    claims: { id: string; text: string; status: string }[]
    evidence: { fragmentId: string; text: string; sourceId: string }[]
  }>
}

interface MetadataFilters {
  [key: string]: unknown | { $in: unknown[] } | { $nin: unknown[] } | null
}
```

---

## 11. Success Criteria

### MVP Success Definition

A developer can install the package, point it at a Postgres database, ingest 10 documents, and run a query that returns a grounded wiki-based answer — all within one hour of starting.

### Functional Requirements

- ✅ `createClient()` runs migrations and returns a working client
- ✅ `ingestSource()` is fully atomic (no partial writes on LLM failure)
- ✅ `deleteSource()` updates all affected pages
- ✅ `query()` returns results scoped correctly by metadata filters
- ✅ `getPage()` returns full version history and evidence chain
- ✅ All methods accept and filter by arbitrary JSONB metadata
- ✅ TypeScript types are accurate and exported for developer use

### Quality Indicators

- Zero external service dependencies beyond Postgres and the developer's LLM adapter
- All public methods have TypeScript return types (no `any`)
- Integration tests run against a real Postgres instance (no mocks)

---

## 12. Implementation Phases

### Phase 1 — Schema & Client Foundation
**Goal:** Working Postgres schema with TypeORM and a functioning `createClient`.

- ✅ Define all TypeORM entities (`sources`, `source_fragments`, `wiki_pages`, `wiki_page_versions`, `wiki_links`, `wiki_claims`, `claim_evidence`, `jobs`, `job_events`)
- ✅ Write initial migration
- ✅ `createClient()` connects, runs migrations, returns Client instance
- ✅ JSONB metadata columns and GIN indexes on all major entities

**Validation:** `createClient({ connectionString })` creates all tables in a fresh Postgres database.

---

### Phase 2 — Ingest Pipeline
**Goal:** Atomic `ingestSource()` that fragments content and creates/updates wiki pages.

- ✅ Source storage with metadata
- ✅ Fragment extraction (character-offset-based passages)
- ✅ LLM adapter interface and prompt design for page creation/update
- ✅ Transactional ingest (rollback on LLM failure)
- ✅ `deleteSource()` with cascading page evaluation

**Validation:** Ingest 3 documents, verify pages created, verify rollback on simulated LLM failure.

---

### Phase 3 — Query Layer
**Goal:** `query()`, `listPages()`, and `getPage()` working with metadata filters.

- ✅ Full-text search on `wiki_pages` content
- ✅ Metadata filter application (exact match, `$in`, `$nin`, null checks)
- ✅ Evidence fragment retrieval per page
- ✅ `synthesize` mode calling LLM adapter with matched page context
- ✅ `listPages()` with filters and pagination
- ✅ `getPage()` with versions, claims, evidence

**Validation:** Query returns correct pages scoped by metadata; synthesize mode returns a grounded answer.

---

### Phase 4 — Polish & Package
**Goal:** Production-ready npm package.

- ✅ Clean public TypeScript exports from `index.ts`
- ✅ Integration test suite against real Postgres
- ✅ README with quickstart example
- ✅ npm package configuration (`package.json`, `tsconfig`, build output)
- ✅ Optional embedding adapter interface documented

**Validation:** `npm install pg-wiki-knowledge` in a blank project, run quickstart, all tests pass.

---

## 13. Future Considerations

- **Background reconciliation jobs** — periodic sweeps to detect stale pages, contradictions, and missing links
- **Conflict resolution UI hooks** — callbacks or events for human-in-the-loop review
- **Embedding-based semantic search** — upgrade `query()` to support hybrid search when an `EmbeddingAdapter` is provided
- **Multi-tenant row-level security** — Postgres RLS policies driven by metadata namespace
- **Page type schemas** — user-defined structured fields per page type (entity, glossary term, timeline, etc.)
- **Export / import** — snapshot and restore the knowledge base
- **Observability** — structured events on ingestion jobs for logging and monitoring integrations
- **CLI** — `npx pg-wiki-knowledge migrate` and `npx pg-wiki-knowledge ingest <file>` for quick setup

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| LLM output quality degrades wiki pages | Version every change; expose `getPage()` with version history so bad updates can be identified; config option for human review before publish |
| Atomic ingest is slow for large documents | Make fragmentation chunk size configurable; expose a streaming/batch ingest option in a later phase |
| JSONB metadata filters become a performance bottleneck | GIN indexes by default; document generated column pattern for high-cardinality filter fields |
| Conflict resolution config leads to silently wrong pages | Default to `"flag"` (mark page as `conflicted`) rather than auto-resolve; log conflict events in `job_events` |
| TypeORM migration conflicts in existing databases | Prefix all table names with `pgwiki_` by default; allow developer to override schema/prefix in config |

---

## 15. Appendix

### Database Tables

| Table | Purpose |
|---|---|
| `pgwiki_sources` | Raw ingested content |
| `pgwiki_source_fragments` | Passage-level splits of sources |
| `pgwiki_wiki_pages` | Canonical wiki pages |
| `pgwiki_wiki_page_versions` | Append-only version snapshots |
| `pgwiki_wiki_links` | Typed edges between pages |
| `pgwiki_wiki_claims` | Atomic claims extracted from pages |
| `pgwiki_claim_evidence` | Mapping from claims to source fragments |
| `pgwiki_jobs` | Ingestion and update job records |
| `pgwiki_job_events` | Structured log events per job |

### Assumptions Made

- Developers are responsible for providing a working `LLMAdapter` implementation.
- Multi-tenancy is handled purely through metadata filtering, not separate schemas or databases.
- Embeddings are optional; MVP ships without requiring a vector extension.
- The package targets Node.js 18+ (native `fetch`, modern TypeScript support).
