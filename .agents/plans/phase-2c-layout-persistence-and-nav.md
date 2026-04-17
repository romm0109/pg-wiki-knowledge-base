# Feature: Phase 2C — Layout Persistence & Dependency Navigation

The following plan should be complete, but validate codebase patterns and task sanity before implementing.

Pay special attention to: the migration pattern (manual SQL, not TypeORM `generate`), the existing DTO inheritance via `PartialType`, the `onNodeDragStop` React Flow event, and the RTL CSS conventions (`end-0`, `border-s`, etc.).

## Feature Description

Two focused improvements that complete the Phase 2 story:

1. **Clickable dependencies** — In `ServicePanel`, the outgoing/incoming connection lists are currently static text. Clicking a service name should open that service's panel (navigate to it on the map).

2. **Layout persistence with explicit save** — When a user drags a team group or service node, the map enters an "edit state" showing a שמירה / ביטול bar. On שמירה, all current node positions are PATCHed to the backend and stored. On ביטול, positions revert to last saved state. Currently, all positions are re-computed from scratch on every `GET /map` call and drag changes are lost on refresh.

## User Story

As a platform engineer
I want to drag map nodes to a preferred layout and save it, and navigate between services by clicking connection links
So that I can maintain a readable topology map and explore service dependencies quickly

## Problem Statement

- `ServicePanel` shows dependency names but they are unclickable — to inspect a connected service you must find it on the map manually.
- `MapService.getMap()` computes node positions from a fixed grid algorithm on every call. Any dragging is lost on refresh.

## Solution Statement

- **Navigation**: add `onNavigate: (serviceId: string) => void` prop to `ServicePanel`. In `MapCanvas`, provide a handler that calls `servicesApi.get(id)` and `setSelectedService`. Each `<li>` in the dependency lists gets an `onClick`.
- **Layout**: add nullable `position_x / position_y` float columns to `teams` and `services` via a TypeORM migration. Update `MapService.getMap()` to use stored values when non-null. Add `positionX / positionY` optional fields to `UpdateTeamDto` and `UpdateServiceDto` (inheriting validators). Add `onNodeDragStop` to `ReactFlow` in `MapCanvas` → sets `layoutDirty = true`. Render a floating save bar. On שמירה, batch-PATCH all visible nodes; on ביטול, `fetchMap()`.

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**: Frontend (`MapCanvas`, `ServicePanel`), Backend (`teams` entity/DTO, `services` entity/DTO, `MapService`, new migration)
**Dependencies**: None new

---

## CONTEXT REFERENCES

### Relevant Codebase Files — MUST READ BEFORE IMPLEMENTING

- `frontend/src/components/map/MapCanvas.tsx` (full file) — all state, handlers, JSX. `handleNodeClick` pattern, `fetchMap`, mutual exclusion logic.
- `frontend/src/components/map/ServicePanel.tsx` (full file) — dependency list rendering just added (lines ~151–181). Add `onNavigate` prop and `onClick` handlers here.
- `frontend/src/types/service.ts` — `ServiceConnectionRef` (just added). `Service.outgoingConnections` / `incomingConnections`.
- `frontend/src/api/client.ts` — `teamsApi.update` and `servicesApi.update` signatures. Both accept `Partial<CreateXPayload>` — just add `positionX / positionY` to the payload types.
- `backend/src/map/map.service.ts` (full file) — grid layout algorithm. Use stored positions when non-null, fall through to computed otherwise.
- `backend/src/teams/team.entity.ts` — add `positionX` / `positionY` nullable float columns.
- `backend/src/services/service.entity.ts` — add `positionX` / `positionY` nullable float columns.
- `backend/src/teams/dto/create-team.dto.ts` — `CreateTeamDto` is the parent of `UpdateTeamDto`. Add optional position fields here.
- `backend/src/services/dto/create-service.dto.ts` — same pattern.
- `backend/src/migrations/1712500000000-InitialSchema.ts` — migration file format to mirror exactly.

### New Files to Create

- `backend/src/migrations/1714000000000-AddNodePositions.ts` — adds `position_x` / `position_y` nullable float columns to `teams` and `services`.

### Patterns to Follow

**Migration pattern** — manual SQL, same file structure as `InitialSchema`. Name format: `{timestamp}-{PascalCaseName}`. Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`:
```ts
export class AddNodePositions1714000000000 implements MigrationInterface {
  name = 'AddNodePositions1714000000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "position_x" double precision`);
    await queryRunner.query(`ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "position_y" double precision`);
    await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "position_x" double precision`);
    await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "position_y" double precision`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "position_y"`);
    await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "position_x"`);
    await queryRunner.query(`ALTER TABLE "teams" DROP COLUMN IF EXISTS "position_y"`);
    await queryRunner.query(`ALTER TABLE "teams" DROP COLUMN IF EXISTS "position_x"`);
  }
}
```

**DTO validation — optional float fields** (mirror `IsOptional()` + `IsNumber()` pattern, `class-validator`):
```ts
@IsOptional()
@IsNumber()
positionX?: number;

@IsOptional()
@IsNumber()
positionY?: number;
```
Import `IsNumber` from `class-validator` (already installed).

**Entity column — nullable float** (TypeORM):
```ts
@Column({ name: 'position_x', type: 'double precision', nullable: true })
positionX: number | null;

@Column({ name: 'position_y', type: 'double precision', nullable: true })
positionY: number | null;
```

**Map service — fall-through to computed position**:
```ts
// In team node construction:
position: {
  x: team.positionX ?? teamX,
  y: team.positionY ?? 0,
},
// In service node construction:
position: {
  x: svc.positionX ?? (TEAM_PADDING + col * (NODE_WIDTH + COL_GAP)),
  y: svc.positionY ?? (TEAM_PADDING + 32 + row * (NODE_HEIGHT + ROW_GAP)),
},
```

**IMPORTANT — `teamX` must still be computed even when stored positions are used**, because it's the fallback for newly-added teams. The `teamX += groupWidth + 48` accumulation must run unconditionally inside the loop.

**`onNodeDragStop` React Flow event** — fires once when a drag ends (not on every pixel move), receives `(event, node)`. This is the right hook — not `onNodesChange`:
```ts
const handleNodeDragStop = useCallback((_event: React.MouseEvent, _node: AppNode) => {
  setLayoutDirty(true);
}, []);
```

**`nodes` state contains current positions** — after a drag, React Flow's internal state (managed by `useNodesState`) already reflects the new positions. Reading `nodes` during save gives us the latest geometry without any extra tracking.

**Layout save bar** — floating bar docked to the bottom-center of the map container (not the whole viewport). Use `absolute` positioning inside the `relative` map div. Only visible when `layoutDirty === true`:
```tsx
{layoutDirty && (
  <div className="absolute bottom-6 start-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 shadow-2xl">
    <span className="text-xs text-slate-400">יש שינויים לא שמורים בפריסה</span>
    <button onClick={handleLayoutSave} disabled={savingLayout}
      className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded disabled:opacity-50">
      {savingLayout ? '...' : 'שמירה'}
    </button>
    <button onClick={handleLayoutCancel}
      className="text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5">
      ביטול
    </button>
  </div>
)}
```

**`-translate-x-1/2` note** — Tailwind v4 uses `start-1/2` for logical-property horizontal centering but `translate` uses physical `x`. For centering a floating bar this combination works correctly in both LTR and RTL.

**API payload types** — `teamsApi.update` signature is `(id, Partial<CreateTeamPayload>)`. `CreateTeamPayload` in `frontend/src/types/team.ts` needs `positionX? / positionY?` added. Check that file exists and mirror the pattern.

**Clickable dep `onClick`** — wrap the service name `<span>` in a `<button>` (for accessibility) styled as unstyled inline text link:
```tsx
<button
  onClick={() => onNavigate(conn.toServiceId)}
  className="text-slate-300 hover:text-slate-100 hover:underline text-sm text-start"
>
  {conn.toService?.name ?? conn.toServiceId}
</button>
```

**RTL conventions** — `text-start` (not `text-left`), `start-1/2` (not `left-1/2`), `end-0` (not `right-0`).

---

## IMPLEMENTATION PLAN

### Phase 1: Backend — DB + DTOs + Map service

Add the migration, update entities, DTOs, and map service to use stored positions.

### Phase 2: Frontend — Types + API client

Extend `CreateTeamPayload` and `CreateServicePayload` types in frontend to accept optional position fields.

### Phase 3: Frontend — MapCanvas wiring

Add `layoutDirty` state, `handleNodeDragStop`, `handleLayoutSave`, `handleLayoutCancel`. Render save bar. Wire `onNodeDragStop` to ReactFlow.

### Phase 4: Frontend — ServicePanel navigation

Add `onNavigate` prop, update MapCanvas to provide the handler, add `onClick` to dependency list items.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom.

---

### Task 1 — CREATE `backend/src/migrations/1714000000000-AddNodePositions.ts`

- **CREATE**: New migration file following `InitialSchema` format exactly.
- **IMPLEMENT**: Add `position_x` and `position_y` as `double precision` nullable columns to both `teams` and `services`. Use `ADD COLUMN IF NOT EXISTS` for safety.
- **GOTCHA**: TypeORM requires the migration class name to match the timestamp suffix — `AddNodePositions1714000000000`.
- **VALIDATE**: `cd /path/to/backend && npm run migration:run` — should apply without error.

---

### Task 2 — UPDATE `backend/src/teams/team.entity.ts`

- **ADD** two nullable float columns:
```ts
@Column({ name: 'position_x', type: 'double precision', nullable: true })
positionX: number | null;

@Column({ name: 'position_y', type: 'double precision', nullable: true })
positionY: number | null;
```
- **VALIDATE**: `cd /path/to/backend && npx tsc --noEmit`

---

### Task 3 — UPDATE `backend/src/services/service.entity.ts`

- **ADD** the same two columns as Task 2 (same code, same placement after `updatedAt`).
- **VALIDATE**: `cd /path/to/backend && npx tsc --noEmit`

---

### Task 4 — UPDATE `backend/src/teams/dto/create-team.dto.ts`

- **ADD** to `CreateTeamDto` (inherited by `UpdateTeamDto` via `PartialType`):
```ts
@IsOptional()
@IsNumber()
positionX?: number;

@IsOptional()
@IsNumber()
positionY?: number;
```
- **IMPORTS**: add `IsNumber` to the existing `class-validator` import.
- **VALIDATE**: `cd /path/to/backend && npx tsc --noEmit`

---

### Task 5 — UPDATE `backend/src/services/dto/create-service.dto.ts`

- **ADD** same position fields as Task 4.
- **IMPORTS**: add `IsNumber` to the existing `class-validator` import.
- **VALIDATE**: `cd /path/to/backend && npx tsc --noEmit`

---

### Task 6 — UPDATE `backend/src/services/services.service.ts`

`update()` already does `Object.assign(service, dto)` and saves — no logic change needed. But verify that `positionX / positionY` from the DTO will flow through. Since `UpdateServiceDto extends PartialType(CreateServiceDto)` and `Object.assign` copies all enumerable properties, this works automatically.

- **VERIFY** (read the `update` method): confirm `Object.assign(service, dto)` is the only mutation before `save`. No change should be needed.
- **VALIDATE**: `cd /path/to/backend && npx tsc --noEmit`

---

### Task 7 — UPDATE `backend/src/teams/teams.service.ts`

Same check as Task 6 for teams. The `update` method likely does `Object.assign` too.

- **VERIFY**: read `update` method — confirm `Object.assign` pattern, no changes needed.
- **VALIDATE**: `cd /path/to/backend && npx tsc --noEmit`

---

### Task 8 — UPDATE `backend/src/map/map.service.ts`

Use stored positions when non-null; fall back to computed grid otherwise.

**For team nodes** — inside the `for (const team of teams)` loop, replace:
```ts
position: { x: teamX, y: 0 },
```
with:
```ts
position: { x: team.positionX ?? teamX, y: team.positionY ?? 0 },
```

**For service nodes** — inside the `teamServices.forEach`, replace the two computed values:
```ts
position: {
  x: TEAM_PADDING + col * (NODE_WIDTH + COL_GAP),
  y: TEAM_PADDING + 32 + row * (NODE_HEIGHT + ROW_GAP),
},
```
with:
```ts
position: {
  x: svc.positionX ?? (TEAM_PADDING + col * (NODE_WIDTH + COL_GAP)),
  y: svc.positionY ?? (TEAM_PADDING + 32 + row * (NODE_HEIGHT + ROW_GAP)),
},
```

- **GOTCHA**: `teamX += groupWidth + 48` must remain unconditional — it provides the fallback for teams without stored positions and must be accurate regardless.
- **GOTCHA**: Also update `getMap()` to load `services` with positions. The current query is `this.servicesRepo.find(...)` — TypeORM selects all columns by default (except those with `select: false`), so `positionX` / `positionY` will be included automatically once the entity is updated. No query change needed.
- **VALIDATE**: `cd /path/to/backend && npx tsc --noEmit && npm run build`

---

### Task 9 — UPDATE `frontend/src/types/team.ts`

Read `frontend/src/types/team.ts` first. Add optional position fields to `CreateTeamPayload` (or whatever the payload type is called):
```ts
positionX?: number;
positionY?: number;
```

- **VALIDATE**: `cd /path/to/frontend && npx tsc --noEmit`

---

### Task 10 — UPDATE `frontend/src/types/service.ts`

Add to `CreateServicePayload`:
```ts
positionX?: number;
positionY?: number;
```

- **VALIDATE**: `cd /path/to/frontend && npx tsc --noEmit`

---

### Task 11 — UPDATE `frontend/src/components/map/MapCanvas.tsx`

Apply in order:

**11a — Add imports** (none new — `teamsApi` already imported, `AppNode` already imported).

**11b — Add state:**
```ts
const [layoutDirty, setLayoutDirty] = useState(false);
const [savingLayout, setSavingLayout] = useState(false);
```

**11c — Add `handleNodeDragStop`:**
```ts
const handleNodeDragStop = useCallback((_event: React.MouseEvent, _node: AppNode) => {
  setLayoutDirty(true);
}, []);
```

**11d — Add `handleLayoutSave`:**
```ts
const handleLayoutSave = useCallback(async () => {
  setSavingLayout(true);
  try {
    await Promise.all(
      nodes.map(node => {
        if (node.type === 'teamGroup') {
          return teamsApi.update(node.id, {
            positionX: node.position.x,
            positionY: node.position.y,
          });
        } else if (node.type === 'service') {
          return servicesApi.update(node.id, {
            positionX: node.position.x,
            positionY: node.position.y,
          });
        }
        return Promise.resolve();
      }),
    );
    await fetchMap();
    setLayoutDirty(false);
  } finally {
    setSavingLayout(false);
  }
}, [nodes, fetchMap]);
```

**11e — Add `handleLayoutCancel`:**
```ts
const handleLayoutCancel = useCallback(async () => {
  await fetchMap(); // re-fetch from server, which still has old positions
  setLayoutDirty(false);
}, [fetchMap]);
```

**11f — Wire `onNodeDragStop` to `<ReactFlow>`:**
```tsx
<ReactFlow
  ...
  onNodeDragStop={handleNodeDragStop}
  ...
>
```

**11g — Render save bar** after `<ConnectLabelDialog>` closing tag but inside the outer `<div>`:
```tsx
{layoutDirty && (
  <div className="absolute bottom-6 start-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 shadow-2xl">
    <span className="text-xs text-slate-400">יש שינויים לא שמורים בפריסה</span>
    <button
      onClick={handleLayoutSave}
      disabled={savingLayout}
      className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded disabled:opacity-50"
    >
      {savingLayout ? '...' : 'שמירה'}
    </button>
    <button
      onClick={handleLayoutCancel}
      className="text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5"
    >
      ביטול
    </button>
  </div>
)}
```

- **GOTCHA**: `handleLayoutSave` uses `nodes` from `useNodesState` which contains the latest React Flow geometry including all drag changes — no need to track positions separately.
- **GOTCHA**: `onNodeDragStop` also fires when a teamGroup is dragged. Team node positions are absolute; service node positions are *relative to their parent group*. The backend stores them in whatever coordinate space React Flow uses, and `MapService.getMap()` returns them in the same coordinate space. This round-trips correctly.
- **GOTCHA**: `setLayoutDirty(false)` is NOT called when `fetchMap()` runs elsewhere (e.g. after service edit/delete). Layout dirty state is independent of service data changes.

**11h — Add `onNavigate` handler:**
```ts
const handleNavigateToService = useCallback(async (serviceId: string) => {
  const svc = await servicesApi.get(serviceId);
  setSelectedService(svc);
  setCreateForTeamId(null);
  setSelectedEdge(null);
}, []);
```

**11i — Pass `onNavigate` to `<ServicePanel>`:**
```tsx
<ServicePanel
  ...
  onNavigate={handleNavigateToService}
/>
```

- **VALIDATE**: `cd /path/to/frontend && npx tsc --noEmit`

---

### Task 12 — UPDATE `frontend/src/components/map/ServicePanel.tsx`

**12a — Add `onNavigate` to `ServicePanelProps`:**
```ts
interface ServicePanelProps {
  ...
  onNavigate: (serviceId: string) => void;
}
```

**12b — Destructure in function signature:**
```ts
export default function ServicePanel({
  ...,
  onNavigate,
}: ServicePanelProps) {
```

**12c — Replace `<span>{conn.toService?.name ...}</span>` in outgoing list** with a clickable button:
```tsx
<button
  onClick={() => onNavigate(conn.toServiceId)}
  className="text-slate-300 hover:text-slate-100 hover:underline text-sm text-start bg-transparent border-0 p-0 cursor-pointer"
>
  {conn.toService?.name ?? conn.toServiceId}
</button>
```

**12d — Same for incoming list**, using `conn.fromServiceId`:
```tsx
<button
  onClick={() => onNavigate(conn.fromServiceId)}
  className="text-slate-300 hover:text-slate-100 hover:underline text-sm text-start bg-transparent border-0 p-0 cursor-pointer"
>
  {conn.fromService?.name ?? conn.fromServiceId}
</button>
```

- **VALIDATE**: `cd /path/to/frontend && npx tsc --noEmit`

---

## TESTING STRATEGY

No automated test framework on the frontend. Backend has no test runner configured. Manual validation only.

### Manual Validation Checklist

**Navigation:**
1. Open ServicePanel for a service with outgoing connections → dependency names are underlined on hover
2. Click a dependency name → ServicePanel switches to that service (panel title changes, team changes)
3. Click an incoming connection name → same behavior
4. Clicking a dependency while `layoutDirty = true` → layout bar stays visible, panel switches correctly

**Layout persistence:**
5. Drag a service node to a new position → layout save bar appears with correct Hebrew text
6. Drag more nodes → bar remains visible
7. Click ביטול → nodes snap back to last saved positions, bar disappears
8. Drag nodes again → click שמירה → bar shows `...` while saving, then disappears
9. Refresh the page → nodes appear in the saved positions
10. Create a new service (no stored position) → it appears at the computed grid position, not at 0,0
11. Drag a team group → bar appears; save → team group position persists on refresh
12. `filterState` (team/lifecycle toggles) unchanged after layout save
13. `selectedService`, `selectedEdge`, `createForTeamId` unchanged after layout save

---

## VALIDATION COMMANDS

### Level 1: Backend TypeScript
```bash
cd /path/to/fire-attack-hub/backend && npx tsc --noEmit
```

### Level 2: Backend build
```bash
cd /path/to/fire-attack-hub/backend && npm run build
```

### Level 3: Migration run
```bash
cd /path/to/fire-attack-hub/backend && npm run migration:run
```

### Level 4: Frontend TypeScript
```bash
cd /path/to/fire-attack-hub/frontend && npx tsc --noEmit
```

### Level 5: Frontend lint
```bash
cd /path/to/fire-attack-hub/frontend && npm run lint
```

### Level 6: Frontend build
```bash
cd /path/to/fire-attack-hub/frontend && npm run build
```

### Level 7: Browser validation (agent-browser)

Use the `agent-browser` skill to automate the manual checklist against `http://localhost:5173`. Both backend (`npm run start` in `backend/`) and frontend (`npm run dev` in `frontend/`) must be running before invoking the browser agent.

Instruct the browser agent to verify the following scenarios in order:

**Navigation:**
1. Navigate to `http://localhost:5173` — confirm the map canvas loads with service nodes visible.
2. Click a service node that has outgoing connections → ServicePanel opens → dependency list is visible → dependency names are rendered as clickable elements (hover shows underline).
3. Click a dependency name → confirm ServicePanel header changes to the target service name.
4. Click an incoming connection name → confirm same navigation behavior.

**Layout persistence:**
5. Drag a service node to a new position → confirm a save bar appears containing the text "שמירה" and "ביטול".
6. Click "ביטול" → confirm the save bar disappears and the node returns to its previous position.
7. Drag a service node again → click "שמירה" → confirm bar disappears after save completes.
8. Reload the page (`http://localhost:5173`) → confirm the node appears at the saved position (not at the original grid position).
9. Drag a team group node → confirm the save bar appears.
10. Save → reload → confirm team group is at the saved position.

**Regression:**
11. After all above interactions, confirm team/lifecycle filter toggles still work (click a team filter off → nodes disappear; click on → nodes return).
12. Confirm edge click still opens EdgePanel and service node click still opens ServicePanel.

---

## ACCEPTANCE CRITERIA

- [ ] Clicking a service name in the outgoing/incoming dependency list opens that service's panel
- [ ] Dragging any node sets `layoutDirty = true` and shows the save bar
- [ ] שמירה PATCHes all node positions to the backend and clears the dirty state
- [ ] ביטול re-fetches the map (restoring previous positions) and clears the dirty state
- [ ] After saving and refreshing, all nodes appear at their saved positions
- [ ] Newly-created services (no stored position) fall back to the computed grid position
- [ ] Filter state, selection state are unaffected by layout save/cancel
- [ ] `npx tsc --noEmit` passes on both backend and frontend
- [ ] `npm run lint` passes on frontend
- [ ] `npm run build` passes on both

---

## COMPLETION CHECKLIST

- [ ] Task 1: Migration created and applied
- [ ] Task 2: `team.entity.ts` updated
- [ ] Task 3: `service.entity.ts` updated
- [ ] Task 4: `create-team.dto.ts` updated
- [ ] Task 5: `create-service.dto.ts` updated
- [ ] Task 6: `services.service.ts` verified (no change likely needed)
- [ ] Task 7: `teams.service.ts` verified (no change likely needed)
- [ ] Task 8: `map.service.ts` updated with fallthrough logic
- [ ] Task 9: `frontend/src/types/team.ts` updated
- [ ] Task 10: `frontend/src/types/service.ts` updated
- [ ] Task 11: `MapCanvas.tsx` updated (drag stop, save bar, navigate handler)
- [ ] Task 12: `ServicePanel.tsx` updated (onNavigate prop + clickable deps)
- [ ] All validation commands pass
- [ ] Manual checklist verified

---

## NOTES

**Why `onNodeDragStop` and not `onNodesChange`?**
`onNodesChange` fires on every pixel of movement (position change events). `onNodeDragStop` fires exactly once when the user releases the mouse — much cheaper and semantically correct for "user finished a drag".

**Why batch `Promise.all` on save instead of only saving changed nodes?**
Tracking which nodes moved requires storing the pre-drag snapshot. `Promise.all` over all visible nodes is simpler, idempotent, and fast enough (typically < 20 nodes). PATCH is cheap.

**Why does `handleLayoutCancel` call `fetchMap()` instead of re-deriving from `rawData`?**
`fetchMap()` sets `rawData` to the server's authoritative state. Since we never wrote positions to the server (cancel path), the server still has the old positions, and `fetchMap()` triggers the derive-nodes `useEffect` which re-applies them. Clean and consistent.

**Service node positions are relative to their parent team group.**
React Flow stores `position` relative to the parent when `parentId` is set. When we PATCH `positionX / positionY` for a service, we store the relative coordinates. `MapService.getMap()` returns them in the same coordinate space (relative), so the round-trip is correct.

**Confidence Score: 9/10**
All patterns are derived from existing code. The only mild risk is the `start-1/2 / -translate-x-1/2` centering for RTL — if the layout bar appears off-center, replace with `left-1/2` (physical property) since `translate` is always physical in Tailwind. Main complexity is the migration + entity + DTO chain, but it's fully mechanical.
