# Feature: search_doc — Single-Document Full-Text AI Tool

The following plan should be complete, but validate codebase patterns and task sanity before implementing.

Pay special attention to the existing tool patterns, switch cases, UUID regex, and system prompt wording style.

## Feature Description

Add a new AI tool `search_doc(doc_id_or_name, query)` to the chat assistant. Unlike `search_docs` which performs vector similarity search across all document chunks, this tool retrieves the **full extracted text** of a single document and returns it directly to the LLM. The LLM reads the entire document and answers the user's question from it — no embedding, no chunking, no pgvector. The result is higher precision when the user is asking about a specific known document.

## User Story

As an engineer using the AI assistant,
I want to ask questions about a specific document by name or ID,
So that I get precise answers drawn from the full content of that document, not just the closest chunks.

## Problem Statement

`search_docs` chunks documents and retrieves only the top-K most similar chunks. If the relevant answer spans chunks or the relevant chunk ranked low, the answer is incomplete or wrong. When the user already knows which document they want to interrogate, chunk retrieval adds noise and boundary artifacts.

## Solution Statement

Add a `search_doc` tool that resolves a document by UUID or partial title match, fetches its `extracted_text` column from Postgres, and returns the full text as the tool result. The LLM receives the complete document and produces a precise answer.

## Feature Metadata

**Feature Type**: New Capability (additive tool)
**Estimated Complexity**: Low
**Primary Systems Affected**: `AiChatService` (backend only)
**Dependencies**: None — uses `docsRepo` already injected, `Doc.extractedText` already stored

---

## CONTEXT REFERENCES

### Relevant Codebase Files — MUST READ BEFORE IMPLEMENTING

- `backend/src/ai/ai-chat.service.ts` (lines 226–259) — `dispatchTool` switch: pattern for adding a new case
- `backend/src/ai/ai-chat.service.ts` (lines 445–485) — `toolSearchDocs`: closest existing method, shows the return shape to mirror (`docId`, `docTitle`, `excerpt`)
- `backend/src/ai/ai-chat.service.ts` (lines 262–307) — `toolGetService`: shows UUID-first then ILIKE fallback pattern — **mirror this exactly**
- `backend/src/ai/ai-chat.service.ts` (lines 688–887) — `buildToolDefs`: where to append the new tool definition
- `backend/src/ai/ai-chat.service.ts` (lines 651–686) — `buildSystemPrompt`: where to add the new guidance line
- `backend/src/docs/doc.entity.ts` (lines 53–54) — `extractedText: string | null` column — what we fetch
- `backend/src/docs/doc.entity.ts` (line 16) — `@Entity('docs')` — confirms table name
- `backend/src/ai/ai-chat.service.ts` (lines 74–75) — `docsRepo` already injected — no constructor changes needed

### New Files to Create

None.

### Patterns to Follow

**UUID detection (mirror from `toolGetService`, line 264):**
```ts
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

**ID-first, name-fallback resolution (mirror from `toolGetService`, lines 266–304):**
```ts
let doc = null;
if (uuidPattern.test(idOrName)) {
  doc = await this.docsRepo.findOne({ where: { id: idOrName } });
}
if (!doc) {
  doc = await this.docsRepo
    .createQueryBuilder('d')
    .where('d.title ILIKE :exact', { exact: idOrName })
    .orWhere('d.title ILIKE :partial', { partial: `%${idOrName}%` })
    .orderBy(`CASE WHEN d.title ILIKE :exact THEN 0 WHEN d.title ILIKE :prefix THEN 1 ELSE 2 END`, 'ASC')
    .addOrderBy('d.title', 'ASC')
    .setParameters({ exact: idOrName, prefix: `${idOrName}%`, partial: `%${idOrName}%` })
    .getOne();
}
```

**Return shape — JSON string (mirror from `toolSearchDocs`, lines 477–484):**
```ts
return JSON.stringify({ docId: doc.id, docTitle: doc.title, fullText: doc.extractedText });
```

**Not-found return (mirror from `toolGetService`, line 307):**
```ts
return JSON.stringify('not found');
```

**Tool def shape (mirror any existing entry in `buildToolDefs`):**
```ts
{
  type: 'function',
  function: {
    name: 'search_doc',
    description: '...',
    parameters: {
      type: 'object',
      properties: {
        doc_id_or_name: { type: 'string', description: '...' },
        query: { type: 'string', description: '...' },
      },
      required: ['doc_id_or_name', 'query'],
    },
  },
}
```

**System prompt line style (mirror existing lines in `buildSystemPrompt`, lines 665–671):**
Plain imperative sentence, no markdown inside the string.

---

## IMPLEMENTATION PLAN

### Phase 1: Core method

Add `private async toolSearchDoc(idOrName: string, query: string): Promise<string>` to `AiChatService`.

### Phase 2: Dispatch wiring

Add `case 'search_doc':` to the `dispatchTool` switch.

### Phase 3: Tool definition

Append the tool def object to the array returned by `buildToolDefs()`.

### Phase 4: System prompt guidance

Add one sentence to `buildSystemPrompt()` instructing the LLM when to prefer `search_doc` over `search_docs`.

---

## STEP-BY-STEP TASKS

### Task 1 — ADD `toolSearchDoc` method to `AiChatService`

**File:** `backend/src/ai/ai-chat.service.ts`

**Insert after:** the closing brace of `toolSearchDocs` (around line 485), before `formatService`.

**IMPLEMENT:**
```ts
private async toolSearchDoc(idOrName: string, query: string): Promise<string> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let doc = null;

  if (uuidPattern.test(idOrName)) {
    doc = await this.docsRepo.findOne({ where: { id: idOrName } });
  }

  if (!doc) {
    doc = await this.docsRepo
      .createQueryBuilder('d')
      .where('d.title ILIKE :exact', { exact: idOrName })
      .orWhere('d.title ILIKE :partial', { partial: `%${idOrName}%` })
      .orderBy(
        `CASE
          WHEN d.title ILIKE :exact THEN 0
          WHEN d.title ILIKE :prefix THEN 1
          ELSE 2
        END`,
        'ASC',
      )
      .addOrderBy('d.title', 'ASC')
      .setParameters({ exact: idOrName, prefix: `${idOrName}%`, partial: `%${idOrName}%` })
      .getOne();
  }

  if (!doc) {
    return JSON.stringify('not found');
  }

  if (!doc.extractedText) {
    return JSON.stringify({ error: 'Document has no extracted text.' });
  }

  return JSON.stringify({
    docId: doc.id,
    docTitle: doc.title,
    fullText: doc.extractedText,
  });
}
```

**PATTERN:** UUID-first + ILIKE fallback from `toolGetService` lines 264–307
**IMPORTS:** None needed — `docsRepo` and `Doc` already imported and injected
**GOTCHA:** `doc.extractedText` is nullable — handle the null case explicitly before returning, otherwise JSON.stringify returns `null` and the LLM gets confused
**GOTCHA:** Do NOT use `SELECT *` — TypeORM's `findOne` and `createQueryBuilder` on `docsRepo` will select all columns including `extractedText` by default. The only column excluded by default is `search_vector` (has `select: false` in the entity). This is correct behavior.
**VALIDATE:** `cd backend && npx tsc --noEmit`

---

### Task 2 — ADD `case 'search_doc'` to `dispatchTool`

**File:** `backend/src/ai/ai-chat.service.ts`

**Location:** Inside the `switch (name)` block in `dispatchTool` (around line 254), before the `default:` case.

**IMPLEMENT:**
```ts
case 'search_doc':
  return this.toolSearchDoc(args['doc_id_or_name'] ?? '', args['query'] ?? '');
```

**PATTERN:** Mirror every other `case` in the switch (lines 235–258)
**GOTCHA:** Argument key must exactly match the parameter name in the tool def: `doc_id_or_name` — not `doc_id`, not `name`
**VALIDATE:** `cd backend && npx tsc --noEmit`

---

### Task 3 — ADD tool definition to `buildToolDefs`

**File:** `backend/src/ai/ai-chat.service.ts`

**Location:** Append to the array returned by `buildToolDefs()`, after the `search_docs` entry and before the closing `]`.

**IMPLEMENT:**
```ts
{
  type: 'function',
  function: {
    name: 'search_doc',
    description: `Read the full content of a single document and answer a question from it.
Use this tool when the user asks a question about a specific, named document (e.g. "in the Kafka runbook, what does it say about retries?").
Unlike search_docs which searches across all documents by chunk similarity, this tool returns the entire document text so you can answer precisely.
The doc_id_or_name parameter accepts either the document UUID or a case-insensitive partial title match.`,
    parameters: {
      type: 'object',
      properties: {
        doc_id_or_name: {
          type: 'string',
          description: 'The document UUID or a partial case-insensitive title to identify the document.',
        },
        query: {
          type: 'string',
          description: 'The question to answer from the document content.',
        },
      },
      required: ['doc_id_or_name', 'query'],
    },
  },
},
```

**PATTERN:** Mirror `search_docs` tool def entry (lines 862–886)
**GOTCHA:** `query` is listed as `required` even though the backend ignores it — the LLM uses it to know what to look for in the full text. Keep it required so the LLM is forced to be explicit.
**VALIDATE:** `cd backend && npx tsc --noEmit`

---

### Task 4 — ADD system prompt guidance line to `buildSystemPrompt`

**File:** `backend/src/ai/ai-chat.service.ts`

**Location:** Inside `buildSystemPrompt`, after the existing `search_docs` guidance line (line 671), before the blank line that precedes the formatting rules.

**IMPLEMENT:** Add this line:
```
When the user asks a question specifically about a named document, use search_doc — it returns the full document text so you can answer precisely without relying on chunk retrieval.
```

**PATTERN:** Mirror the style of the existing guidance lines (lines 665–671) — plain imperative English, no markdown
**VALIDATE:** `cd backend && npx tsc --noEmit`

---

## TESTING STRATEGY

### Manual Validation

No automated tests exist for `AiChatService` in this project (no test files found). Validate manually:

1. Start backend: `cd backend && npm run start:dev`
2. In the AI chat panel, ask: `"In the [title of an uploaded doc], what does it say about X?"`
3. Confirm the tool call shows `search_doc` in the tool calls section of the chat UI
4. Confirm the answer is accurate and drawn from document content
5. Test with a non-existent doc name — confirm the LLM reports it was not found gracefully
6. Test with a valid doc UUID directly — confirm it resolves correctly

### Edge Cases

- Doc exists but `extractedText` is null → returns `{ error: 'Document has no extracted text.' }` — LLM should report this to the user
- Doc name partial match returns multiple candidates — `ORDER BY` prioritizes exact match then prefix match then partial, same as `get_service`
- UUID passed that doesn't exist → falls through to ILIKE search, then returns 'not found'
- Empty `doc_id_or_name` → ILIKE query with empty string matches everything → returns first doc alphabetically. Acceptable — LLM should not call this with an empty string given the required constraint.

---

## VALIDATION COMMANDS

### Level 1: Type checking

```bash
cd backend && npx tsc --noEmit
```

### Level 2: Manual smoke test

```bash
cd backend && npm run start:dev
# Then interact via the chat panel in the running frontend
```

---

## ACCEPTANCE CRITERIA

- [ ] `search_doc` tool appears in the LLM tool dispatch loop
- [ ] Resolves document by UUID (exact match)
- [ ] Resolves document by partial title (ILIKE, priority-ordered)
- [ ] Returns full `extractedText` in the tool result
- [ ] Returns `'not found'` when no document matches
- [ ] Returns `{ error: '...' }` when doc has no extracted text
- [ ] TypeScript compiles with zero errors
- [ ] `search_docs` behavior is completely unchanged
- [ ] No frontend changes required

---

## COMPLETION CHECKLIST

- [ ] Task 1 completed — `toolSearchDoc` method added
- [ ] Task 2 completed — `dispatchTool` case added
- [ ] Task 3 completed — tool def added to `buildToolDefs`
- [ ] Task 4 completed — system prompt line added
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Manual test confirms correct document resolution and answer quality
- [ ] `search_docs` still works as before

---

## NOTES

- **No DB migration needed** — `docs.extracted_text` already stored by the document processing pipeline
- **No frontend changes needed** — `ChatPanel` renders any tool name generically
- **No new imports needed** — `docsRepo` and `Doc` are already imported and injected in `AiChatService`
- **Token budget:** Very large documents could push the LLM context limit. Not addressed in this plan — if it becomes a problem, a future enhancement could truncate to a character limit (e.g. 40,000 chars). For now, the approach prioritizes accuracy over token economy.
- **`search_docs` is unchanged** — it remains the right tool for broad cross-document discovery. `search_doc` is for precision on a known target.
