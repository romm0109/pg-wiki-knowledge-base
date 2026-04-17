# Feature: Phase 6B — AI Chat Assistant

The following plan should be complete, but validate documentation and codebase patterns before implementing.

Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

A persistent, collapsible AI chat panel anchored to the left edge of the viewport (RTL "end" side), visible on every page. The assistant answers natural-language questions in Hebrew or English using two knowledge sources: semantic search (RAG) over `doc_chunks` (Phase 6A), and live tool calls that query the Postgres catalog directly. Conversations are stored server-side in `ai_sessions` (already migrated). No streaming in v1 — each user turn returns a single complete response.

## User Story

As an engineer or PM using the catalog,
I want to ask natural-language questions in Hebrew or English from any page,
So that I can instantly find information about services, entities, teams, docs, and API playgrounds without knowing which page to visit.

## Problem Statement

All catalog data exists in structured form and as searchable text, but there is no natural-language interface. Users must know where to look. The AI assistant closes that gap by combining live database queries (tools) and document retrieval (RAG) into a single conversational interface.

## Solution Statement

- **Backend**: `AiModule` with `AiChatService` and `AiController`. A single `POST /ai/chat` endpoint accepts `{ sessionId?, message }` and returns `{ sessionId, reply }`. The service performs an embedding similarity search over `doc_chunks`, builds a system prompt with injected context, calls the OpenAI-compatible chat completions API with tool definitions, executes any tool calls the model requests, then persists the updated session and returns the final reply.
- **Frontend**: `ChatPanel` component wired into `AppShell`. Collapsed by default (48 px icon strip), expands to ~340 px. Resize via drag. `localStorage` persists session ID, expanded state, and custom width.

## Feature Metadata

**Feature Type**: New Capability  
**Estimated Complexity**: High  
**Primary Systems Affected**: `backend/src/ai/`, `backend/src/app.module.ts`, `frontend/src/components/ai/`, `frontend/src/components/layout/AppShell.tsx`, `frontend/src/api/client.ts`, `backend/src/config/env.validation.ts`  
**Dependencies**: None new — uses existing `EmbeddingModule`, `TypeOrmModule`, `ConfigModule`, Axios, Tailwind

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ THESE BEFORE IMPLEMENTING

- `backend/src/ai/embedding.service.ts` — Pattern for calling OpenAI-compatible API with `fetch`; `AI_BASE_URL`, `AI_API_KEY` env vars already wired; replicate this pattern for chat completions at `/chat/completions`
- `backend/src/ai/embedding.module.ts` — Module that exports `ChunkingService`, `EmbeddingService`, and `TypeOrmModule` (with `DocChunk`, `AiSession`); `AiModule` imports `EmbeddingModule` for `EmbeddingService` + repos
- `backend/src/ai/doc-chunk.entity.ts` — `DocChunk` entity; `embedding` uses `pgvector` transformer. Semantic search must use raw SQL: `ORDER BY embedding <=> $1::vector LIMIT $2` — TypeORM does not know vector operators
- `backend/src/ai/ai-session.entity.ts` — `AiSession` entity; `messages` is `jsonb` typed as `object[]`; update by appending to the array and calling `repo.save()`
- `backend/src/docs/docs.service.ts` (lines 410–443) — `insertChunks()` shows how to run raw parameterized SQL via `this.dataSource.query()`; mirror this for the vector similarity query
- `backend/src/services/services.service.ts` (lines 16–51) — `findAll()` / `findOne()` patterns with QueryBuilder and relations; the tool implementations call these repos directly
- `backend/src/entities/entities.service.ts` (lines 26–59) — Same pattern for entities; note the entity is named `Entity` (conflicts with TypeORM's `@Entity()` decorator — always import as `import { Entity as CatalogEntity } ...`)
- `backend/src/teams/teams.service.ts` (lines 22–35) — Simple `findAll()` / `findOne()` returning team with label relation
- `backend/src/docs/docs.controller.ts` — Controller pattern: `@Controller('docs')`, `@Get()`, `@Post()`, `@Param('id', ParseUUIDPipe)`; mirror for `@Controller('ai')`
- `backend/src/docs/docs.module.ts` — How a module imports `EmbeddingModule` alongside TypeORM feature modules
- `backend/src/app.module.ts` — Where to register `AiModule` in the imports array
- `backend/src/config/env.validation.ts` (lines 82–96) — How to add optional env vars with `@IsOptional() @IsString() @IsNotEmpty()`; add `AI_CHAT_MODEL` here
- `backend/src/migrations/1714700000000-AddAiFoundation.ts` — `ai_sessions` table already exists; no new migration needed for Phase 6B
- `frontend/src/components/layout/AppShell.tsx` — Current shell: vertical flex column, `<TopNav />` + `<main>`. Change `main` to a horizontal flex row that includes `<ChatPanel />` on the left
- `frontend/src/components/layout/TopNav.tsx` — RTL nav using `ms-`/`me-` Tailwind direction utilities; follow this pattern in the chat panel
- `frontend/src/api/client.ts` (lines 28–33) — Axios instance `http`; add `aiApi` at the bottom following the existing group pattern
- `frontend/src/components/map/ServicePanel.tsx` (lines 19–22) — `INPUT_CLASS` / `LABEL_CLASS` constants; reuse these Tailwind class strings for form inputs in the chat panel

### New Files to Create

- `backend/src/ai/ai-chat.service.ts` — Core chat logic: RAG retrieval, system prompt builder, tool dispatch loop, session persistence
- `backend/src/ai/ai.controller.ts` — `POST /ai/chat` controller
- `backend/src/ai/ai.module.ts` — Module wiring `AiChatService`, `AiController`, importing `EmbeddingModule` + catalog entity repos
- `frontend/src/components/ai/ChatPanel.tsx` — Full chat panel component
- `frontend/src/types/ai.ts` — `ChatMessage`, `ChatRequest`, `ChatResponse` TypeScript types

### Relevant Documentation

- OpenAI Chat Completions API with tool use: https://platform.openai.com/docs/api-reference/chat/create
  - Section: `tools` array and `tool_calls` in assistant messages — required to implement the tool-call dispatch loop
  - Section: `messages` array structure — `role: "system" | "user" | "assistant" | "tool"`, `tool_call_id` for tool result messages
- pgvector cosine distance operator: `<=>` — used in raw SQL `ORDER BY embedding <=> $1::vector LIMIT $2`

### Patterns to Follow

**Controller pattern** (from `docs.controller.ts`):
```typescript
@Controller('ai')
export class AiController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Post('chat')
  chat(@Body() dto: ChatDto) {
    return this.aiChatService.chat(dto);
  }
}
```

**Raw SQL for pgvector similarity** (pattern from `docs.service.ts` insertChunks):
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

**Env var pattern** (from `env.validation.ts`):
```typescript
@IsOptional()
@IsString()
@IsNotEmpty()
AI_CHAT_MODEL?: string;
```

**Module import of EmbeddingModule** (from `docs.module.ts`):
```typescript
imports: [
  TypeOrmModule.forFeature([Service, Entity as CatalogEntity, Team, Doc]),
  EmbeddingModule,  // gives access to EmbeddingService + DocChunk/AiSession repos
],
```

**Frontend localStorage persistence pattern** (consistent with PRD spec):
```typescript
const STORAGE_KEY = 'ai_panel';
// shape: { sessionId?: string; expanded: boolean; width: number }
```

**AppShell layout change** — from vertical-only to a `flex-row` in `<main>`:
```tsx
<main className="flex-1 flex flex-row overflow-hidden">
  <ChatPanel />
  <div className="flex-1 overflow-hidden">{children}</div>
</main>
```
Panel is on the **left** (RTL "end" = `left` in physical layout when `dir="rtl"`).

---

## IMPLEMENTATION PLAN

### Phase 1: Backend — Chat Service Core

Wire `AiChatService` with:
1. Session load/create from `ai_sessions`
2. RAG (always-on): embed the user message, cosine search `doc_chunks` for top-5 chunks, inject into system prompt regardless of question type
3. Build a system prompt that describes the catalog and injects RAG chunks
4. Tool definitions array (7 tools — no `search_docs` tool)
5. LLM chat completions call (POST `/chat/completions`)
6. Tool-call dispatch loop: execute requested tools, append results, re-call LLM
7. Append user + assistant messages to session and save
8. Return `{ sessionId, reply }`

### Phase 2: Backend — Tool Implementations

Each tool is a private method on `AiChatService` that queries TypeORM repos:
- `get_service(id_or_name)` — uses `servicesRepo.findOne()` with connections + team relation
- `list_services(team?, lifecycle?)` — filtered `servicesRepo` query
- `get_entity(name)` — search by `nameEn` or `nameHe` with full relations
- `list_entities(q?)` — `entitiesRepo` with optional name search
- `get_connection(id)` — `connectionsRepo.findOne()` with from/to service
- `list_playgrounds(team?, service?)` — `playgroundsRepo` filtered query
- `get_team(name)` — `teamsRepo` by name with services + label

### Phase 3: Backend — Controller and Module Registration

- `AiController` with `POST /ai/chat`
- `AiModule` with all providers and repos
- Register `AiModule` in `app.module.ts`
- Add `AI_CHAT_MODEL` to `env.validation.ts`
- Add `AI_CHAT_MODEL` to `backend/.env.example`

### Phase 4: Frontend — Chat Panel Component

- `ChatPanel` — collapsible panel on the left side of AppShell
- State: `expanded`, `width`, `sessionId` from localStorage; `messages`, `input`, `loading` in component state
- Collapsed state: 48px wide, shows only a toggle icon button
- Expanded state: full chat UI with message list and input
- Resizable via `mousedown` on the right border drag handle
- `aiApi.chat()` call on submit; appends optimistic user message, then assistant reply

### Phase 5: Frontend — AppShell Integration

- Update `AppShell.tsx` to use `flex-row` in `<main>`
- Add `<ChatPanel />` on the left
- Wrap `{children}` in a `flex-1 overflow-hidden` div so pages still fill the space

---

## STEP-BY-STEP TASKS

### Task 1: ADD `AI_CHAT_MODEL` to env validation

**File**: `backend/src/config/env.validation.ts`
- **ADD** `AI_CHAT_MODEL?: string` field to `EnvironmentVariables` class after `AI_EMBEDDING_MODEL`, following the same `@IsOptional() @IsString() @IsNotEmpty()` decorator pattern (lines 92–96)
- **VALIDATE**: `cd backend && npm run typecheck`

---

### Task 2: CREATE `backend/src/ai/ai-chat.service.ts`

- **IMPLEMENT**: `@Injectable()` class `AiChatService`
- **CONSTRUCTOR INJECT**:
  - `@InjectRepository(AiSession) private readonly sessionsRepo: Repository<AiSession>`
  - `@InjectRepository(DocChunk) private readonly chunksRepo: Repository<DocChunk>` (unused directly — raw SQL via dataSource)
  - `@InjectDataSource() private readonly dataSource: DataSource`
  - `private readonly embeddingService: EmbeddingService`
  - `private readonly configService: ConfigService`
  - `@InjectRepository(Service) private readonly servicesRepo: Repository<Service>`
  - `@InjectRepository(Entity as CatalogEntity) private readonly entitiesRepo: Repository<Entity>`  ← import Entity as `import { Entity as CatalogEntity } from '../entities/entity.entity'`
  - `@InjectRepository(Team) private readonly teamsRepo: Repository<Team>`
  - `@InjectRepository(ServiceConnection) private readonly connectionsRepo: Repository<ServiceConnection>`
  - `@InjectRepository(Playground) private readonly playgroundsRepo: Repository<Playground>`
  - `@InjectRepository(Doc) private readonly docsRepo: Repository<Doc>`
- **IMPLEMENT** `async chat(dto: ChatDto): Promise<{ sessionId: string; reply: string }>`
  1. Load or create session: `dto.sessionId ? sessionsRepo.findOne({ where: { id: dto.sessionId } }) ?? create new : create new`
  2. RAG: `const [queryEmbed] = await this.embeddingService.embed([dto.message])` — then run raw cosine query (see pattern above, `TOP_K = 5`); if embedding fails or is empty skip RAG silently
  3. Build system prompt string (see System Prompt section below)
  4. Assemble `messages` array: `[{ role: 'system', content: systemPrompt }, ...session.messages, { role: 'user', content: dto.message }]`
  5. Call `this.callLlm(messages, toolDefs)` → returns raw API response
  6. Tool dispatch loop: `while (response.choices[0].finish_reason === 'tool_calls')` — call each tool, push assistant message + tool result messages, re-call LLM
  7. Extract final reply text
  8. Update `session.messages`: append `{ role: 'user', content: dto.message }` and `{ role: 'assistant', content: reply }`; `await sessionsRepo.save(session)`
  9. Return `{ sessionId: session.id, reply }`
- **IMPLEMENT** private `callLlm(messages, tools)` — mirrors `EmbeddingService.embed()`'s fetch pattern, POSTs to `${AI_BASE_URL}/chat/completions` with `{ model: AI_CHAT_MODEL, messages, tools, tool_choice: 'auto' }`
- **IMPLEMENT** 7 private tool methods (see Tool Methods section)
- **IMPLEMENT** private `buildToolDefs(): object[]` — returns the OpenAI tool definitions array (JSON schema for each tool's parameters)
- **IMPLEMENT** private `buildSystemPrompt(ragChunks: string[]): string` — see System Prompt section
- **GOTCHA**: Import `Service` entity as `import { Service } from '../services/service.entity'` — NOT the NestJS `@Injectable()`. Same for `Entity` — import as `CatalogEntity` to avoid clash with TypeORM's `@Entity()` decorator
- **GOTCHA**: `pgvector`'s `toSql()` is imported from `'pgvector'` (already in package.json). Use it in the raw similarity query parameter
- **GOTCHA**: `session.messages` is `object[]` (jsonb). Cast to `ChatCompletionMessage[]` when building the messages array for the LLM call
- **VALIDATE**: `cd backend && npm run typecheck`

#### System Prompt

```
You are a helpful assistant for an internal engineering catalog called "Fire Attack Hub".
You have access to tools that let you query live catalog data (services, entities, teams, playgrounds).
You also have context from relevant documents retrieved from the knowledge base.

Respond in the same language the user writes in (Hebrew or English).
Be concise and factual. If you do not know, say so.

${ragChunks.length > 0 ? `\n## Relevant document excerpts\n${ragChunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')}` : ''}
```

#### Tool Methods

```typescript
private async toolGetService(idOrName: string): Promise<string>
// Try findOne by UUID first; fall back to findOne where name ILIKE :n; return JSON

private async toolListServices(team?: string, lifecycle?: string): Promise<string>
// servicesRepo.createQueryBuilder with optional team/lifecycle filters

private async toolGetEntity(name: string): Promise<string>
// entitiesRepo.createQueryBuilder where nameEn ILIKE :n OR nameHe = :n, full relations

private async toolListEntities(q?: string): Promise<string>
// entitiesRepo with optional name search

private async toolGetConnection(id: string): Promise<string>
// connectionsRepo.findOne({ where: { id }, relations: ['fromService', 'toService'] })

private async toolListPlaygrounds(teamId?: string, serviceId?: string): Promise<string>
// playgroundsRepo filtered query with team + service relations

private async toolGetTeam(name: string): Promise<string>
// teamsRepo findOne where name ILIKE :n, with services + label relations
```

All tool methods serialize results with `JSON.stringify(result ?? 'not found')`.

---

### Task 3: CREATE `backend/src/ai/dto/chat.dto.ts`

- **IMPLEMENT**: `ChatDto` with `@IsOptional() @IsUUID() sessionId?: string` and `@IsString() @IsNotEmpty() message: string`
- **VALIDATE**: `cd backend && npm run typecheck`

---

### Task 4: CREATE `backend/src/ai/ai.controller.ts`

- **IMPLEMENT**: `@Controller('ai')` class `AiController`
- **ADD** `@Post('chat')` method calling `this.aiChatService.chat(dto)` with `@Body() dto: ChatDto`
- **MIRROR**: `docs.controller.ts` structure — imports from `@nestjs/common`, no `ParseUUIDPipe` needed on chat body
- **VALIDATE**: `cd backend && npm run typecheck`

---

### Task 5: CREATE `backend/src/ai/ai.module.ts`

- **IMPLEMENT**: `@Module` importing:
  - `EmbeddingModule` (gives `EmbeddingService` + `DocChunk`/`AiSession` repos from its exported `TypeOrmModule`)
  - `TypeOrmModule.forFeature([Service, CatalogEntity, Team, ServiceConnection, Playground, Doc])` — for the catalog tool repos
  - `ConfigModule` is global, no explicit import needed
- **PROVIDERS**: `[AiChatService]`
- **CONTROLLERS**: `[AiController]`
- **EXPORTS**: `[AiChatService]` (not strictly required but good practice)
- **GOTCHA**: `EmbeddingModule` already exports `TypeOrmModule` which registers `DocChunk` and `AiSession` — do NOT re-register them in `forFeature` here or TypeORM will throw a duplicate entity error
- **VALIDATE**: `cd backend && npm run typecheck`

---

### Task 6: UPDATE `backend/src/app.module.ts`

- **ADD** `import { AiModule } from './ai/ai.module'` and add `AiModule` to the `imports` array
- **VALIDATE**: `cd backend && npm run typecheck`

---

### Task 7: UPDATE `backend/.env.example`

- **ADD** line `AI_CHAT_MODEL=` after `AI_EMBEDDING_MODEL=`
- **VALIDATE**: file diff looks correct

---

### Task 8: CREATE `frontend/src/types/ai.ts`

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  sessionId?: string;
  message: string;
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
}
```

- **VALIDATE**: `cd frontend && npm run build -- --noEmit 2>&1 | head -20` (type check via build)

---

### Task 9: UPDATE `frontend/src/api/client.ts`

- **ADD** import: `import type { ChatRequest, ChatResponse } from '../types/ai'`
- **ADD** at the bottom of the file:
```typescript
export const aiApi = {
  chat: (payload: ChatRequest) =>
    http.post<ChatResponse>('/ai/chat', payload).then(r => r.data),
};
```
- **VALIDATE**: `cd frontend && npm run build 2>&1 | tail -5`

---

### Task 10: CREATE `frontend/src/components/ai/ChatPanel.tsx`

- **IMPLEMENT** the full collapsible chat panel
- **STATE**:
  - `expanded: boolean` — read/write `localStorage` key `ai_panel_expanded` (default `false`)
  - `width: number` — read/write `localStorage` key `ai_panel_width` (default `340`)
  - `sessionId: string | undefined` — read/write `localStorage` key `ai_panel_session`
  - `messages: ChatMessage[]` — component state, initialized empty (not persisted in localStorage — session history lives server-side)
  - `input: string` — controlled input value
  - `loading: boolean`
- **COLLAPSED STATE**: `w-12` (48px) div with a single icon button to expand; `aria-expanded={false}`
- **EXPANDED STATE**: fixed width from state, flex-col layout with:
  - Header: "עוזר AI" label + collapse button
  - Message list: `flex-1 overflow-y-auto` with `overscroll-behavior: contain`; user messages right-aligned, assistant messages left-aligned (RTL aware)
  - Input area: `<textarea>` + send button; `Enter` submits (Shift+Enter = newline)
- **SUBMIT HANDLER**:
  1. Append optimistic user message to `messages`
  2. Set `loading = true`
  3. Call `aiApi.chat({ sessionId, message: input })`
  4. On success: set `sessionId` from response, append assistant message, persist session ID to localStorage
  5. On error: append error message as assistant reply
  6. Set `loading = false`
- **RESIZE**: `mousedown` on a 4px drag handle on the right border; `mousemove` on `document` while dragging updates width (min 240, max 600); `mouseup` clears listener and persists to localStorage
- **ACCESSIBILITY**: outermost div has `role="complementary" aria-label="עוזר AI"`; toggle button has `aria-label` and `aria-expanded`; message list div has `aria-live="polite"`
- **ANIMATION**: collapse/expand uses `transition-all duration-200` respecting `prefers-reduced-motion` (add `motion-reduce:transition-none` class)
- **TAILWIND CLASSES**: follow dark pattern from rest of app — `bg-slate-900 border-slate-800 text-slate-100`; user bubble: `bg-blue-600`; assistant bubble: `bg-slate-700`
- **GOTCHA**: The panel is on the `left` of the main flex row in the physical DOM. In RTL layout this is visually the "end" side. Use `dir="rtl"` on the panel's own scope if needed, or let it inherit from `<html>`
- **VALIDATE**: `cd frontend && npm run build 2>&1 | tail -5`

---

### Task 11: UPDATE `frontend/src/components/layout/AppShell.tsx`

- **UPDATE** `<main>` to:
```tsx
<main className="flex-1 flex flex-row overflow-hidden">
  <ChatPanel />
  <div className="flex-1 overflow-hidden">
    {children}
  </div>
</main>
```
- **ADD** import `import ChatPanel from '../ai/ChatPanel'`
- **VALIDATE**: `cd frontend && npm run build 2>&1 | tail -5`

---

## TESTING STRATEGY

### Unit Tests

This project has no test framework configured. Skip unit tests.

### Manual Validation (Required)

1. Start backend: `cd backend && npm run start:dev`
2. Start frontend: `cd frontend && npm run dev`

### Edge Cases

- `AI_CHAT_MODEL` / `AI_BASE_URL` / `AI_API_KEY` not set → service should log a warning and return a graceful error reply (e.g. `"AI not configured"`) instead of throwing 500
- Empty session ID in chat request → creates new session, returns new ID
- Unknown session ID in chat request → creates new session (don't throw 404)
- LLM returns no `tool_calls` on first call → skip dispatch loop, return content directly
- Tool call returns empty result → tool method returns `"not found"` string; LLM continues
- User message is Hebrew → LLM responds in Hebrew (system prompt instructs this)
- Panel collapsed → `{children}` fills 100% width
- Resize below min 240px → clamp to 240

---

## VALIDATION COMMANDS

### Level 1: TypeScript

```bash
cd backend && npm run typecheck
cd frontend && npm run build
```

### Level 2: Lint

```bash
cd frontend && npm run lint
```

### Level 3: Manual Smoke Test

```bash
# 1. Create a new session
curl -X POST http://localhost:3001/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "list all services"}'
# Expect: { sessionId: "<uuid>", reply: "..." }

# 2. Continue the session
curl -X POST http://localhost:3001/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "<uuid from above>", "message": "which teams own them?"}'
# Expect: reply references prior context

# 3. Unknown session ID (should create new)
curl -X POST http://localhost:3001/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "00000000-0000-0000-0000-000000000000", "message": "hello"}'
# Expect: new sessionId returned, no 500
```

### Level 4: Frontend

1. Open `http://localhost:5173`
2. Chat panel visible on left edge as 48px strip
3. Click toggle → expands to ~340px; main content reflows
4. Type a message, press Enter → optimistic message appears, loading indicator shows, assistant reply appears
5. Drag resize handle → width adjusts, persists after page reload
6. Collapse → persists after page reload
7. Session ID persists in localStorage (`ai_panel_session`) across reloads; conversation continues

---

## ACCEPTANCE CRITERIA

- [ ] `POST /ai/chat` returns `{ sessionId, reply }` for any valid message
- [ ] Session messages persist in `ai_sessions.messages` jsonb column
- [ ] Unknown / missing sessionId creates a new session (no 500)
- [ ] At least 4 tools callable by the LLM (`list_services`, `get_service`, `list_entities`, `get_entity`)
- [ ] RAG chunks injected into system prompt when embedding is configured
- [ ] AI env vars absent → graceful reply, no 500
- [ ] Chat panel renders on every page (wired into AppShell)
- [ ] Collapsed state (48px) does not obscure main content
- [ ] Expanded state reflows main content correctly
- [ ] Session ID persisted in localStorage; conversation continues after page reload
- [ ] Resize drag works and persists
- [ ] `npm run typecheck` passes with zero errors (backend)
- [ ] `npm run build` passes with zero errors (frontend)
- [ ] `npm run lint` passes with zero errors (frontend)

---

## COMPLETION CHECKLIST

- [ ] Task 1: `AI_CHAT_MODEL` added to env validation
- [ ] Task 2: `AiChatService` created with RAG + tool dispatch loop
- [ ] Task 3: `ChatDto` created
- [ ] Task 4: `AiController` created
- [ ] Task 5: `AiModule` created
- [ ] Task 6: `AiModule` registered in `AppModule`
- [ ] Task 7: `.env.example` updated
- [ ] Task 8: `frontend/src/types/ai.ts` created
- [ ] Task 9: `aiApi` added to `client.ts`
- [ ] Task 10: `ChatPanel` component created
- [ ] Task 11: `AppShell` updated to include `ChatPanel`
- [ ] All validation commands pass
- [ ] Manual smoke tests pass

---

## NOTES

### Tool Dispatch Loop Pattern

The OpenAI tool-use protocol requires a multi-turn exchange *within a single user request*:
1. Send messages + tool definitions → model may respond with `finish_reason: "tool_calls"`
2. Execute each tool call, collect results
3. Append `{ role: "assistant", tool_calls: [...] }` and one `{ role: "tool", tool_call_id, content }` per result
4. Re-send to LLM → repeat until `finish_reason: "stop"`

Cap the loop at 5 iterations to prevent infinite loops from a misbehaving model.

Only the final user turn and final assistant reply are appended to `session.messages`. The intermediate tool call/result messages are ephemeral within the request — do NOT persist them to the session.

### Session Storage Design

`AiSession.messages` stores the conversation history as an array of `{ role, content }` objects. Each `chat()` call appends exactly two items: the user message and the final assistant reply. This keeps session storage lean and avoids storing tool call metadata.

### Graceful Degradation

If `AI_BASE_URL`, `AI_API_KEY`, or `AI_CHAT_MODEL` are absent, `AiChatService.chat()` should return `{ sessionId: <new uuid>, reply: "AI assistant is not configured." }` without throwing. The panel remains visible but shows the message — it should never make the app crash.

### Confidence Score

**8/10** — All infrastructure exists (DB, embedding pipeline, repos, module pattern). The main complexity is the tool dispatch loop and wiring 8 tool methods correctly. The frontend panel resize logic is moderately complex but self-contained. Risks: TypeORM entity name clash (`Entity` vs `@Entity()`), pgvector raw SQL syntax, and the multi-turn tool loop protocol — all documented above.
