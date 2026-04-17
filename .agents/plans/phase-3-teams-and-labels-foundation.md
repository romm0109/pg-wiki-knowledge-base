# Feature: Phase 3 — Teams and Labels Foundation

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files, preserve the existing `teamsApi.update()` layout-save behavior from the map, and do not accidentally remove fields that the map already persists (`positionX`, `positionY`, `width`, `height`).

## Feature Description

Replace the placeholder lineage page with a real Teams management surface that matches the updated PRD. The feature introduces reusable org labels, extends teams with an optional label association, and exposes CRUD APIs and a frontend page to manage both concepts from one place.

This is a foundation slice. It resolves the current mismatch between product requirements and the codebase before entity work starts. It also preserves the map behavior that already depends on teams.

## User Story

As a platform engineer
I want to manage teams and reusable org labels from one page
So that the catalog reflects internal and external ownership correctly and future entity/source modeling has the right foundation

## Problem Statement

The codebase still routes to `/lineage`, but the PRD no longer includes lineage as a standalone concept. The backend has only `teams`, `services`, `connections`, and `map`; there is no `labels` domain and teams cannot reference reusable org labels. The frontend also lacks a CRUD-oriented page pattern outside the map. If implementation continues toward entities without first correcting this foundation, the app will drift further from the PRD and later entity work will build on the wrong model.

## Solution Statement

Implement a new `labels` backend feature module and extend `teams` with an optional `label_id` foreign key while keeping current team layout fields intact. Replace the placeholder `/lineage` route with `/teams`, and create a Teams page that manages labels and teams in two sections on the same route. Keep the first version operational and simple: fetch, list, create, edit, and delete for both resources, with visible color chips and a clear internal/external toggle. Update navigation and client types so the frontend and backend share the same model.

## Feature Metadata

**Feature Type**: New Capability + Refactor  
**Estimated Complexity**: Medium  
**Primary Systems Affected**: Frontend router/navigation, frontend API client/types, new Teams page UI, backend teams module, new labels module, TypeORM config, DB migrations  
**Dependencies**: `react-router-dom@6.30.3`, `axios@1.14.0`, `@nestjs/common@11.1.18`, `@nestjs/typeorm@11.0.1`, `class-validator@0.15.1`, `typeorm@0.3.28`, Postgres 16 via `docker-compose.yml`

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `frontend/src/App.tsx` (lines 1-22) - Current route table; `/lineage` must become `/teams`.
- `frontend/src/components/layout/TopNav.tsx` (lines 1-34) - Current navigation source of truth; still points to `/lineage` and uses `NavLink`.
- `frontend/src/pages/LineagePage.tsx` (full file) - Current placeholder page to replace/remove.
- `frontend/src/api/client.ts` (lines 1-44) - Existing axios wrapper and resource API organization pattern; mirror this for `labelsApi`.
- `frontend/src/types/team.ts` (lines 1-17) - Current team response/payload shape; must be extended without breaking map layout persistence.
- `frontend/src/components/map/MapCanvas.tsx` (lines 37-245) - Existing consumer of `teamsApi.list()` and `teamsApi.update()`; layout save depends on PATCH remaining compatible.
- `frontend/src/components/ui/Badge.tsx` (lines 1-17) - Existing lightweight colored badge pattern that can be reused for labels.
- `backend/src/main.ts` (lines 6-21) - Global `ValidationPipe` config with `whitelist`, `forbidNonWhitelisted`, and `transform`; every DTO field must be decorated.
- `backend/src/app.module.ts` (lines 1-29) - Root module registration pattern; new `LabelsModule` must be imported here.
- `backend/src/config/typeorm.config.ts` (lines 1-20) - Explicit entity registration for the Nest app; new `Label` entity must be added here.
- `backend/src/teams/teams.module.ts` (lines 1-13) - Feature module pattern to mirror for the new labels module.
- `backend/src/teams/teams.controller.ts` (lines 17-49) - CRUD controller pattern using `ParseUUIDPipe`, `@HttpCode(NO_CONTENT)`, and thin controllers.
- `backend/src/teams/teams.service.ts` (lines 12-45) - Current service layer pattern and current gaps: no relation validation, no foreign-key failure handling, no uniqueness check on update.
- `backend/src/teams/team.entity.ts` (lines 10-40) - Current team entity fields, relation style, and naming conventions for snake_case DB columns mapped to camelCase properties.
- `backend/src/teams/dto/create-team.dto.ts` (lines 1-31) - DTO validation pattern; new optional `labelId` must be decorated or validation will reject requests.
- `backend/src/services/service.entity.ts` (lines 17-68) - Canonical TypeORM relation pattern in this repo using explicit FK columns plus `@ManyToOne` and `@JoinColumn`.
- `backend/src/migrations/1712500000000-InitialSchema.ts` (lines 6-105) - Manual SQL migration style, naming convention, and `queryRunner.query(...)` usage.
- `backend/src/migrations/1714100000000-AddTeamSize.ts` (lines 3-15) - Small additive migration format to mirror for the next schema change.
- `docker-compose.yml` (lines 1-34) - Local Postgres runtime used for migration/manual validation.
- `CLAUDE.md` (lines 1-4) - Project rule: do not commit changes unless explicitly asked.

### New Files to Create

- `backend/src/labels/label.entity.ts` - TypeORM entity for reusable org labels.
- `backend/src/labels/labels.module.ts` - Feature module registration for labels.
- `backend/src/labels/labels.controller.ts` - CRUD controller for `/labels`.
- `backend/src/labels/labels.service.ts` - CRUD service with uniqueness checks and delete behavior.
- `backend/src/labels/dto/create-label.dto.ts` - Validation DTO for label creation.
- `backend/src/labels/dto/update-label.dto.ts` - Partial update DTO for labels.
- `backend/src/migrations/1714200000000-AddLabelsAndTeamLabelRelation.ts` - Creates `labels` table and adds nullable `label_id` FK on `teams`.
- `frontend/src/pages/TeamsPage.tsx` - New Teams page replacing the lineage placeholder.
- `frontend/src/types/label.ts` - Frontend label types and payload shape.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [React Router `<Routes>`](https://reactrouter.com/6.30.1/components/routes)
  - Specific section: route matching and nested route behavior
  - Why: current app uses `BrowserRouter` + `<Routes>` directly in `frontend/src/App.tsx`; route replacement should preserve this pattern.
- [React Router `<NavLink>`](https://reactrouter.com/6.30.1/components/nav-link)
  - Specific section: `className` callback and active link behavior
  - Why: `TopNav.tsx` already uses the `className={({ isActive }) => ...}` pattern and should continue to.
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
  - Specific section: `ValidationPipe`, `whitelist`, `forbidNonWhitelisted`, mapped types
  - Why: new DTO fields must be explicitly decorated or requests will fail with 400s.
- [NestJS Modules](https://docs.nestjs.com/modules)
  - Specific section: feature modules and exports/imports
  - Why: `LabelsModule` should follow the same feature-module structure as `TeamsModule`.
- [TypeORM Migrations](https://typeorm.io/docs/advanced-topics/migrations)
  - Specific section: manual migrations with `up`/`down`, compiled `.js` execution, and `QueryRunner`
  - Why: this repo already uses manual SQL migrations and runs them via compiled JS.
- [TypeORM Many-to-one / One-to-many Relations](https://typeorm.io/docs/relations/many-to-one-one-to-many-relations/)
  - Specific section: owning side, FK placement, and inverse-side optionality
  - Why: `Team` ↔ `Label` relation should follow the repo’s explicit FK column pattern.

### Patterns to Follow

**Frontend routing pattern**

Use route registration in `App.tsx` and nav definition in `TopNav.tsx` as the two places that must stay in sync.

```tsx
<Routes>
  <Route path="/" element={<Navigate to="/map" replace />} />
  <Route path="/map" element={<MapPage />} />
</Routes>
```

```tsx
<NavLink
  to={to}
  className={({ isActive }) =>
    isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
  }
>
```

**Axios API client pattern**

Keep resource APIs grouped in `frontend/src/api/client.ts`:

```ts
export const teamsApi = {
  list: () => http.get<Team[]>('/teams').then(r => r.data),
  create: (payload: CreateTeamPayload) => http.post<Team>('/teams', payload).then(r => r.data),
  update: (id: string, payload: Partial<CreateTeamPayload>) =>
    http.patch<Team>(`/teams/${id}`, payload).then(r => r.data),
  delete: (id: string) => http.delete(`/teams/${id}`),
};
```

Mirror that shape for `labelsApi`.

**Frontend state/data-loading pattern**

There is no data-fetching library. Existing code uses `useEffect`, `useState`, and direct async calls:

```tsx
useEffect(() => {
  Promise.all([mapApi.get(), teamsApi.list()]).then(([mapData, teamList]) => {
    setRawData(mapData);
    setTeams(teamList);
  });
}, []);
```

Use the same approach for the first pass of `TeamsPage.tsx`. Do not introduce React Query or a new state library in this slice.

**Backend feature module pattern**

Mirror `TeamsModule`:

```ts
@Module({
  imports: [TypeOrmModule.forFeature([Team])],
  providers: [TeamsService],
  controllers: [TeamsController],
  exports: [TeamsService],
})
```

**Thin controller pattern**

Controllers delegate to services and use `ParseUUIDPipe` for `:id` params:

```ts
@Patch(':id')
update(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: UpdateTeamDto,
) {
  return this.teamsService.update(id, dto);
}
```

**DTO validation pattern**

All fields must be decorated because `ValidationPipe` uses `whitelist: true` and `forbidNonWhitelisted: true`:

```ts
@IsOptional()
@IsHexColor()
color?: string;
```

`UpdateTeamDto` should continue to use `PartialType(CreateTeamDto)`.

**TypeORM entity pattern**

This repo keeps explicit FK columns and separate relation properties:

```ts
@Column({ name: 'team_id', type: 'uuid' })
teamId: string;

@ManyToOne(() => Team, (team) => team.services, { onDelete: 'RESTRICT' })
@JoinColumn({ name: 'team_id' })
team: Team;
```

Use the same pattern for `Team.labelId` plus `Team.label`, and optionally `Label.teams` on the inverse side.

**Migration pattern**

Migrations are handwritten SQL via `queryRunner.query(...)`, named with a timestamped class:

```ts
export class AddTeamSize1714100000000 implements MigrationInterface {
  name = 'AddTeamSize1714100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "width" double precision`);
  }
}
```

Follow this style instead of generated schema-builder code.

### Anti-patterns to Avoid

- Do not remove `positionX`, `positionY`, `width`, or `height` from team DTOs or types. `MapCanvas` PATCH calls depend on them.
- Do not overload label color to replace team color on the map in this slice. Team color already drives map rendering.
- Do not change the teams API contract in a way that breaks `teamsApi.list()` consumers on the map.
- Do not add a new frontend state or form library just for this page.
- Do not silently ignore delete failures for teams with attached services; surface them as a controlled API error and UI message.

---

## IMPLEMENTATION PLAN

### Phase 1: Backend Foundation

Add the `labels` domain and extend `teams` with a nullable `label_id` relation while preserving all current team fields and map behavior.

**Tasks:**

- Create `Label` entity/module/controller/service/DTOs
- Add migration for `labels` table and `teams.label_id`
- Register `Label` in TypeORM config and import `LabelsModule` in `AppModule`
- Extend `Team` entity and team DTOs with `labelId`
- Add backend validation and friendly conflict/not-found behavior

### Phase 2: Frontend Route and Data Model

Replace the stale lineage route and add client types and API functions for labels and richer teams.

**Tasks:**

- Replace `/lineage` with `/teams` in router and top nav
- Add `Label` frontend types
- Extend `Team` type with `labelId` and optional `label`
- Add `labelsApi` in `frontend/src/api/client.ts`

### Phase 3: Teams Page UI

Build one page with two management sections: labels and teams.

**Tasks:**

- Fetch labels and teams on mount
- Render label CRUD UI with color chip preview
- Render team CRUD UI with internal/external toggle and label select
- Handle loading, empty, save, delete, and backend error states

### Phase 4: Validation and Regression Protection

Confirm the new route works, the map still loads teams, and destructive paths behave correctly.

**Tasks:**

- Run backend migration and compile checks
- Run frontend lint/build
- Manually verify create/edit/delete workflows
- Manually verify map still loads and layout save still works

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### CREATE `backend/src/labels/label.entity.ts`

- **IMPLEMENT**: Add `id`, `name`, `color`, `createdAt`, `updatedAt`, plus inverse `teams` relation.
- **PATTERN**: Mirror entity decorators and timestamp columns from `backend/src/services/service.entity.ts:17-68` and `backend/src/teams/team.entity.ts:10-40`.
- **IMPORTS**: `Column`, `CreateDateColumn`, `Entity`, `OneToMany`, `PrimaryGeneratedColumn`, `UpdateDateColumn`.
- **GOTCHA**: Keep `color` required on labels even though `Team.color` is nullable; label color is the core identity of the label.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run typecheck`

### CREATE `backend/src/labels/dto/create-label.dto.ts`

- **IMPLEMENT**: Require non-empty `name` and valid hex `color`.
- **PATTERN**: Mirror validation style from `backend/src/teams/dto/create-team.dto.ts:1-31`.
- **IMPORTS**: `IsHexColor`, `IsNotEmpty`, `IsString`.
- **GOTCHA**: Because global validation forbids non-whitelisted fields, every accepted field needs decorators.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run typecheck`

### CREATE `backend/src/labels/dto/update-label.dto.ts`

- **IMPLEMENT**: Use `PartialType(CreateLabelDto)`.
- **PATTERN**: Mirror `backend/src/teams/dto/update-team.dto.ts`.
- **IMPORTS**: `PartialType` from `@nestjs/mapped-types`.
- **GOTCHA**: Keep update DTO thin; do not duplicate validation rules manually.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run typecheck`

### CREATE `backend/src/labels/labels.service.ts`

- **IMPLEMENT**: CRUD service with `findAll`, `findOne`, `create`, `update`, `remove`.
- **PATTERN**: Mirror service structure from `backend/src/teams/teams.service.ts:12-45`.
- **IMPORTS**: `Injectable`, `NotFoundException`, `ConflictException`, `InjectRepository`, `Repository`.
- **GOTCHA**: Add uniqueness checks on both create and update for `name`; current `TeamsService.update()` does not guard duplicate-name collisions.
- **GOTCHA**: Delete should succeed even if teams reference the label because the FK should be `ON DELETE SET NULL`.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run typecheck`

### CREATE `backend/src/labels/labels.controller.ts`

- **IMPLEMENT**: CRUD endpoints `GET /labels`, `GET /labels/:id`, `POST /labels`, `PATCH /labels/:id`, `DELETE /labels/:id`.
- **PATTERN**: Mirror `backend/src/teams/teams.controller.ts:17-49`.
- **IMPORTS**: `Body`, `Controller`, `Delete`, `Get`, `HttpCode`, `HttpStatus`, `Param`, `ParseUUIDPipe`, `Patch`, `Post`.
- **GOTCHA**: Return `204 No Content` on delete to match current CRUD conventions.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run typecheck`

### CREATE `backend/src/labels/labels.module.ts`

- **IMPLEMENT**: Register `Label` repository, controller, and service.
- **PATTERN**: Mirror `backend/src/teams/teams.module.ts:1-13`.
- **IMPORTS**: `Module`, `TypeOrmModule`, `Label`, `LabelsService`, `LabelsController`.
- **GOTCHA**: Export `LabelsService` only if another module ends up injecting it. For this slice it is acceptable but not required.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run typecheck`

### UPDATE `backend/src/teams/team.entity.ts`

- **IMPLEMENT**: Add nullable `labelId` FK column and `label` relation while preserving existing map layout fields and `services` relation.
- **PATTERN**: Use explicit FK column + relation style from `backend/src/services/service.entity.ts:25-27` and `backend/src/services/service.entity.ts:60-62`.
- **IMPORTS**: Add `JoinColumn`, `ManyToOne`, `UpdateDateColumn`, and `Label`.
- **GOTCHA**: `Team` currently lacks `updatedAt`. Add it now so updates to `labelId` and future team edits have a timestamp, but make sure the migration adds the column too if you choose to include it. If you do not add `updatedAt`, keep the entity/migration aligned.
- **GOTCHA**: Keep `isExternal` mapped to `is_external` and `labelId` mapped to `label_id`.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run typecheck`

### UPDATE `backend/src/teams/dto/create-team.dto.ts`

- **IMPLEMENT**: Add optional nullable `labelId` with `@IsOptional()` and `@IsUUID()`.
- **PATTERN**: Extend the existing DTO in place; `UpdateTeamDto` already derives from it.
- **IMPORTS**: Add `IsUUID` if missing.
- **GOTCHA**: Keep existing optional layout fields. `MapCanvas.handleLayoutSave()` sends them through the same PATCH endpoint.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run typecheck`

### UPDATE `backend/src/teams/teams.service.ts`

- **IMPLEMENT**: Inject `Label` repository or `LabelsService` to validate `labelId` existence on create/update.
- **IMPLEMENT**: Add duplicate-name checks in `update`.
- **IMPLEMENT**: Translate delete failures for teams with services into a clear `ConflictException` message instead of leaking a raw DB foreign-key error.
- **PATTERN**: Stay with repository-driven service logic from `backend/src/teams/teams.service.ts:12-45`; keep controllers thin.
- **GOTCHA**: `findAll()` currently returns plain teams ordered by name. If the UI needs label details, either load the `label` relation here or return only `labelId` and join on the client using `labelsApi.list()`. Pick one approach and keep it consistent across create/update/list.
- **GOTCHA**: Do not require `labelId` for external teams; PRD says the label is optional.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run typecheck && npm run build`

### UPDATE `backend/src/config/typeorm.config.ts`

- **IMPLEMENT**: Add `Label` to the explicit `entities` array.
- **PATTERN**: Follow the existing explicit import registration in `backend/src/config/typeorm.config.ts:1-20`.
- **GOTCHA**: `backend/data-source.ts` uses a glob for migration CLI and does not need the same explicit entity addition, but the Nest app does.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run build`

### UPDATE `backend/src/app.module.ts`

- **IMPLEMENT**: Import `LabelsModule`.
- **PATTERN**: Mirror current feature-module registration in `backend/src/app.module.ts:11-27`.
- **GOTCHA**: Keep module imports flat and ordered logically next to `TeamsModule`.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run build`

### CREATE `backend/src/migrations/1714200000000-AddLabelsAndTeamLabelRelation.ts`

- **IMPLEMENT**: Create `labels` table with unique `name`, required `color`, timestamps, and add nullable `teams.label_id` with FK `ON DELETE SET NULL`.
- **PATTERN**: Mirror manual SQL style from `backend/src/migrations/1712500000000-InitialSchema.ts:6-105` and additive migration style from `backend/src/migrations/1714100000000-AddTeamSize.ts:3-15`.
- **GOTCHA**: If you add `updated_at` to `labels` and/or `teams`, migration and entity definitions must stay perfectly aligned.
- **GOTCHA**: Use deterministic constraint names for the FK and unique index where practical so future down migrations are easy.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run migration:run`

### CREATE `frontend/src/types/label.ts`

- **IMPLEMENT**: Add `Label` and `CreateLabelPayload` interfaces.
- **PATTERN**: Mirror style from `frontend/src/types/team.ts:1-17`.
- **IMPORTS**: None.
- **GOTCHA**: Use camelCase response fields to match how existing frontend types consume backend JSON (`isExternal`, `createdAt`).
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run build`

### UPDATE `frontend/src/types/team.ts`

- **IMPLEMENT**: Extend `Team` with `labelId?: string | null` and optionally `label?: Label | null` if the backend includes the relation in responses.
- **IMPLEMENT**: Extend `CreateTeamPayload` with `labelId?: string | null`.
- **PATTERN**: Preserve current camelCase naming used by `MapCanvas`.
- **GOTCHA**: Do not remove `positionX`, `positionY`, `width`, or `height`.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run build`

### UPDATE `frontend/src/api/client.ts`

- **IMPLEMENT**: Add `labelsApi` using the same axios wrapper and method naming as `teamsApi`.
- **PATTERN**: Mirror the resource grouping pattern in `frontend/src/api/client.ts:11-18`.
- **IMPORTS**: Add `Label` and `CreateLabelPayload`.
- **GOTCHA**: Keep `teamsApi.update()` signature compatible with `MapCanvas.handleLayoutSave()` at `frontend/src/components/map/MapCanvas.tsx:213-239`.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run build`

### CREATE `frontend/src/pages/TeamsPage.tsx`

- **IMPLEMENT**: Build a page with two sections on one route:
  - labels list/form/actions
  - teams list/form/actions
- **PATTERN**: Follow the repo’s simple page approach from `frontend/src/pages/MapPage.tsx` and direct async loading/state style from `frontend/src/components/map/MapCanvas.tsx:65-80`.
- **IMPLEMENT**: Use `Badge` or a similar small color chip to display labels.
- **IMPLEMENT**: Support create, edit, delete, loading, empty state, and surfaced error messages.
- **GOTCHA**: The app currently has no generic form components, modal system, or toast system. Keep the first pass simple and local to the page.
- **GOTCHA**: If a team delete fails because services still reference it, show the backend conflict message in the page instead of swallowing it.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run build && npm run lint`

### UPDATE `frontend/src/App.tsx`

- **IMPLEMENT**: Replace the `/lineage` route with `/teams` and swap `LineagePage` import for `TeamsPage`.
- **PATTERN**: Preserve route ordering and root redirect style from `frontend/src/App.tsx:1-22`.
- **GOTCHA**: Remove stale imports so TypeScript does not retain unused `LineagePage`.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run build`

### UPDATE `frontend/src/components/layout/TopNav.tsx`

- **IMPLEMENT**: Replace nav item `{ to: '/lineage', label: 'מקורות' }` with the new teams entry and update labels so navigation matches the PRD.
- **PATTERN**: Keep the `NAV_ITEMS` constant and `NavLink` active styling pattern from `frontend/src/components/layout/TopNav.tsx:3-31`.
- **GOTCHA**: Use the React Router `NavLink` callback pattern already in place; do not reimplement active-route logic manually.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run build && npm run lint`

### REMOVE `frontend/src/pages/LineagePage.tsx`

- **IMPLEMENT**: Delete the stale placeholder once `TeamsPage` is wired in and there are no remaining imports.
- **PATTERN**: N/A.
- **GOTCHA**: Only remove after route and import replacement is complete.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run build`

### UPDATE `frontend/src/components/map/MapCanvas.tsx`

- **IMPLEMENT**: Verify the existing teams fetch and layout-save PATCH flow still compile against the expanded team types.
- **PATTERN**: Existing `teamsApi.list()` and `teamsApi.update()` calls at `frontend/src/components/map/MapCanvas.tsx:65-80` and `frontend/src/components/map/MapCanvas.tsx:213-239`.
- **GOTCHA**: This file may not need logic changes, but it is a regression hotspot because it is the only current consumer of teams CRUD data.
- **VALIDATE**: `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run build`

---

## TESTING STRATEGY

There is currently no repo-level automated test framework configured for either app. No Jest/Vitest/Cypress setup exists in `frontend/package.json` or `backend/package.json`, and there are no first-party test files outside `node_modules`. Because of that, this slice should rely on compilation, linting, migration execution, and manual end-to-end validation. If automated tests are required, that should be a separate infrastructure task.

### Unit Tests

No unit test harness is configured today. Do not introduce one as part of this slice unless the scope is explicitly expanded.

### Integration Tests

Use real local integration through the running backend/frontend and Postgres from `docker-compose.yml`.

### Edge Cases

- Creating two labels with the same name should fail cleanly.
- Updating a label to a duplicate name should fail cleanly.
- Creating/updating a team with a non-existent `labelId` should fail with a controlled 404/400 path, not a raw DB error.
- Deleting a label that is assigned to teams should leave teams intact and unset `labelId`.
- Deleting a team that still has services should fail with a clear conflict message.
- Editing a team without a label should keep `labelId` null.
- Map page should still render and save team layout after the team schema/API extension.
- Replacing `/lineage` must not leave broken nav links or dead imports.

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and feature correctness.

### Level 1: Syntax & Style

- `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run typecheck`
- `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run build`
- `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run lint`
- `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run build`

### Level 2: Database & Migration Validation

- `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub && docker compose up -d postgres`
- `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run migration:run`

### Level 3: Runtime Validation

- `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run start:dev`
- `cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npm run dev`

### Level 4: Manual Validation

1. Open the app and confirm top navigation shows `צוותים` instead of `מקורות`.
2. Visit `/teams` directly and confirm the page loads instead of a placeholder.
3. Create a label with a color and confirm it appears in the labels list.
4. Edit the label and confirm updates persist after refresh.
5. Create an internal team without a label and confirm save succeeds.
6. Create an external team with a label and confirm save succeeds.
7. Edit a team to change `isExternal`, `color`, and `labelId`, then refresh and confirm persistence.
8. Delete a label assigned to one or more teams and confirm the teams remain, now unlabeled.
9. Attempt to delete a team that still owns services and confirm the UI shows a clear failure message.
10. Open `/map` and confirm teams still render, external teams still collapse by default, and saving layout still works.

### Level 5: Additional Validation (Optional)

- `curl http://localhost:3001/labels`
- `curl http://localhost:3001/teams`

---

## ACCEPTANCE CRITERIA

- [ ] `/teams` exists and `/lineage` is removed from routing and navigation
- [ ] Labels can be created, edited, listed, and deleted through both API and UI
- [ ] Teams can be created, edited, listed, and deleted through both API and UI
- [ ] Teams support `isExternal` and optional `labelId`
- [ ] Deleting a label unassigns it from teams instead of deleting teams
- [ ] Deleting a team with attached services fails with a controlled error message
- [ ] Existing map functionality still works with the expanded team model
- [ ] Backend migrations run successfully on local Postgres
- [ ] Frontend build/lint and backend build/typecheck pass
- [ ] PRD-aligned navigation and terminology are reflected in the app

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Migration applied successfully on local Postgres
- [ ] No frontend lint or build errors
- [ ] No backend typecheck or build errors
- [ ] Manual testing confirms Teams and Labels workflows
- [ ] Map regression check completed
- [ ] Acceptance criteria all met
- [ ] Code reviewed for consistency with repo patterns

---

## NOTES

- Current codebase status: there is no first-party automated test harness. Build and manual validation are the practical gates for this slice.
- Current naming style is camelCase in TypeScript and snake_case in SQL columns where needed. Keep that split.
- Current frontend is dark-themed globally. The new page should visually fit the app shell, but it does not need to mimic the map canvas.
- Recommended response shape decision: keep `/labels` as a separate list API and let `/teams` return at minimum `labelId`. Returning the joined `label` relation is acceptable if implemented consistently, but not required for the page because it already needs the label list.
- Confidence Score: 8/10 that implementation succeeds in one pass if the execution agent follows this plan and validates the delete/fk behavior early.
