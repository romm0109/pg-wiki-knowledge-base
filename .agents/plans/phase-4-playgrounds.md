# Feature: Playgrounds

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files, preserve the current page structure, and do not invent a second CRUD pattern when the repo already has a consistent NestJS module + grouped axios pattern.

## Feature Description

A Playgrounds hub where teams register API explorers (Swagger, GraphiQL, Redoc, etc.) with multiple environment URLs per playground (Production, Staging, Dev, etc.). The list page is searchable. Clicking a playground opens a detail page with an environment switcher panel on the right and a full-width iframe on the left. The backend checks whether a URL is embeddable before the frontend renders the iframe, showing a clean fallback if not.

## User Story

As an engineer
I want to browse registered API playgrounds, switch between their environments, and open them embedded in the app
So that I can explore any service API in any environment without leaving the catalog

## Problem Statement

The `/playgrounds` route is a stub. Teams currently have no central place to register or discover API explorers. They also deal with multiple environments (Production, Staging, Dev), so a simple single-URL model per playground is not enough.

## Solution Statement

- `playgrounds` table: name, description, type, optional linked service, responsible team
- `playground_environments` table: label, url, sort_order — child of a playground; one playground can have many environments
- `/playgrounds` — searchable list page (card grid), create/edit inline form
- `/playgrounds/:id` — detail page: right-side environment panel (switcher + add/edit/delete environments) + full-width iframe on the left; backend `check-url` endpoint to detect X-Frame-Options/CSP blocks before rendering
- `ServicePanel` on the map gets a playground shortcut that navigates to `/playgrounds/:id`

## Feature Metadata

**Feature Type**: New Capability  
**Estimated Complexity**: Medium-High  
**Primary Systems Affected**: backend (2 new modules), frontend (2 new pages, api client, types, ServicePanel, App router)  
**Dependencies**: `@nestjs/common@11`, `class-validator@0.15`, `typeorm@0.3`, `react-router-dom@6`, `axios@1.14`

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `backend/src/services/service.entity.ts` — TypeORM entity pattern: uuid PK, column naming, ManyToOne/JoinColumn, nullable FK
- `backend/src/services/services.service.ts` — CRUD service pattern: QueryBuilder with leftJoinAndSelect, NotFoundException, create/update/remove
- `backend/src/services/services.controller.ts` — thin controller: @Query() DTO, ParseUUIDPipe, @HttpCode(NO_CONTENT) on DELETE
- `backend/src/services/dto/create-service.dto.ts` — DTO decorator pattern: @IsString, @IsNotEmpty, @IsOptional, @IsUUID, @IsEnum
- `backend/src/services/services.module.ts` — module pattern: TypeOrmModule.forFeature, exports service
- `backend/src/entity-flows/entity-flows.controller.ts` — sub-resource controller pattern: nested route `entities/:id/flows` + flat `entity-flows/:id` for PATCH/DELETE; `@Controller()` with no prefix
- `backend/src/entity-flows/entity-flows.service.ts` — sub-resource service pattern: parent existence check, conflict detection, NotFoundException
- `backend/src/entity-flows/entity-flows.module.ts` — sub-resource module: injects parent entity repo too
- `backend/src/app.module.ts` — where to register new modules
- `backend/src/main.ts` (line 9) — global ValidationPipe with transform: true, enableImplicitConversion: true; all DTO fields must be decorated
- `backend/src/migrations/1714300000000-AlignEntitiesWithPrd.ts` — migration pattern: raw SQL, one queryRunner.query() per statement, .catch(() => undefined) on FK constraints
- `frontend/src/api/client.ts` — grouped axios resource pattern; extend here
- `frontend/src/types/service.ts` — frontend type interface pattern to mirror
- `frontend/src/pages/TeamsPage.tsx` (lines 33–76) — canonical loadData() + useState + getErrorMessage + confirm modal CRUD page pattern
- `frontend/src/pages/PlaygroundsPage.tsx` — currently a stub; replace entirely
- `frontend/src/components/map/ServicePanel.tsx` (lines 108–200) — dark-mode aside panel; add playground shortcut in view mode
- `frontend/src/components/entities/EntityPanel.tsx` (lines 262–605) — sub-resource CRUD inside a panel: busyItemId pattern, inline add/edit/delete sections, refreshEntity pattern
- `frontend/src/components/layout/AppShell.tsx` — AppShell wraps TopNav + main; the playground detail page needs full viewport height
- `frontend/src/App.tsx` — add /playgrounds/:id route here

### New Files to Create

**Backend:**
- `backend/src/playgrounds/playground.entity.ts`
- `backend/src/playgrounds/dto/create-playground.dto.ts`
- `backend/src/playgrounds/dto/update-playground.dto.ts`
- `backend/src/playgrounds/dto/query-playground.dto.ts`
- `backend/src/playgrounds/playgrounds.service.ts`
- `backend/src/playgrounds/playgrounds.controller.ts`
- `backend/src/playgrounds/playgrounds.module.ts`
- `backend/src/playground-environments/playground-environment.entity.ts`
- `backend/src/playground-environments/dto/create-playground-environment.dto.ts`
- `backend/src/playground-environments/dto/update-playground-environment.dto.ts`
- `backend/src/playground-environments/playground-environments.service.ts`
- `backend/src/playground-environments/playground-environments.controller.ts`
- `backend/src/playground-environments/playground-environments.module.ts`
- `backend/src/migrations/1714400000000-AddPlaygrounds.ts`

**Frontend:**
- `frontend/src/types/playground.ts`
- `frontend/src/pages/PlaygroundViewPage.tsx`

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [TypeORM Entity Relations](https://typeorm.io/relations)
  - Specific section: OneToMany / ManyToOne, cascade, nullable
  - Why: Playground → PlaygroundEnvironment is a OneToMany; environments cascade-delete with the playground
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
  - Specific section: DTO-based validation with ValidationPipe
  - Why: All new DTO fields must be decorated; global pipe uses `transform: true`
- [NestJS Controllers — Route order](https://docs.nestjs.com/controllers#route-parameters)
  - Why: `GET /playgrounds/check-url` must be defined BEFORE `GET /playgrounds/:id` in the controller; in NestJS static routes take priority over parameterized ones within the same controller, but ordering still matters for readability and safety

---

## IMPLEMENTATION PLAN

### Phase 1: Database and Entities

Migration + TypeORM entities.

### Phase 2: Backend CRUD Modules

Playground CRUD + PlaygroundEnvironments sub-resource + check-url endpoint.

### Phase 3: Frontend Types and API Client

TypeScript types + grouped axios resources.

### Phase 4: Frontend Pages

Searchable list page + detail page with environment panel + iframe.

### Phase 5: Map Integration

Add playground shortcut to ServicePanel.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

---

### CREATE `backend/src/migrations/1714400000000-AddPlaygrounds.ts`

- **IMPLEMENT**: Two tables — `playgrounds` and `playground_environments`.
- **PATTERN**: Mirror `1714300000000-AlignEntitiesWithPrd.ts` — raw SQL, one call per statement, `.catch(() => undefined)` on FK constraints.
- **IMPORTS**: `MigrationInterface, QueryRunner` from `typeorm`.
- **SQL for `up`**:

```sql
-- playgrounds
CREATE TABLE IF NOT EXISTS "playgrounds" (
  "id"          uuid        NOT NULL DEFAULT gen_random_uuid(),
  "name"        text        NOT NULL,
  "description" text,
  "type"        text        NOT NULL DEFAULT 'other',
  "service_id"  uuid,
  "team_id"     uuid        NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_playgrounds" PRIMARY KEY ("id")
);

-- FK: service nullable ON DELETE SET NULL
ALTER TABLE "playgrounds"
  ADD CONSTRAINT "FK_playgrounds_service"
  FOREIGN KEY ("service_id") REFERENCES "services"("id")
  ON DELETE SET NULL;

-- FK: team required ON DELETE RESTRICT
ALTER TABLE "playgrounds"
  ADD CONSTRAINT "FK_playgrounds_team"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id")
  ON DELETE RESTRICT;

-- playground_environments
CREATE TABLE IF NOT EXISTS "playground_environments" (
  "id"             uuid        NOT NULL DEFAULT gen_random_uuid(),
  "playground_id"  uuid        NOT NULL,
  "label"          text        NOT NULL,
  "url"            text        NOT NULL,
  "sort_order"     integer     NOT NULL DEFAULT 0,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_playground_environments" PRIMARY KEY ("id")
);

-- FK: playground ON DELETE CASCADE
ALTER TABLE "playground_environments"
  ADD CONSTRAINT "FK_playground_environments_playground"
  FOREIGN KEY ("playground_id") REFERENCES "playgrounds"("id")
  ON DELETE CASCADE;
```

- **`down`**: `DROP TABLE IF EXISTS "playground_environments"` then `DROP TABLE IF EXISTS "playgrounds"`.
- **GOTCHA**: Migration class name must be `AddPlaygrounds1714400000000` to match the filename timestamp.
- **VALIDATE**: `cd backend && npm run build`

---

### CREATE `backend/src/playgrounds/playground.entity.ts`

- **IMPLEMENT**: TypeORM entity for `playgrounds`.
- **PATTERN**: Mirror `service.entity.ts`.
- **TYPE**: Export `PlaygroundType = 'openapi' | 'graphql' | 'postman' | 'other'`
- **RELATIONS**: 
  - `@ManyToOne(() => Service, { onDelete: 'SET NULL', nullable: true })` for `service`
  - `@ManyToOne(() => Team, { onDelete: 'RESTRICT' })` for `team`
  - `@OneToMany(() => PlaygroundEnvironment, (env) => env.playground)` for `environments`
- **IMPORTS**: TypeORM decorators; `Service` from `../services/service.entity`; `Team` from `../teams/team.entity`; forward-ref `PlaygroundEnvironment` from `../playground-environments/playground-environment.entity`.
- **GOTCHA**: Use `@Column({ name: 'service_id', type: 'uuid', nullable: true })` for the FK column. Do NOT use `eager: true` on relations.
- **VALIDATE**: `cd backend && npm run build`

---

### CREATE `backend/src/playground-environments/playground-environment.entity.ts`

- **IMPLEMENT**: TypeORM entity for `playground_environments`.
- **COLUMNS**: `id` (uuid PK), `playgroundId` (uuid, name: `playground_id`), `label` (text), `url` (text), `sortOrder` (int, name: `sort_order`, default: 0), `createdAt`, `updatedAt`.
- **RELATIONS**: `@ManyToOne(() => Playground, (p) => p.environments, { onDelete: 'CASCADE' })` with `@JoinColumn({ name: 'playground_id' })`.
- **PATTERN**: Mirror `entity-flow.entity.ts` for the parent FK pattern.
- **VALIDATE**: `cd backend && npm run build`

---

### CREATE backend playground DTOs

Create three files:

**`backend/src/playgrounds/dto/create-playground.dto.ts`**
```ts
export class CreatePlaygroundDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(['openapi', 'graphql', 'postman', 'other']) type?: PlaygroundType;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsUUID() teamId: string;
}
```

**`backend/src/playgrounds/dto/update-playground.dto.ts`**
```ts
export class UpdatePlaygroundDto extends PartialType(CreatePlaygroundDto) {}
```

**`backend/src/playgrounds/dto/query-playground.dto.ts`**
```ts
export class QueryPlaygroundDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() serviceId?: string;
}
```

- **PATTERN**: Mirror `create-service.dto.ts` and `query-service.dto.ts`.
- **IMPORTS**: class-validator decorators; `PartialType` from `@nestjs/mapped-types` for update DTO.
- **VALIDATE**: `cd backend && npm run build`

---

### CREATE backend playground-environments DTOs

Create two files:

**`backend/src/playground-environments/dto/create-playground-environment.dto.ts`**
```ts
export class CreatePlaygroundEnvironmentDto {
  @IsString() @IsNotEmpty() label: string;
  @IsString() @IsNotEmpty() url: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}
```

**`backend/src/playground-environments/dto/update-playground-environment.dto.ts`**
```ts
export class UpdatePlaygroundEnvironmentDto extends PartialType(CreatePlaygroundEnvironmentDto) {}
```

- **VALIDATE**: `cd backend && npm run build`

---

### CREATE `backend/src/playgrounds/playgrounds.service.ts`

- **IMPLEMENT**:
  - `findAll(query)`: QueryBuilder, `leftJoinAndSelect` for `team` and `service`, optional `q` filter using `ILIKE` on name/description (no tsvector for playgrounds — keep it simple), optional `teamId` and `serviceId` where clauses, order by name ASC.
  - `findOne(id)`: `findOne({ where: { id }, relations: ['team', 'service', 'environments'] })` ordered environments by `sort_order ASC` — use QueryBuilder for this: `leftJoinAndSelect('p.environments', 'env').addOrderBy('env.sort_order', 'ASC').addOrderBy('env.created_at', 'ASC')`.
  - `create(dto)`: create + save, return `findOne(saved.id)` to include relations.
  - `update(id, dto)`: findOne → Object.assign → save → return findOne.
  - `remove(id)`: findOne → repo.remove (environments cascade).
  - `checkUrl(url)`: make a HEAD request to the URL using Node's built-in `fetch` with a 5-second timeout (`AbortController`); inspect `x-frame-options` and `content-security-policy` headers; return `{ embeddable: boolean; reason?: string }`. If the request errors/times out, return `{ embeddable: true }` (optimistic fallback).
- **PATTERN**: Mirror `services.service.ts`.
- **`checkUrl` logic**:
  ```ts
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    const xfo = res.headers.get('x-frame-options')?.toUpperCase();
    if (xfo === 'DENY' || xfo === 'SAMEORIGIN') {
      return { embeddable: false, reason: 'x-frame-options' };
    }
    const csp = res.headers.get('content-security-policy') ?? '';
    if (csp.includes('frame-ancestors') && !csp.includes('frame-ancestors *')) {
      return { embeddable: false, reason: 'content-security-policy' };
    }
    return { embeddable: true };
  } catch {
    return { embeddable: true }; // optimistic on error/timeout
  } finally {
    clearTimeout(timeout);
  }
  ```
- **GOTCHA**: `fetch` is available globally in Node 18+. No need to import it. The NestJS app uses Node — verify the Node version if unsure, but Node 18 is standard for NestJS 11.
- **VALIDATE**: `cd backend && npm run build`

---

### CREATE `backend/src/playgrounds/playgrounds.controller.ts`

- **IMPLEMENT**: Routes in this order (static before parameterized):
  1. `GET /playgrounds/check-url` — `@Query('url') url: string`, calls `service.checkUrl(url)`, returns `{ embeddable, reason? }`
  2. `GET /playgrounds` — `@Query() query: QueryPlaygroundDto`
  3. `GET /playgrounds/:id` — `ParseUUIDPipe`
  4. `POST /playgrounds`
  5. `PATCH /playgrounds/:id`
  6. `DELETE /playgrounds/:id` — `@HttpCode(NO_CONTENT)`
- **PATTERN**: Mirror `services.controller.ts`.
- **GOTCHA**: `check-url` MUST be the first `@Get()` method. In NestJS, static routes take precedence over parameterized ones in the same controller, but defining it first is safer and clearer.
- **VALIDATE**: `cd backend && npm run build`

---

### CREATE `backend/src/playgrounds/playgrounds.module.ts`

- **IMPLEMENT**: `TypeOrmModule.forFeature([Playground])`, provide `PlaygroundsService`, register `PlaygroundsController`, export `PlaygroundsService`.
- **PATTERN**: Mirror `services.module.ts`.
- **VALIDATE**: `cd backend && npm run build`

---

### CREATE `backend/src/playground-environments/playground-environments.service.ts`

- **IMPLEMENT**:
  - `create(playgroundId, dto)`: verify playground exists via `playgroundsRepo.findOne`; create + save environment; return saved.
  - `update(id, dto)`: findOne by id (NotFoundException if missing); Object.assign; save; return saved.
  - `remove(id)`: findOne; repo.remove; returns void.
- **PATTERN**: Mirror `entity-flows.service.ts` — parent existence check, simple NotFoundException.
- **IMPORTS**: `InjectRepository` for both `PlaygroundEnvironment` and `Playground` repos (needed for parent existence check).
- **VALIDATE**: `cd backend && npm run build`

---

### CREATE `backend/src/playground-environments/playground-environments.controller.ts`

- **IMPLEMENT**: `@Controller()` with no prefix (mirrors entity-flows pattern):
  - `POST playgrounds/:id/environments`
  - `PATCH playground-environments/:id`
  - `DELETE playground-environments/:id` — `@HttpCode(NO_CONTENT)`
- **PATTERN**: Mirror `entity-flows.controller.ts` exactly.
- **VALIDATE**: `cd backend && npm run build`

---

### CREATE `backend/src/playground-environments/playground-environments.module.ts`

- **IMPLEMENT**: `TypeOrmModule.forFeature([PlaygroundEnvironment, Playground])`, provide service, register controller. Import `PlaygroundsModule` and add to imports so `PlaygroundsService` is injectable if needed — or simply inject both repos directly (simpler, matches entity-flows pattern).
- **PATTERN**: Mirror `entity-flows.module.ts`.
- **VALIDATE**: `cd backend && npm run build`

---

### UPDATE `backend/src/app.module.ts`

- **IMPLEMENT**: Import and add `PlaygroundsModule` and `PlaygroundEnvironmentsModule` to the imports array.
- **VALIDATE**: `cd backend && npm run build && npm run typecheck`

---

### CREATE `frontend/src/types/playground.ts`

- **IMPLEMENT**:
```ts
export type PlaygroundType = 'openapi' | 'graphql' | 'postman' | 'other';

export interface PlaygroundEnvironment {
  id: string;
  playgroundId: string;
  label: string;
  url: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Playground {
  id: string;
  name: string;
  description: string | null;
  type: PlaygroundType;
  serviceId: string | null;
  teamId: string;
  createdAt: string;
  updatedAt: string;
  service?: { id: string; name: string } | null;
  team?: import('./team').Team;
  environments?: PlaygroundEnvironment[];
}

export interface CreatePlaygroundPayload {
  name: string;
  description?: string;
  type?: PlaygroundType;
  serviceId?: string;
  teamId: string;
}

export interface CreatePlaygroundEnvironmentPayload {
  label: string;
  url: string;
  sortOrder?: number;
}
```
- **VALIDATE**: `cd frontend && npm run build`

---

### UPDATE `frontend/src/api/client.ts`

- **IMPLEMENT**: Add two new resource groups after `entityFlowsApi`:

```ts
export const playgroundsApi = {
  list: (params?: { q?: string; teamId?: string; serviceId?: string }) =>
    http.get<Playground[]>('/playgrounds', { params }).then(r => r.data),
  get: (id: string) =>
    http.get<Playground>(`/playgrounds/${id}`).then(r => r.data),
  create: (payload: CreatePlaygroundPayload) =>
    http.post<Playground>('/playgrounds', payload).then(r => r.data),
  update: (id: string, payload: Partial<CreatePlaygroundPayload>) =>
    http.patch<Playground>(`/playgrounds/${id}`, payload).then(r => r.data),
  delete: (id: string) => http.delete(`/playgrounds/${id}`),
  checkUrl: (url: string) =>
    http.get<{ embeddable: boolean; reason?: string }>('/playgrounds/check-url', { params: { url } }).then(r => r.data),
};

export const playgroundEnvironmentsApi = {
  create: (playgroundId: string, payload: CreatePlaygroundEnvironmentPayload) =>
    http.post<PlaygroundEnvironment>(`/playgrounds/${playgroundId}/environments`, payload).then(r => r.data),
  update: (id: string, payload: Partial<CreatePlaygroundEnvironmentPayload>) =>
    http.patch<PlaygroundEnvironment>(`/playground-environments/${id}`, payload).then(r => r.data),
  delete: (id: string) => http.delete(`/playground-environments/${id}`),
};
```

- **IMPORTS**: Add `Playground, CreatePlaygroundPayload, PlaygroundEnvironment, CreatePlaygroundEnvironmentPayload` from `../types/playground`.
- **VALIDATE**: `cd frontend && npm run build`

---

### UPDATE `frontend/src/pages/PlaygroundsPage.tsx`

- **IMPLEMENT**: Replace the stub with a full searchable list page.

**Layout**: single-column content area on `bg-slate-950`:
- Page header: title "פלייגראונדים" + description
- Two-column grid (same as TeamsPage): left = create/edit form, right = card grid
- Search input above the card grid (filters `q` client-side against `playground.name` and `playground.description` since the list is loaded once — no need to refetch on every keystroke)
- Each card shows: name, type badge, description (truncated), team name, linked service name (if any), "פתח" button → `useNavigate('/playgrounds/:id')`
- Type badge labels: `openapi` → "OpenAPI", `graphql` → "GraphQL", `postman` → "Postman", `other` → "אחר"

**Form fields** (create/edit): name (required), description (optional textarea), type (select), linked service (select, optional — loads `servicesApi.list()`), responsible team (select, required — loads `teamsApi.list()`)

**State**:
- `playgrounds`, `services`, `teams` loaded in parallel via `loadData()` / `Promise.all`
- `searchQuery` — local string for client-side card filtering
- `editingId` — id of playground being edited, or null
- `form` — create/edit form fields
- `confirmDeleteId` — playground id to confirm delete, or null
- `loading`, `saving`, `error` — standard flags

**Delete flow**: confirm modal (same pattern as TeamsPage `confirmAction` modal)

- **PATTERN**: Mirror `TeamsPage.tsx` — `loadData`, `getErrorMessage`, confirm modal, two-column layout, `rounded-3xl border border-slate-800 bg-slate-900/70` card style.
- **IMPORTS**: `playgroundsApi, servicesApi, teamsApi` from `../api/client`; `useNavigate` from `react-router-dom`; playground types.
- **GOTCHA**: Load services and teams for the form dropdowns. Client-side search filtering is fine here since this is a list page and the dataset is small. Do NOT debounce or refetch — filter the already-loaded `playgrounds` array in a `useMemo`.
- **VALIDATE**: `cd frontend && npm run build`

---

### CREATE `frontend/src/pages/PlaygroundViewPage.tsx`

- **IMPLEMENT**: Full-height detail page for a single playground.

**Layout** (flex row, fills `calc(100vh - 56px)` where 56px is TopNav height):
```
+--------------------------------+--------------------------------+
| Environment Panel (right, RTL) | iframe / fallback (flex-1)    |
| ~260px wide                    |                               |
| border-s border-slate-700      |                               |
|                                |                               |
| Playground info:               | <iframe                       |
|   name, team, description      |   src={activeEnv.url}        |
|   type badge                   |   className="w-full h-full"   |
|   linked service               | />                            |
|                                |                               |
| Environments:                  | OR blocked state:             |
|   [Prod]  ↗ (open in new tab)  |   centered message +          |
|   [Stage] ↗                   |   "פתח בטאב חדש" button       |
|   [Dev]   ↗                   |                               |
|                                |                               |
| Add environment form           |                               |
| (label + url + add button)     |                               |
+--------------------------------+--------------------------------+
```

**Note on RTL**: The app is RTL (`dir="rtl"`). Use `className="flex flex-row-reverse"` or just `flex-row` with the panel on the right — in RTL, putting the panel `div` second in DOM order with `order-first` keeps it on the right visually. Simplest: use `flex flex-row` and put the panel div first in JSX (it renders on the right in RTL).

**State**:
- `playground: Playground | null` — loaded by id from URL param
- `loading`, `error`
- `activeEnvId: string | null` — id of selected environment (default to first on load)
- `embeddable: boolean | null` — null = checking, true = show iframe, false = show fallback
- `busyEnvId: string | null` — environment being saved/deleted
- `envForm: { label: string; url: string }` — add/edit environment form
- `editingEnvId: string | null`

**Embeddability check flow**:
1. When `activeEnvId` changes (including on initial load), call `playgroundsApi.checkUrl(activeEnv.url)`
2. While checking: show a subtle loading state over the iframe area
3. On result: set `embeddable`; if false, show fallback
4. If check request itself errors: set `embeddable: true` (optimistic)

**Environment panel interactions**:
- Click environment row → set `activeEnvId`, trigger check
- Clicking active environment row does nothing (already selected, style it highlighted)
- Each environment row has an "↗" icon button that opens the URL in a new tab via `window.open(url, '_blank')`
- Below the list: inline add/edit form (label + url) — same `busyItemId` pattern as `EntityPanel`
- Edit: clicking "עריכה" on an environment row populates the form and sets `editingEnvId`
- Delete: direct delete with `busyEnvId` spinner, no confirm modal (environments are easy to re-add)
- After add/edit/delete: re-fetch `playgroundsApi.get(id)` to refresh environments list

**Iframe area**:
- `embeddable === null`: show subtle spinner/loading overlay
- `embeddable === true`: `<iframe src={activeEnv.url} title={playground.name} allow="fullscreen" className="w-full h-full border-0" />`
- `embeddable === false`: centered fallback — icon + "הפלייגראונד לא ניתן להטמעה" + prominent "פתח בטאב חדש" button + smaller text explaining X-Frame-Options/CSP
- No active environment selected (empty list): instructional placeholder — "הוסף סביבה כדי להתחיל"

**Back navigation**: "חזרה לפלייגראונדים" link at the top of the panel using `<Link to="/playgrounds">`.

- **PATTERN**: `useParams<{ id: string }>()`, `useState` + `useEffect` + `loadData()`. Panel styling mirrors `EntityPanel` — `border-s border-slate-700 bg-slate-900`.
- **IMPORTS**: `useParams, Link` from `react-router-dom`; `playgroundsApi, playgroundEnvironmentsApi` from `../api/client`; playground types.
- **GOTCHA**: 
  - The `embeddable` check should fire whenever `activeEnvId` changes. Use a separate `useEffect` with `[activeEnvId]` dependency.
  - Reset `embeddable` to `null` immediately when `activeEnvId` changes so the loading state shows while the check runs.
  - The outer container needs `h-[calc(100vh-56px)] overflow-hidden` to fill the viewport below TopNav without scrolling (the panel itself scrolls internally).
  - `AppShell` wraps content in `<main className="flex-1 overflow-hidden">` — the page just needs `h-full`.
- **VALIDATE**: `cd frontend && npm run build`

---

### UPDATE `frontend/src/App.tsx`

- **IMPLEMENT**: Add `<Route path="/playgrounds/:id" element={<PlaygroundViewPage />} />` alongside the existing `/playgrounds` route, inside the `<AppShell>` wrapper.
- **IMPORTS**: `PlaygroundViewPage` from `./pages/PlaygroundViewPage`.
- **VALIDATE**: `cd frontend && npm run build`

---

### UPDATE `frontend/src/components/map/ServicePanel.tsx`

- **IMPLEMENT**: In the view mode block (`!isFormMode && service`), add a "פלייגראונדים" section between the team and connections sections:
  - Local `useState<Playground[]>([])` for the list
  - `useEffect` that calls `playgroundsApi.list({ serviceId: service.id })` whenever `service?.id` changes (skip if `createForTeamId` is set)
  - Render each playground as a clickable button using `useNavigate` to `/playgrounds/:id`
  - Empty state: `"אין פלייגראונד מקושר"`
- **PATTERN**: Mirror existing `useEffect`s in ServicePanel. Link styling: `text-slate-300 hover:text-slate-100 hover:underline text-sm text-start bg-transparent border-0 p-0 cursor-pointer`.
- **IMPORTS**: `playgroundsApi` from `../../api/client`; `Playground` from `../../types/playground`; `useNavigate` from `react-router-dom`.
- **GOTCHA**: Clear the playground list when `service` changes to avoid showing stale data. Set it to `[]` at the start of the effect before the async call.
- **VALIDATE**: `cd frontend && npm run build`

---

## TESTING STRATEGY

No automated test harness in this repo. Validation is build + type checks + curl + manual browser.

### Edge Cases

- Playground with no environments: view page shows "הוסף סביבה" placeholder; iframe area is empty; no check-url call fires
- Playground with environments, first environment is auto-selected on load
- check-url on a URL that blocks iframes → fallback state renders correctly
- check-url request times out → optimistic fallback (iframe renders)
- check-url on an unreachable URL → optimistic fallback (iframe renders)
- Deleting an environment that is currently active → after refresh, default to first remaining env or show empty state
- Deleting a playground from the list page with the confirm modal
- Creating a playground with no linked service (serviceId omitted) — serviceId saves as null
- Deleting a service that has linked playgrounds — playgrounds survive, serviceId becomes null; the list card shows no linked service

---

## VALIDATION COMMANDS

### Level 1: Syntax & Types

```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run build
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run typecheck
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run build
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run lint
```

### Level 2: API Validation (requires running backend + migrated DB)

```bash
# Run migration
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run migration:run

# Get a real team UUID first
TEAM_ID=$(curl -s http://localhost:3001/teams | jq -r '.[0].id')

# Create playground
PG=$(curl -s -X POST http://localhost:3001/playgrounds \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Swagger UI\",\"type\":\"openapi\",\"teamId\":\"$TEAM_ID\"}")
echo $PG | jq '.'
PG_ID=$(echo $PG | jq -r '.id')

# List playgrounds
curl -s http://localhost:3001/playgrounds | jq 'length'

# Add environment
ENV=$(curl -s -X POST http://localhost:3001/playgrounds/$PG_ID/environments \
  -H 'Content-Type: application/json' \
  -d '{"label":"Production","url":"http://localhost:3001/api","sortOrder":0}')
echo $ENV | jq '.'
ENV_ID=$(echo $ENV | jq -r '.id')

# Get playground with environments
curl -s http://localhost:3001/playgrounds/$PG_ID | jq '{name: .name, envCount: (.environments | length)}'

# check-url (embeddable — no blocking headers on localhost)
curl -s "http://localhost:3001/playgrounds/check-url?url=http://localhost:3001" | jq '.'

# Update environment
curl -s -X PATCH http://localhost:3001/playground-environments/$ENV_ID \
  -H 'Content-Type: application/json' \
  -d '{"label":"Prod"}' | jq '.label'

# Delete environment
curl -s -X DELETE http://localhost:3001/playground-environments/$ENV_ID -o /dev/null -w '%{http_code}'
# expect 204

# Delete playground
curl -s -X DELETE http://localhost:3001/playgrounds/$PG_ID -o /dev/null -w '%{http_code}'
# expect 204
```

### Level 3: Manual Browser Validation

1. Start backend (`npm run start:dev`) and frontend (`npm run dev`)
2. Navigate to `/playgrounds` — confirm page loads (not the stub)
3. Create a playground — fill name, type, responsible team; save
4. Confirm the card appears in the grid
5. Add a second playground; use the search input to filter — confirm filtering works
6. Click "פתח" on a card — confirm navigation to `/playgrounds/:id`
7. On the detail page — confirm playground info shows in the right panel
8. Add environments (Production, Staging) via the inline form
9. Click each environment — confirm the environment button highlights and the iframe loads
10. Click the "↗" icon on an environment — confirm it opens in a new tab
11. Test check-url fallback: add an environment with a URL that has X-Frame-Options (e.g. `https://google.com`) — confirm the fallback state renders instead of the iframe
12. Delete an environment — confirm it disappears from the list and the next env is auto-selected
13. Navigate to `/map`, click a service that has a linked playground — confirm the playground shortcut appears in the side panel
14. Click the shortcut — confirm it navigates to `/playgrounds/:id`
15. Edit a playground from the list page — confirm the form populates and saving updates the card
16. Delete a playground via the confirm modal — confirm it is removed

---

## ACCEPTANCE CRITERIA

- [ ] `GET /playgrounds` returns playgrounds with `team` and `service` relations
- [ ] `GET /playgrounds/:id` returns playground with `environments` array sorted by `sort_order ASC, created_at ASC`
- [ ] `POST /playgrounds/:id/environments` adds an environment; `GET /playgrounds/:id` reflects it
- [ ] `PATCH /playground-environments/:id` updates label/url/sortOrder
- [ ] `DELETE /playground-environments/:id` returns 204
- [ ] `GET /playgrounds/check-url?url=...` returns `{ embeddable: boolean }` correctly for blocking and non-blocking URLs
- [ ] `/playgrounds` list page is searchable client-side
- [ ] `/playgrounds` create/edit form works with confirm modal for delete
- [ ] `/playgrounds/:id` shows info panel on the right (RTL start side)
- [ ] `/playgrounds/:id` environment switcher highlights the active env and triggers iframe reload
- [ ] `/playgrounds/:id` calls `check-url` before rendering iframe; shows fallback when not embeddable
- [ ] `/playgrounds/:id` environment add/edit/delete works inline without navigating away
- [ ] `ServicePanel` shows linked playgrounds with navigation link
- [ ] Backend and frontend build with zero errors and zero lint warnings

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately after implementation
- [ ] Migration ran successfully
- [ ] Backend build + typecheck clean
- [ ] Frontend build + lint clean
- [ ] All curl API checks pass
- [ ] Manual browser walkthrough confirms full flow
- [ ] No regressions in map, entities, or teams pages

---

## NOTES

- `check-url` uses a server-side HEAD request. This means the backend's network must be able to reach the target URL. For internal services on the same network this is always true. For external URLs it may occasionally fail — the optimistic fallback handles this gracefully.
- `X-Frame-Options: SAMEORIGIN` is flagged as non-embeddable. In practice, if the catalog and the playground are on the same origin (same host + port), SAMEORIGIN would allow embedding. But since the catalog and the playgrounds are almost always on different ports/domains, flagging it is the correct default.
- Client-side search on the list page (filtering the already-loaded array) is intentional — the playground list will be small and always loaded in full. No need for server-side search on this resource.
- The environment `sort_order` field allows teams to control the display order. The default is 0; teams can set explicit values if ordering matters. The UI sorts by `sort_order ASC, created_at ASC` so newly added envs with `sortOrder: 0` appear first unless explicitly ordered otherwise.
- Confidence Score: 9/10 for one-pass implementation success if the execution agent follows this plan closely and reads the referenced files before implementing.
