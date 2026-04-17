# Feature: Entities Team Filter & Data Place Colors

The following plan should be complete, but validate codebase patterns and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

---

## Feature Description

Redesign the Entities section so users can filter entities by team (single-select) and see each entity's box colored by the database ("data place") it comes from — for that team. Since the same entity can come from different databases for different teams, `dataPlace` is stored on the `EntityTeamSource` join record, not on the entity itself.

## User Story

As a catalog user
I want to pick a team and see its entities colored by which database they come from
So that I can instantly understand the data landscape of a team and its sources

## Problem Statement

Currently the entities graph shows all entities with no team ownership hierarchy and no visual indicator of data source. The multi-checkbox filter is confusing.

## Solution Statement

- Add a `data_place` column to `entity_team_sources` (VARCHAR, nullable)
- When a team is selected, the graph API returns each entity's `dataPlace` for that team in the node data
- Entity nodes render a colored top bar + colored badge using a fixed palette keyed by `dataPlace` name
- Filter panel becomes a single-team pill selector (click a team to see its entities; click again to deselect)
- The EntityPanel team source form gets a `dataPlace` text input field

## Feature Metadata

**Feature Type**: Enhancement  
**Estimated Complexity**: Medium  
**Primary Systems Affected**: EntityTeamSource (backend), EntitiesService graph query, EntityNode, EntityFilterPanel, EntityCanvas, EntityPanel  
**Dependencies**: None new — uses existing TypeORM, React Flow, Tailwind stack

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ THESE BEFORE IMPLEMENTING

- `backend/src/entity-team-sources/entity-team-source.entity.ts` — entity to add `dataPlace` column to
- `backend/src/entity-team-sources/dto/create-entity-team-source.dto.ts` — DTO to extend with `dataPlace`
- `backend/src/entity-team-sources/dto/update-entity-team-source.dto.ts` — extends CreateDto via PartialType; no changes needed unless direct field is required
- `backend/src/entity-team-sources/entity-team-sources.service.ts` — create/update must persist `dataPlace`
- `backend/src/entities/entities.module.ts` (line 9) — forFeature array; needs `EntityTeamSource` added
- `backend/src/entities/entities.service.ts` (lines 98–158) — `getGraph()` method; inject teamSourcesRepo, build dataPlaceMap after entity fetch
- `backend/src/entities/dto/query-entity-graph.dto.ts` — existing `internalTeamIds` param used as-is (single element array)
- `backend/src/migrations/1715000000000-AddWorkspaceLinks.ts` — migration pattern to mirror: has `name = 'ClassName'`, `public async up/down`, raw SQL via `queryRunner.query()`
- `frontend/src/types/entity.ts` (lines 19–28, 49–57) — `EntityTeamSource`, `CreateEntityTeamSourcePayload`, `UpdateEntityTeamSourcePayload` types
- `frontend/src/types/entity-graph.ts` (lines 1–10) — `EntityGraphNodeData` type; add `dataPlace`
- `frontend/src/api/client.ts` (lines 104–129, 132–138) — `entitiesApi.graph()` custom paramsSerializer for arrays; `entityTeamSourcesApi` create/update; no changes needed
- `frontend/src/components/entities/EntityNode.tsx` — replace with color-accented version
- `frontend/src/components/entities/EntityFilterPanel.tsx` — replace with single-team pill selector
- `frontend/src/components/entities/EntityCanvas.tsx` (lines 41–53) — state; replace `selectedInternalTeamIds: Set<string>` + `selectedExternalTeamIds: Set<string>` with `selectedTeamId: string | null`
- `frontend/src/components/entities/EntityPanel.tsx` (lines 33–41, 472–535) — `TeamSourceFormState` and the team source form section; add `dataPlace` field

### New Files to Create

- `backend/src/migrations/1715100000000-AddDataPlaceToEntityTeamSource.ts` — ALTER TABLE migration

### Patterns to Follow

**Migration pattern** (mirror `1715000000000-AddWorkspaceLinks.ts`):
```typescript
export class AddDataPlaceToEntityTeamSource1715100000000 implements MigrationInterface {
  name = 'AddDataPlaceToEntityTeamSource1715100000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "entity_team_sources" ADD COLUMN "data_place" VARCHAR(255) NULL`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "entity_team_sources" DROP COLUMN "data_place"`);
  }
}
```

**TypeORM column pattern** (mirror existing columns in entity-team-source.entity.ts):
```typescript
@Column({ name: 'data_place', type: 'varchar', length: 255, nullable: true })
dataPlace: string | null;
```

**DTO optional field pattern** (mirror existing DTOs):
```typescript
@IsOptional()
@IsString()
@MaxLength(255)
dataPlace?: string | null;
```

**Graph dataPlace lookup** — after fetching `entities` in `getGraph()`, do a second targeted query:
```typescript
const dataPlaceMap = new Map<string, string | null>();
if (query.internalTeamIds?.length && entityIds.length > 0) {
  const teamSources = await this.teamSourcesRepo.find({
    where: { entityId: In(entityIds), consumerTeamId: In(query.internalTeamIds) },
  });
  for (const ts of teamSources) {
    dataPlaceMap.set(ts.entityId, ts.dataPlace ?? null);
  }
}
// then in nodes mapping: dataPlace: dataPlaceMap.get(entity.id) ?? null
```
Note: `In` is imported from `typeorm`.

**Color palette** — define as a plain object constant in `EntityNode.tsx`. Starting with two entries:
```typescript
const DATA_PLACE_COLORS: Record<string, string> = {
  banana: '#f59e0b',  // amber
  apple:  '#22c55e',  // green
};
const DEFAULT_COLOR = '#64748b'; // slate — no data place or unknown
```
Key lookup: `data.dataPlace?.toLowerCase()`. When `dataPlace` is null, use default color (no accent, no badge).

**EntityNode color accent** — a 4px colored top bar + a small colored pill badge replacing the "Entity" badge when dataPlace is set. The node must stay `overflow-hidden` for the top bar to respect border-radius.

**Filter panel — single team pills pattern**: Render one "כל הצוותים" (all) button + one pill per internal team. Active state uses the team's `color` field for border + background tint. Clicking an already-selected team deselects (sets to null).

**EntityCanvas state change**:
- Remove: `selectedInternalTeamIds`, `selectedExternalTeamIds`, `toggleInternalTeam`, `toggleExternalTeam`
- Add: `selectedTeamId: string | null`, `setSelectedTeamId`
- `graphParams` becomes: `{ q: deferredSearch || undefined, internalTeamIds: selectedTeamId ? [selectedTeamId] : [] }`
- `clearFilters` resets both `search` and `selectedTeamId`
- Pass `internalTeams` (not externalTeams) and `selectedTeamId` to `EntityFilterPanel`

**EntityPanel team source form**:
- `TeamSourceFormState` gets `dataPlace: string`
- `EMPTY_TEAM_SOURCE_FORM` gets `dataPlace: ''`
- The form renders a text input for `dataPlace` between the existing consumer/source team selects
- On `beginTeamSourceEdit`, set `dataPlace: teamSource.dataPlace ?? ''`
- `handleSaveTeamSource` passes `dataPlace: teamSourceForm.dataPlace.trim() || null` in the payload

---

## IMPLEMENTATION PLAN

### Phase 1: Backend — data model & migration

Add the column, wire through entity/DTO/service.

### Phase 2: Backend — graph API

Inject `EntityTeamSource` repo into `EntitiesService`, build `dataPlaceMap`, return `dataPlace` in node data.

### Phase 3: Frontend types

Update `EntityTeamSource`, `CreateEntityTeamSourcePayload`, `UpdateEntityTeamSourcePayload` in `entity.ts`. Update `EntityGraphNodeData` in `entity-graph.ts`.

### Phase 4: Frontend UI

Update EntityNode, EntityFilterPanel, EntityCanvas, EntityPanel.

---

## STEP-BY-STEP TASKS

### Task 1 — CREATE `backend/src/migrations/1715100000000-AddDataPlaceToEntityTeamSource.ts`

- **IMPLEMENT**: Migration that adds `data_place VARCHAR(255) NULL` to `entity_team_sources`
- **PATTERN**: Mirror `1715000000000-AddWorkspaceLinks.ts` — use `name = 'ClassName'`, `public async up/down`, raw `queryRunner.query()`
- **IMPORTS**: `MigrationInterface, QueryRunner` from `typeorm`
- **VALIDATE**: File exists and compiles — `cd backend && npx tsc --noEmit -p tsconfig.build.json`

### Task 2 — UPDATE `backend/src/entity-team-sources/entity-team-source.entity.ts`

- **ADD**: `@Column({ name: 'data_place', type: 'varchar', length: 255, nullable: true }) dataPlace: string | null;` after `sourceTeamId`
- **IMPORTS**: No new imports needed — `@Column` already imported
- **VALIDATE**: `cd backend && npx tsc --noEmit -p tsconfig.build.json`

### Task 3 — UPDATE `backend/src/entity-team-sources/dto/create-entity-team-source.dto.ts`

- **ADD**: `@IsOptional() @IsString() @MaxLength(255) dataPlace?: string | null;`
- **IMPORTS**: Add `IsOptional, IsString, MaxLength` from `class-validator`
- **VALIDATE**: `cd backend && npx tsc --noEmit -p tsconfig.build.json`

### Task 4 — UPDATE `backend/src/entity-team-sources/entity-team-sources.service.ts`

- **UPDATE create()**: In the upsert branch (`if (existing)`) add `dataPlace: dto.dataPlace ?? null` to the update call. In the `teamSourcesRepo.create({...})` call add `dataPlace: dto.dataPlace ?? null`
- **UPDATE update()**: In `teamSourcesRepo.update(id, {...})` add `...(dto.dataPlace !== undefined ? { dataPlace: dto.dataPlace ?? null } : {})` (spread only if explicitly provided, to avoid overwriting with undefined on partial updates)
- **GOTCHA**: `UpdateEntityTeamSourceDto` extends `PartialType(CreateEntityTeamSourceDto)` so `dataPlace` becomes optional automatically — no change to the update DTO file needed
- **VALIDATE**: `cd backend && npx tsc --noEmit -p tsconfig.build.json`

### Task 5 — UPDATE `backend/src/entities/entities.module.ts`

- **ADD**: Import `EntityTeamSource` from `'../entity-team-sources/entity-team-source.entity'` and add it to the `TypeOrmModule.forFeature([...])` array
- **VALIDATE**: `cd backend && npx tsc --noEmit -p tsconfig.build.json`

### Task 6 — UPDATE `backend/src/entities/entities.service.ts`

- **ADD import**: `In` from `'typeorm'` (alongside existing `Repository, SelectQueryBuilder`)
- **ADD import**: `EntityTeamSource` from `'../entity-team-sources/entity-team-source.entity'`
- **ADD constructor param**: `@InjectRepository(EntityTeamSource) private readonly teamSourcesRepo: Repository<EntityTeamSource>`
- **UPDATE `getGraph()`**: After `const entityIds = entities.map(...)`, add the `dataPlaceMap` block (see Patterns section above). In the `nodes` mapping, add `dataPlace: dataPlaceMap.get(entity.id) ?? null`
- **GOTCHA**: When `internalTeamIds` is empty (no team selected), `dataPlaceMap` stays empty and all nodes get `dataPlace: null` — this is correct (no color when no team selected)
- **VALIDATE**: `cd backend && npx tsc --noEmit -p tsconfig.build.json`

### Task 7 — UPDATE `frontend/src/types/entity.ts`

- **UPDATE `EntityTeamSource`**: Add `dataPlace: string | null;`
- **UPDATE `CreateEntityTeamSourcePayload`**: Add `dataPlace?: string | null;`
- **UPDATE `UpdateEntityTeamSourcePayload`**: Add `dataPlace?: string | null;`
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 8 — UPDATE `frontend/src/types/entity-graph.ts`

- **ADD**: `dataPlace: string | null;` to `EntityGraphNodeData`
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 9 — UPDATE `frontend/src/components/entities/EntityNode.tsx`

- **IMPLEMENT**: 
  - Define `DATA_PLACE_COLORS` and `DEFAULT_COLOR` constants at module level
  - Define `getDataPlaceColor(dataPlace: string | null): string` helper
  - Wrap the node in `overflow-hidden` so the top bar respects border-radius
  - Add a `<div className="h-1 w-full" style={{ backgroundColor: accentColor }} />` as the first child (top color bar)
  - Move handles and content into a `<div className="px-4 py-3">` wrapper
  - Replace the "Entity" badge with a colored pill when `data.dataPlace` is set (same style as the "Entity" badge but uses `accentColor` for bg tint, border, and text). Show "Entity" badge when `dataPlace` is null
- **GOTCHA**: Handles must be inside the positioned wrapper so React Flow can find them — keep them inside the `px-4 py-3` div
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 10 — UPDATE `frontend/src/components/entities/EntityFilterPanel.tsx`

- **IMPLEMENT**: Completely rewrite with simplified props:
  ```typescript
  interface EntityFilterPanelProps {
    search: string;
    teams: Team[];              // internal teams only
    selectedTeamId: string | null;
    onSearchChange: (value: string) => void;
    onTeamSelect: (teamId: string | null) => void;
  }
  ```
- **IMPLEMENT**: Search input (keep identical to current). Below it, a `<div className="flex flex-wrap gap-2">` with:
  - "כל הצוותים" pill — selected when `selectedTeamId === null`, styled with blue (`#1e40af` bg, `#3b82f6` border) when active
  - One pill per team — selected pill uses `team.color` for bg tint + border; unselected is transparent with `#334155` border and `#94a3b8` text. Each pill has a small colored dot (`team.color`) on the left
  - Clicking a selected team calls `onTeamSelect(null)` (deselects)
- **REMOVE**: `onClear`, `internalTeams`, `externalTeams`, `selectedInternalTeamIds`, `selectedExternalTeamIds`, `onInternalTeamToggle`, `onExternalTeamToggle` — these props are gone
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 11 — UPDATE `frontend/src/components/entities/EntityCanvas.tsx`

- **REMOVE state**: `selectedInternalTeamIds`, `selectedExternalTeamIds`
- **REMOVE callbacks**: `toggleInternalTeam`, `toggleExternalTeam`
- **ADD state**: `const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);`
- **UPDATE `graphParams`**: 
  ```typescript
  const graphParams = useMemo<EntitiesGraphQueryParams>(() => ({
    q: deferredSearch || undefined,
    internalTeamIds: selectedTeamId ? [selectedTeamId] : [],
  }), [deferredSearch, selectedTeamId]);
  ```
- **UPDATE `clearFilters`**: Reset both `search` and `selectedTeamId` to defaults
- **UPDATE `EntitiesGraphQueryParams` usage**: Remove `externalTeamIds` from params (no longer needed)
- **UPDATE `<EntityFilterPanel>` JSX**: Change props to `teams={internalTeams}`, `selectedTeamId={selectedTeamId}`, `onTeamSelect={setSelectedTeamId}` — remove all the old props
- **GOTCHA**: `externalTeams` useMemo and `externalTeams` variable can be fully removed since the new filter panel doesn't show them. Keep `internalTeams` useMemo.
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 12 — UPDATE `frontend/src/components/entities/EntityPanel.tsx`

- **UPDATE `TeamSourceFormState`**: Add `dataPlace: string`
- **UPDATE `EMPTY_TEAM_SOURCE_FORM`**: Add `dataPlace: ''`
- **UPDATE `beginTeamSourceEdit()`**: Set `dataPlace: teamSource.dataPlace ?? ''` alongside existing fields
- **UPDATE `handleSaveTeamSource()`**: Pass `dataPlace: teamSourceForm.dataPlace.trim() || null` in both the create and update payloads
- **ADD form field**: Between the source team select and the save buttons, add a text input for `dataPlace`:
  ```tsx
  <div>
    <label className={LABEL_CLASS}>Data Place</label>
    <input
      className={INPUT_CLASS}
      value={teamSourceForm.dataPlace}
      onChange={(e) => setTeamSourceForm(prev => ({ ...prev, dataPlace: e.target.value }))}
      placeholder="banana"
    />
  </div>
  ```
- **DISPLAY in view mode**: In the `visibleTeamSources` mapping (the read-only cards), add a small badge showing `teamSource.dataPlace` when set — below the consumer/source text
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

---

## VALIDATION COMMANDS

### Level 1: Type check backend
```bash
cd backend && npx tsc --noEmit -p tsconfig.build.json
```

### Level 2: Type check frontend
```bash
cd frontend && npx tsc --noEmit
```

### Level 3: Run migration
```bash
cd backend && npm run migration:run
```

### Level 4: Manual validation
1. Start backend and frontend (`npm run start:dev` + `npm run dev`)
2. Go to `/entities`
3. Click a team pill — only that team's entities should appear
4. Entities with a `dataPlace` set should show a colored top bar + colored badge
5. Entities without `dataPlace` should show the gray "Entity" badge with no top bar
6. Click the same team pill — deselects, all entities reappear (no colors)
7. Open an entity → "Internal Teams And Sources" section → edit a mapping → `Data Place` field should be present and saveable
8. After saving a data place (e.g. "banana"), select that entity's consumer team in the filter — the entity should show the amber banana color

---

## ACCEPTANCE CRITERIA

- [ ] `data_place` column exists in `entity_team_sources` table after migration
- [ ] Creating/updating an `EntityTeamSource` with `dataPlace` persists correctly
- [ ] Graph API returns `dataPlace` in node data when `internalTeamIds` is provided
- [ ] Selecting a team in the filter panel shows only that team's entities
- [ ] Entity nodes show a colored top bar and badge when `dataPlace` is set
- [ ] No color shown when no team is selected or entity has no `dataPlace`
- [ ] Color palette: `banana` → amber `#f59e0b`, `apple` → green `#22c55e`, unknown → slate `#64748b`
- [ ] EntityPanel team source form has a `Data Place` text input
- [ ] `dataPlace` displayed in read-only team source cards in EntityPanel
- [ ] TypeScript compiles with zero errors on both backend and frontend
- [ ] Deselecting a team (clicking active pill) returns to "all entities" view

---

## NOTES

- `UpdateEntityTeamSourceDto` extends `PartialType(CreateEntityTeamSourceDto)` — `dataPlace` is automatically optional in the update DTO, no need to touch that file
- The `externalTeamIds` filter is removed from the UI entirely in this redesign. The backend still supports it — no backend removal needed
- The `entitiesApi.graph()` paramsSerializer in `client.ts` already handles `internalTeamIds` as an array — passing `[selectedTeamId]` works without any changes there
- Data place names are free-text strings for now. The user will provide a canonical list later — at that point `dataPlace` can become a select/enum. Keep it a plain text input for now.
- Confidence score: **9/10** — all patterns are directly traceable to existing code, no new libraries, minimal surface area
