# Feature: Phase 3 — Entities Foundation and Graph

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files, preserve current team/service behavior, and do not invent a second graph shape when the repo already has established React Flow and API response patterns.

## Feature Description

Implement the first real Entities domain described in the PRD: backend CRUD for entities, entity team-source mappings, and entity flows, plus a frontend `/entities` page that renders a React Flow graph with automatic layout and an entity side panel for viewing and editing the underlying model.

This slice replaces the current placeholder page with a working entity graph surface and resolves a real schema drift in the project: the local database already contains legacy `entities`, `entity_relationships`, and `lineage` tables, but the current codebase has no active Entities feature and the PRD now defines a different Phase 3 data model (`entities`, `entity_team_sources`, `entity_flows`).

## User Story

As a data engineer
I want to model entities, their upstream sources, and the flows between them
So that I can understand how data concepts move across teams and systems in one graph

## Problem Statement

The frontend still ships only a placeholder `/entities` page, while the backend has no entity modules, controllers, DTOs, or types. At the same time, the local Postgres database already has legacy entity-related tables with live data, but those tables do not match the current PRD: they use a single `name`, an old `lineage` model, and `entity_relationships` instead of the new `entity_team_sources` and `entity_flows` design.

If implementation starts without explicitly handling that mismatch, the agent will likely either:

- build a new entity feature against the wrong schema,
- destroy existing local data during migration, or
- expose a frontend graph that drifts from the required API and ownership model.

## Solution Statement

Implement a PRD-aligned Entities feature in both backend and frontend, while preserving existing local entity data through an in-place migration strategy instead of a destructive reset.

The recommended approach is:

- Evolve the existing `entities` table to the new PRD shape by adding `name_en`, `name_he`, `owner_team_id`, and `original_source_team_id`, while backfilling legacy rows safely.
- Replace runtime usage of legacy `entity_relationships` with a new `entity_flows` runtime model, preferably by renaming/migrating the table so existing relationships survive.
- Introduce a new `entity_team_sources` table from scratch.
- Leave the legacy `lineage` table untouched in this slice unless the migration can transform it safely and losslessly. It has live local rows, but its semantics do not map cleanly to the new PRD model.
- Add a new `/entities` frontend surface using React Flow + Dagre auto-layout, with a side panel pattern similar to the existing service panel and CRUD data-loading patterns similar to the current Teams page.

## Feature Metadata

**Feature Type**: New Capability + Refactor  
**Estimated Complexity**: High  
**Primary Systems Affected**: Frontend entities route/UI, frontend API client/types, new React Flow entity components, backend entities modules/services/controllers/DTOs, TypeORM config, DB migrations  
**Dependencies**: `@xyflow/react@12.10.2`, `axios@1.14.0`, `react-router-dom@6.30.3`, `@nestjs/common@11.1.18`, `@nestjs/typeorm@11.0.1`, `class-validator@0.15.1`, `typeorm@0.3.28`, Postgres 16, and an explicit frontend graph-layout dependency such as `@dagrejs/dagre@3.0.0`

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `frontend/src/pages/EntitiesPage.tsx` (lines 1-7) - Current placeholder route that must be replaced with the real feature.
- `frontend/src/App.tsx` (lines 1-23) - Route registration pattern; `/entities` already exists and should continue to be registered here.
- `frontend/src/components/layout/TopNav.tsx` (lines 1-34) - Nav source of truth; entities is already in navigation and should stay aligned with page behavior.
- `frontend/src/api/client.ts` (lines 1-54) - Existing grouped axios resource API pattern; mirror this for `entitiesApi`, `entityTeamSourcesApi`, and `entityFlowsApi`.
- `frontend/src/pages/TeamsPage.tsx` (lines 42-236) - Current CRUD page pattern using `useEffect`, `useState`, centralized `loadData()`, error handling, and confirmation flows.
- `frontend/src/pages/MapPage.tsx` (lines 1-9) - Page-level canvas wrapper pattern using fixed viewport height.
- `frontend/src/components/map/MapCanvas.tsx` (lines 1-260) - Canonical React Flow state setup, hoisted `nodeTypes`, `useNodesState`, `useEdgesState`, async fetch-on-mount, and graph derivation pattern to mirror.
- `frontend/src/components/map/ServicePanel.tsx` (lines 1-280) - Existing side-panel pattern for view/edit/delete flows. The entity panel should feel like the sibling of this component, not a brand new UI language.
- `frontend/src/types/map.ts` (lines 1-54) - Current typed React Flow node/edge pattern for the map; mirror the same structure for entity graph types.
- `frontend/src/types/team.ts` (lines 1-26) - Current shared team shape; entity owner/source/team-source fields should reuse this shape instead of inventing new team DTO fragments.
- `frontend/src/types/service.ts` (lines 1-32) - Example of detail types that embed related resource refs.

- `backend/src/main.ts` (lines 1-27) - Global `ValidationPipe` config; every new DTO field must be decorated.
- `backend/src/app.module.ts` (lines 1-31) - Root module registration pattern; new entity-related modules must be imported here.
- `backend/src/config/typeorm.config.ts` (lines 1-21) - Explicit entity registration for the Nest app; all new entity-related TypeORM classes must be added here.
- `backend/src/services/service.entity.ts` (lines 1-69) - Canonical TypeORM entity pattern in this repo: explicit FK columns, `@ManyToOne`, `@JoinColumn`, timestamp columns, and search-vector comments.
- `backend/src/teams/team.entity.ts` (lines 1-51) - Team relation shape to mirror for owner/source relations.
- `backend/src/services/services.service.ts` (lines 1-73) - QueryBuilder list/search pattern and detail-loading with relations.
- `backend/src/services/services.controller.ts` (lines 1-51) - Thin controller pattern using `ParseUUIDPipe`, `@HttpCode(NO_CONTENT)`, and DTO-bound query params.
- `backend/src/services/dto/create-service.dto.ts` (lines 1-33) - DTO validation pattern for create payloads.
- `backend/src/services/dto/query-service.dto.ts` (lines 1-15) - Query DTO pattern for list/search endpoints.
- `backend/src/connections/connections.service.ts` (lines 1-48) - Conflict detection pattern for unique graph edges.
- `backend/src/migrations/1712500000000-InitialSchema.ts` (lines 1-105) - Handwritten SQL migration style and trigger creation pattern for search vectors.
- `backend/src/migrations/1714200000000-AddLabelsAndTeamLabelRelation.ts` (lines 1-32) - Current additive migration style with `IF EXISTS` / `IF NOT EXISTS`.
- `backend/src/seed/seed.ts` (lines 1-65) - Current seed only covers teams/services/connections; useful to understand existing development data assumptions.
- `CLAUDE.md` (lines 1-4) - Project rule: do not commit changes unless explicitly asked.

### Local Database State YOU MUST ACCOUNT FOR BEFORE IMPLEMENTING!

These are not source files, but they are a real constraint discovered during planning:

- Local Postgres currently contains `entities`, `entity_relationships`, and `lineage` tables with live rows.
- As of planning time, the local DB had 5 `entities` rows, 4 `entity_relationships` rows, and 4 `lineage` rows.
- The current `entities` table uses legacy columns (`name`, `team_id`) rather than the PRD shape (`name_en`, `name_he`, `owner_team_id`, `original_source_team_id`).
- The current `entity_relationships` table is semantically close to PRD `entity_flows`.
- The current `lineage` table is a legacy model that does not map cleanly to PRD `entity_team_sources`.

This means the migration strategy matters. Do not assume an empty database.

### New Files to Create

Backend:

- `backend/src/entities/entity.entity.ts` - TypeORM entity for the PRD-aligned entity record.
- `backend/src/entities/dto/create-entity.dto.ts`
- `backend/src/entities/dto/update-entity.dto.ts`
- `backend/src/entities/dto/query-entity.dto.ts`
- `backend/src/entities/entities.service.ts`
- `backend/src/entities/entities.controller.ts`
- `backend/src/entities/entities.module.ts`
- `backend/src/entity-team-sources/entity-team-source.entity.ts`
- `backend/src/entity-team-sources/dto/create-entity-team-source.dto.ts`
- `backend/src/entity-team-sources/dto/update-entity-team-source.dto.ts`
- `backend/src/entity-team-sources/entity-team-sources.service.ts`
- `backend/src/entity-team-sources/entity-team-sources.controller.ts`
- `backend/src/entity-team-sources/entity-team-sources.module.ts`
- `backend/src/entity-flows/entity-flow.entity.ts`
- `backend/src/entity-flows/dto/create-entity-flow.dto.ts`
- `backend/src/entity-flows/dto/update-entity-flow.dto.ts`
- `backend/src/entity-flows/entity-flows.service.ts`
- `backend/src/entity-flows/entity-flows.controller.ts`
- `backend/src/entity-flows/entity-flows.module.ts`
- `backend/src/migrations/1714300000000-AlignEntitiesWithPrd.ts` - Migration to evolve legacy schema to Phase 3 PRD shape.

Frontend:

- `frontend/src/types/entity.ts` - Entity/detail/team-source/flow response and payload types.
- `frontend/src/types/entity-graph.ts` - Typed React Flow nodes/edges for the entities graph.
- `frontend/src/components/entities/EntityCanvas.tsx` - Main entities graph container.
- `frontend/src/components/entities/EntityNode.tsx` - Custom React Flow node renderer for entities.
- `frontend/src/components/entities/EntityPanel.tsx` - Side panel for view/edit/create/delete and managing team sources / flows.
- `frontend/src/components/entities/entityLayout.ts` - Dagre layout helper.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [React Flow Components](https://reactflow.dev/api-reference/components)
  - Specific section: `ReactFlow`, controls, node/edge composition
  - Why: The entities graph should mirror the project’s existing React Flow usage instead of introducing a different graph framework.
- [React Flow Custom Nodes / Handles](https://reactflow.dev/learn/customization/handles)
  - Specific section: custom node rendering and handles
  - Why: Entity nodes will likely need custom rendering and directional flow handles.
- [React Flow Auto Layout Examples](https://reactflow.dev/pro/examples)
  - Specific section: auto-layout examples using Dagre / ELK
  - Why: The PRD explicitly requires hierarchical auto-layout for entities.
- [NestJS Modules](https://docs.nestjs.com/modules)
  - Specific section: feature modules and exports/imports
  - Why: New entity-related modules must be registered consistently with the current app structure.
- [NestJS Controllers](https://docs.nestjs.com/controllers)
  - Specific section: route handlers and parameter decorators
  - Why: Entity, entity-team-source, and entity-flow controllers should remain thin.
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
  - Specific section: `ValidationPipe`, DTO decorators, mapped types
  - Why: Global whitelist/forbid settings make undecorated fields fail at runtime.
- [TypeORM Migrations](https://typeorm.io/docs/advanced-topics/migrations/)
  - Specific section: manual SQL migrations via `QueryRunner`
  - Why: This repo uses handwritten SQL migrations, including trigger creation.
- [TypeORM Many-to-one / One-to-many Relations](https://typeorm.io/docs/relations/many-to-one-one-to-many-relations/)
  - Specific section: owning side, foreign keys, inverse-side relations
  - Why: Entities need multiple team relations and child collections.
- [TypeORM Select Query Builder](https://typeorm.io/docs/query-builder/select-query-builder/)
  - Specific section: filtering and joins
  - Why: `GET /entities` should support search and relation loading in the same style as services.

### Patterns to Follow

**Frontend route + page pattern**

Use route registration in `App.tsx` and a page component that simply mounts the main canvas component:

```tsx
<Route path="/entities" element={<EntitiesPage />} />
```

```tsx
export default function MapPage() {
  return (
    <div className="w-full h-[calc(100vh-3.5rem)]">
      <MapCanvas />
    </div>
  );
}
```

Mirror this for the final `EntitiesPage` wrapper.

**Axios resource grouping**

Keep new APIs inside `frontend/src/api/client.ts`:

```ts
export const servicesApi = {
  list: (params?: { q?: string; team?: string; lifecycle?: string }) =>
    http.get<Service[]>('/services', { params }).then(r => r.data),
};
```

Mirror that shape for:

- `entitiesApi`
- `entityTeamSourcesApi`
- `entityFlowsApi`
- optionally `entitiesGraphApi` or a `graph()` method on `entitiesApi`

**CRUD page data-loading pattern**

Mirror `TeamsPage`:

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

Do not introduce React Query or another client-state library in this slice.

**React Flow state pattern**

Mirror `MapCanvas`:

```tsx
const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);
```

Keep `nodeTypes` and `edgeTypes` hoisted outside the component.

**Side-panel pattern**

Mirror `ServicePanel`:

- local `useState` for edit/delete modes,
- form state loaded via `useEffect`,
- close button in panel header,
- inline CRUD actions,
- no global modal framework.

**Backend controller pattern**

Mirror `ServicesController` and `TeamsController`:

```ts
@Get(':id')
findOne(@Param('id', ParseUUIDPipe) id: string) {
  return this.entitiesService.findOne(id);
}

@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT)
remove(@Param('id', ParseUUIDPipe) id: string) {
  return this.entitiesService.remove(id);
}
```

**Query DTO + QueryBuilder search pattern**

Mirror `QueryServiceDto` and `ServicesService.findAll()`:

```ts
if (query.q) {
  qb.andWhere(
    `s.search_vector @@ plainto_tsquery('simple', :q)`,
    { q: query.q },
  );
}
```

For entities, the search vector must cover English name, Hebrew name, and description.

**TypeORM entity relation pattern**

Mirror explicit FK columns + relation properties:

```ts
@Column({ name: 'team_id', type: 'uuid' })
teamId: string;

@ManyToOne(() => Team, (team) => team.services, { onDelete: 'RESTRICT' })
@JoinColumn({ name: 'team_id' })
team: Team;
```

For `Entity`, use explicit FK columns for:

- `ownerTeamId`
- `originalSourceTeamId`

For `EntityTeamSource`, use explicit FK columns for:

- `entityId`
- `consumerTeamId`
- `sourceTeamId`

**Migration pattern**

Use handwritten SQL migrations via `queryRunner.query(...)`. If search vectors are added or updated, create/replace the trigger explicitly in SQL as done in `1712500000000-InitialSchema.ts`.

### Anti-patterns to Avoid

- Do not drop and recreate `entities` or `entity_relationships` blindly. Local DB data already exists.
- Do not try to map the legacy `lineage` table directly onto the new `entity_team_sources` model without a clear, lossless rule. It is a different concept.
- Do not rely on the currently extraneous `@dagrejs/dagre` install in `node_modules`; add it to `frontend/package.json` explicitly if you use it.
- Do not add manual drag-persisted positions for entities in this slice. The PRD calls for auto-layout, not a free-form canvas.
- Do not introduce docs attachments UI yet unless you also implement the missing docs backend. The current codebase has no docs domain.
- Do not add a new state-management library or graph library.
- Do not use `127.0.0.1` for browser validation unless backend CORS is widened; current backend CORS only allows `http://localhost:*`.

---

## IMPLEMENTATION PLAN

### Phase 1: Schema Alignment and Dependency Foundation

Stabilize the ground truth first: declare the layout dependency explicitly, define the final resource boundaries, and migrate the database from the legacy entity schema to the PRD-aligned model without losing rows.

**Tasks:**

- Add the chosen graph-layout dependency to `frontend/package.json` explicitly.
- Design the entity resource boundaries and DTO shapes before writing controllers.
- Write a migration that evolves legacy tables in place:
  - transform `entities`
  - introduce `entity_team_sources`
  - migrate or rename `entity_relationships` into `entity_flows`
  - intentionally defer `lineage` cleanup unless there is a safe transform

### Phase 2: Backend Entity Domains

Build the full backend surface: entities CRUD/search/detail/graph, team-source CRUD, and flow CRUD.

**Tasks:**

- Create TypeORM entities and register them in Nest and TypeORM config.
- Implement DTOs with strict validation.
- Implement services with relation loading, uniqueness checks, and not-found handling.
- Implement controllers matching current Nest patterns.
- Add graph endpoint and detail endpoint shapes the frontend can consume directly.

### Phase 3: Frontend Entity Graph

Replace the placeholder page with a working graph view and side panel.

**Tasks:**

- Add frontend entity types and APIs.
- Build entity graph types and Dagre layout helper.
- Build `EntityCanvas`, `EntityNode`, and `EntityPanel`.
- Wire `/entities` to load graph data, teams, and apply client-side layout.
- Support create/edit/delete for entities, team-source mappings, and flows.

### Phase 4: Validation and Dataset Sanity

Confirm migrations, API behavior, and browser workflows all behave against real data.

**Tasks:**

- Run backend and frontend builds.
- Run the migration against local Postgres.
- Validate API CRUD via `curl`.
- Validate graph UI and side panel workflows with `agent-browser`.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### UPDATE `frontend/package.json`

- **IMPLEMENT**: Add `@dagrejs/dagre` as an explicit dependency. Do not rely on the currently extraneous install present in `node_modules`.
- **PATTERN**: Keep dependency declarations in the same simple shape used in `frontend/package.json`.
- **IMPORTS**: None yet.
- **GOTCHA**: `npm ls @dagrejs/dagre --depth=0` currently shows it as extraneous, which means another machine or clean install will not have it.
- **VALIDATE**: `cd frontend && npm ls @dagrejs/dagre --depth=0`

### CREATE `backend/src/entities/entity.entity.ts`

- **IMPLEMENT**: Model PRD-aligned entity fields:
  - `id`
  - `nameEn`
  - `nameHe`
  - `description`
  - `ownerTeamId`
  - `originalSourceTeamId`
  - `searchVector`
  - `createdAt`
  - `updatedAt`
  - inverse collections for team sources and flows
- **PATTERN**: Mirror entity decorator style from `backend/src/services/service.entity.ts:17-68`.
- **IMPORTS**: `Team`, `EntityTeamSource`, `EntityFlow`.
- **GOTCHA**: Use explicit FK columns plus relation properties; do not embed team objects without FK columns.
- **VALIDATE**: `cd backend && npm run build`

### CREATE `backend/src/entity-team-sources/entity-team-source.entity.ts`

- **IMPLEMENT**: Model `entity_id`, `consumer_team_id`, `source_team_id`, timestamps, and a uniqueness constraint at the DB level.
- **PATTERN**: Mirror the explicit FK + relation pattern from `backend/src/services/service.entity.ts:25-27` and `backend/src/services/service.entity.ts:60-68`.
- **IMPORTS**: `Entity`, `Team`.
- **GOTCHA**: `consumerTeamId` and `sourceTeamId` are both team relations with different meanings; keep names precise.
- **VALIDATE**: `cd backend && npm run build`

### CREATE `backend/src/entity-flows/entity-flow.entity.ts`

- **IMPLEMENT**: Model `fromEntityId`, `toEntityId`, optional `label`, `createdAt`, and inverse relations.
- **PATTERN**: Mirror connection-edge uniqueness semantics from `backend/src/connections/connections.service.ts:17-31`.
- **IMPORTS**: `Entity`.
- **GOTCHA**: This is a directional edge; do not normalize ordering or treat it as undirected.
- **VALIDATE**: `cd backend && npm run build`

### CREATE entity DTO files

- **IMPLEMENT**:
  - `create-entity.dto.ts`
  - `update-entity.dto.ts`
  - `query-entity.dto.ts`
  - `create-entity-team-source.dto.ts`
  - `update-entity-team-source.dto.ts`
  - `create-entity-flow.dto.ts`
  - `update-entity-flow.dto.ts`
- **PATTERN**: Mirror `backend/src/services/dto/create-service.dto.ts:10-33`, `backend/src/services/dto/query-service.dto.ts:3-15`, and `PartialType(...)` usage elsewhere in repo.
- **IMPORTS**: `@nestjs/mapped-types`, `class-validator`.
- **GOTCHA**: Because of `ValidationPipe` in `backend/src/main.ts:9-15`, every field must be decorated. `nameEn` and `nameHe` must both be explicit strings; `originalSourceTeamId` is optional UUID.
- **VALIDATE**: `cd backend && npm run build`

### CREATE `backend/src/entities/entities.service.ts`

- **IMPLEMENT**:
  - `findAll(query)` with search support for English/Hebrew/description
  - `findOne(id)` with owner/original-source/team-sources/flows relations
  - `create(dto)`
  - `update(id, dto)`
  - `remove(id)`
  - `getGraph()`
- **PATTERN**: Mirror QueryBuilder search from `backend/src/services/services.service.ts:16-35`.
- **IMPORTS**: repositories for `Entity`, `EntityTeamSource`, `EntityFlow`, and `Team` if validating FK targets in service layer.
- **GOTCHA**:
  - `getGraph()` should return a graph-oriented response the frontend can lay out directly.
  - Do not couple backend graph response to a persisted x/y coordinate model.
  - Validate referenced teams exist before save/update if the DTO includes `ownerTeamId` or `originalSourceTeamId`.
- **VALIDATE**: `cd backend && npm run build`

### CREATE `backend/src/entity-team-sources/entity-team-sources.service.ts`

- **IMPLEMENT**:
  - create-or-replace behavior for `POST /entities/:id/team-sources`
  - update by id
  - delete by id
- **PATTERN**: Mirror conflict and not-found handling from `backend/src/connections/connections.service.ts:17-48`.
- **IMPORTS**: repositories for `EntityTeamSource`, `Entity`, and `Team`.
- **GOTCHA**: The PRD says POST should “add or replace a consumer-team source mapping” for the entity. That means uniqueness is `(entity_id, consumer_team_id)`, and create should upsert at the service level rather than blindly insert.
- **VALIDATE**: `cd backend && npm run build`

### CREATE `backend/src/entity-flows/entity-flows.service.ts`

- **IMPLEMENT**: create flow from `entities/:id/flows`, update optional label, delete by id.
- **PATTERN**: Mirror directional edge handling from `backend/src/connections/connections.service.ts:17-48`.
- **IMPORTS**: repositories for `EntityFlow` and `Entity`.
- **GOTCHA**: Reject self-loops unless you explicitly decide the PRD allows them. Default recommendation: block `fromEntityId === toEntityId`.
- **VALIDATE**: `cd backend && npm run build`

### CREATE entity controllers and modules

- **IMPLEMENT**:
  - `backend/src/entities/entities.controller.ts`
  - `backend/src/entities/entities.module.ts`
  - `backend/src/entity-team-sources/entity-team-sources.controller.ts`
  - `backend/src/entity-team-sources/entity-team-sources.module.ts`
  - `backend/src/entity-flows/entity-flows.controller.ts`
  - `backend/src/entity-flows/entity-flows.module.ts`
- **PATTERN**: Mirror thin controller structure from `backend/src/services/services.controller.ts:19-50` and module registration from `backend/src/services/services.module.ts:1-11`.
- **IMPORTS**: `TypeOrmModule.forFeature([...])`, services, controllers, DTOs.
- **GOTCHA**: Prefer resource-specific modules to match current repo structure, even though `EntitiesModule` may need to import/export across the entity subdomains.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE `backend/src/app.module.ts`

- **IMPLEMENT**: Import and register all new entity-related modules.
- **PATTERN**: Mirror module registration style from `backend/src/app.module.ts:12-29`.
- **IMPORTS**: new modules only.
- **GOTCHA**: Keep import order readable and domain-grouped; do not remove existing module imports.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE `backend/src/config/typeorm.config.ts`

- **IMPLEMENT**: Add all new entity classes to the explicit `entities` array.
- **PATTERN**: Mirror current explicit entity registration in `backend/src/config/typeorm.config.ts:11-20`.
- **IMPORTS**: `Entity`, `EntityTeamSource`, `EntityFlow`.
- **GOTCHA**: `backend/data-source.ts` uses a glob for CLI migrations; Nest runtime does not.
- **VALIDATE**: `cd backend && npm run build`

### CREATE `backend/src/migrations/1714300000000-AlignEntitiesWithPrd.ts`

- **IMPLEMENT**:
  - evolve `entities` table to PRD shape
  - preserve existing rows
  - create or migrate search vector trigger
  - create `entity_team_sources`
  - migrate `entity_relationships` to `entity_flows`
  - leave `lineage` untouched unless you have a safe transform
- **PATTERN**: Mirror SQL style from `backend/src/migrations/1712500000000-InitialSchema.ts:6-105` and additive safety from `backend/src/migrations/1714200000000-AddLabelsAndTeamLabelRelation.ts:6-30`.
- **IMPORTS**: `MigrationInterface`, `QueryRunner`.
- **GOTCHA**:
  - Existing rows currently have only `name`; recommended migration path:
    1. add `name_en` and `name_he` nullable,
    2. backfill both from legacy `name`,
    3. add `owner_team_id` from legacy `team_id`,
    4. create `original_source_team_id` nullable,
    5. rebuild search vector trigger using `name_en`, `name_he`, `description`,
    6. enforce `NOT NULL` where safe.
  - If you rename `entity_relationships` to `entity_flows`, preserve IDs and rows.
  - Do not drop `lineage` in this slice unless you also update any seed/manual data strategy and are certain nothing still relies on it locally.
- **VALIDATE**:
  - `cd backend && npm run migration:run`
  - `psql postgresql://postgres:postgres@localhost:5432/service_catalog -c "\d+ entities"`
  - `psql postgresql://postgres:postgres@localhost:5432/service_catalog -c "\d+ entity_team_sources"`
  - `psql postgresql://postgres:postgres@localhost:5432/service_catalog -c "\d+ entity_flows"`

### CREATE `frontend/src/types/entity.ts`

- **IMPLEMENT**:
  - `Entity`
  - `EntityTeamSource`
  - `EntityFlow`
  - `CreateEntityPayload`
  - `CreateEntityTeamSourcePayload`
  - `CreateEntityFlowPayload`
- **PATTERN**: Mirror structure style from `frontend/src/types/service.ts:1-32`.
- **IMPORTS**: `Team`.
- **GOTCHA**: Keep detail types rich enough for the side panel to render without extra ad hoc transforms.
- **VALIDATE**: `cd frontend && npm run build`

### CREATE `frontend/src/types/entity-graph.ts`

- **IMPLEMENT**: Typed node/edge/data shapes for the entities canvas, similar to `frontend/src/types/map.ts`.
- **PATTERN**: Mirror `frontend/src/types/map.ts:1-54`.
- **IMPORTS**: `Node`, `Edge` from `@xyflow/react`; entity-specific refs.
- **GOTCHA**: Do not reuse service-map node types directly; entities are a separate graph with different node data.
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE `frontend/src/api/client.ts`

- **IMPLEMENT**: Add grouped API wrappers for entities, entity team sources, and entity flows.
- **PATTERN**: Mirror `frontend/src/api/client.ts:12-54`.
- **IMPORTS**: new entity types.
- **GOTCHA**: Keep method naming consistent with existing API groups: `list`, `get`, `create`, `update`, `delete`, and optionally `graph`.
- **VALIDATE**: `cd frontend && npm run build`

### CREATE `frontend/src/components/entities/entityLayout.ts`

- **IMPLEMENT**: Centralize Dagre graph layout logic in a small helper that accepts entity nodes/edges and returns positioned nodes.
- **PATTERN**: Follow the project’s preference for small colocated helpers rather than embedding algorithm code directly into the page.
- **IMPORTS**: `@dagrejs/dagre`, entity graph types.
- **GOTCHA**:
  - Layout direction should match the PRD’s hierarchical flow goals.
  - Use deterministic node width/height assumptions shared with `EntityNode`.
  - Add the dependency explicitly to `package.json`.
- **VALIDATE**: `cd frontend && npm run build`

### CREATE `frontend/src/components/entities/EntityNode.tsx`

- **IMPLEMENT**: Render a custom entity node with English/Hebrew names, owner/source hints, and flow handles.
- **PATTERN**: Mirror the project’s custom node usage from `frontend/src/components/map/MapCanvas.tsx:27-35`.
- **IMPORTS**: `Handle` / relevant React Flow APIs, entity node data type.
- **GOTCHA**: Keep visuals consistent with the existing slate-based design language and RTL text flow.
- **VALIDATE**: `cd frontend && npm run build`

### CREATE `frontend/src/components/entities/EntityPanel.tsx`

- **IMPLEMENT**:
  - view mode
  - edit mode
  - create mode
  - delete confirmation
  - management UI for team-source rows
  - management UI for incoming/outgoing flows
- **PATTERN**: Mirror panel structure and local state transitions from `frontend/src/components/map/ServicePanel.tsx:21-280`.
- **IMPORTS**: `entitiesApi`, `entityTeamSourcesApi`, `entityFlowsApi`, `Team`, entity types.
- **GOTCHA**:
  - Docs attachments are out of scope for this slice because docs backend is not implemented.
  - Keep entity-source and flow editing inside the panel to avoid adding a second full-screen CRUD surface.
- **VALIDATE**: `cd frontend && npm run build`

### CREATE `frontend/src/components/entities/EntityCanvas.tsx`

- **IMPLEMENT**:
  - fetch graph data + teams on mount
  - apply Dagre layout client-side
  - render React Flow graph
  - open panel on node click
  - keep selected entity / create state local
  - refresh graph after CRUD changes
- **PATTERN**:
  - React Flow state from `frontend/src/components/map/MapCanvas.tsx:37-153`
  - async detail fetch on click from `frontend/src/components/map/MapCanvas.tsx:155-165`
- **IMPORTS**: `ReactFlow`, `Background`, `Controls`, `MiniMap`, node/edge state hooks, new entity components/types/APIs.
- **GOTCHA**:
  - Do not persist manual entity positions.
  - Keep edge/node types hoisted outside the component.
  - If you support search, prefer local filtering of the graph after fetch for first pass.
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE `frontend/src/pages/EntitiesPage.tsx`

- **IMPLEMENT**: Replace placeholder with the new page wrapper that renders `EntityCanvas`.
- **PATTERN**: Mirror `frontend/src/pages/MapPage.tsx:1-9`.
- **IMPORTS**: `EntityCanvas`.
- **GOTCHA**: Keep the same viewport-height calculation as the map page so the canvas uses the full screen area under the top nav.
- **VALIDATE**: `cd frontend && npm run build`

### OPTIONAL UPDATE `backend/src/seed/seed.ts`

- **IMPLEMENT**: Only if needed, extend the dev seed to include a minimal set of PRD-aligned entities/team-sources/flows.
- **PATTERN**: Mirror current sequential seed style in `backend/src/seed/seed.ts:19-59`.
- **IMPORTS**: new entity classes.
- **GOTCHA**:
  - Current seed does not reset the database and may conflict with unique rows.
  - Do not make seed updates a hard dependency for the feature unless you also define a clean reset flow.
- **VALIDATE**: `cd backend && npm run build`

---

## TESTING STRATEGY

This repo currently has no meaningful first-party automated test suite or test scripts for backend/frontend resources. Validation for this slice must therefore rely on:

- build/type checks,
- migration execution,
- direct API verification,
- browser validation.

If you choose to add tests, keep them focused and do not turn “adding a test framework” into the critical path for this feature.

### Unit Tests

Recommended only if lightweight and already supported by the repo during implementation.

Priority candidates:

- entity service search behavior
- team-source create-or-replace logic
- flow duplicate rejection / self-loop rejection

### Integration Tests

Prefer practical API and migration validation over introducing a large new test harness.

Priority flows:

- create entity
- attach team-source mapping
- create flow
- load entity detail
- load graph
- delete label / team interactions should not break entity reads

### Edge Cases

- Existing legacy `entities` rows survive migration with both `nameEn` and `nameHe` populated.
- Existing legacy `entity_relationships` rows survive migration into `entity_flows`.
- `lineage` is not accidentally dropped or corrupted.
- Entity search matches both English and Hebrew names.
- `POST /entities/:id/team-sources` replaces an existing consumer mapping for the same entity instead of duplicating it.
- Flow uniqueness is enforced for `(from_entity, to_entity)`.
- Self-loop flow creation is rejected.
- Deleting an entity cascades its team-source rows and flows correctly.
- Deleting an owner team or original source team sets nullable FKs as intended.
- Browser validation is run against `http://localhost`, not `http://127.0.0.1`, unless CORS is widened.

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and feature correctness.

### Level 1: Syntax & Build

- `cd backend && npm run build`
- `cd backend && npm run typecheck`
- `cd frontend && npm run build`
- `cd frontend && npm run lint`

### Level 2: Dependency & Migration Validation

- `cd frontend && npm ls @dagrejs/dagre --depth=0`
- `cd backend && npm run migration:run`
- `psql postgresql://postgres:postgres@localhost:5432/service_catalog -c "\d+ entities"`
- `psql postgresql://postgres:postgres@localhost:5432/service_catalog -c "\d+ entity_team_sources"`
- `psql postgresql://postgres:postgres@localhost:5432/service_catalog -c "\d+ entity_flows"`
- `psql postgresql://postgres:postgres@localhost:5432/service_catalog -c "SELECT COUNT(*) FROM entities; SELECT COUNT(*) FROM entity_flows;"`

### Level 3: API Validation

- `curl -s http://localhost:3001/entities | jq`
- `curl -s http://localhost:3001/entities/graph | jq`
- `curl -s -X POST http://localhost:3001/entities -H 'Content-Type: application/json' -d '{"nameEn":"Orders","nameHe":"הזמנות","description":"Primary orders record","ownerTeamId":"<team-uuid>"}' | jq`
- `curl -s -X POST http://localhost:3001/entities/<entity-uuid>/team-sources -H 'Content-Type: application/json' -d '{"consumerTeamId":"<team-uuid>","sourceTeamId":"<team-uuid>"}' | jq`
- `curl -s -X POST http://localhost:3001/entities/<entity-uuid>/flows -H 'Content-Type: application/json' -d '{"toEntityId":"<entity-uuid>","label":"feeds"}' | jq`

### Level 4: Browser Validation

Start apps on `localhost`, not `127.0.0.1`:

- `cd backend && npm run start:dev`
- `cd frontend && npm run dev -- --host localhost --port 4173`

Then validate with browser automation:

- `agent-browser open http://localhost:4173/entities`
- `agent-browser snapshot -i`
- Create an entity via the UI and confirm it appears in the graph and panel.
- Add a team-source mapping in the panel and confirm it persists after refresh.
- Add a flow and confirm the edge appears.
- Edit an entity and confirm the graph/panel refreshes.
- Delete a flow and entity and confirm graph consistency.

### Level 5: Manual SQL Sanity Checks

- `psql postgresql://postgres:postgres@localhost:5432/service_catalog -c "SELECT id, name_en, name_he, owner_team_id, original_source_team_id FROM entities ORDER BY created_at DESC LIMIT 10;"`
- `psql postgresql://postgres:postgres@localhost:5432/service_catalog -c "SELECT entity_id, consumer_team_id, source_team_id FROM entity_team_sources ORDER BY created_at DESC LIMIT 10;"`
- `psql postgresql://postgres:postgres@localhost:5432/service_catalog -c "SELECT from_entity, to_entity, label FROM entity_flows ORDER BY created_at DESC LIMIT 10;"`

---

## ACCEPTANCE CRITERIA

- [ ] `/entities` renders a real React Flow graph instead of the placeholder page.
- [ ] Backend exposes working PRD-aligned endpoints for entities, entity team sources, and entity flows.
- [ ] `GET /entities` supports search by English and Hebrew name.
- [ ] `GET /entities/graph` returns all nodes and edges needed by the frontend graph.
- [ ] Entity side panel supports create, edit, and delete.
- [ ] Team-source mappings can be created, replaced, updated, and deleted.
- [ ] Entity flows can be created, updated, and deleted.
- [ ] Existing local entity rows survive the migration.
- [ ] Existing local relationship rows survive the migration into the new flow model.
- [ ] `lineage` is not accidentally destroyed or silently repurposed without an explicit migration rule.
- [ ] All validation commands pass with zero errors.
- [ ] No regressions are introduced to teams, map, or service CRUD.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Migration strategy validated against non-empty local DB
- [ ] New entities registered in Nest TypeORM config
- [ ] Backend build passes
- [ ] Frontend build passes
- [ ] Frontend lint passes
- [ ] API validation passes
- [ ] Browser validation on `http://localhost` passes
- [ ] Acceptance criteria all met
- [ ] Code reviewed for schema drift and future maintainability

---

## NOTES

- Recommended migration strategy is preservation-first. The local DB already contains legacy entity data; assume it matters.
- Recommended layout library is `@dagrejs/dagre`, not ELK, for the first pass. Dagre is simpler, smaller, and adequate for the PRD’s first hierarchical layout requirement.
- Keep docs attachments out of this slice. The PRD includes them, but the current codebase has no docs backend. Adding fake UI hooks now will increase drift instead of reducing it.
- Keep the entity graph auto-layout only. Manual position persistence is not part of the PRD for entities and would create unnecessary complexity.
- If you later decide to clean up `lineage`, do it in a dedicated migration after entity feature parity exists and after you explicitly define the data-mapping policy.

**Confidence Score**: 8/10 that one-pass implementation will succeed if the execution agent follows this plan exactly and validates the migration against the non-empty local DB before writing application code.
