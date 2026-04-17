# Feature: Phase 2A — Service CRUD (Create, Edit, Delete from Map UI)

The following plan should be complete, but validate codebase patterns and task sanity before implementing.

Pay special attention to Hebrew labels (UI is RTL), Tailwind CSS v4 (no config file — class-based only), and the React Flow `data` prop pattern for passing callbacks into custom nodes.

## Feature Description

Add write operations for services directly from the map canvas. Currently the app is read-only — users can view services and filter but cannot create, edit, or delete. This phase adds:
- Inline edit mode in `ServicePanel` (name, description, lifecycle)
- Delete with inline confirmation in `ServicePanel`
- "New Service" `+` button on each team group node that opens a create form in `ServicePanel`

## User Story

As a platform engineer  
I want to create, edit, and delete services directly from the map  
So that I can manage the service catalog without touching the database directly

## Problem Statement

The UI is entirely read-only. All data must currently be seeded or migrated directly into PostgreSQL. There is no path for users to add or modify services through the application.

## Solution Statement

Extend `ServicePanel` to support three modes (view / edit / create), add a `+` button to non-external `TeamGroupNode`s, and wire `MapCanvas` to refresh its data after every mutation.

## Feature Metadata

**Feature Type**: New Capability  
**Estimated Complexity**: Medium  
**Primary Systems Affected**: Frontend only (backend CRUD endpoints already exist)  
**Dependencies**: None new — `axios`, `@xyflow/react`, `tailwindcss`, `react` already installed

---

## CONTEXT REFERENCES

### Relevant Codebase Files — MUST READ BEFORE IMPLEMENTING

- `frontend/src/components/map/ServicePanel.tsx` (lines 1–62) — Full file rewrite target. Current read-only panel structure and styling conventions to preserve in view mode.
- `frontend/src/components/map/MapCanvas.tsx` (lines 34–181) — Full file: holds all state, fetch logic, filter logic. Extract `fetchMap` from the existing `useEffect`. Add `createForTeamId` state here.
- `frontend/src/components/map/TeamGroupNode.tsx` (lines 1–39) — Add `+` button. Note `stopPropagation` is critical — without it the click bubbles to `onNodeClick` which toggles collapse.
- `frontend/src/types/map.ts` (lines 5–10) — `TeamGroupData` type. Add `onAddService?: () => void` here.
- `frontend/src/types/service.ts` — `Service`, `ServiceLifecycle`, `CreateServicePayload` types.
- `frontend/src/types/team.ts` — `Team` interface.
- `frontend/src/api/client.ts` — `servicesApi.create`, `servicesApi.update`, `servicesApi.delete` already exist. Confirm exact signatures before calling.
- `frontend/src/components/map/lifecycleColors.ts` — `LIFECYCLE_COLORS`, `LIFECYCLE_LABELS` for Hebrew labels and badge colors. Reuse in the lifecycle `<select>`.

### New Files to Create

None — all changes are modifications to existing files.

### API Endpoints (Backend — No Changes Needed)

| Method | Path | DTO |
|--------|------|-----|
| `POST` | `/services` | `{ name, teamId, description?, lifecycle? }` |
| `PATCH` | `/services/:id` | `{ name?, description?, lifecycle? }` |
| `DELETE` | `/services/:id` | — (returns 204 No Content) |
| `GET` | `/services/:id` | returns `Service` with `team`, `outgoingConnections`, `incomingConnections` |

### Patterns to Follow

**Hebrew UI labels** — all visible text must be in Hebrew to match existing UI:
- "ערוך" = Edit, "שמור" = Save, "ביטול" = Cancel
- "מחיקה" = Delete, "אישור מחיקה" = Confirm delete, "בטל" = Cancel (delete confirm)
- "שם שירות" = Service name, "תיאור" = Description, "מחזור חיים" = Lifecycle
- "שירות חדש" = New service, "צוות" = Team

**React Flow callback-in-data pattern** (for `TeamGroupNode`):
```tsx
// In MapCanvas, when building the node list:
nodes.push({
  ...raw,
  data: {
    ...data,
    isCollapsed: collapsedTeams.has(raw.id),
    onAddService: () => handleAddService(raw.id),  // ← inject here
  },
} as AppNode);

// In TeamGroupNode, consume from data:
function TeamGroupNode({ data }: NodeProps<TeamGroupNodeType>) {
  // data.onAddService?.()
}
```

**stopPropagation in React Flow node buttons** — clicking inside a node without stopPropagation fires `onNodeClick` in `MapCanvas`. Always call `e.stopPropagation()` on button `onClick` inside custom nodes.

**Tailwind CSS v4** — no `tailwind.config.js`. Use utility classes only. Dark palette already established: `bg-slate-900`, `border-slate-700`, `text-slate-300`, `text-slate-400`, `text-slate-100`. Input style convention (derive from existing checkboxes): `bg-slate-800 border border-slate-600 rounded text-slate-100 text-sm px-2 py-1 w-full focus:outline-none focus:border-slate-400`.

**Panel slot pattern** — `ServicePanel` is `absolute end-0 top-0 h-full w-80` overlaying the canvas. When both `selectedService` and `createForTeamId` could be set, ensure they are mutually exclusive (setting one clears the other in `MapCanvas`).

**`fetchMap` extraction** — current data load in `MapCanvas` `useEffect([])`:
```ts
Promise.all([mapApi.get(), teamsApi.list()]).then(([mapData, teamList]) => {
  setRawData(mapData);
  setTeams(teamList);
  // collapse external teams
  // set selectedTeams
});
```
Extract the `mapApi.get()` part into a standalone `fetchMap` callback that only refreshes `rawData`. The teams list and initial collapse/selectedTeams setup only need to happen once (on mount). After mutations, call `fetchMap()` only — do not re-initialize `collapsedTeams` or `selectedTeams`.

---

## IMPLEMENTATION PLAN

### Phase 1: Types

Add `onAddService` to `TeamGroupData` so TypeScript does not error when the field is injected in `MapCanvas` and consumed in `TeamGroupNode`.

### Phase 2: ServicePanel rewrite

Three render paths inside one component, controlled by props:
1. `service !== null && !isEditing` → view mode
2. `service !== null && isEditing` → edit mode  
3. `service === null && createForTeamId !== null` → create mode

Local state: `isEditing: boolean`, `isConfirmingDelete: boolean`, `saving: boolean`, form fields `name/description/lifecycle`.

### Phase 3: MapCanvas wiring

Extract `fetchMap`, add `createForTeamId` state, inject `onAddService` into team node data, pass all required props to `ServicePanel`.

### Phase 4: TeamGroupNode button

Add `+` button. Hide on external teams (`data.isExternal === true`). Call `data.onAddService?.()` with `stopPropagation`.

---

## STEP-BY-STEP TASKS

### Task 1 — UPDATE `frontend/src/types/map.ts`

- **ADD** `onAddService?: () => void` to `TeamGroupData` (line 9, after `isCollapsed`)
- **GOTCHA**: This must be optional (`?:`) because the raw API response does not include it — only the derived `AppNode` injected in `MapCanvas` will have it
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

```ts
// Result should look like:
export type TeamGroupData = {
  name: string;
  color: string | null;
  isExternal: boolean;
  isCollapsed?: boolean;
  onAddService?: () => void;
};
```

---

### Task 2 — UPDATE `frontend/src/components/map/MapCanvas.tsx`

- **ADD** `createForTeamId: string | null` state (init `null`)
- **REFACTOR** initial `useEffect` fetch: extract `const fetchMap = useCallback(async () => { ... }, [])` that only calls `mapApi.get()` and `setRawData`. Keep initial-load logic (collapse external teams, init `selectedTeams`) in the mount `useEffect` only — `fetchMap` must NOT reset those.
- **ADD** `handleAddService = useCallback((teamId: string) => { setCreateForTeamId(teamId); setSelectedService(null); }, [])`
- **UPDATE** team node injection block (inside the derive-visible-nodes `useEffect`) to inject `onAddService`:
  ```ts
  data: {
    ...data,
    isCollapsed: collapsedTeams.has(raw.id),
    onAddService: () => handleAddService(raw.id),
  }
  ```
- **UPDATE** `handleNodeClick`: when service node clicked, also `setCreateForTeamId(null)`
- **ADD** `handlePanelClose = useCallback(() => { setSelectedService(null); setCreateForTeamId(null); }, [])`
- **ADD** `handleSaved = useCallback(async (svc: Service) => { await fetchMap(); setSelectedService(svc); setCreateForTeamId(null); }, [fetchMap])`
- **ADD** `handleDeleted = useCallback(async () => { await fetchMap(); setSelectedService(null); }, [fetchMap])`
- **UPDATE** `<ServicePanel>` props: `service={selectedService}`, `createForTeamId={createForTeamId}`, `teams={teams}`, `onClose={handlePanelClose}`, `onSaved={handleSaved}`, `onDeleted={handleDeleted}`
- **GOTCHA**: `handleAddService` must be stable (wrap in `useCallback`) otherwise the derive-nodes `useEffect` re-runs on every render if included in deps. Alternatively, keep it out of the effect deps (it's a stable ref) — mirror how `setNodes`/`setEdges` are used.
- **GOTCHA**: The derive-nodes `useEffect` currently has `[rawData, selectedTeams, selectedLifecycles, collapsedTeams, setNodes, setEdges]` as deps. After injecting `onAddService` into node data, you must NOT add `handleAddService` to that dep array if it causes infinite loops. Use `useCallback` with `[]` deps on `handleAddService` to keep it stable.
- **VALIDATE**: `cd frontend && npx tsc --noEmit` then `npm run lint`

---

### Task 3 — UPDATE `frontend/src/components/map/TeamGroupNode.tsx`

- **ADD** `+` button in the team header `div`, right-aligned, only when `!data.isExternal`
- **IMPLEMENT** `onClick`: call `e.stopPropagation()` then `data.onAddService?.()`
- **GOTCHA**: Without `stopPropagation`, the click fires `onNodeClick` in MapCanvas which toggles collapse — this would immediately collapse the group when you try to add a service
- **PATTERN**: RTL layout — use `ms-auto` for right-side elements (already used for the external badge)

```tsx
{!data.isExternal && (
  <button
    onClick={(e) => { e.stopPropagation(); data.onAddService?.(); }}
    className="ms-auto text-slate-400 hover:text-slate-100 text-base leading-none px-1"
    aria-label="הוסף שירות"
    title="הוסף שירות"
  >
    +
  </button>
)}
```

- **VALIDATE**: `cd frontend && npx tsc --noEmit`

---

### Task 4 — UPDATE `frontend/src/components/map/ServicePanel.tsx` (full rewrite)

This is the largest task. Write the component fresh — do not attempt to patch the existing one.

**Props interface:**
```ts
interface ServicePanelProps {
  service: Service | null;
  createForTeamId: string | null;
  teams: Team[];
  onClose: () => void;
  onSaved: (service: Service) => void;
  onDeleted: () => void;
}
```

**Local state:**
```ts
const [isEditing, setIsEditing] = useState(false);
const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
const [saving, setSaving] = useState(false);
const [name, setName] = useState('');
const [description, setDescription] = useState('');
const [lifecycle, setLifecycle] = useState<ServiceLifecycle>('active');
```

**useEffect to populate form fields** when `service` changes or edit mode opens:
```ts
useEffect(() => {
  if (service) {
    setName(service.name);
    setDescription(service.description ?? '');
    setLifecycle(service.lifecycle);
  }
}, [service]);

// Reset editing state when panel switches to a different service or closes
useEffect(() => {
  setIsEditing(false);
  setIsConfirmingDelete(false);
}, [service, createForTeamId]);
```

**Create mode initialization** — when `createForTeamId` is set, reset form:
```ts
useEffect(() => {
  if (createForTeamId) {
    setName('');
    setDescription('');
    setLifecycle('active');
  }
}, [createForTeamId]);
```

**handleSave** (handles both edit and create):
```ts
const handleSave = async () => {
  if (!name.trim()) return;
  setSaving(true);
  try {
    let saved: Service;
    if (createForTeamId) {
      saved = await servicesApi.create({ name: name.trim(), teamId: createForTeamId, description: description.trim() || undefined, lifecycle });
    } else if (service) {
      saved = await servicesApi.update(service.id, { name: name.trim(), description: description.trim() || undefined, lifecycle });
    } else return;
    onSaved(saved);
    setIsEditing(false);
  } finally {
    setSaving(false);
  }
};
```

**handleDelete:**
```ts
const handleDelete = async () => {
  if (!service) return;
  setSaving(true);
  try {
    await servicesApi.delete(service.id);
    onDeleted();
  } finally {
    setSaving(false);
    setIsConfirmingDelete(false);
  }
};
```

**Render logic:**
- Return `null` if `service === null && createForTeamId === null`
- Outer `<aside>` identical to current: `absolute end-0 top-0 h-full w-80 bg-slate-900 border-s border-slate-700 z-10 overflow-y-auto shadow-2xl`
- Header: title shows service name (view/edit) or "שירות חדש" (create); close button always present
- Body sections:

**View mode body** (when `!isEditing && service`):
```
- Lifecycle badge (existing pattern from LIFECYCLE_COLORS)
- Description section (if present)
- Team section (service.team.name)
- Connections placeholders (keep existing Hebrew stubs)
- Bottom action bar:
    [ערוך] button → setIsEditing(true)
    [מחיקה] button → setIsConfirmingDelete(true) (red/danger style)
    OR if isConfirmingDelete:
    "למחוק את השירות?" text + [אישור] button (red) + [ביטול] button
```

**Edit / Create mode body** (when `isEditing || createForTeamId`):
```
- name <input> — required, autofocus
- description <textarea> — optional, 3 rows
- lifecycle <select> — options: active/deprecated/experimental with Hebrew labels
- Team display (read-only text, not editable) — find team from teams[] by id
- Bottom action bar: [שמור] (disabled+spinner when saving) + [ביטול]
```

**Input styling** (dark theme, consistent):
```
className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-slate-400"
```

**Label styling:**
```
className="text-xs uppercase text-slate-400 mb-1"
```

**Button styles:**
- Primary (save/confirm): `bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded`
- Secondary (cancel): `text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5`
- Edit: `bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded`
- Delete / confirm: `bg-red-700 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded`

- **GOTCHA**: `servicesApi.delete` returns `axios` response (not typed to `Service`). The current `client.ts` has `http.delete(...)` with no `.then(r => r.data)` unwrap needed — just await it.
- **GOTCHA**: After `onSaved` is called in create mode, `MapCanvas` sets `selectedService` to the returned service and clears `createForTeamId`. This transitions the panel back to view mode automatically — no manual mode reset needed in `ServicePanel` for the create path.
- **VALIDATE**: `cd frontend && npx tsc --noEmit && npm run lint`

---

## TESTING STRATEGY

No test framework is configured in the frontend. Manual validation is the only option for this phase.

### Manual Validation Checklist

1. **View mode**: Click a service node → panel slides in → name, lifecycle badge, description, team visible
2. **Edit mode**: Click "ערוך" → form pre-populated with current values → change name → "שמור" → panel returns to view mode with updated name → canvas node updates after map refresh
3. **Edit cancel**: Click "ערוך" → change values → "ביטול" → original values restored, no API call
4. **Delete flow**: Click "מחיקה" → confirm prompt appears → "אישור" → service removed from canvas
5. **Delete cancel**: Click "מחיקה" → confirm prompt appears → "ביטול" → panel returns to view mode, no deletion
6. **Create flow**: Click `+` on a team group → panel opens in create mode → fill name → "שמור" → new node appears in that team's group
7. **Create cancel**: Click `+` → fill name → "ביטול" (or close `×`) → no service created, canvas unchanged
8. **External teams**: `+` button does NOT appear on external team groups
9. **Filter persistence**: After create/edit/delete, active team/lifecycle filters remain unchanged (no reset)
10. **Mutual exclusion**: Open service panel → click `+` on another team → service panel closes, create panel opens; vice versa

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

- [ ] `ServicePanel` renders in view, edit, and create modes with correct Hebrew labels
- [ ] Edit saves via `PATCH /services/:id` and map canvas refreshes without resetting filters
- [ ] Delete triggers inline confirmation; confirmed delete calls `DELETE /services/:id` and removes node from canvas
- [ ] `+` button appears on non-external team groups; absent on external teams
- [ ] Clicking `+` opens create panel for the correct team; team field is read-only in form
- [ ] Creating a service adds it to the correct team group on the canvas
- [ ] `selectedService` and `createForTeamId` are mutually exclusive — only one panel visible at a time
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run lint` passes with zero errors
- [ ] `npm run build` succeeds

---

## COMPLETION CHECKLIST

- [ ] Task 1: `types/map.ts` — `onAddService` added to `TeamGroupData`
- [ ] Task 2: `MapCanvas.tsx` — `fetchMap` extracted, `createForTeamId` state added, panel wired
- [ ] Task 3: `TeamGroupNode.tsx` — `+` button with `stopPropagation`
- [ ] Task 4: `ServicePanel.tsx` — full rewrite with view/edit/create/delete modes
- [ ] TypeScript check passes
- [ ] Lint passes
- [ ] Build passes
- [ ] Manual checklist verified

---

## NOTES

**Why callbacks in React Flow node `data`?** React Flow custom nodes only receive `id`, `data`, `selected`, `dragging`, etc. as props — there is no standard way to pass event handlers. The established pattern (used by the React Flow community and official examples) is to put callbacks in `data`. This is why `onAddService` is added to `TeamGroupData` rather than using a Context or ref.

**Why not optimistic updates?** The map layout is computed server-side (positions, group sizes). After a create, the server must recalculate the group dimensions. Optimistic updates would require replicating that layout logic client-side — not worth the complexity at this stage.

**`fetchMap` scope** — only re-fetches `mapApi.get()`, not `teamsApi.list()`. Team list changes are not expected as part of 2A. The `collapsedTeams` and `selectedTeams` filter state must survive the refresh — this is why the fetch is split from the initialization logic.

**Confidence Score: 9/10** — All API endpoints exist, all types are understood, all component files read. The main risk is React Flow dep-array subtlety with injected callbacks (Task 2 GOTCHA). The plan addresses this explicitly.
