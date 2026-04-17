# Feature: Phase 2B — Connection CRUD from Map UI

The following plan should be complete, but validate codebase patterns and task sanity before implementing.

Pay special attention to Hebrew labels (UI is RTL), Tailwind CSS v4 (no config file — class-based only), and the React Flow `onConnect` / edge-click patterns.

## Feature Description

Add interactive connection management directly on the map canvas. Currently, service-to-service edges can only be created by seeding the database. This phase adds:
- **Drag-to-connect**: drag from a service node's bottom handle to another node's top handle → label prompt dialog appears → connection created
- **Edge panel**: clicking a connection edge opens a right-side panel with label edit and delete
- All mutations trigger a `fetchMap()` refresh without resetting team/lifecycle filter state

## User Story

As a platform engineer  
I want to draw, label, edit, and delete service connections directly on the map  
So that I can keep the service topology up to date without touching the database

## Problem Statement

The map canvas is write-only for nodes after Phase 2A. Edges can only be created via DB seed or migration. There is no way to visualise or manage inter-service dependencies through the UI.

## Solution Statement

Wire React Flow's `onConnect` callback to a label-prompt dialog, and `onEdgeClick` to a new `EdgePanel` component (mirroring `ServicePanel`). Both call existing backend endpoints. No backend changes needed.

## Feature Metadata

**Feature Type**: New Capability  
**Estimated Complexity**: Medium  
**Primary Systems Affected**: Frontend only  
**Dependencies**: None new — `@xyflow/react`, `axios`, `tailwindcss`, `react` already installed

---

## CONTEXT REFERENCES

### Relevant Codebase Files — MUST READ BEFORE IMPLEMENTING

- `frontend/src/components/map/MapCanvas.tsx` (full file) — Holds all state, `fetchMap`, mutual-exclusion logic between `selectedService` and `createForTeamId`. The same pattern must be extended for `selectedEdge` and `pendingConnection`.
- `frontend/src/components/map/ServicePanel.tsx` (full file) — Visual/UX template for `EdgePanel`. Mirror: `absolute end-0 top-0 h-full w-80`, dark palette, Hebrew labels, `INPUT_CLASS`/`LABEL_CLASS` constants, `saving` state pattern.
- `frontend/src/components/map/ServiceNode.tsx` (full file) — Has `<Handle type="source" position={Position.Bottom}>` and `<Handle type="target" position={Position.Top}>`. No changes needed here, but confirms that `source → target` drag direction is **bottom → top**.
- `frontend/src/components/map/ConnectionEdge.tsx` (full file) — Current edge renderer. Will add a selected-state delete button here (a `×` icon in `EdgeLabelRenderer` visible only when `selected === true`).
- `frontend/src/types/map.ts` (full file) — `AppEdge`, `ConnectionEdgeData`. Need to add `onDelete?: () => void` to `ConnectionEdgeData` for the delete button inside the edge renderer.
- `frontend/src/api/client.ts` (full file) — `connectionsApi.create`, `.update`, `.delete` already exist. Confirm signatures before calling.
- `frontend/src/types/connection.ts` — `ServiceConnection` shape returned by backend.

### New Files to Create

- `frontend/src/components/map/EdgePanel.tsx` — Right-side panel for viewing/editing/deleting a selected edge
- `frontend/src/components/map/ConnectLabelDialog.tsx` — Centered modal that appears after drag-connect to prompt for an optional label

### API Endpoints (Backend — No Changes Needed)

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/services/:id/connections` | `{ toServiceId: string, label?: string }` | `ServiceConnection` |
| `PATCH` | `/connections/:id` | `{ label?: string }` | `ServiceConnection` |
| `DELETE` | `/connections/:id` | — | 204 No Content |

Backend throws `ConflictException` (409) if the same connection already exists. Handle gracefully — show a Hebrew error message, do not crash.

### Patterns to Follow

**Panel slot pattern** (mirror `ServicePanel`):
```tsx
// absolute end-0 top-0 h-full w-80 bg-slate-900 border-s border-slate-700 z-10 overflow-y-auto shadow-2xl
```
`EdgePanel` lives in the same slot as `ServicePanel`. They are mutually exclusive — only one is ever visible.

**Dark input / label styling** (copy from ServicePanel constants):
```ts
const INPUT_CLASS =
  'w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-slate-400';
const LABEL_CLASS = 'text-xs uppercase text-slate-400 mb-1';
```

**Button styles** (same as ServicePanel):
- Primary save: `bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded disabled:opacity-50`
- Secondary cancel: `text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5`
- Danger delete: `bg-red-700 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded`

**Mutual exclusion pattern** (mirror MapCanvas):
```ts
// selecting edge clears service selection and vice versa
const handleEdgeClick = useCallback((_e, edge) => {
  setSelectedEdge(edge);
  setSelectedService(null);
  setCreateForTeamId(null);
}, []);

const handleNodeClick = useCallback(async (_e, node) => {
  // ... existing logic ...
  setSelectedEdge(null); // ADD THIS LINE to existing handler
}, []);
```

**`fetchMap` pattern** (already in MapCanvas):
```ts
const fetchMap = useCallback(async () => {
  const mapData = await mapApi.get();
  setRawData(mapData);
}, []);
// After any mutation: await fetchMap() — does NOT reset filters/collapse
```

**Callbacks in edge `data` pattern** (mirrors `onAddService` in `TeamGroupData`):
Edge delete button lives inside `ConnectionEdge` renderer. React Flow custom edges receive only their props — no external handlers. Inject `onDelete` via `data` field, same way `onAddService` is injected into team node data.

The `onDelete` callback is injected during the derive-edges `useEffect` in MapCanvas (same place where `type: 'connectionEdge'` is set), so it is always fresh.

**RTL conventions** — `end-0` (not `right-0`), `ms-auto` (not `ml-auto`), `border-s` (not `border-l`), `start-4` (not `left-4`).

**`stopPropagation` inside React Flow nodes** — not needed for edge renderers (edge clicks don't bubble to `onNodeClick`), but needed if adding buttons inside node components.

**React Flow `Connection` type** (from `@xyflow/react`):
```ts
import type { Connection } from '@xyflow/react';
// { source: string | null, target: string | null, sourceHandle: string | null, targetHandle: string | null }
```
In `onConnect`, check `params.source && params.target && params.source !== params.target` before setting `pendingConnection`.

**Error handling for 409 Conflict** — `connectionsApi.create` rejects with an axios error when the connection exists. Catch in the `ConnectLabelDialog` save handler and set a local `error: string | null` state to display a Hebrew error message: `"חיבור זה כבר קיים"`.

---

## IMPLEMENTATION PLAN

### Phase 1: Types

Extend `ConnectionEdgeData` in `map.ts` to carry `onDelete` callback, and add `selectedEdgeId` to component state.

### Phase 2: New Components

Create `ConnectLabelDialog` and `EdgePanel` following the established dark-theme, Hebrew-label, ServicePanel-style conventions.

### Phase 3: MapCanvas wiring

Add `selectedEdge` and `pendingConnection` state. Wire `onConnect`, `onEdgeClick` handlers. Inject `onDelete` into each edge's `data` during derive-edges. Render new components. Extend existing mutual-exclusion logic.

### Phase 4: ConnectionEdge enhancement

Add `×` delete button inside `EdgeLabelRenderer`, visible only when `selected === true` and `data.onDelete` is defined.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

---

### Task 1 — UPDATE `frontend/src/types/map.ts`

- **ADD** `onDelete?: () => void` to `ConnectionEdgeData`:
```ts
export type ConnectionEdgeData = {
  label: string | null;
  onDelete?: () => void;
};
```
- **GOTCHA**: Must be optional (`?:`) — raw API response edges do not include it; only the derived edges injected in MapCanvas will have it.
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

---

### Task 2 — CREATE `frontend/src/components/map/ConnectLabelDialog.tsx`

Centered modal overlay that appears after a successful drag-connect gesture, prompting the user for an optional label before the API call is made.

**Props interface:**
```ts
interface ConnectLabelDialogProps {
  sourceServiceName: string;  // for display only
  targetServiceName: string;  // for display only
  onConfirm: (label: string) => Promise<void>;
  onCancel: () => void;
}
```

**Local state:** `label: string` (init `''`), `saving: boolean` (init `false`), `error: string | null` (init `null`).

**Structure:**
```tsx
// Fixed full-screen backdrop + centered card
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-80 shadow-2xl">
    <h2 className="font-semibold text-slate-100 text-sm mb-1">חיבור חדש</h2>
    <p className="text-xs text-slate-400 mb-4">
      {sourceServiceName} ← {targetServiceName}
    </p>
    {/* Label input — optional */}
    <label className={LABEL_CLASS}>תווית (אופציונלי)</label>
    <input
      autoFocus
      className={INPUT_CLASS}
      value={label}
      onChange={e => setLabel(e.target.value)}
      placeholder='למשל: REST, Kafka, gRPC'
      onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onCancel(); }}
    />
    {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    <div className="flex gap-2 mt-4">
      <button onClick={handleConfirm} disabled={saving}
        className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded disabled:opacity-50">
        {saving ? '...' : 'שמור'}
      </button>
      <button onClick={onCancel}
        className="text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5">
        ביטול
      </button>
    </div>
  </div>
</div>
```

**`handleConfirm`:**
```ts
const handleConfirm = async () => {
  setSaving(true);
  setError(null);
  try {
    await onConfirm(label.trim());
  } catch (err: unknown) {
    // 409 Conflict = connection already exists
    const status = (err as { response?: { status?: number } })?.response?.status;
    setError(status === 409 ? 'חיבור זה כבר קיים' : 'שגיאה ביצירת החיבור');
  } finally {
    setSaving(false);
  }
};
```

- **GOTCHA**: `onConfirm` must NOT clear `pendingConnection` itself — that is MapCanvas's responsibility after the promise resolves. `ConnectLabelDialog` only owns the `saving` and `error` state.
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

---

### Task 3 — CREATE `frontend/src/components/map/EdgePanel.tsx`

Right-side panel for a selected connection edge. Mirrors `ServicePanel` structure exactly.

**Props interface:**
```ts
interface EdgePanelProps {
  edge: AppEdge | null;
  sourceServiceName: string;
  targetServiceName: string;
  onClose: () => void;
  onUpdated: (newLabel: string) => void;  // called with new label after successful PATCH
  onDeleted: () => void;
}
```

**Local state:** `isEditing: boolean`, `isConfirmingDelete: boolean`, `saving: boolean`, `label: string`.

**useEffect to populate form when edge changes:**
```ts
useEffect(() => {
  if (edge) setLabel(edge.data?.label ?? '');
  setIsEditing(false);
  setIsConfirmingDelete(false);
}, [edge]);
```

**`handleSave`:**
```ts
const handleSave = async () => {
  if (!edge) return;
  setSaving(true);
  try {
    await connectionsApi.update(edge.id, { label: label.trim() || undefined });
    onUpdated(label.trim());
    setIsEditing(false);
  } finally {
    setSaving(false);
  }
};
```

**`handleDelete`:**
```ts
const handleDelete = async () => {
  if (!edge) return;
  setSaving(true);
  try {
    await connectionsApi.delete(edge.id);
    onDeleted();
  } finally {
    setSaving(false);
    setIsConfirmingDelete(false);
  }
};
```

**Return null** when `edge === null`.

**Structure** (full dark-theme panel identical to ServicePanel):
```tsx
<aside className="absolute end-0 top-0 h-full w-80 bg-slate-900 border-s border-slate-700 z-10 overflow-y-auto shadow-2xl">
  {/* Header */}
  <div className="flex items-center justify-between p-4 border-b border-slate-700">
    <h2 className="font-semibold text-slate-100 text-sm">חיבור</h2>
    <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none" aria-label="סגור">×</button>
  </div>
  <div className="p-4 space-y-4">
    {/* Always show from→to */}
    <div>
      <h3 className={LABEL_CLASS}>מקור</h3>
      <p className="text-sm text-slate-300">{sourceServiceName}</p>
    </div>
    <div>
      <h3 className={LABEL_CLASS}>יעד</h3>
      <p className="text-sm text-slate-300">{targetServiceName}</p>
    </div>

    {/* View mode */}
    {!isEditing && (
      <>
        <div>
          <h3 className={LABEL_CLASS}>תווית</h3>
          <p className="text-sm text-slate-300">{edge?.data?.label || '—'}</p>
        </div>
        <div className="pt-2 border-t border-slate-700">
          {isConfirmingDelete ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-300">למחוק את החיבור?</p>
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={saving}
                  className="bg-red-700 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded disabled:opacity-50">
                  {saving ? '...' : 'אישור'}
                </button>
                <button onClick={() => setIsConfirmingDelete(false)}
                  className="text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5">
                  בטל
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setIsEditing(true)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded">
                ערוך
              </button>
              <button onClick={() => setIsConfirmingDelete(true)}
                className="bg-red-700 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded">
                מחיקה
              </button>
            </div>
          )}
        </div>
      </>
    )}

    {/* Edit mode */}
    {isEditing && (
      <>
        <div>
          <label className={LABEL_CLASS}>תווית</label>
          <input autoFocus className={INPUT_CLASS} value={label}
            onChange={e => setLabel(e.target.value)} placeholder='למשל: REST, Kafka, gRPC' />
        </div>
        <div className="pt-2 border-t border-slate-700 flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded disabled:opacity-50">
            {saving ? '...' : 'שמור'}
          </button>
          <button onClick={() => setIsEditing(false)}
            className="text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5">
            ביטול
          </button>
        </div>
      </>
    )}
  </div>
</aside>
```

- **IMPORTS**: `connectionsApi` from `../../api/client`, `AppEdge` from `../../types/map`
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

---

### Task 4 — UPDATE `frontend/src/components/map/MapCanvas.tsx`

This is the largest change. Apply additions in order:

**4a — Add imports:**
```ts
import type { Connection } from '@xyflow/react';
import ConnectLabelDialog from './ConnectLabelDialog';
import EdgePanel from './EdgePanel';
```

**4b — Add state:**
```ts
const [selectedEdge, setSelectedEdge] = useState<AppEdge | null>(null);
const [pendingConnection, setPendingConnection] = useState<{ source: string; target: string } | null>(null);
```

**4c — Add helper to resolve service name from rawData:**
```ts
const getServiceName = useCallback((serviceId: string): string => {
  if (!rawData) return serviceId;
  const node = rawData.nodes.find(n => n.id === serviceId);
  return node ? (node.data as { name: string }).name : serviceId;
}, [rawData]);
```

**4d — Add `onConnect` handler:**
```ts
const handleConnect = useCallback((params: Connection) => {
  if (params.source && params.target && params.source !== params.target) {
    setPendingConnection({ source: params.source, target: params.target });
  }
}, []);
```

**4e — Add `onEdgeClick` handler:**
```ts
const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: AppEdge) => {
  setSelectedEdge(edge);
  setSelectedService(null);
  setCreateForTeamId(null);
}, []);
```

**4f — Extend `handleNodeClick`** — add `setSelectedEdge(null)` inside the `service` branch (after `setSelectedService(svc)`):
```ts
} else if (node.type === 'service') {
  const svc = await servicesApi.get(node.id);
  setSelectedService(svc);
  setCreateForTeamId(null);
  setSelectedEdge(null);  // ADD
}
```

**4g — Add edge panel close/callbacks:**
```ts
const handleEdgePanelClose = useCallback(() => {
  setSelectedEdge(null);
}, []);

const handleEdgeUpdated = useCallback((newLabel: string) => {
  // Update in-memory edge data so panel reflects new label without re-fetching
  setSelectedEdge(prev =>
    prev ? { ...prev, data: { ...prev.data, label: newLabel || null } } : null,
  );
  fetchMap(); // refresh canvas edges in background
}, [fetchMap]);

const handleEdgeDeleted = useCallback(async () => {
  await fetchMap();
  setSelectedEdge(null);
}, [fetchMap]);
```

**4h — Add `handleConnectConfirm` (called by `ConnectLabelDialog`):**
```ts
const handleConnectConfirm = useCallback(async (label: string) => {
  if (!pendingConnection) return;
  await connectionsApi.create(pendingConnection.source, {
    toServiceId: pendingConnection.target,
    label: label || undefined,
  });
  await fetchMap();
  setPendingConnection(null);
}, [pendingConnection, fetchMap]);

const handleConnectCancel = useCallback(() => {
  setPendingConnection(null);
}, []);
```

**4i — Inject `onDelete` into derived edges** inside the derive-nodes `useEffect`. Replace the current edges mapping:
```ts
// BEFORE:
const visibleEdges: AppEdge[] = rawData.edges
  .filter(e => visibleServiceIds.has(e.source) && visibleServiceIds.has(e.target))
  .map(e => ({
    ...e,
    type: 'connectionEdge',
    data: { label: e.label },
  })) as AppEdge[];

// AFTER:
const visibleEdges: AppEdge[] = rawData.edges
  .filter(e => visibleServiceIds.has(e.source) && visibleServiceIds.has(e.target))
  .map(e => ({
    ...e,
    type: 'connectionEdge',
    data: {
      label: e.label,
      onDelete: () => {
        // Inline delete shortcut from the edge ×  button
        connectionsApi.delete(e.id).then(() => fetchMap());
      },
    },
  })) as AppEdge[];
```

- **GOTCHA**: `fetchMap` must be in the derive-nodes `useEffect` dep array since it is referenced in the inline `onDelete`. `fetchMap` is already stable (`useCallback` with `[]` deps), so adding it to deps is safe and won't cause re-renders.
- **GOTCHA**: The current derive-nodes dep array is `[rawData, selectedTeams, selectedLifecycles, collapsedTeams, handleAddService, setNodes, setEdges]`. ADD `fetchMap` to this array.

**4j — Wire `onConnect` and `onEdgeClick` to `<ReactFlow>`:**
```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  onNodesChange={onNodesChange}
  onEdgesChange={onEdgesChange}
  nodeTypes={nodeTypes}
  edgeTypes={edgeTypes}
  onNodeClick={handleNodeClick}
  onEdgeClick={handleEdgeClick}   // ADD
  onConnect={handleConnect}        // ADD
  fitView
  colorMode="dark"
  proOptions={{ hideAttribution: false }}
>
```

**4k — Render new components** after `<ServicePanel>`:
```tsx
<EdgePanel
  edge={selectedEdge}
  sourceServiceName={selectedEdge ? getServiceName(selectedEdge.source) : ''}
  targetServiceName={selectedEdge ? getServiceName(selectedEdge.target) : ''}
  onClose={handleEdgePanelClose}
  onUpdated={handleEdgeUpdated}
  onDeleted={handleEdgeDeleted}
/>

{pendingConnection && (
  <ConnectLabelDialog
    sourceServiceName={getServiceName(pendingConnection.source)}
    targetServiceName={getServiceName(pendingConnection.target)}
    onConfirm={handleConnectConfirm}
    onCancel={handleConnectCancel}
  />
)}
```

- **GOTCHA**: `ServicePanel` and `EdgePanel` both live at `absolute end-0 top-0`. They are mutually exclusive by state — only one of `selectedService/createForTeamId` vs `selectedEdge` is ever non-null at a time. No z-index conflict.
- **VALIDATE**: `cd frontend && npx tsc --noEmit && npm run lint`

---

### Task 5 — UPDATE `frontend/src/components/map/ConnectionEdge.tsx`

Add a `×` delete shortcut button that appears on the edge when it is selected. This is a convenience affordance in addition to the EdgePanel.

**Update the `EdgeLabelRenderer` block:**
```tsx
<EdgeLabelRenderer>
  {data?.label && (
    <div
      style={{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
        pointerEvents: 'all',
      }}
      className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-600"
    >
      {data.label}
    </div>
  )}
  {selected && data?.onDelete && (
    <button
      style={{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${labelX}px,${(data?.label ? labelY + 18 : labelY)}px)`,
        pointerEvents: 'all',
      }}
      onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }}
      className="text-[10px] bg-red-900/80 hover:bg-red-700 text-red-300 px-1.5 py-0.5 rounded border border-red-700 leading-none"
      title="מחק חיבור"
    >
      ✕
    </button>
  )}
</EdgeLabelRenderer>
```

- **GOTCHA**: The `×` button calls `data.onDelete()` which does `connectionsApi.delete(e.id).then(() => fetchMap())`. This is a fire-and-forget path — no EdgePanel involved. The panel also has its own delete flow for users who click the edge and read it first.
- **GOTCHA**: `e.stopPropagation()` prevents the button click from re-firing `onEdgeClick` (which would open EdgePanel) right as we're trying to delete.
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

---

## TESTING STRATEGY

No test framework is configured on the frontend. Manual validation is the only option.

### Manual Validation Checklist

1. **Drag to connect**: Drag from the bottom handle of Service A to the top handle of Service B → `ConnectLabelDialog` appears with correct service names
2. **Create with label**: Type "REST" in the dialog → שמור → edge appears on canvas with label pill
3. **Create without label**: Leave label empty → שמור → edge appears on canvas with no label pill
4. **Create cancel**: Drag connect → dialog opens → ביטול → no edge created, canvas unchanged
5. **Duplicate connection**: Try to connect two services that already have a connection → dialog shows `"חיבור זה כבר קיים"` error message, dialog stays open
6. **Self-connection**: Drag from a service to itself → dialog does NOT appear (guard in `handleConnect`)
7. **Click edge**: Click any edge → `EdgePanel` opens on the right showing from/to service names and current label
8. **Edge panel view**: Verify Hebrew labels — מקור, יעד, תווית show correct data
9. **Edit label**: Click edge → ערוך → change label → שמור → panel shows updated label, edge on canvas updates
10. **Edit cancel**: Click edge → ערוך → change label → ביטול → original label restored, no API call
11. **Delete from panel**: Click edge → מחיקה → confirm prompt → אישור → edge removed from canvas, panel closes
12. **Delete cancel**: Click edge → מחיקה → confirm prompt → בטל → panel returns to view mode, edge unchanged
13. **Delete shortcut**: Select an edge → `×` button appears on edge → click it → edge removed immediately
14. **Mutual exclusion (node→edge)**: Click a service node (ServicePanel opens) → then click an edge → EdgePanel opens, ServicePanel closes
15. **Mutual exclusion (edge→node)**: Click an edge (EdgePanel opens) → then click a service node → ServicePanel opens, EdgePanel closes
16. **Mutual exclusion (edge→add)**: Click `+` on a team (create panel opens) → then click an edge → EdgePanel opens, create panel closes
17. **Filter persistence**: After creating/deleting connections, team and lifecycle filters remain unchanged
18. **External team services**: Connections to/from services inside an external team group work after the group is expanded
19. **`npx tsc --noEmit`**: Zero errors
20. **`npm run lint`**: Zero errors
21. **`npm run build`**: Succeeds

---

## VALIDATION COMMANDS

### Level 1: TypeScript
```bash
cd /path/to/fire-attack-hub/frontend && npx tsc --noEmit
```

### Level 2: Lint
```bash
cd /path/to/fire-attack-hub/frontend && npm run lint
```

### Level 3: Build check
```bash
cd /path/to/fire-attack-hub/frontend && npm run build
```

### Level 4: Dev server smoke test
```bash
# Terminal 1
cd /path/to/fire-attack-hub/backend && npm run start:dev
# Terminal 2
cd /path/to/fire-attack-hub/frontend && npm run dev
# Then manually run checklist above at http://localhost:5173
```

---

## ACCEPTANCE CRITERIA

- [ ] Drag from service bottom handle to another service top handle triggers `ConnectLabelDialog`
- [ ] Confirmed connection calls `POST /services/:id/connections` and edge appears on canvas
- [ ] Duplicate connection shows Hebrew error `"חיבור זה כבר קיים"` — dialog stays open
- [ ] Self-connection drag does NOT open dialog
- [ ] Clicking an edge opens `EdgePanel` with correct from/to service names and label
- [ ] Edit label calls `PATCH /connections/:id` and panel reflects updated label without losing position
- [ ] Delete from panel: confirm → `DELETE /connections/:id` → edge removed → panel closes
- [ ] `×` shortcut on selected edge calls delete immediately
- [ ] `selectedService`/`createForTeamId` and `selectedEdge` are mutually exclusive — only one panel visible at a time
- [ ] `fetchMap()` after mutations does NOT reset team/lifecycle filter state
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run lint` passes with zero errors
- [ ] `npm run build` succeeds

---

## COMPLETION CHECKLIST

- [ ] Task 1: `types/map.ts` — `onDelete` added to `ConnectionEdgeData`
- [ ] Task 2: `ConnectLabelDialog.tsx` — created
- [ ] Task 3: `EdgePanel.tsx` — created
- [ ] Task 4: `MapCanvas.tsx` — all 4k sub-steps applied
- [ ] Task 5: `ConnectionEdge.tsx` — `×` button added
- [ ] TypeScript check passes
- [ ] Lint passes
- [ ] Build passes
- [ ] Manual checklist verified

---

## NOTES

**Why inject `onDelete` into edge `data`?**  
React Flow custom edge components receive only `id`, `data`, `selected`, geometry props, etc. — no way to pass event handlers from the canvas level except via `data`. This is the same pattern used for `onAddService` in `TeamGroupData`. The callback is re-injected on every derive-edges run, so it always closes over the latest `fetchMap`.

**Why not optimistic updates?**  
Same reason as Phase 2A: the map layout is computed server-side. After a connection is created, the server response is authoritative. `fetchMap()` is fast enough for this use case.

**`handleEdgeUpdated` keeps the panel open**  
Unlike delete (which closes the panel), an edit just updates the `selectedEdge` in memory and fires `fetchMap()` in the background. The user sees the new label immediately (via state update) and the canvas refreshes asynchronously. This gives a snappier feel for edits.

**`connectionsApi.delete` in inline `onDelete`**  
The `×` shortcut on the edge is intentionally fire-and-forget — there's no confirm prompt. This is acceptable for a quick delete affordance. Users who want a confirm step can use the EdgePanel's delete flow instead.

**Confidence Score: 9/10**  
All API endpoints exist and are verified. All React Flow hook signatures confirmed. All component patterns derived from existing code. Main risk: the derive-nodes `useEffect` dep array change (Task 4i) — adding `fetchMap` must not cause loops. `fetchMap` is `useCallback` with `[]` deps, so it is referentially stable. No loop risk.
