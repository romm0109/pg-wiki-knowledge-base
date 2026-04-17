# Feature: Docs Filters + AI search_docs Tool

The following plan should be complete, but it's important that you validate codebase patterns and task sanity before implementing.

Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Two related improvements to the docs system:

1. **Docs Page Filters** — Add team and file-type filter controls to the `/docs` browser page. Currently the page only has a free-text search input. Users need to narrow docs by the team whose services the doc is attached to, and by file type (md / pdf / docx).

2. **AI `search_docs` Tool + System Prompt Update** — Add an explicit `search_docs(query)` tool to the AI assistant so the LLM can consciously trigger semantic search over the document knowledge base when it lacks information. Currently RAG is auto-triggered on every message but the LLM cannot refine or repeat the search intentionally. Also update the system prompt to instruct the LLM to use this tool proactively when it is missing information.

## User Story

As an engineer using the Fire Attack Hub,
I want to filter docs by team and file type on the docs page, and have the AI assistant search documents when it needs more information,
So that I can find relevant docs faster and get more accurate AI answers backed by documentation.

## Problem Statement

- The `/docs` page lists all documents with only a free-text search. There is no way to narrow by the team a doc belongs to or by file format.
- The AI assistant auto-retrieves RAG chunks on every message using the user's raw input as the query, but has no tool to consciously search docs with a refined query when it realises its initial context is insufficient.

## Solution Statement

- Add `teamId` and `fileType` query params to `GET /docs` and add filter UI (team dropdown + file type pills) to `DocsPage.tsx`.
- Add a `search_docs` tool to `AiChatService` that embeds a query and runs a vector cosine similarity search against `doc_chunks`, returning top-K excerpts with doc titles. Register it in `buildToolDefs()` and add dispatch in `dispatchTool()`. Update `buildSystemPrompt()` to instruct the LLM to call it when it lacks information.
- Fix a latent bug: `DocChunk` is `@InjectRepository`-ed in `AiChatService` but is NOT registered in `AiModule`'s `TypeOrmModule.forFeature([...])` — this must be fixed as part of this work.

## Feature Metadata

**Feature Type**: Enhancement + New Capability  
**Estimated Complexity**: Medium  
**Primary Systems Affected**: Backend docs module, Backend AI module, Frontend DocsPage  
**Dependencies**: pgvector (`toSql` already imported), `EmbeddingService` (already injected in `AiChatService`), `DataSource` (already injected in `AiChatService`)

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

- `backend/src/docs/dto/query-doc.dto.ts` (full file, 19 lines) — Current DTO shape; `fileType` already exists, `teamId` is missing
- `backend/src/docs/docs.service.ts` (lines 58–90) — `findAll()` query builder; pattern to mirror for new filters
- `frontend/src/pages/DocsPage.tsx` (full file) — Current page; add filter state and UI here
- `frontend/src/api/client.ts` (lines 169–191) — `docsApi.list()` params type; add `teamId` and fix `fileType` to strict union
- `frontend/src/types/doc.ts` (full file) — `DocFileType = 'md' | 'pdf' | 'docx'`; use this type in UI state
- `backend/src/ai/ai.module.ts` (full file, 29 lines) — Missing `DocChunk` in `TypeOrmModule.forFeature`; fix required
- `backend/src/ai/ai-chat.service.ts` (lines 1–20) — Imports; `toSql` already imported from `pgvector`
- `backend/src/ai/ai-chat.service.ts` (lines 44–77) — Constructor; `EmbeddingService`, `DataSource`, `chunksRepo` already injected
- `backend/src/ai/ai-chat.service.ts` (lines 199–229) — `dispatchTool()` switch; add `search_docs` case here
- `backend/src/ai/ai-chat.service.ts` (lines 372–396) — `toolListTeams()` — last tool method before formatters; add `toolSearchDocs()` after this
- `backend/src/ai/ai-chat.service.ts` (lines 550–582) — `buildSystemPrompt()`; update guidance text here
- `backend/src/ai/ai-chat.service.ts` (lines 584–763) — `buildToolDefs()`; add `search_docs` definition before closing `]`
- `backend/src/ai/embedding.service.ts` (lines 27–33) — `embed(texts)` returns `number[][]`; returns `texts.map(() => [])` when env vars missing — must guard against empty embedding
- `backend/src/ai/doc-chunk.entity.ts` (full file) — `DocChunk` entity; columns are `docId`, `chunkIndex`, `content`, `embedding`
- `frontend/src/types/team.ts` — `Team` type; needed for team dropdown state
- `frontend/src/api/client.ts` (lines 54–61) — `teamsApi.list()` call pattern to fetch teams in DocsPage

### New Files to Create

None — all changes are to existing files.

### Patterns to Follow

**QueryBuilder filter pattern** (mirror from `docs.service.ts` lines 67–87):
```typescript
if (query.teamId) {
  qb.andWhere(`EXISTS (
    SELECT 1 FROM doc_services ds2
    INNER JOIN services s2 ON ds2.service_id = s2.id
    WHERE ds2.doc_id = doc.id AND s2.team_id = :teamId
  )`, { teamId: query.teamId });
}
```
Use `EXISTS` subquery — NOT a JOIN — to avoid row multiplication from the already-present LEFT JOINs on `docService` and `docEntity`.

**RAG vector query pattern** (mirror from `ai-chat.service.ts` lines 101–110):
```typescript
const rows = await this.dataSource.query<{ content: string; doc_id: string }[]>(
  `SELECT content, doc_id
   FROM doc_chunks
   WHERE embedding IS NOT NULL
   ORDER BY embedding <=> $1::vector
   LIMIT $2`,
  [toSql(queryEmbedding), TOP_K],
);
```
Extend this pattern to also `JOIN docs d ON d.id = dc.doc_id` and `SELECT d.title AS doc_title`.

**Tool dispatch pattern** (mirror from `ai-chat.service.ts` lines 207–228):
```typescript
case 'search_docs':
  return this.toolSearchDocs(args['query'] ?? '');
```

**Tool definition pattern** (mirror from `ai-chat.service.ts` lines 586–602):
```typescript
{
  type: 'function',
  function: {
    name: 'search_docs',
    description: '...',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '...' },
      },
      required: ['query'],
    },
  },
},
```

**Frontend debounced filter pattern** (mirror from `DocsPage.tsx` existing `useEffect`):
```typescript
useEffect(() => {
  const timeout = window.setTimeout(() => {
    docsApi.list({ q: search.trim() || undefined, teamId: teamId || undefined, fileType: fileType || undefined })
      .then(setDocs)
      .catch(...)
      .finally(...);
  }, 180);
  return () => window.clearTimeout(timeout);
}, [search, teamId, fileType]);
```

**Frontend filter pill pattern** (mirror from `MapFilterPanel.tsx` or `EntityFilterPanel.tsx` for active/inactive pill styles):
Active pill: `border-cyan-400 text-cyan-300`
Inactive pill: `border-slate-700 text-slate-400 hover:border-slate-500`
Pill wrapper: `rounded-full border px-2 py-1 text-xs cursor-pointer transition-colors`

**Naming conventions**:
- Backend DTOs: `camelCase` properties decorated with class-validator decorators
- Frontend state: `camelCase` (`teamId`, `fileType`)
- API params: passed as-is via axios `params` object (axios serializes camelCase → `teamId=...` in query string, NestJS ValidationPipe maps it correctly)

---

## IMPLEMENTATION PLAN

### Phase 1: Backend — Docs Filter

Add `teamId` to the DTO and service. No migration needed (no schema changes).

### Phase 2: Backend — AI Module Fix + search_docs Tool

Fix the `DocChunk` registration bug in `AiModule`, then add the tool method, dispatch, definition, and system prompt update.

### Phase 3: Frontend — API Client + DocsPage

Extend `docsApi.list()` params type, then rebuild `DocsPage` with filter state and UI.

---

## STEP-BY-STEP TASKS

### Task 1 — UPDATE `backend/src/docs/dto/query-doc.dto.ts`

- **ADD** `teamId` optional field after the existing `fileType` field:
  ```typescript
  @IsOptional()
  @IsUUID('4')
  teamId?: string;
  ```
- **IMPORTS**: `IsUUID` is already imported from `class-validator`
- **GOTCHA**: Do NOT add `attachmentType` — it was explicitly excluded from scope
- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 2 — UPDATE `backend/src/docs/docs.service.ts`

- **ADD** `teamId` filter block inside `findAll()` after the existing `fileType` block (line 87), before `return qb.getMany()`:
  ```typescript
  if (query.teamId) {
    qb.andWhere(
      `EXISTS (
        SELECT 1 FROM doc_services ds2
        INNER JOIN services s2 ON ds2.service_id = s2.id
        WHERE ds2.doc_id = doc.id AND s2.team_id = :teamId
      )`,
      { teamId: query.teamId },
    );
  }
  ```
- **GOTCHA**: Must use `EXISTS` subquery, not a JOIN. The query builder already has LEFT JOINs on `docService` and `docEntity` aliases — adding another JOIN on `doc_services` with a WHERE clause would cause duplicate rows that break `getMany()`.
- **GOTCHA**: Table names in raw SQL are snake_case (`doc_services`, `services`). Column names are also snake_case (`service_id`, `team_id`, `doc_id`).
- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 3 — UPDATE `backend/src/ai/ai.module.ts`

- **ADD** `DocChunk` import and registration in `TypeOrmModule.forFeature`:
  ```typescript
  import { DocChunk } from '../ai/doc-chunk.entity';
  // or from the relative path — the module is in src/ai/, so:
  import { DocChunk } from './doc-chunk.entity';
  ```
  Add `DocChunk` to the array: `TypeOrmModule.forFeature([Service, CatalogEntity, Team, ServiceConnection, Playground, Doc, DocChunk])`
- **GOTCHA**: `AiSession` — check if it's also missing. The `sessionsRepo` is `@InjectRepository(AiSession)` in `AiChatService`. Look at whether `AiSession` is in the forFeature array. If it is already there, leave it. If not, add it too (`import { AiSession } from './ai-session.entity'`).
- **VALIDATE**: `cd backend && npx tsc --noEmit` — if `DocChunk` was truly missing, NestJS would fail at runtime; TypeScript won't catch it but the import must resolve

### Task 4 — UPDATE `backend/src/ai/ai-chat.service.ts` — add `toolSearchDocs()` method

- **ADD** after `toolListTeams()` method (line 396), before `private formatService()` (line 398):
  ```typescript
  private async toolSearchDocs(query: string): Promise<string> {
    if (!query?.trim()) {
      return JSON.stringify([]);
    }

    let embedding: number[];
    try {
      const [result] = await this.embeddingService.embed([query]);
      if (!result || result.length === 0) {
        return JSON.stringify({ error: 'Embedding unavailable — AI env vars may not be configured' });
      }
      embedding = result;
    } catch (err) {
      this.logger.warn('search_docs embedding failed:', err);
      return JSON.stringify({ error: 'Embedding failed' });
    }

    const rows = await this.dataSource.query<{
      doc_id: string;
      doc_title: string;
      chunk_index: number;
      content: string;
    }[]>(
      `SELECT dc.doc_id, d.title AS doc_title, dc.chunk_index, dc.content
       FROM doc_chunks dc
       JOIN docs d ON d.id = dc.doc_id
       WHERE dc.embedding IS NOT NULL
       ORDER BY dc.embedding <=> $1::vector
       LIMIT $2`,
      [toSql(embedding), TOP_K],
    );

    const results = rows.map((row) => ({
      docId: row.doc_id,
      docTitle: row.doc_title,
      chunkIndex: row.chunk_index,
      excerpt: row.content.slice(0, 400),
    }));

    return JSON.stringify(results);
  }
  ```
- **PATTERN**: `toSql` already imported at line 9; `TOP_K = 5` already defined at line 18; `this.embeddingService` already injected; `this.dataSource` already injected; `this.logger` already defined
- **GOTCHA**: `embed()` returns `number[][]`. Destructure as `const [result] = await this.embeddingService.embed([query])`. Guard `result.length === 0` (not just falsy) because when env vars are missing, `embed()` returns `[[]]` — an array of one empty array.
- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 5 — UPDATE `backend/src/ai/ai-chat.service.ts` — add dispatch case

- **ADD** inside `dispatchTool()` switch (lines 207–228), before the `default` case:
  ```typescript
  case 'search_docs':
    return this.toolSearchDocs(args['query'] ?? '');
  ```
- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 6 — UPDATE `backend/src/ai/ai-chat.service.ts` — add tool definition

- **ADD** a new entry to the array in `buildToolDefs()` (currently ends at line 763), before the closing `]`:
  ```typescript
  {
    type: 'function',
    function: {
      name: 'search_docs',
      description: `Search the internal document knowledge base using a semantic query.
  Use this tool when the user asks about how something works, deployment procedures, architecture decisions, runbooks, or operational knowledge that may be captured in uploaded Markdown, PDF, or DOCX documents.
  Returns the top-${TOP_K} most relevant document excerpts with their source document title.
  You can call this tool multiple times with different refined queries if the first results are insufficient.`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'A natural language semantic search query, e.g. "how to deploy the payments service" or "retry policy for Kafka consumers".',
          },
        },
        required: ['query'],
      },
    },
  },
  ```
- **GOTCHA**: The template literal inside `description` uses `TOP_K` — this is valid because `buildToolDefs` is a class method and `TOP_K` is a module-level const at line 18. The backtick description will interpolate correctly at runtime.
- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 7 — UPDATE `backend/src/ai/ai-chat.service.ts` — update system prompt

- **FIND** `buildSystemPrompt()` at line 550. Inside the template literal, add the following instruction **after** the existing `"When the user asks what playgrounds something 'has'..."` line and before the `Formatting rules:` section:
  ```
  When you are unsure about the content of a document, how a system works, or any technical detail that might be captured in internal documentation, use the search_docs tool before answering from general knowledge. Prefer searching docs over saying you don't know.
  ```
- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 8 — UPDATE `frontend/src/api/client.ts`

- **UPDATE** `docsApi.list()` params type (currently lines 169–175) to add `teamId` and tighten `fileType`:
  ```typescript
  list: (params?: {
    q?: string;
    serviceId?: string;
    entityId?: string;
    fileType?: 'md' | 'pdf' | 'docx';
    teamId?: string;
  }) => http.get<Doc[]>('/docs', { params }).then(r => r.data),
  ```
- **IMPORTS**: `DocFileType` from `'../types/doc'` is `'md' | 'pdf' | 'docx'` — can inline the union or import the type
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 9 — UPDATE `frontend/src/pages/DocsPage.tsx`

This is the largest frontend change. Rewrite the component to add filter state and filter UI.

**State to add:**
```typescript
const [teams, setTeams] = useState<Team[]>([]);
const [teamId, setTeamId] = useState('');
const [fileType, setFileType] = useState<'md' | 'pdf' | 'docx' | ''>('');
```

**Teams fetch** — add a one-time effect on mount (no deps):
```typescript
useEffect(() => {
  teamsApi.list().then(setTeams).catch(() => {});
}, []);
```

**Debounced doc load effect** — add `teamId` and `fileType` to deps and params:
```typescript
docsApi.list({
  q: search.trim() || undefined,
  teamId: teamId || undefined,
  fileType: (fileType as 'md' | 'pdf' | 'docx') || undefined,
})
```
Deps: `[search, teamId, fileType]`

**Filter UI** — add a second filter panel `div` below the search input panel, before the card grid. Use the app's visual language:

```tsx
<div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 flex flex-wrap items-center gap-4">
  {/* Team dropdown */}
  <select
    value={teamId}
    onChange={e => setTeamId(e.target.value)}
    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
  >
    <option value="">כל הצוותים</option>
    {teams.map(t => (
      <option key={t.id} value={t.id}>{t.name}</option>
    ))}
  </select>

  {/* File type pills */}
  <div className="flex gap-2">
    {(['md', 'pdf', 'docx'] as const).map(type => (
      <button
        key={type}
        onClick={() => setFileType(prev => prev === type ? '' : type)}
        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
          fileType === type
            ? 'border-cyan-400 text-cyan-300'
            : 'border-slate-700 text-slate-400 hover:border-slate-500'
        }`}
      >
        {type.toUpperCase()}
      </button>
    ))}
  </div>

  {/* Clear button */}
  {(teamId || fileType) && (
    <button
      onClick={() => { setTeamId(''); setFileType(''); }}
      className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
    >
      נקה סינון
    </button>
  )}
</div>
```

- **IMPORTS**: Add `import type { Team } from '../types/team';` and `import { teamsApi } from '../api/client';`
- **GOTCHA**: `DocsPage` currently imports `docsApi` only — also import `teamsApi`
- **GOTCHA**: The `fileType` state default is `''` (empty string = no filter). When passing to `docsApi.list()`, pass `undefined` when empty to avoid sending `fileType=` in the query string
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

---

## TESTING STRATEGY

### No automated tests exist in this project

The project has no test files (`*.spec.ts`, `*.test.ts`). Validation is via TypeScript compilation and manual API/UI testing.

### Edge Cases

- `teamId` filter with no matching docs → returns empty array (correct)
- `teamId` for an external team whose services have docs → should still appear
- `fileType` + `teamId` combined → both filters applied via AND logic, correct
- `search_docs` called with empty string → returns `[]` immediately, no embedding call
- `search_docs` with AI env vars missing → `embed()` returns `[[]]`; guard `result.length === 0` prevents `toSql([])` crash
- `search_docs` when `doc_chunks` table is empty → returns `[]` (pgvector returns no rows, not an error)
- Auto-RAG already injected top-K chunks in system prompt + `search_docs` called with same query → LLM receives the same content twice (acceptable, by design)

---

## VALIDATION COMMANDS

### Level 1: TypeScript

```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npx tsc --noEmit
```
```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npx tsc --noEmit
```

### Level 2: Backend Start

```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run start:dev
```
Watch for `UnknownDependenciesException` — if `DocChunk` or `AiSession` registration is missing, NestJS will fail here with a clear message.

### Level 3: Manual API Validation

```bash
# Filter by fileType
curl "http://localhost:3001/docs?fileType=md"

# Filter by teamId (replace UUID with a real team ID from your DB)
curl "http://localhost:3001/docs?teamId=<team-uuid>"

# Combined
curl "http://localhost:3001/docs?fileType=pdf&teamId=<team-uuid>"

# No filter — should return all docs
curl "http://localhost:3001/docs"
```

### Level 4: Manual AI Tool Validation

Send a chat message that references documentation content. Observe server logs for `dispatchTool` calls. The LLM should call `search_docs` when asked about operational details.

```bash
# Watch backend logs for: "Tool search_docs called with query: ..."
curl -X POST http://localhost:3001/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "How do I deploy the payments service?"}'
```

### Level 5: Frontend Manual

1. Open `http://localhost:5173/docs`
2. Confirm team dropdown renders all teams
3. Select a team — doc list should update
4. Click MD / PDF / DOCX pills — list should filter
5. Click a pill again to deselect — list returns to unfiltered
6. Combine team + file type — both applied
7. "נקה סינון" button appears when any filter is active, clears both on click

---

## ACCEPTANCE CRITERIA

- [ ] `GET /docs?teamId=<uuid>` returns only docs attached to services of that team
- [ ] `GET /docs?fileType=pdf` returns only PDF docs
- [ ] `GET /docs?teamId=<uuid>&fileType=md` applies both filters correctly
- [ ] DocsPage renders team dropdown populated from `teamsApi.list()`
- [ ] DocsPage renders MD / PDF / DOCX file type pills
- [ ] Selecting a filter updates the doc list within 200ms (debounce)
- [ ] "נקה סינון" button appears when a filter is active and clears all filters
- [ ] Backend starts without `UnknownDependenciesException` (DocChunk registered)
- [ ] `search_docs` appears in the LLM's tool definitions
- [ ] LLM calls `search_docs` when user asks about documentation content
- [ ] `search_docs` returns `[]` for empty query (no crash, no embedding call)
- [ ] `search_docs` handles missing embedding env vars gracefully (returns error JSON, no crash)
- [ ] System prompt instructs the LLM to use `search_docs` when lacking information
- [ ] `cd backend && npx tsc --noEmit` passes with zero errors
- [ ] `cd frontend && npx tsc --noEmit` passes with zero errors

---

## COMPLETION CHECKLIST

- [ ] Task 1: `query-doc.dto.ts` — `teamId` field added
- [ ] Task 2: `docs.service.ts` — `teamId` EXISTS filter added
- [ ] Task 3: `ai.module.ts` — `DocChunk` registered; `AiSession` verified
- [ ] Task 4: `ai-chat.service.ts` — `toolSearchDocs()` method added
- [ ] Task 5: `ai-chat.service.ts` — `'search_docs'` case in `dispatchTool()`
- [ ] Task 6: `ai-chat.service.ts` — `search_docs` definition in `buildToolDefs()`
- [ ] Task 7: `ai-chat.service.ts` — system prompt updated
- [ ] Task 8: `client.ts` — `docsApi.list()` params extended
- [ ] Task 9: `DocsPage.tsx` — filter state, teams fetch, filter UI
- [ ] Backend TypeScript clean
- [ ] Frontend TypeScript clean
- [ ] Backend starts without exceptions
- [ ] All acceptance criteria verified

---

## NOTES

### Why EXISTS not JOIN for teamId filter
The `findAll()` query builder already has two LEFT JOINs (`docService`, `docEntity`). Adding a third JOIN on `doc_services` for the team filter would cause row multiplication — a doc attached to 3 services would appear 3 times in `getMany()`. The correlated EXISTS subquery is the correct pattern here.

### Why `doc_connections` / attachment type filter is excluded
Migration `1714600000000-DropDocConnections.ts` explicitly dropped the `doc_connections` table. The PRD mentions connection-attached docs but this was removed from the DB. Attachment type filter was explicitly descoped by the user.

### Auto-RAG + search_docs coexistence
The `chat()` method auto-runs RAG on every user message and injects the results into the system prompt. The `search_docs` tool gives the LLM a second chance to search with a refined query. If the LLM calls `search_docs` with the same query, it gets the same chunks twice — once in the prompt context, once as a tool result. This is intentional and acceptable. The system prompt already labels the first pass as a first-pass retrieval.

### AiSession registration
When fixing `ai.module.ts`, also verify `AiSession` is in `TypeOrmModule.forFeature`. If `sessionsRepo` is injected via `@InjectRepository(AiSession)` but `AiSession` isn't in forFeature, the same bug exists. Add it if missing.
