# Feature: Entities Search and Team Filters

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files, preserve the current entities graph/page structure, and do not invent a second filtering pattern when the repo already has floating filter panels and grouped axios resource APIs.

## Feature Description

Add search and team-based filtering to the `/entities` graph so users can quickly narrow the entity canvas by English/Hebrew name, by internal consumer teams, and by external source teams.

This feature must work with the project’s simplified entity model:

- entity fields are `nameEn`, `nameHe`, optional `originalSourceTeamId`, connections, and internal team-source mappings
- internal-team filtering is based on `entity_team_sources.consumer_team_id`
- external-team filtering is based on `entity_team_sources.source_team_id`
- an external-team filter only shows entities that have at least one real internal consumer using that entity from the selected external team

The graph response must be filtered server-side so the feature scales beyond the current tiny local dataset.

## User Story

As a data engineer
I want to search entities by English or Hebrew name and filter them by internal or external team usage
So that I can isolate the subset of the entity graph relevant to a specific team or source relationship

## Problem Statement

The current `/entities` page always loads the full graph and has no search or team filters. Even though the backend already stores internal consumer-team mappings and source-team mappings via `entity_team_sources`, the UI cannot answer common questions like:

- "show me the entities used by Billing"
- "show me the entities that come from Stripe"
- "show me the entities matching this Hebrew name fragment"

Without server-backed filtering, the graph will become noisy and harder to use as the number of entities and flows grows.

## Solution Statement

Add a dedicated entities filter surface and extend `GET /entities/graph` with query params for search, internal-team filters, and external-team filters.

Recommended implementation approach:

- keep `/entities/graph` as the source of truth for the filtered graph
- add a graph-specific query DTO for `q`, `internalTeamIds`, and `externalTeamIds`
- use backend QueryBuilder joins over `entity_team_sources` so node filtering is database-driven
- only return edges whose endpoints remain visible after filtering
- mirror the existing floating filter panel pattern from the map page for the entities filter UI
- derive internal/external team lists from the existing `teamsApi.list()` response rather than adding new backend endpoints

Recommended combined-filter semantics:

- `q` matches `nameEn` and `nameHe`
- internal-team filters match `entity_team_sources.consumer_team_id`
- external-team filters match `entity_team_sources.source_team_id`
- when both internal and external filters are active, require a single `entity_team_sources` row to satisfy both filters together
  - this produces the most intuitive result for "show me entities that team A gets from external source B"
- `originalSourceTeamId` is display-only and must not drive the external-team filter

## Feature Metadata

**Feature Type**: Enhancement  
**Estimated Complexity**: Medium  
**Primary Systems Affected**: frontend entities graph UI, frontend API client/types, backend entities controller/service/query DTOs, PRD  
**Dependencies**: `@xyflow/react@12.10.2`, `axios@1.14.0`, `react-router-dom@6.30.3`, `@nestjs/common@11.1.18`, `class-validator@0.15.1`, `typeorm@0.3.28`

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `PRD.md` ([181](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/PRD.md#L181), [409](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/PRD.md#L409), [548](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/PRD.md#L548)) - Current entities product definition, schema, and API sections that must be updated to mention search and internal/external team filters.
- `CLAUDE.md` ([1](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/CLAUDE.md#L1)) - Project rule: never commit unless explicitly asked.
- `frontend/src/App.tsx` ([1](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/App.tsx#L1)) - Route registration; `/entities` already exists and should remain unchanged.
- `frontend/src/components/layout/TopNav.tsx` ([1](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/layout/TopNav.tsx#L1)) - Entities navigation is already exposed here; page behavior should stay aligned.
- `frontend/src/api/client.ts` ([67](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/api/client.ts#L67)) - Existing grouped axios API pattern; extend `entitiesApi.graph()` rather than creating a second entities client.
- `frontend/src/components/entities/EntityCanvas.tsx` ([36](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/entities/EntityCanvas.tsx#L36)) - Current graph fetch, node/edge state, and page-level overlay logic that must absorb the new filter state.
- `frontend/src/components/entities/EntityPanel.tsx` ([40](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/entities/EntityPanel.tsx#L40)) - Current side panel; useful for understanding selected-entity lifecycle and when filtered results should close stale panel state.
- `frontend/src/components/entities/EntityNode.tsx` ([6](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/entities/EntityNode.tsx#L6)) - Current node renderer and hit area size; keep graph filtering orthogonal to node rendering.
- `frontend/src/components/entities/entityLayout.ts` ([7](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/entities/entityLayout.ts#L7)) - Dagre layout helper; filtered results should continue to flow through the same layout path.
- `frontend/src/components/map/MapCanvas.tsx` ([31](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/map/MapCanvas.tsx#L31)) - Canonical React Flow page pattern in this repo.
- `frontend/src/components/map/MapFilterPanel.tsx` ([18](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/map/MapFilterPanel.tsx#L18)) - Existing floating checkbox filter panel pattern to mirror for entities filters.
- `frontend/src/pages/TeamsPage.tsx` ([42](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/pages/TeamsPage.tsx#L42)) - Existing `loadData()` + `useState` + inline error handling pattern for CRUD pages.
- `frontend/src/types/team.ts` ([3](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/types/team.ts#L3)) - Source of truth for `Team.isExternal`, which drives internal vs external filter options.
- `frontend/src/types/entity.ts` ([30](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/types/entity.ts#L30)) - Current entity/detail/team-source response types that the filter flow will continue to use.
- `frontend/src/types/entity-graph.ts` ([19](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/types/entity-graph.ts#L19)) - Graph API response shape; likely needs only query-param support, not a response redesign.
- `backend/src/main.ts` ([6](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/main.ts#L6)) - Global `ValidationPipe` setup; every new query DTO field must be decorated.
- `backend/src/entities/entities.controller.ts` ([19](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/entities/entities.controller.ts#L19)) - Current thin controller pattern; `GET /entities/graph` currently takes no query object.
- `backend/src/entities/dto/query-entity.dto.ts` ([1](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/entities/dto/query-entity.dto.ts#L1)) - Current minimal search DTO pattern.
- `backend/src/entities/entities.service.ts` ([26](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/entities/entities.service.ts#L26)) - Current search and graph behavior; `findAll()` supports `q`, but `getGraph()` ignores all filters and loads every entity/flow.
- `backend/src/entity-team-sources/entity-team-source.entity.ts` ([14](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/entity-team-sources/entity-team-source.entity.ts#L14)) - Defines the consumer/source team mapping used by both new filters.
- `backend/src/entity-team-sources/entity-team-sources.service.ts` ([26](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/entity-team-sources/entity-team-sources.service.ts#L26)) - Already enforces that `consumerTeamId` is internal; the filter semantics should align with this rule.
- `backend/src/entity-flows/entity-flow.entity.ts` ([12](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/entity-flows/entity-flow.entity.ts#L12)) - Defines directional entity edges; filtered graph responses must only include edges between surviving nodes.
- `backend/src/teams/team.entity.ts` ([13](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/teams/team.entity.ts#L13)) - Source of truth for `isExternal`.
- `backend/src/teams/teams.service.ts` ([22](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/teams/teams.service.ts#L22)) - Existing list behavior used by the frontend to fetch team options.

### New Files to Create

- `backend/src/entities/dto/query-entity-graph.dto.ts` - Graph-specific filter DTO for `q`, `internalTeamIds`, and `externalTeamIds`.
- `frontend/src/components/entities/EntityFilterPanel.tsx` - Floating filter/search panel for the entities page, mirroring the map filter panel pattern.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [React Flow: Panning and Zooming](https://reactflow.dev/learn/concepts/the-viewport)
  - Specific section: viewport behavior and default slippy-map interaction model
  - Why: The entities page should keep map-like pan/zoom behavior while adding filter UI.
- [TypeORM Select Query Builder](https://typeorm.io/docs/query-builder/select-query-builder/)
  - Specific section: joins, aliasing, join conditions, and parameter naming
  - Why: `GET /entities/graph` will need filtered joins over `entity_team_sources`.
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
  - Specific section: DTO-based validation with `ValidationPipe`
  - Why: the graph query endpoint needs decorated filter fields and predictable query coercion.

### Patterns to Follow

**Frontend route + page pattern**

Mirror the existing route/page wiring in [App.tsx](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/App.tsx#L9). Do not add a new route; keep the feature inside `/entities`.

**Grouped axios API pattern**

Mirror [client.ts](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/api/client.ts#L67):

```ts
export const entitiesApi = {
  graph: () => http.get<EntitiesGraphApiResponse>('/entities/graph').then(r => r.data),
};
```

Extend this method with `params`, not a second resource object.

**CRUD/async loading pattern**

Mirror [TeamsPage.tsx](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/pages/TeamsPage.tsx#L64):

```ts
async function loadData() {
  setLoading(true);
  setError(null);
  try {
    const [labelList, teamList] = await Promise.all([labelsApi.list(), teamsApi.list()]);
    setLabels(labelList);
    setTeams(teamList);
  } finally {
    setLoading(false);
  }
}
```

Use a single `loadData()` / `loadGraph()` flow for entities filters too.

**Floating filter panel pattern**

Mirror [MapFilterPanel.tsx](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/map/MapFilterPanel.tsx#L25): small floating panel, checkbox lists, no new modal or popover library.

**React Flow state pattern**

Mirror [EntityCanvas.tsx](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/entities/EntityCanvas.tsx#L37):

```tsx
const [nodes, setNodes, onNodesChange] = useNodesState<EntityGraphNode>([]);
const [edges, setEdges, onEdgesChange] = useEdgesState<EntityGraphEdge>([]);
```

The filtering feature should update the graph by refetching data and re-running `layoutEntityGraph()`, not by mutating node visibility in place.

**Backend controller pattern**

Mirror [entities.controller.ts](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/entities/entities.controller.ts#L23) and [teams.controller.ts](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/teams/teams.controller.ts#L21): thin controller methods with DTO-bound `@Query()` objects and `ParseUUIDPipe` only where path params are UUIDs.

**Backend QueryBuilder search pattern**

Mirror [entities.service.ts](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/entities/entities.service.ts#L26):

```ts
if (query.q) {
  qb.andWhere(
    `e.search_vector @@ plainto_tsquery('simple', :q)`,
    { q: query.q },
  );
}
```

Reuse `search_vector`; do not replace it with raw `ILIKE`.

### Anti-patterns to Avoid

- Do not client-filter the full graph after fetching everything from `/entities/graph`; push filter logic into the backend response.
- Do not use `originalSourceTeamId` to satisfy the external-team filter. The user explicitly wants entities shown only when an internal team is actually using that external source via `entity_team_sources`.
- Do not introduce React Query, Zustand, or another state library for this slice.
- Do not add a new backend endpoint just to list internal/external teams; the frontend already has `teamsApi.list()`.
- Do not fetch all entity flows and then filter in memory on the server when the node id set is already known.
- Do not require a test framework migration in this slice; this repo currently has no automated test harness.

---

## IMPLEMENTATION PLAN

### Phase 1: Query Contract and Product Spec

Define the filter semantics clearly in both code contracts and the PRD before touching the graph query.

**Tasks:**

- Finalize query semantics for `q`, internal-team filters, and external-team filters.
- Add a graph-specific backend query DTO instead of overloading `QueryEntityDto`.
- Update the PRD entities section to document search and both filter types.

### Phase 2: Backend Filtered Graph Query

Teach the backend graph endpoint to return only the matching entities and edges.

**Tasks:**

- Add `@Query()` binding to `GET /entities/graph`.
- Parse and validate internal/external team filter ids.
- Build a filtered entities QueryBuilder with conditional joins to `entity_team_sources`.
- Return only edges whose endpoints survive node filtering.

### Phase 3: Frontend Filter UI and API Wiring

Add a filter panel and connect it to the graph fetch flow.

**Tasks:**

- Extend `entitiesApi.graph()` to accept filter params.
- Add `EntityFilterPanel` using the floating filter panel pattern.
- Add local state for search, internal teams, and external teams.
- Refetch graph when filters change and re-run Dagre layout.
- Close stale selected entity state if it is filtered out of the graph.

### Phase 4: Validation and UX Sanity

Confirm the filtering semantics are correct for search, internal teams, external teams, and mixed combinations.

**Tasks:**

- Run build/type validation.
- Validate filtered graph responses with `curl`.
- Validate browser workflows for search and both filter groups.
- Check that graph panning/clicking still behaves like the map page.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### UPDATE `PRD.md`

- **IMPLEMENT**: Document that the entities page supports:
  - search by English or Hebrew name
  - filtering by internal consumer teams
  - filtering by external source teams only when an internal team is actually using the entity from that source
- **PATTERN**: Update the existing entities sections at [181](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/PRD.md#L181), [409](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/PRD.md#L409), and [548](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/PRD.md#L548) rather than adding a disconnected new section.
- **IMPORTS**: None.
- **GOTCHA**: Explicitly state that external-team filtering is based on `entity_team_sources.source_team_id`, not `originalSourceTeamId`.
- **VALIDATE**: `rg -n "search|internal|external" PRD.md | rg "entities|team source|graph"`

### CREATE `backend/src/entities/dto/query-entity-graph.dto.ts`

- **IMPLEMENT**: Add decorated fields for:
  - `q?: string`
  - `internalTeamIds?: string`
  - `externalTeamIds?: string`
- **PATTERN**: Mirror the simple DTO style in [query-entity.dto.ts](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/entities/dto/query-entity.dto.ts#L1).
- **IMPORTS**: `class-validator`.
- **GOTCHA**: The repo does not currently use `@Transform` or `ParseArrayPipe` for query arrays. Prefer comma-separated strings and parse them in the service for consistency with existing patterns.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE `backend/src/entities/entities.controller.ts`

- **IMPLEMENT**: Bind the new graph query DTO to `GET /entities/graph`.
- **PATTERN**: Keep the controller thin, like [entities.controller.ts](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/entities/entities.controller.ts#L19) and [teams.controller.ts](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/teams/teams.controller.ts#L17).
- **IMPORTS**: `QueryEntityGraphDto`.
- **GOTCHA**: Do not route graph filtering through `GET /entities`; the graph endpoint needs different semantics because it returns nodes and edges together.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE `backend/src/entities/entities.service.ts`

- **IMPLEMENT**:
  - accept a graph query object in `getGraph(query)`
  - parse comma-separated internal/external team ids into deduped UUID arrays
  - validate that requested internal ids belong to non-external teams
  - validate that requested external ids belong to external teams
  - build a filtered entity query using `search_vector` and `entity_team_sources`
  - query only flows where both `from_entity` and `to_entity` are in the visible node id set
- **PATTERN**: Reuse the `search_vector` filtering style from [entities.service.ts](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/entities/entities.service.ts#L26) and the existing team validation style from [entity-team-sources.service.ts](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend/src/entity-team-sources/entity-team-sources.service.ts#L97).
- **IMPORTS**: `SelectQueryBuilder` is already in use; add only the TypeORM helpers actually needed.
- **GOTCHA**:
  - preserve no-filter behavior: entities with no team-source rows must still appear when no team filters are active
  - when both internal and external filters are set, apply both conditions to the same `entity_team_sources` alias so the match represents one actual mapping row
  - do not keep the current `flowsRepo.find({ order: ... })` behavior because that returns all flows regardless of filters
- **VALIDATE**:
  - `cd backend && npm run build`
  - `curl -s "http://localhost:3001/entities/graph?q=%D7%94%D7%96%D7%9E%D7%A0%D7%95%D7%AA" | jq '{nodes: (.nodes|length), edges: (.edges|length)}'`

### UPDATE `frontend/src/api/client.ts`

- **IMPLEMENT**: Extend `entitiesApi.graph()` to accept optional params:
  - `q?: string`
  - `internalTeamIds?: string[]`
  - `externalTeamIds?: string[]`
- **PATTERN**: Mirror the grouped resource pattern in [client.ts](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/api/client.ts#L67).
- **IMPORTS**: None beyond current types.
- **GOTCHA**: Serialize team id arrays intentionally. Recommended approach: send comma-separated strings, matching the backend DTO plan.
- **VALIDATE**: `cd frontend && npm run build`

### CREATE `frontend/src/components/entities/EntityFilterPanel.tsx`

- **IMPLEMENT**:
  - search input
  - internal-team checkbox list
  - external-team checkbox list
  - optional clear-filters action
- **PATTERN**: Mirror the structure and styling conventions of [MapFilterPanel.tsx](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/map/MapFilterPanel.tsx#L18).
- **IMPORTS**: `Team` type and lightweight callback props only.
- **GOTCHA**:
  - split teams into `!isExternal` and `isExternal` in this component or just above it
  - keep the panel compact and floating; do not enlarge the top overlay and recreate the existing click-interference problem
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE `frontend/src/components/entities/EntityCanvas.tsx`

- **IMPLEMENT**:
  - add filter state for `searchQuery`, `selectedInternalTeamIds`, and `selectedExternalTeamIds`
  - debounce search input changes before refetching
  - pass query params into `entitiesApi.graph()`
  - mount `EntityFilterPanel`
  - clear `selectedEntity` if the filtered node list no longer contains the selected entity id
  - keep the current `layoutEntityGraph()` path for every filtered graph load
- **PATTERN**:
  - reuse `loadData()` / `loadGraph()` structure from [EntityCanvas.tsx](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/entities/EntityCanvas.tsx#L46)
  - reuse floating panel conventions from [MapFilterPanel.tsx](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/map/MapFilterPanel.tsx#L25)
- **IMPORTS**: `EntityFilterPanel`, any minimal debounce utility implemented inline with `useEffect`
- **GOTCHA**:
  - do not filter nodes client-side after the fetch; the backend response must already be filtered
  - keep graph panning/clicking behavior aligned with the working map canvas in [MapCanvas.tsx](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/map/MapCanvas.tsx#L255)
  - avoid fetching teams on every keystroke if they are static; load teams once and only refetch graph on filter changes
- **VALIDATE**:
  - `cd frontend && npm run build`
  - open `/entities`, type a Hebrew name, and confirm the graph shrinks without breaking node clicks or panning

### UPDATE `frontend/src/types/entity-graph.ts` IF NEEDED

- **IMPLEMENT**: Keep the current graph response shape unless filter metadata is truly necessary. Prefer not adding new response fields in this slice.
- **PATTERN**: Preserve the minimal graph contract in [entity-graph.ts](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/types/entity-graph.ts#L19).
- **IMPORTS**: None unless new client param types are centralized here.
- **GOTCHA**: Do not redesign the response shape just to support filters; query params are enough.
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE `frontend/src/components/entities/EntityPanel.tsx` IF NEEDED

- **IMPLEMENT**: Only add behavior needed to handle the selected entity disappearing under active filters, such as closing the panel or reloading a still-visible entity.
- **PATTERN**: Preserve the panel’s current create/edit/delete behavior in [EntityPanel.tsx](/Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend/src/components/entities/EntityPanel.tsx#L136).
- **IMPORTS**: None unless filter-related UX needs a new prop.
- **GOTCHA**: Do not duplicate the filter UI inside the side panel.
- **VALIDATE**: `cd frontend && npm run build`

---

## TESTING STRATEGY

This repo currently has no automated unit/integration test harness in `frontend/` or `backend/`. Do not invent Jest/Vitest/Playwright in this slice unless the user explicitly asks for it.

Validation for this feature should therefore be:

- static build/type validation
- targeted API checks with `curl`
- browser/manual workflow verification

### Unit Tests

No existing unit test framework is configured. If the user later wants automation, the best first candidate is backend service-level tests around graph filtering semantics.

### Integration Tests

No existing integration test harness is configured. For this slice, integration validation should be API-level `curl` checks plus browser verification.

### Edge Cases

- search by English name only
- search by Hebrew name only
- no search results
- internal-team filter with one team
- internal-team filter with multiple teams
- external-team filter with one external source
- external-team filter with multiple external sources
- combined internal + external filters
- external filter should not match entities whose `originalSourceTeamId` matches but have no qualifying `entity_team_sources` row
- graph edges disappear when one endpoint is filtered out
- selected entity panel closes or resets when the selected entity is no longer visible
- invalid UUIDs in filter params are rejected or surfaced cleanly
- internal filter should reject external team ids
- external filter should reject internal team ids

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and feature correctness.

### Level 1: Syntax & Style

- `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run build`
- `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run lint`
- `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run build`

### Level 2: API Validation

- `curl -s "http://localhost:3001/entities/graph" | jq '{nodes: (.nodes|length), edges: (.edges|length)}'`
- `curl -s "http://localhost:3001/entities/graph?q=Orders" | jq '{nodes: (.nodes|length), edges: (.edges|length)}'`
- `curl -s "http://localhost:3001/entities/graph?q=%D7%94%D7%96%D7%9E%D7%A0%D7%95%D7%AA" | jq '{nodes: (.nodes|length), edges: (.edges|length)}'`
- `curl -s "http://localhost:3001/entities/graph?internalTeamIds=<internal-team-uuid>" | jq '{nodes: (.nodes|length), edges: (.edges|length)}'`
- `curl -s "http://localhost:3001/entities/graph?externalTeamIds=<external-team-uuid>" | jq '{nodes: (.nodes|length), edges: (.edges|length)}'`
- `curl -s "http://localhost:3001/entities/graph?internalTeamIds=<internal-team-uuid>&externalTeamIds=<external-team-uuid>" | jq '{nodes: (.nodes|length), edges: (.edges|length)}'`

### Level 3: Manual Validation

1. Start backend and frontend dev servers.
2. Open `http://localhost:5173/entities` or the current Vite port.
3. Confirm the graph initially shows the full dataset.
4. Type an English search term and confirm matching entities remain.
5. Type a Hebrew search term and confirm matching entities remain.
6. Select one internal team and confirm only its entities remain.
7. Select one external team and confirm only entities with at least one internal consumer from that external source remain.
8. Combine one internal and one external team filter and confirm the result behaves as specified.
9. Clear filters and confirm the full graph returns.
10. Click a visible entity after filtering and confirm the side panel still opens correctly.
11. Drag the empty canvas and confirm panning still behaves like the map page.

### Level 4: Additional Validation (Optional)

- Use `agent-browser` to verify checkbox interactions and filtered graph updates if manual browser validation is noisy.

---

## ACCEPTANCE CRITERIA

- [ ] `/entities` includes a search input that matches both English and Hebrew names.
- [ ] `/entities` includes an internal-team filter using only non-external teams.
- [ ] `/entities` includes an external-team filter using only external teams.
- [ ] External-team filtering is based on `entity_team_sources.source_team_id`, not `originalSourceTeamId`.
- [ ] An entity appears for an external-team filter only when at least one internal team is actually using it from that external source.
- [ ] Combined internal + external filters return the intended intersection semantics.
- [ ] Filtered graph responses include only edges whose endpoints remain visible.
- [ ] Graph interaction on `/entities` remains consistent with the working map page.
- [ ] PRD is updated to describe the new entities search/filter behavior.
- [ ] Build/lint validation passes with zero errors.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] Backend build passes
- [ ] Frontend lint and build pass
- [ ] API validation confirms search/internal/external filter behavior
- [ ] Manual browser testing confirms UX works
- [ ] PRD is updated
- [ ] No regressions in existing entity create/edit/delete flows

---

## NOTES

- Recommended request contract:
  - `GET /entities/graph?q=<text>&internalTeamIds=<uuid,uuid>&externalTeamIds=<uuid,uuid>`
- Recommended semantics:
  - no filters: all entities
  - only `q`: name-based filter
  - only internal team ids: entities with matching `consumer_team_id`
  - only external team ids: entities with matching `source_team_id` and at least one internal consumer
  - both internal and external ids: same team-source row should satisfy both conditions
- The current repo has no automated tests. Do not claim or require coverage thresholds in implementation unless a test harness is added separately.
- Keep the implementation small-surface:
  - one new backend DTO
  - one new frontend filter panel
  - targeted updates to the existing entities graph endpoint and canvas
- Confidence Score: 8/10 that one-pass implementation will succeed if the execution agent follows this plan closely.
