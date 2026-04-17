# Feature: Implement Agentic `query(..., { mode: "synthesize" })` with Wiki Tool Usage

The following plan should be complete, but it is important that you validate documentation, codebase patterns, and task sanity before you start implementing.

Pay special attention to tenant scoping, backward compatibility of the `LLMAdapter`, the existing thin-client/query-module split, and the fact that the user explicitly wants the model to decide when to fetch wiki data through tool usage. Do not collapse this into a single prompt-based summarize step.

## Feature Description

Implement `client.query(text, { mode: "synthesize" })` as an agentic read path where the LLM can decide when and how to fetch wiki data using read-only tools. The library should expose internal wiki tools such as search, list, and page fetch to the model, execute requested tool calls inside a bounded loop, and return a grounded natural-language `answer` together with the supporting `pages` and `evidence`.

This closes the remaining Phase 3 PRD gap while preserving the existing deterministic `"pages-only"` mode as a retrieval-only path.

## User Story

As a developer
I want `query(..., { mode: "synthesize" })` to let the model fetch wiki data through tool usage
So that I can build grounded Q&A behavior where the model decides when to search, browse, and inspect pages without extra orchestration

## Problem Statement

The PRD requires `query()` synthesis support, but the current implementation explicitly rejects `mode: "synthesize"` in `src/query.ts`. The current `LLMAdapter` only supports `complete(prompt: string)`, which is enough for ingest-time JSON generation but not enough for a tool-calling query loop where the model can decide when to use wiki retrieval functions. If synthesis is added as a single prompt over pre-fetched pages, the library will not satisfy the user’s stated requirement that the AI fetch wikis through tool usage.

## Solution Statement

Extend the query stack with an additive, backward-compatible tool-capable LLM interface and an internal bounded agent loop for synthesize mode. The loop should expose a small read-only wiki tool surface to the model:

- `wiki_search`
- `wiki_list_pages`
- `wiki_get_page`

The model decides which tool to call and in what order. The library executes those calls with the same tenant and metadata scoping rules already used by the read path, feeds structured tool results back into the model, and continues until the model returns a final answer or the loop hits a hard step limit.

The `"pages-only"` path remains deterministic and unchanged in behavior. The `"synthesize"` path becomes the only agentic mode. Existing adapters that only implement `complete(prompt)` remain valid for ingest, but synthesize mode should fail clearly unless the adapter also implements the new tool-capable method.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High
**Primary Systems Affected**: `src/llm.ts`, `src/query.ts`, `src/prompts.ts`, `src/index.ts`, `tests/integration/query.test.ts`
**Dependencies**: existing `typeorm`, `pg`, `reflect-metadata`, `jest`, `ts-jest`; external LLM providers that support tool calling through developer-supplied adapters

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `PRD.md` (lines 111-121)
  - Why: Defines the user story for `query()` and explicitly calls out synthesize mode.

- `PRD.md` (lines 213-218)
  - Why: Defines `query()` behavior, including synthesized answers and grounded pages/evidence.

- `PRD.md` (lines 335-346)
  - Why: Defines the public `Client.query()` signature and exact `QueryResult` shape.

- `PRD.md` (lines 430-440)
  - Why: Confirms synthesize mode is part of Phase 3, not a future enhancement.

- `src/llm.ts` (lines 1-8)
  - Why: Current adapter only supports prompt-in/text-out plus embeddings; this is the main interface gap for tool calling.

- `src/types.ts` (lines 3-15)
  - Why: `ClientConfig` currently stores `llm: LLMAdapter`; any adapter expansion must stay compatible with this config surface.

- `src/types.ts` (lines 39-43)
  - Why: `QueryResult` shape must remain `{ answer?, pages, evidence }`.

- `src/client.ts` (lines 69-82)
  - Why: `Client.query()` is already a thin delegator; preserve this pattern instead of moving orchestration into the client class.

- `src/query.ts` (lines 18-22)
  - Why: `QueryContext` is the right place to reach `ctx.config.llm` and existing DB state.

- `src/query.ts` (lines 60-80)
  - Why: Tenant resolution and page tenant scoping already exist and must be reused by tool implementations.

- `src/query.ts` (lines 90-176)
  - Why: Metadata filter semantics already exist and must be reused by any search/list tool.

- `src/query.ts` (lines 252-335)
  - Why: `getPage()` already returns detailed page/evidence shape and should inform `wiki_get_page`.

- `src/query.ts` (lines 338-409)
  - Why: Current pages-only `query()` implementation can be reused or refactored into a helper for `wiki_search`.

- `src/prompts.ts` (lines 24-67)
  - Why: Prompt-building/parsing currently lives here. New synthesize instructions should follow this pattern instead of inlining large prompt strings in `src/query.ts`.

- `src/index.ts` (lines 1-12)
  - Why: New public adapter/tool-call types should be exported here if added to `src/llm.ts`.

- `tests/integration/query.test.ts` (lines 13-47)
  - Why: Existing mock adapter pattern should be extended for tool-capable synthesize tests.

- `tests/integration/query.test.ts` (lines 395-530)
  - Why: Existing query integration coverage should be extended in-place rather than split into a separate query test file.

- `tests/integration/ingest.test.ts` (lines 8-61)
  - Why: Existing adapter mocks only implement `complete()`, which confirms backward-compatibility matters for ingest.

- `package.json` (lines 7-10)
  - Why: Defines the build and integration test commands that must be used for validation.

- `jest.config.js` (lines 1-7)
  - Why: Confirms test execution environment and single-worker integration model.

### Files to Update

- `src/llm.ts` - add tool-capable adapter types and backward-compatible optional method(s)
- `src/query.ts` - add synthesize-mode runtime, internal wiki tool execution, and result aggregation
- `src/prompts.ts` - add synthesize/tool-use instructions and any small prompt helpers
- `src/index.ts` - export any new public adapter/tool types
- `tests/integration/query.test.ts` - add synthesize-mode integration coverage using tool-capable mocks

### New Files to Create

- `src/query-agent.ts` - bounded tool-calling loop and query-time tool/result types

Why create this file:
- The current `src/query.ts` already contains deterministic retrieval logic.
- The synthesize path introduces a distinct orchestration concern: tool schemas, tool execution loop, and answer assembly.
- Keeping the loop in its own file reduces the risk of making `src/query.ts` unreadable while preserving query-specific ownership near the read path.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [OpenAI Reasoning Guide](https://developers.openai.com/api/docs/guides/reasoning)
  - Specific section: “Keeping reasoning items in context”
  - Why: If an adapter is implemented on top of OpenAI Responses API, the model’s reasoning and tool-call items must be carried across tool turns for correctness and token efficiency.

- [OpenAI API Overview](https://developers.openai.com/api/reference/overview)
  - Specific sections: “Function calling”, “Responses API”
  - Why: Confirms the structured tool-calling mental model and response lifecycle for OpenAI-backed adapters.

- [Anthropic Tool Use Guide](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use)
  - Specific sections: “Specifying client tools”, “Best practices for tool definitions”, “Model responses with tools”
  - Why: Useful primary-source guidance for provider-agnostic tool design, especially schema detail, description quality, and compact result shaping.

- [Anthropic Define Tools Guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)
  - Specific sections: detailed tool descriptions, `input_schema`, `tool_choice`
  - Why: Reinforces the need for precise tool metadata and compact outputs if adapters target Anthropic-style tool use.

### Patterns to Follow

**Thin client methods delegate into query module**
```ts
const ctx: QueryContext<TTenant> = {
  dataSource: this.dataSource,
  schema: this.schema,
  config: this._config,
};
return query(ctx, text, opts);
```
Source: `src/client.ts:69-82`

**Tenant resolution and scoping helper reuse**
```ts
const tenantValue = resolveTenantValue(ctx.config, opts);
pageQuery = applyPageTenantScope(pageQuery, tenantValue);
```
Source: `src/query.ts:60-80`

**Metadata filters are centralized**
```ts
pageQuery = applyMetadataFilters(pageQuery, opts.filters);
```
Source: `src/query.ts:90-176`

**Evidence dedupe is map-based and deterministic**
```ts
const evidence = Array.from(
  new Map(
    evidenceRows.map((row) => [
      row.fragmentId,
      {
        fragmentId: row.fragmentId,
        text: row.text,
        sourceId: row.sourceId,
      },
    ])
  ).values()
);
```
Source: `src/query.ts:307-318`, `src/query.ts:393-404`

**Plain `Error` style**
- Existing code throws plain runtime errors with stable strings:
  - `Page not found: ${id}` in `src/query.ts:268-269`
  - `Invalid query text` in `src/query.ts:197-205`
  - `LLM returned invalid JSON` in `src/prompts.ts:49-56`

**Prompt utilities live in `src/prompts.ts`**
- Current code builds ingest prompts there instead of embedding them in ingest/query modules.
- Mirror that organization for synthesize instructions.

**Integration-test lifecycle pattern**
- Shared `beforeAll`, `beforeEach`, and DB cleanup are already established in `tests/integration/query.test.ts:50-97`.
- Extend that file rather than creating a second query integration suite.

**Naming Conventions**
- Query aliases stay short: `p`, `c`, `ce`, `sf`, `s`
- Public methods remain `camelCase`
- Tool names should be stable, explicit, and namespaced, for example:
  - `wiki_search`
  - `wiki_list_pages`
  - `wiki_get_page`

**Project-Specific Conventions**
- No `CLAUDE.md` file was found in the repo, so rely on observed code patterns only.

### Anti-Patterns to Avoid

- Do not fake tool use by stuffing tool instructions into `complete(prompt)` and parsing ad hoc prose.
- Do not make synthesize mode recursively call `client.query(..., { mode: "synthesize" })` from inside a tool; that will create infinite recursion.
- Do not expose write-path tools such as ingest/delete in the agent loop for this feature.
- Do not bypass tenant or metadata filters in any internal wiki tool.
- Do not return bloated tool payloads with every field from the DB; keep outputs compact and high-signal.
- Do not silently fall back from synthesize mode to pages-only mode if the adapter lacks tool support.

---

## IMPLEMENTATION PLAN

### Phase 1: Adapter Foundation

Define an additive tool-capable adapter contract that keeps ingest backward-compatible while enabling query-time agentic behavior.

**Tasks:**

- Add structured tool-calling request/response types to `src/llm.ts`
- Add an optional synthesize/tool-use method to `LLMAdapter`
- Export any public types from `src/index.ts`
- Keep `complete(prompt)` untouched for ingest

### Phase 2: Query Agent Runtime

Create a dedicated query-agent runtime that exposes read-only wiki tools to the model and executes a bounded tool loop.

**Tasks:**

- Create `src/query-agent.ts`
- Define wiki tool schemas and execution contracts
- Implement loop control, tool-call validation, and hard step limits
- Aggregate fetched pages/evidence across tool calls for the final `QueryResult`

### Phase 3: Query Integration

Integrate the query-agent runtime with synthesize mode while preserving the existing pages-only behavior.

**Tasks:**

- Refactor pages-only search into a reusable internal helper
- Wire `mode: "synthesize"` to the agent runtime
- Keep `mode: "pages-only"` behavior unchanged
- Add clear error behavior when synthesize mode is requested but unsupported by the adapter

### Phase 4: Testing & Validation

Extend the existing integration suite with tool-capable mocks and synthesize-mode scenarios.

**Tasks:**

- Add deterministic tool-loop mock adapter
- Add happy-path synthesize integration tests
- Add tenant/filter propagation tests
- Add error-path tests for unsupported adapters, loop limits, and malformed tool calls

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### UPDATE `src/llm.ts`

- **IMPLEMENT**: Add public types for query-time tool calling, for example:
  - tool definition type
  - tool call type
  - tool result message type
  - synthesize/agent request type
  - synthesize/agent response type
- **IMPLEMENT**: Extend `LLMAdapter` with an optional structured method for tool-capable query turns. Recommended direction:
  - keep `complete(prompt: string): Promise<string>` unchanged
  - add `respondWithTools?(request: LLMToolRequest): Promise<LLMToolResponse>`
- **PATTERN**: Keep the interface additive so existing ingest mocks in `tests/integration/ingest.test.ts:8-61` remain valid without changes
- **GOTCHA**: Do not replace `complete()` or make tool support mandatory at the type level; that would break ingest and existing tests
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `src/index.ts`

- **IMPLEMENT**: Export the new public tool-capable adapter types from `src/llm.ts`
- **PATTERN**: Mirror the current public export style in `src/index.ts:1-12`
- **GOTCHA**: Do not accidentally stop exporting `LLMAdapter` or `EmbeddingAdapter`
- **VALIDATE**: `npx tsc --noEmit`

### CREATE `src/query-agent.ts`

- **IMPLEMENT**: Add the bounded synthesize-mode agent loop in a dedicated file
- **IMPLEMENT**: Define a small internal runtime surface:
  - tool descriptors
  - loop state
  - accumulated pages/evidence
  - max-step guard
- **IMPLEMENT**: Export one main helper, for example:
  - `runSynthesizeQueryAgent(ctx, text, opts): Promise<QueryResult>`
- **PATTERN**: Keep this file query-specific and database-aware through `QueryContext<TTenant>`
- **GOTCHA**: Do not couple this runtime to any one provider SDK; it must work through `LLMAdapter`
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `src/prompts.ts`

- **ADD**: Query-time prompt helpers for synthesize mode, such as:
  - system instructions for grounded answering
  - explicit tool-usage guidance
  - answer constraints such as “do not invent facts outside retrieved wiki data”
- **PATTERN**: Mirror prompt construction style from `buildIngestPrompt()` in `src/prompts.ts:24-46`
- **GOTCHA**: Keep prompts focused on behavior and grounding; tool schemas themselves should live in typed code, not be hard-coded into a giant prompt string
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `src/query.ts` foundation

- **REFACTOR**: Extract the current pages-only search behavior from `query()` into a reusable internal helper, for example:
  - `runPagesOnlyQuery(ctx, text, opts): Promise<QueryResult>`
- **PATTERN**: Reuse:
  - `resolveTenantValue()` from `src/query.ts:60-67`
  - `applyPageTenantScope()` from `src/query.ts:69-80`
  - `applyMetadataFilters()` from `src/query.ts:90-176`
- **GOTCHA**: Keep pages-only output deterministic and unchanged for existing tests
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `src/query.ts` synthesize mode dispatch

- **IMPLEMENT**: Change `resolveQueryMode()` / `query()` so that:
  - `"pages-only"` keeps the current deterministic path
  - `"synthesize"` calls `runSynthesizeQueryAgent(...)`
- **IMPLEMENT**: If `ctx.config.llm.respondWithTools` is missing, throw a clear plain error such as:
  - `synthesize mode requires a tool-capable llm adapter`
- **PATTERN**: Preserve the current `QueryResult` output shape from `src/types.ts:39-43`
- **GOTCHA**: Do not silently degrade to prompt-only summarize behavior; the user explicitly requested tool-driven fetch behavior
- **VALIDATE**: `npx tsc --noEmit`

### ADD wiki tool definitions in `src/query-agent.ts`

- **IMPLEMENT**: Define these read-only tools:
  - `wiki_search`
  - `wiki_list_pages`
  - `wiki_get_page`
- **IMPLEMENT**: Use explicit JSON-schema-like input definitions compatible with provider adapters
- **RECOMMENDED**:
  - `wiki_search({ text, filters?, tenant? })`
  - `wiki_list_pages({ filters?, limit?, offset?, tenant? })`
  - `wiki_get_page({ id, tenant? })`
- **PATTERN**: Follow Anthropic guidance for precise tool descriptions and compact outputs
- **GOTCHA**: Tool input schemas must match the library’s actual tenant/filter semantics; do not invent unsupported filter operators
- **VALIDATE**: `npx tsc --noEmit`

### ADD tool executors in `src/query-agent.ts`

- **IMPLEMENT**: Map each tool to internal query helpers:
  - `wiki_search` should call the extracted pages-only query helper
  - `wiki_list_pages` should call `listPages(...)`
  - `wiki_get_page` should call `getPage(...)`
- **IMPLEMENT**: Normalize tool outputs to compact, stable shapes
- **RECOMMENDED**:
  - `wiki_search` returns `pages` and `evidence`, not full page content
  - `wiki_get_page` returns `id`, `title`, `content`, `claims`, `evidence`
  - `wiki_list_pages` returns summaries only
- **GOTCHA**: `wiki_search` must avoid recursively triggering synthesize mode
- **GOTCHA**: Every tool must preserve tenant scope and filters from the user request unless the tool explicitly accepts narrower inputs
- **VALIDATE**: `npx tsc --noEmit`

### ADD agent loop control in `src/query-agent.ts`

- **IMPLEMENT**: Execute model turns until:
  - the adapter returns a final answer
  - the adapter returns no tool calls and no final answer
  - the loop hits a hard step limit
- **IMPLEMENT**: Add a small fixed max, recommended `MAX_QUERY_TOOL_STEPS = 6`
- **IMPLEMENT**: Throw clear plain errors for:
  - unknown tool names
  - malformed tool arguments
  - exceeding max tool steps
  - synthesize adapter responses that contain neither tool calls nor final text
- **PATTERN**: Match current plain-error style in `src/query.ts` and `src/prompts.ts`
- **GOTCHA**: Do not let the model call tools indefinitely
- **VALIDATE**: `npx tsc --noEmit`

### ADD result aggregation in `src/query-agent.ts`

- **IMPLEMENT**: Accumulate pages and evidence returned by tool executions across the loop
- **IMPLEMENT**: Deduplicate:
  - pages by `id`
  - evidence by `fragmentId`
- **IMPLEMENT**: Return:
  - `answer` from the model’s final answer
  - `pages` from all fetched/search results, preserving first-seen order or deterministic relevance order where possible
  - `evidence` from all fetched/search results
- **PATTERN**: Mirror evidence dedupe from `src/query.ts:307-318` and `src/query.ts:393-404`
- **GOTCHA**: If the model only uses `wiki_get_page`, you still need to populate `QueryResult.pages` with excerpted page summaries for the final response
- **VALIDATE**: `npx tsc --noEmit`

### UPDATE `tests/integration/query.test.ts` mock adapters

- **IMPLEMENT**: Add one or more tool-capable mock adapters that implement the new optional `respondWithTools` method
- **IMPLEMENT**: Keep the existing `complete()` behavior intact so ingest-related setup still works
- **PATTERN**: Mirror the compact deterministic mock style from `tests/integration/query.test.ts:13-47`
- **GOTCHA**: The same client instance is used for ingesting seed pages and querying them, so the mock adapter must support both ingest-time `complete()` and synthesize-time tool responses
- **VALIDATE**: `npx tsc --noEmit`

### ADD `synthesize mode answers by using wiki_search then wiki_get_page` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. ingest a searchable page
  2. use a tool-capable mock adapter that first requests `wiki_search`
  3. after receiving search results, requests `wiki_get_page`
  4. then returns a final answer
  5. assert `result.answer` is present
  6. assert `result.pages` includes the fetched page
  7. assert `result.evidence` includes grounded evidence
- **GOTCHA**: This test must prove the model used tools, not just that the final answer exists
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD `synthesize mode preserves tenant scope` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. create a tenant-aware client
  2. ingest one page under tenant `a`
  3. ingest another page under tenant `b`
  4. run synthesize mode under tenant `a`
  5. assert tool results and final answer only reference tenant `a` data
- **PATTERN**: Mirror tenant-client setup from `tests/integration/query.test.ts:292-357` and `tests/integration/query.test.ts:466-497`
- **GOTCHA**: The tool executor must not lose tenant context when dispatching tool calls
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD `synthesize mode preserves metadata filters` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. ingest at least two pages with shared searchable terms
  2. update page metadata directly as current tests do
  3. run synthesize mode with `filters: { project: 'billing' }`
  4. assert the answer/pages/evidence only reflect the billing page
- **PATTERN**: Reuse `updatePageMetadata(...)` from `tests/integration/query.test.ts:534-542`
- **GOTCHA**: Search text must match both pages so that metadata scoping is actually tested
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD `synthesize mode fails clearly without tool-capable adapter` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. ingest a page using the existing simple mock adapter
  2. call `client.query(..., { mode: 'synthesize' })`
  3. assert it rejects with the explicit adapter-support error
- **RATIONALE**: This locks in backward compatibility for ingest while making synthesize requirements explicit
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD `synthesize mode fails on excessive tool steps` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. use a mock adapter that repeatedly requests a tool and never returns a final answer
  2. call synthesize mode
  3. assert the loop-limit error is thrown
- **GOTCHA**: This protects against infinite loops and runaway provider bills
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### ADD `synthesize mode rejects malformed tool calls` test in `tests/integration/query.test.ts`

- **IMPLEMENT**:
  1. use a mock adapter that returns an unknown tool name or invalid args
  2. assert the library throws a stable plain error
- **RATIONALE**: Adapter output is untrusted at runtime and must be validated
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

### UPDATE `tests/integration/query.test.ts` existing unsupported synthesize test

- **REPLACE**: The current test that asserts `synthesize mode not implemented` should be removed or rewritten
- **IMPLEMENT**: Replace it with:
  - unsupported-adapter error test
  - real synthesize-mode happy-path test
- **PATTERN**: Existing unsupported-mode test lives at `tests/integration/query.test.ts:518-530`
- **GOTCHA**: Do not leave stale assertions that contradict the new feature
- **VALIDATE**: `DATABASE_URL=postgresql:///pgwiki_test npm run test:integration -- --runTestsByPath tests/integration/query.test.ts`

---

## TESTING STRATEGY

Use real-Postgres integration tests as the primary validation layer. This feature is not just prompt formatting; it is a runtime interaction among DB retrieval, tenant scoping, metadata filters, tool schemas, and a bounded model loop. Integration tests are the right default in this repo.

### Unit Tests

No separate unit-test layer is required for the first pass. The existing repo leans integration-first. Small helpers in `src/query-agent.ts` can remain untested in isolation unless they become unusually complex.

### Integration Tests

Extend `tests/integration/query.test.ts` to verify:

- synthesize mode uses tool calls rather than a one-shot summarize prompt
- synthesize mode can search then fetch full page content before answering
- final `answer` is returned together with grounded `pages` and `evidence`
- tenant scoping is preserved across tool executions
- metadata filters are preserved across tool executions
- adapters without tool support fail clearly
- malformed tool calls fail clearly
- loop limits prevent infinite execution
- pages-only mode remains unchanged

### Edge Cases

- adapter supports `complete()` but not synthesize tool calls
- model requests an unknown tool name
- model returns invalid or missing tool arguments
- model never produces a final answer
- model calls `wiki_get_page` directly without `wiki_search`
- no relevant pages exist for the question
- tenant-aware clients do not leak cross-tenant tool results
- metadata filters narrow tool results consistently
- evidence is deduplicated when both `wiki_search` and `wiki_get_page` surface the same fragments

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
ls dist/query-agent.js
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

1. Create a local mock adapter that:
   - ingests with `complete()`
   - synthesizes with `respondWithTools()`
2. Ingest two pages, one relevant and one distractor
3. Run `client.query("What does TypeScript add to JavaScript?", { mode: "synthesize" })`
4. Confirm:
   - the adapter requested wiki tools
   - the answer is grounded in fetched wiki content
   - returned `pages` and `evidence` match the fetched wiki records

---

## ACCEPTANCE CRITERIA

- [ ] `query(..., { mode: "synthesize" })` returns a grounded `answer`
- [ ] The model can decide when and how to fetch wiki data through read-only tool calls
- [ ] `"pages-only"` mode behavior remains unchanged
- [ ] Existing ingest adapters that only implement `complete()` remain valid
- [ ] Synthesizing with a non-tool-capable adapter fails with a clear plain error
- [ ] Tenant scoping is preserved across all tool executions
- [ ] Metadata filters are preserved across all tool executions
- [ ] Tool loops are bounded and fail safely on runaway execution
- [ ] Final `QueryResult` always matches `{ answer?, pages, evidence }`
- [ ] All validation commands pass with zero errors

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full integration suite passes
- [ ] No type-check or build errors remain
- [ ] Manual synthesize flow confirms real tool-driven wiki fetching
- [ ] Acceptance criteria all met
- [ ] Code reviewed for maintainability and provider-agnostic design

---

## NOTES

- Design choice: add an optional tool-capable query method to `LLMAdapter` instead of replacing `complete()`. This preserves ingest behavior and avoids a broad breaking change.
- Design choice: implement the tool loop in a new `src/query-agent.ts` file instead of embedding it fully inside `src/query.ts`. The retrieval path and the agent loop are different concerns.
- Design choice: keep tool surface read-only and intentionally small. This matches the user request and keeps safety manageable.
- Design choice: do not add embedding-based retrieval in this task. The PRD treats embeddings as optional, and the user’s request is specifically about autonomous wiki fetching through tools.
- Open question for implementation: whether to expose the new tool-capable adapter method as a generic provider-neutral message protocol or a simpler library-specific request/response shape. Recommended answer: choose the simpler library-specific shape first, because this repo currently favors compact custom interfaces over abstract protocol stacks.

**Confidence Score**: 8/10 that one-pass implementation will succeed with this plan
