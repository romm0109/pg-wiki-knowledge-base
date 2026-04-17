# Feature: AI Panel Tool Call Visibility

The following plan should be complete, but validate documentation and codebase patterns before implementing.

Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Surface which tools the AI assistant invoked during a response turn directly in the chat panel UI. When the LLM calls one or more tools to answer a question (e.g. `list_playgrounds`, `get_service`), the user sees a compact, collapsible list of those tool names rendered above the assistant's reply bubble. The latest response starts expanded; all previous tool call sections remain collapsed.

## User Story

As an engineer using the catalog AI assistant,
I want to see which tools the AI used to answer my question,
So that I can understand how the assistant retrieved its information and trust the response.

## Problem Statement

The AI assistant's tool dispatch loop is completely opaque — the user has no visibility into whether the LLM queried the live catalog, which tools it called, or how many round-trips occurred. This reduces trust and debuggability.

## Solution Statement

- **Backend**: Accumulate tool names during the dispatch loop in `AiChatService.chat()` and return them as `toolCalls: string[]` alongside the existing `{ sessionId, reply }` response. No schema or migration changes needed.
- **Frontend**: Extend `ChatMessage` with `toolCalls?: string[]` and `toolCallsOpen?: boolean`. When an assistant message arrives with tool calls, set `toolCallsOpen: true`. Render a collapsible section above the assistant bubble showing raw tool names. Toggle via `setMessages` mutation so collapse state is per-message and independent.

## Feature Metadata

**Feature Type**: Enhancement  
**Estimated Complexity**: Low  
**Primary Systems Affected**: `backend/src/ai/ai-chat.service.ts`, `frontend/src/types/ai.ts`, `frontend/src/components/ai/ChatPanel.tsx`  
**Dependencies**: None new — uses existing patterns throughout

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ THESE BEFORE IMPLEMENTING

- `backend/src/ai/ai-chat.service.ts` (lines 78–171) — The `chat()` method. The tool dispatch loop is at lines 132–158. Tool names are available via `tc.function.name` inside the `for (const tc of toolCalls)` block. The return statement is at line 170: `return { sessionId: session.id, reply }` — this is where `toolCalls` is added.
- `frontend/src/types/ai.ts` (lines 1–14) — Current `ChatMessage`, `ChatRequest`, `ChatResponse` types. `ChatMessage` gets two new optional fields; `ChatResponse` gets one new required field.
- `frontend/src/components/ai/ChatPanel.tsx` (lines 106–351) — Full chat panel. Key areas:
  - State declarations: lines 107–120
  - `handleSubmit`: lines 145–165 — where assistant message is created and appended; this is where `toolCallsOpen: true` is set
  - Message render loop: lines 281–296 — where the tool call section is inserted above the assistant bubble
- `frontend/src/api/client.ts` (lines 194–197) — `aiApi.chat()` — already typed as `ChatResponse`; no change needed here beyond updating the `ChatResponse` type

### New Files to Create

None — all changes are modifications to existing files.

### Patterns to Follow

**Mutating a single message in state** (for toggle):
```typescript
// Pattern: update one item in a messages array immutably
setMessages(prev =>
  prev.map((m, i) => (i === idx ? { ...m, toolCallsOpen: !m.toolCallsOpen } : m))
);
```

**Creating assistant message with tool calls open** (in `handleSubmit`):
```typescript
setMessages(prev => [
  ...prev,
  {
    role: 'assistant' as const,
    content: res.reply,
    toolCalls: res.toolCalls,        // string[] from response
    toolCallsOpen: (res.toolCalls?.length ?? 0) > 0,  // start expanded if tools fired
  },
]);
```

**Tool call section render** (inserted between user bubble detection and assistant bubble, inside the `messages.map` block):
```tsx
{msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
  <div className="...">
    <button onClick={() => toggleToolCalls(idx)}>
      ⚙ {msg.toolCalls.length} {msg.toolCalls.length === 1 ? 'tool' : 'tools'}  {chevron}
    </button>
    {msg.toolCallsOpen && (
      <ul>
        {msg.toolCalls.map(name => <li key={name}>{name}</li>)}
      </ul>
    )}
  </div>
)}
```

**Styling conventions** — follow existing dark palette from `ChatPanel.tsx`:
- Container: `bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 mb-1 text-xs text-slate-400`
- Toggle button: `flex items-center gap-1.5 w-full text-start hover:text-slate-300 transition-colors`
- Tool name list item: `py-0.5 ps-4 font-mono text-slate-400`
- Chevron: inline SVG `w-3 h-3`, rotated 90° when expanded via `className={msg.toolCallsOpen ? 'rotate-90' : ''} transition-transform`

---

## IMPLEMENTATION PLAN

### Phase 1: Backend — expose tool calls in response

Collect tool names during dispatch loop and return them.

### Phase 2: Frontend types — extend ChatMessage and ChatResponse

Add `toolCalls` and `toolCallsOpen` fields.

### Phase 3: Frontend ChatPanel — render and toggle

Add `toggleToolCalls` handler and insert tool call section into the message render loop.

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE `backend/src/ai/ai-chat.service.ts`

- **ADD** `const usedTools: string[] = [];` immediately before the `// Initial LLM call` comment (line 129)
- **ADD** inside the tool dispatch loop's `for (const tc of toolCalls)` block (after line 141, before `let toolResult`): `usedTools.push(tc.function.name);`
- **UPDATE** the return statement at line 170 from:
  ```typescript
  return { sessionId: session.id, reply };
  ```
  to:
  ```typescript
  return { sessionId: session.id, reply, toolCalls: usedTools };
  ```
- **UPDATE** the early-return for unconfigured AI (line 83) to also include `toolCalls: []`:
  ```typescript
  return { sessionId: session.id, reply: 'AI assistant is not configured.', toolCalls: [] };
  ```
- **UPDATE** the method signature return type from `Promise<{ sessionId: string; reply: string }>` to `Promise<{ sessionId: string; reply: string; toolCalls: string[] }>`
- **VALIDATE**: `cd backend && npm run typecheck`

---

### Task 2: UPDATE `frontend/src/types/ai.ts`

- **UPDATE** `ChatMessage` to add two optional fields:
  ```typescript
  export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    toolCalls?: string[];
    toolCallsOpen?: boolean;
  }
  ```
- **UPDATE** `ChatResponse` to add `toolCalls`:
  ```typescript
  export interface ChatResponse {
    sessionId: string;
    reply: string;
    toolCalls: string[];
  }
  ```
- **VALIDATE**: `cd frontend && npm run build 2>&1 | tail -10`

---

### Task 3: UPDATE `frontend/src/components/ai/ChatPanel.tsx`

#### 3a — Add `toggleToolCalls` handler

- **ADD** after the `handleKeyDown` callback (around line 175), a new callback:
  ```typescript
  const toggleToolCalls = useCallback((idx: number) => {
    setMessages(prev =>
      prev.map((m, i) => (i === idx ? { ...m, toolCallsOpen: !m.toolCallsOpen } : m))
    );
  }, []);
  ```

#### 3b — Update `handleSubmit` to carry tool calls onto the assistant message

- **UPDATE** the assistant message creation inside the `try` block of `handleSubmit` (currently line 156):
  ```typescript
  // BEFORE:
  setMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);

  // AFTER:
  setMessages(prev => [
    ...prev,
    {
      role: 'assistant' as const,
      content: res.reply,
      toolCalls: res.toolCalls,
      toolCallsOpen: (res.toolCalls?.length ?? 0) > 0,
    },
  ]);
  ```

#### 3c — Render tool call section in the message list

- **UPDATE** the `messages.map` render block (around lines 281–296). The current structure per message is a single `<div>` with the bubble. Wrap it so the tool call section renders **above** the bubble, inside the same outer `<div key={idx}>`:

  Replace the existing map body:
  ```tsx
  {messages.map((msg, idx) => (
    <div
      key={idx}
      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm break-words ${
        msg.role === 'user'
          ? 'bg-blue-600 text-white'
          : 'bg-slate-700 text-slate-100'
      }`}>
        <MessageContent content={msg.content} role={msg.role} />
      </div>
    </div>
  ))}
  ```

  With:
  ```tsx
  {messages.map((msg, idx) => (
    <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
      {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="max-w-[85%] mb-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-400">
          <button
            onClick={() => toggleToolCalls(idx)}
            className="flex items-center gap-1.5 w-full text-start hover:text-slate-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 transition-transform ${msg.toolCallsOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span>
              {msg.toolCalls.length === 1
                ? `1 tool: ${msg.toolCalls[0]}`
                : `${msg.toolCalls.length} tools`}
            </span>
          </button>
          {msg.toolCallsOpen && (
            <ul className="mt-1 space-y-0.5">
              {msg.toolCalls.map(name => (
                <li key={name} className="ps-4 font-mono text-slate-400">{name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm break-words ${
        msg.role === 'user'
          ? 'bg-blue-600 text-white'
          : 'bg-slate-700 text-slate-100'
      }`}>
        <MessageContent content={msg.content} role={msg.role} />
      </div>
    </div>
  ))}
  ```

- **GOTCHA**: The outer `<div>` changed from `flex` with `justify-end/start` to `flex-col` with `items-end/start`. This is equivalent for the bubble alignment but allows stacking the tool section above the bubble in the same column.
- **GOTCHA**: When `msg.toolCalls.length === 1`, the collapsed header shows `1 tool: list_playgrounds` inline (saves a click for the common single-tool case). When multiple tools, collapsed shows `3 tools` and expanded reveals the list.
- **VALIDATE**: `cd frontend && npm run build 2>&1 | tail -10`

---

## TESTING STRATEGY

### Unit Tests

No test framework configured. Skip.

### Manual Validation

1. Start backend: `cd backend && npm run start:dev`
2. Start frontend: `cd frontend && npm run dev`
3. Open `http://localhost:5173`, expand the AI panel
4. Ask: *"what playgrounds are there?"* → expect tool section above reply showing at least `list_playgrounds` or `search_playgrounds`, expanded
5. Send a second message: *"which teams exist?"* → new response tool section starts expanded; previous message's tool section remains collapsed
6. Click the chevron on the latest tool section → collapses
7. Click again → expands
8. Reload page → messages are gone (not persisted client-side), session continues server-side
9. Ask a question that requires no tools (e.g. *"hello"*) → no tool section rendered

### Edge Cases

- Response with `toolCalls: []` → no tool section rendered (the `msg.toolCalls.length > 0` guard handles this)
- Response where AI is unconfigured → `toolCalls: []` from backend, no section rendered
- Single tool fired → collapsed header shows `1 tool: <name>` inline
- Multiple tools fired → collapsed shows count, expanded shows full list

---

## VALIDATION COMMANDS

### Level 1: TypeScript

```bash
cd backend && npm run typecheck
```

```bash
cd frontend && npm run build 2>&1 | tail -10
```

### Level 2: Lint

```bash
cd frontend && npm run lint
```

### Level 3: Manual Smoke

```bash
# Confirm backend returns toolCalls in response
curl -s -X POST http://localhost:3001/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "list all playgrounds"}' | grep -o '"toolCalls":\[[^]]*\]'
# Expect: "toolCalls":["list_playgrounds"] or similar
```

---

## ACCEPTANCE CRITERIA

- [ ] `POST /ai/chat` response includes `toolCalls: string[]` on every call (empty array when no tools fired)
- [ ] Tool section renders above the assistant bubble when `toolCalls.length > 0`
- [ ] Tool section is absent when `toolCalls` is empty
- [ ] Single tool: collapsed header shows `1 tool: <raw_name>` inline
- [ ] Multiple tools: collapsed header shows count; expanded shows full list one per line
- [ ] Latest response starts expanded
- [ ] Toggling collapse/expand works per message independently
- [ ] Previous messages' tool sections remain at their current state (collapsed by default) when new response arrives
- [ ] `npm run typecheck` passes (backend)
- [ ] `npm run build` passes (frontend)
- [ ] `npm run lint` passes (frontend)

---

## COMPLETION CHECKLIST

- [ ] Task 1: `ai-chat.service.ts` updated — `usedTools` collected, returned in response
- [ ] Task 2: `types/ai.ts` updated — `ChatMessage` and `ChatResponse` extended
- [ ] Task 3a: `toggleToolCalls` callback added to `ChatPanel`
- [ ] Task 3b: `handleSubmit` passes `toolCalls` and `toolCallsOpen` onto assistant message
- [ ] Task 3c: Tool call section rendered in message list
- [ ] All validation commands pass

---

## NOTES

### Why `toolCallsOpen` lives on the message object

The toggle state is per-message and must survive re-renders without a separate `Map<index, boolean>` in component state. Attaching it directly to the `ChatMessage` object (a UI-only field) keeps the toggle logic to a single `setMessages` map — no additional state needed.

### Why the latest message starts expanded

The user just asked a question and wants immediate feedback on what the AI did. Previous messages are historical context — they've already been read; collapsing them reduces clutter.

### Single-tool inline display

When exactly one tool fired, showing `1 tool: list_playgrounds` in the collapsed header avoids a gratuitous expand click for the most common case. The user can still collapse it.

### Confidence Score

**9/10** — Three small, isolated changes with no new dependencies. The only risk is the JSX restructure in the message map (changing `flex justify-end/start` to `flex-col items-end/start`) — easy to verify visually in a few seconds.
