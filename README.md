# pg-wiki-knowledge-base

A TypeScript library that turns a Postgres database into a self-maintaining, LLM-powered knowledge base. Ingest raw sources once; the library synthesizes them into versioned wiki pages with claim extraction, full-text search, and traceable evidence — no external vector stores required.

## Install

```bash
npm install pg-wiki-knowledge-base
```

Requires Node.js 18+ and a Postgres 14+ database.

## Quickstart

```typescript
import { createClient } from 'pg-wiki-knowledge-base';

const client = await createClient({
  connectionString: process.env.DATABASE_URL!,
  llm: myLLMAdapter, // your LLM adapter (see below)
});

// Ingest a source — wiki pages are created/updated automatically
await client.ingestSource({
  content: 'TypeScript is a typed superset of JavaScript developed by Microsoft.',
  type: 'text',
  metadata: { source: 'docs' },
});

// Query the knowledge base
const result = await client.query('What is TypeScript?', { mode: 'synthesize' });
console.log(result.answer);
console.log(result.pages);   // canonical wiki pages consulted
console.log(result.evidence); // source fragments cited
```

## LLM Adapter

You supply the LLM adapter — the library is provider-agnostic. Implement the `LLMAdapter` interface:

```typescript
import type { LLMAdapter, LLMToolRequest, LLMToolResponse } from 'pg-wiki-knowledge-base';

const myLLMAdapter: LLMAdapter = {
  // Required: used at ingest time to synthesize wiki pages
  async complete(prompt: string): Promise<string> {
    const response = await myLLMProvider.generate(prompt);
    return response.text;
  },

  // Optional: used for semantic search if embeddings are enabled
  async embed(text: string): Promise<number[]> {
    return myEmbeddingProvider.embed(text);
  },

  // Optional: used by synthesize query mode for tool-calling
  async respondWithTools(request: LLMToolRequest): Promise<LLMToolResponse> {
    return myLLMProvider.respondWithTools(request);
  },
};
```

## Tenant-Aware Clients

Pass a generic type parameter to scope all reads and writes to a tenant:

```typescript
import { createClient } from 'pg-wiki-knowledge-base';

const client = await createClient<{ workspaceId: string }>({
  connectionString: process.env.DATABASE_URL!,
  llm: myLLMAdapter,
  tenant: { key: 'workspaceId' },
});

// All operations require a tenant argument
await client.ingestSource({
  content: 'Company policy update.',
  type: 'text',
  tenant: { workspaceId: 'acme' },
});

const pages = await client.listPages({ tenant: { workspaceId: 'acme' } });
```

## API Reference

### `createClient(config)`

Initializes a client and runs schema migrations. Returns a `Client` instance.

### `client.ingestSource(input)`

Ingests a raw source (text, markdown, HTML, PDF text, URL, or record). The LLM synthesizes the content into new or updated wiki pages atomically — if the LLM step fails, the source is not saved. Returns `{ sourceId, pages }`.

### `client.deleteSource(id, opts)`

Deletes a source by ID and cascades updates to affected wiki pages. Pages that lose all evidence are either marked `stale` (default) or deleted, depending on `deleteOrphanPages` config. Returns `{ sourceId, pages }`.

### `client.query(text, opts)`

Searches the knowledge base. `mode: 'pages-only'` (default) returns matching pages and evidence without calling the LLM. `mode: 'synthesize'` additionally calls the LLM to produce a natural-language answer. Returns `{ answer?, pages, evidence }`.

### `client.listPages(opts)`

Returns an array of `PageSummary` objects (`id`, `title`, `type`, `status`, `metadata`). Supports metadata filters, `limit`, and `offset`.

### `client.getPage(id, opts)`

Returns full `PageDetail` for a single page: content, version history, claims, and evidence fragments.

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `connectionString` | `string` | — | Postgres connection URL |
| `llm` | `LLMAdapter` | — | LLM adapter (required) |
| `schema` | `string` | `"public"` | Postgres schema to use |
| `tenant` | `{ key: string }` | — | Enables tenant isolation |
| `conflictResolution` | `"flag" \| "auto-resolve"` | `"flag"` | When a second ingest changes a page: `"flag"` marks it `conflicted`; `"auto-resolve"` overwrites and publishes |
| `deleteOrphanPages` | `"stale" \| "delete"` | `"stale"` | What to do with pages that lose all evidence after a source is deleted |
| `embeddings` | `EmbeddingAdapter` | — | Optional embedding adapter for semantic search |
| `migrations.run` | `boolean` | `true` | Set to `false` to skip auto-migration |
| `migrations.tableName` | `string` | TypeORM default | Custom migrations table name |
