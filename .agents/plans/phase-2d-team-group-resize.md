# Feature: Phase 2D — Resizable Team Group Nodes

The following plan should be complete, but validate codebase patterns and task sanity before implementing.

Pay special attention to: the `onResized` callback pattern (mirrors `onAddService`), the `useRef` for resize storage (not state — intentional), and the conditional width/height spread in `handleLayoutSave` (only send if user actually resized that node).

## Feature Description

Team group nodes on the map currently have a fixed, auto-computed size based on how many services they contain. Once a team has been laid out, users cannot manually adjust the group boundary. This feature adds drag-to-resize handles to team group nodes via React Flow's `NodeResizer` component. Resizes participate in the existing Phase 2C save bar: dragging a handle marks the layout dirty, and the user saves/cancels via the same "שמירה / ביטול" bar. Saved dimensions persist in the database and are returned by `GET /map` on subsequent loads.

## User Story

As a platform engineer  
I want to resize team group boxes on the topology map  
So that I can control how much visual space each team occupies, regardless of service count

## Problem Statement

`MapService.getMap()` computes `style: { width, height }` for each team group from the number of services inside it. This auto-sizing is good for the initial view but gives engineers no control: a team with few services gets a tiny box, and there is no way to visually emphasize a team's importance by giving it more space.

## Solution Statement

Add `NodeResizer` from `@xyflow/react` to `TeamGroupNode`. Wire a callback (`data.onResized`) through the node data so that when the user finishes a resize, `MapCanvas` stores the new dimensions in a ref and sets `layoutDirty = true`. The existing save bar is reused without modification. On save, `handleLayoutSave` includes `width` / `height` in the team PATCH payload. The backend stores them in new nullable float columns and `MapService.getMap()` returns them with a fallback to the computed size.

## Feature Metadata

**Feature Type**: Enhancement  
**Estimated Complexity**: Low  
**Primary Systems Affected**: Frontend (`TeamGroupNode`, `MapCanvas`, `types/map`, `types/team`), Backend (`team.entity`, `create-team.dto`, `map.service`, new migration)  
**Dependencies**: `NodeResizer` from `@xyflow/react` (already installed, v12.10.2)

---

## CONTEXT REFERENCES

### Relevant Codebase Files — MUST READ BEFORE IMPLEMENTING

- `frontend/src/components/map/TeamGroupNode.tsx` (full file, 49 lines) — the custom node to modify; note how `onAddService` callback is passed via `data` — **mirror this exact pattern for `onResized`**
- `frontend/src/components/map/MapCanvas.tsx` (full file) — `handleLayoutSave` (lines ~203-227), the `useEffect` that derives `visibleNodes` (lines ~92-135), `handleLayoutCancel` (~229-232) — all need targeted edits
- `frontend/src/types/map.ts` — `TeamGroupData` type; add `onResized?` here
- `frontend/src/types/team.ts` — `CreateTeamPayload`; add `width?` / `height?` here
- `backend/src/teams/team.entity.ts` — add `width` / `height` columns after `positionY`
- `backend/src/teams/dto/create-team.dto.ts` — add `@IsNumber()` fields for `width` / `height`
- `backend/src/map/map.service.ts` — update `style` object to use `team.width ?? groupWidth` fallback
- `backend/src/migrations/1714000000000-AddNodePositions.ts` — **migration file format to mirror exactly**

### New Files to Create

- `backend/src/migrations/1714100000000-AddTeamSize.ts` — adds nullable `width` / `height` double precision columns to `teams`

### Patterns to Follow

**Callback via data** — `onAddService` in `TeamGroupNode` is the canonical example. The callback is added to the node `data` inside the `useEffect` in `MapCanvas` and consumed in the node component via `data.onAddService?.()`. Mirror this identically for `onResized`:

```tsx
// MapCanvas — inside visibleNodes useEffect, teamGroup branch:
data: {
  ...data,
  isCollapsed: collapsedTeams.has(raw.id),
  onAddService: () => handleAddService(raw.id),
  onResized: (w: number, h: number) => handleNodeResized(raw.id, w, h),  // new
},
```

```tsx
// TeamGroupNode — inside JSX:
<NodeResizer
  minWidth={200}
  minHeight={80}
  isVisible={selected}
  onResizeEnd={(_event, params) => data.onResized?.(params.width, params.height)}
/>
```

**Migration format** — manual SQL, `IF NOT EXISTS`, `double precision`, class name matches timestamp:

```ts
export class AddTeamSize1714100000000 implements MigrationInterface {
  name = 'AddTeamSize1714100000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "width" double precision`);
    await queryRunner.query(`ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "height" double precision`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teams" DROP COLUMN IF EXISTS "height"`);
    await queryRunner.query(`ALTER TABLE "teams" DROP COLUMN IF EXISTS "width"`);
  }
}
```

**Entity column** — nullable float, same as `positionX/positionY`:

```ts
@Column({ type: 'double precision', nullable: true })
width: number | null;

@Column({ type: 'double precision', nullable: true })
height: number | null;
```

No `name:` override needed — single-word columns don't need snake_case aliasing.

**DTO validation** — same as `positionX/positionY`:

```ts
@IsOptional()
@IsNumber()
width?: number;

@IsOptional()
@IsNumber()
height?: number;
```

**Map service fallback** — same pattern as position fallback:

```ts
style: {
  width:  team.width  ?? groupWidth,
  height: team.height ?? groupHeight,
},
```

**Ref for resize storage** — `nodeSizes` is a `useRef<Map<string, { width: number; height: number }>>`. It is a **ref, not state**, because the UI does not need to re-render when a resize value is stored — the only needed side-effect is `setLayoutDirty(true)`, which is state and triggers the re-render. The ref is read at save time.

```ts
const nodeSizes = useRef<Map<string, { width: number; height: number }>>(new Map());
```

**Conditional size in handleLayoutSave** — only send `width`/`height` if the user actually resized that team in this session. This prevents clobbering stored DB sizes for teams the user only dragged (not resized):

```ts
if (node.type === 'teamGroup') {
  const size = nodeSizes.current.get(node.id);
  return teamsApi.update(node.id, {
    positionX: node.position.x,
    positionY: node.position.y,
    ...(size ? { width: size.width, height: size.height } : {}),
  });
}
```

**Clear ref on cancel** — `handleLayoutCancel` calls `fetchMap()` which resets node layout. The ref must also be cleared to avoid stale override on the next save:

```ts
const handleLayoutCancel = useCallback(async () => {
  nodeSizes.current.clear();  // new
  await fetchMap();
  setLayoutDirty(false);
}, [fetchMap]);
```

---

## IMPLEMENTATION PLAN

### Phase 1: Backend — DB + Entity + DTO + Map service

Add the migration, update the entity, DTO, and map service.

### Phase 2: Frontend — Types + TeamGroupNode

Extend `TeamGroupData` and `CreateTeamPayload`, then add `NodeResizer` to the node component.

### Phase 3: Frontend — MapCanvas wiring

Add the `nodeSizes` ref, `handleNodeResized` callback, wire `onResized` in the `visibleNodes` derivation, update `handleLayoutSave` to include dimensions, and clear the ref in `handleLayoutCancel`.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom.

---

### Task 1 — CREATE `backend/src/migrations/1714100000000-AddTeamSize.ts`

- **CREATE**: New migration file, mirroring `1714000000000-AddNodePositions.ts` format exactly.
- **IMPLEMENT**: Add `width` and `height` as `double precision` nullable columns to `teams` using `ADD COLUMN IF NOT EXISTS`.
- **GOTCHA**: Class name must be `AddTeamSize1714100000000` to match the timestamp suffix — TypeORM uses this to track which migrations have run.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run migration:run`

---

### Task 2 — UPDATE `backend/src/teams/team.entity.ts`

- **ADD** after the `positionY` column declaration:

```ts
@Column({ type: 'double precision', nullable: true })
width: number | null;

@Column({ type: 'double precision', nullable: true })
height: number | null;
```

- **GOTCHA**: No `name:` property needed — TypeORM maps `width` → `width` and `height` → `height` directly (no snake_case conversion required for single-word columns).
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npx tsc --noEmit`

---

### Task 3 — UPDATE `backend/src/teams/dto/create-team.dto.ts`

- **ADD** after the `positionY` block:

```ts
@IsOptional()
@IsNumber()
width?: number;

@IsOptional()
@IsNumber()
height?: number;
```

- **IMPORTS**: `IsNumber` is already imported from `class-validator`. No new imports needed.
- **GOTCHA**: `forbidNonWhitelisted: true` is active globally. Fields NOT decorated with validators will cause a 400 when sent from the frontend. Both `width` and `height` **must** be whitelisted here.
- **NOTE**: `update-team.dto.ts` uses `PartialType(CreateTeamDto)` — no change needed there.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npx tsc --noEmit`

---

### Task 4 — UPDATE `backend/src/map/map.service.ts`

- **UPDATE** the team node `style` property. Find:

```ts
style: { width: groupWidth, height: groupHeight },
```

Replace with:

```ts
style: {
  width:  team.width  ?? groupWidth,
  height: team.height ?? groupHeight,
},
```

- **GOTCHA**: `groupWidth` and `groupHeight` are still computed unconditionally above this line — they provide the fallback for teams that have never been manually resized. Do not move or remove that computation.
- **GOTCHA**: No query change needed — TypeORM's `find()` selects all columns by default (including newly added `width`/`height` columns once the entity is updated). `team.width` will be `null` for existing rows, triggering the `??` fallback.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npx tsc --noEmit && npm run build`

---

### Task 5 — UPDATE `frontend/src/types/map.ts`

- **ADD** `onResized` to `TeamGroupData`:

```ts
export type TeamGroupData = {
  name: string;
  color: string | null;
  isExternal: boolean;
  isCollapsed?: boolean;
  onAddService?: () => void;
  onResized?: (width: number, height: number) => void;
};
```

- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npx tsc --noEmit`

---

### Task 6 — UPDATE `frontend/src/types/team.ts`

- **ADD** `width` and `height` to `CreateTeamPayload`:

```ts
export interface CreateTeamPayload {
  name: string;
  color?: string;
  isExternal?: boolean;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
}
```

- **NOTE**: The `Team` interface (the response shape) does not need `width`/`height` — we only write them, never read them back in the frontend.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npx tsc --noEmit`

---

### Task 7 — UPDATE `frontend/src/components/map/TeamGroupNode.tsx`

- **ADD** import: `NodeResizer` from `@xyflow/react`
- **ADD** `<NodeResizer>` as the **first child** of the outer `div` (before the header div), wired to `data.onResized`:

```tsx
import { memo } from 'react';
import { NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { TeamGroupNode as TeamGroupNodeType } from '../../types/map';

function TeamGroupNode({ data, selected }: NodeProps<TeamGroupNodeType>) {
  return (
    <div
      className="w-full h-full rounded-xl border-2"
      style={{
        borderColor: data.color ?? '#475569',
        backgroundColor: `${data.color ?? '#475569'}18`,
        outline: selected ? '2px solid #60a5fa' : undefined,
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={80}
        isVisible={selected}
        onResizeEnd={(_event, params) => data.onResized?.(params.width, params.height)}
      />
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
        style={{ backgroundColor: `${data.color ?? '#475569'}33` }}
      >
        {/* existing header content unchanged */}
      </div>
    </div>
  );
}

export default memo(TeamGroupNode);
```

- **GOTCHA**: `isVisible={selected}` — handles are only shown when the node is selected, reducing visual clutter. The user must click the team group first, then resize.
- **GOTCHA**: `onResizeEnd` (not `onResize`) — fires once when the mouse is released, not on every pixel of movement. This prevents a storm of `setLayoutDirty(true)` calls.
- **GOTCHA**: `data.onResized?.()` — optional chain is required because this callback is only wired after `MapCanvas` is updated (Task 8). TypeScript accepts this because the type is `onResized?`.
- **GOTCHA**: `<NodeResizer>` must be a **direct child of the root element**, not nested inside the header div, for the resize handles to be positioned correctly relative to the node boundary.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npx tsc --noEmit`

---

### Task 8 — UPDATE `frontend/src/components/map/MapCanvas.tsx`

Apply in order:

**8a — Add `useRef` import**: Add `useRef` to the existing React import:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
```

**8b — Add `nodeSizes` ref** (immediately after the `savingLayout` state declaration):

```ts
const nodeSizes = useRef<Map<string, { width: number; height: number }>>(new Map());
```

**8c — Add `handleNodeResized` callback** (after `handleNodeDragStop`):

```ts
const handleNodeResized = useCallback((nodeId: string, width: number, height: number) => {
  nodeSizes.current.set(nodeId, { width, height });
  setLayoutDirty(true);
}, []);
```

**8d — Wire `onResized` in the `visibleNodes` useEffect** — inside the `teamGroup` branch where `visibleNodes.push({...})` is called, add `onResized` to the data spread:

```ts
visibleNodes.push({
  ...raw,
  data: {
    ...data,
    isCollapsed: collapsedTeams.has(raw.id),
    onAddService: () => handleAddService(raw.id),
    onResized: (w: number, h: number) => handleNodeResized(raw.id, w, h),
  },
} as AppNode);
```

Also add `handleNodeResized` to the dependency array of that `useEffect`.

**8e — Update `handleLayoutSave`** — for `teamGroup` nodes, read from `nodeSizes` ref and conditionally spread `width`/`height`:

```ts
const handleLayoutSave = useCallback(async () => {
  setSavingLayout(true);
  try {
    await Promise.all(
      nodes.map(node => {
        if (node.type === 'teamGroup') {
          const size = nodeSizes.current.get(node.id);
          return teamsApi.update(node.id, {
            positionX: node.position.x,
            positionY: node.position.y,
            ...(size ? { width: size.width, height: size.height } : {}),
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

**8f — Update `handleLayoutCancel`** — clear the ref before fetching:

```ts
const handleLayoutCancel = useCallback(async () => {
  nodeSizes.current.clear();
  await fetchMap();
  setLayoutDirty(false);
}, [fetchMap]);
```

- **GOTCHA**: `nodeSizes` is a ref — mutating it does NOT cause re-renders. The only re-render needed is from `setLayoutDirty(true)` (which is state).
- **GOTCHA**: The `...(size ? { width, height } : {})` spread means: if a team was not resized this session, no `width`/`height` is sent. The backend `Object.assign(team, dto)` only touches fields present in the DTO, so the DB value is preserved.
- **GOTCHA**: `handleNodeResized` has `[]` deps (empty array) — it is stable across renders. Adding it to the `useEffect` dependency array is correct and won't cause extra effect runs.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npx tsc --noEmit`

---

## TESTING STRATEGY

No automated test framework configured. Manual validation only.

### Manual Validation Checklist

**Resize interaction:**
1. Load the map — team group nodes appear at auto-computed sizes (no visual change from before)
2. Click a team group to select it → 8 blue resize handles appear on the border
3. Click elsewhere → handles disappear (confirming `isVisible={selected}` works)
4. Select a team group and drag a corner handle to make it larger → node visually resizes
5. While resizing, confirm the save bar ("יש שינויים לא שמורים בפריסה") has NOT appeared yet (it appears on `onResizeEnd`, not during drag)
6. Release the mouse → save bar appears immediately

**Save:**
7. Click "שמירה" → bar shows `...` → bar disappears → node stays at resized dimensions
8. In browser DevTools → Network, confirm the PATCH for the resized team includes `width` and `height` in the request body
9. Confirm other teams' PATCH requests do NOT include `width`/`height` (only `positionX/Y`)
10. Reload the page (`http://localhost:5173`) → team group renders at the saved size (not the auto-computed default)

**Cancel:**
11. Resize a team → save bar appears → click "ביטול" → node snaps back to previous size, bar disappears
12. Reload → node is at the pre-resize size (confirms cancel did not write to DB)

**Min size:**
13. Try shrinking a team group below `minWidth=200`/`minHeight=80` → NodeResizer blocks it

**Combined with drag:**
14. Drag a team group to a new position AND resize it → click "שמירה" → both position and size persist on reload

**Auto-size fallback:**
15. Create a new team with one service → it appears at auto-computed size (DB `width`/`height` are null → `??` fallback)
16. Ensure service nodes inside a manually-resized team remain accessible (not clipped by a shrunken group)

**Regression:**
17. Drag a service node (not resize) → save bar appears → save → positions persist (unaffected by resize changes)
18. Dependency navigation (clicking service names in ServicePanel) still works
19. Team/lifecycle filter toggles still work after resize + save

---

## VALIDATION COMMANDS

### Level 1: Backend TypeScript
```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npx tsc --noEmit
```

### Level 2: Backend build
```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run build
```

### Level 3: Migration run
```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run migration:run
```

### Level 4: Frontend TypeScript
```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npx tsc --noEmit
```

### Level 5: Frontend lint
```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run lint
```

### Level 6: Frontend build
```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run build
```

---

## ACCEPTANCE CRITERIA

- [ ] Selecting a team group node shows `NodeResizer` handles; deselecting hides them
- [ ] Dragging a resize handle to completion sets `layoutDirty = true` and shows the save bar
- [ ] "שמירה" PATCHes `width` and `height` for resized teams and clears the dirty state
- [ ] "ביטול" re-fetches the map (restoring previous size) and clears the dirty state
- [ ] After saving and refreshing, the team group renders at the saved size
- [ ] Teams that were not resized in a session do NOT have `width`/`height` sent in their PATCH
- [ ] Newly-created teams (no stored size) fall back to the auto-computed grid size
- [ ] `minWidth={200}` and `minHeight={80}` prevent collapsing the node to illegible sizes
- [ ] `npx tsc --noEmit` passes on both backend and frontend
- [ ] `npm run lint` passes on frontend
- [ ] `npm run build` passes on both

---

## COMPLETION CHECKLIST

- [ ] Task 1: Migration `1714100000000-AddTeamSize.ts` created and applied
- [ ] Task 2: `team.entity.ts` updated with `width` / `height` columns
- [ ] Task 3: `create-team.dto.ts` updated with `@IsNumber()` fields
- [ ] Task 4: `map.service.ts` updated with `??` fallback for `width` / `height`
- [ ] Task 5: `types/map.ts` — `onResized?` added to `TeamGroupData`
- [ ] Task 6: `types/team.ts` — `width?` / `height?` added to `CreateTeamPayload`
- [ ] Task 7: `TeamGroupNode.tsx` — `NodeResizer` added
- [ ] Task 8: `MapCanvas.tsx` — ref, callback, wiring, save, cancel all updated
- [ ] All validation commands pass
- [ ] Manual checklist verified

---

## NOTES

**Why `onResizeEnd` instead of `onResize`?**  
`onResize` fires on every animation frame while the user drags (many times per second). `onResizeEnd` fires once when the mouse is released. We only need the final dimensions for the ref, so `onResizeEnd` is cheaper and semantically correct.

**Why a ref and not state for `nodeSizes`?**  
If `nodeSizes` were state, each resize event would trigger a re-render of `MapCanvas` and all its children. Since no UI element needs to display the current resize dimensions (only the save bar needs to appear, and that's driven by `layoutDirty` state), a ref is the right tool. The ref is read exactly once — at save time.

**Why conditional spread `...(size ? { width, height } : {})`?**  
If a team group was dragged but not resized, we don't want to send `width: undefined` in the PATCH body. With `forbidNonWhitelisted: true` on the backend, sending `undefined` would be stripped anyway, but sending `null` or a missing key could affect DB state differently depending on TypeORM behavior. The conditional spread ensures we only write size when we have a confirmed new size from a resize event.

**Why `isVisible={selected}`?**  
Without this, all 8 resize handles would be visible on every team group at all times, creating significant visual noise on a map with many teams. Requiring selection first is standard UX for resize-on-canvas tools (e.g., Figma, Miro).

**Service nodes are not resizable.**  
Services are fixed-size cards (200×60 px). Resizing them would break the visual consistency of the service grid and add no practical value. Only team group containers need resize.

**Confidence Score: 9.5/10**  
All patterns are directly derived from existing Phase 2C code (`onAddService` via data, `handleNodeDragStop` → dirty state, migration format, DTO whitelist). The only mild risk is React Flow's `NodeResizer` behavior with `extent: 'parent'` on child service nodes — shrinking a team group below its service layout may clip service nodes visually. The `minHeight: 80` guard and the manual checklist item #16 cover this.
