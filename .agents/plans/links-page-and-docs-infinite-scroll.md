# Feature: Links Page + Docs Infinite Scroll

The following plan should be complete, but it's important that you validate codebase patterns and task sanity before implementing.

Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Two independent improvements shipped together:

1. **Workspace Links Page** — A new `/links` page where the team stores frequently-used URLs (Grafana, Lens, runbooks, dashboards, etc.) as clickable cards. Full CRUD: anyone can add, edit, and delete links. Each link has a title, URL, optional description, and optional category for grouping. Accessible from the top nav.

2. **Docs Infinite Scroll** — Replace the current all-at-once doc fetch on `/docs` with cursor-based pagination (limit + offset). The frontend appends pages as the user scrolls down, using an `IntersectionObserver` sentinel div. This prevents loading hundreds of docs into memory at once.

## User Story

As an engineer using Fire Attack Hub,
I want a Links page to bookmark frequently-used workspace URLs, and I want the docs list to load progressively as I scroll,
So that I can quickly access operational links without searching, and the docs page stays fast even as the knowledge base grows.

## Problem Statement

- No central place for workspace-level bookmarks (Grafana, Lens, Jenkins, etc.) — people paste links in Slack and they disappear.
- `GET /docs` returns all documents in a single response with no pagination; performance degrades as the doc count grows.

## Solution Statement

- Add a `workspace_links` table and full CRUD NestJS module (`LinksModule`). Frontend renders a `/links` page with add/edit/delete inline. Links open in a new browser tab.
- Add `limit` + `offset` query params to `GET /docs`. Frontend replaces full-reload with append-on-scroll using `IntersectionObserver`. End-of-feed detected when response length < limit.

## Feature Metadata

**Feature Type**: New Capability (Links) + Enhancement (Infinite Scroll)
**Estimated Complexity**: Medium
**Primary Systems Affected**: Backend (new LinksModule, DocsService pagination), Frontend (new LinksPage, DocsPage refactor)
**Dependencies**: No new npm packages needed. Uses existing TypeORM, class-validator, React, IntersectionObserver (browser-native).

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

**For Links (pattern source — mirror this module exactly):**
- `backend/src/labels/label.entity.ts` (full file, 30 lines) — Entity column decoration pattern; `@PrimaryGeneratedColumn('uuid')`, `@CreateDateColumn`, `@UpdateDateColumn`
- `backend/src/labels/labels.service.ts` (full file, 55 lines) — Service CRUD pattern; `findAll`, `findOne`, `create`, `update`, `remove` with `NotFoundException`
- `backend/src/labels/labels.controller.ts` (full file, 49 lines) — Controller pattern; `@Get`, `@Post`, `@Patch`, `@Delete`, `ParseUUIDPipe`, `HttpStatus.NO_CONTENT`
- `backend/src/labels/labels.module.ts` (full file, 13 lines) — Module pattern; `TypeOrmModule.forFeature([Entity])`, exports service
- `backend/src/labels/dto/create-label.dto.ts` (full file) — DTO pattern; `class-validator` decorators
- `backend/src/migrations/1714200000000-AddLabelsAndTeamLabelRelation.ts` (full file) — Migration pattern; `CREATE TABLE IF NOT EXISTS`, uuid PK with `gen_random_uuid()`, `timestamptz`
- `backend/src/app.module.ts` (full file) — Where to register `LinksModule`
- `frontend/src/types/label.ts` (full file) — Frontend type pattern; interface + payload interface
- `frontend/src/api/client.ts` (lines 1–62, 54–61) — Import pattern for new API objects; `teamsApi` pattern to mirror for `linksApi`
- `frontend/src/pages/TeamsPage.tsx` (lines 1–80) — Inline add/edit/delete UI pattern for the Links page

**For Infinite Scroll:**
- `backend/src/docs/dto/query-doc.dto.ts` (full file, 23 lines) — Add `limit` and `offset` fields here
- `backend/src/docs/docs.service.ts` (lines 58–101) — `findAll()` query builder; add `.take()` and `.skip()` here
- `frontend/src/pages/DocsPage.tsx` (full file, 167 lines) — Full rewrite of data-loading logic
- `frontend/src/api/client.ts` (lines 169–192) — `docsApi.list()` params — add `limit` and `offset`

### New Files to Create

**Backend (Links module):**
- `backend/src/links/workspace-link.entity.ts`
- `backend/src/links/links.module.ts`
- `backend/src/links/links.service.ts`
- `backend/src/links/links.controller.ts`
- `backend/src/links/dto/create-link.dto.ts`
- `backend/src/links/dto/update-link.dto.ts`
- `backend/src/migrations/1715000000000-AddWorkspaceLinks.ts`

**Frontend (Links page):**
- `frontend/src/types/link.ts`
- `frontend/src/pages/LinksPage.tsx`

### Patterns to Follow

**Entity column pattern** (mirror from `label.entity.ts`):
```typescript
@Entity('workspace_links')
export class WorkspaceLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  category: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
```

**Migration pattern** (mirror from `1714200000000-AddLabelsAndTeamLabelRelation.ts`):
```typescript
export class AddWorkspaceLinks1715000000000 implements MigrationInterface {
  name = 'AddWorkspaceLinks1715000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspace_links" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" text NOT NULL,
        "url" text NOT NULL,
        "description" text,
        "category" text,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_links" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_links"`);
  }
}
```

**DTO pattern** (mirror from `create-label.dto.ts`):
```typescript
import { IsNotEmpty, IsOptional, IsString, IsUrl, IsInt, Min } from 'class-validator';

export class CreateLinkDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsUrl({ require_protocol: true })
  url: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

**Pagination pattern for `findAll()` (add to query builder before `getMany()`):**
```typescript
const take = Math.min(query.limit ?? 20, 100); // cap at 100
const skip = query.offset ?? 0;
qb.take(take).skip(skip);
return qb.getMany();
```

**QueryDocDto pagination fields:**
```typescript
@IsOptional()
@Type(() => Number)
@IsInt()
@Min(1)
@Max(100)
limit?: number;

@IsOptional()
@Type(() => Number)
@IsInt()
@Min(0)
offset?: number;
```
Import `Type` from `class-transformer` and `IsInt`, `Min`, `Max` from `class-validator`. Check if `class-transformer` is already in `backend/package.json` (it is — NestJS ValidationPipe uses it).

**IntersectionObserver sentinel pattern (frontend):**
```tsx
const sentinelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const el = sentinelRef.current;
  if (!el) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && hasMore && !loading) {
        loadMore();
      }
    },
    { rootMargin: '200px' },
  );
  observer.observe(el);
  return () => observer.disconnect();
}, [hasMore, loading]);
```

**Frontend pill / active-state class pattern** (mirror from `DocsPage.tsx` existing file-type pills):
Active: `border-cyan-400 text-cyan-300`
Inactive: `border-slate-700 text-slate-400 hover:border-slate-500`
Pill: `rounded-full border px-3 py-1 text-xs transition-colors`

**Naming conventions:**
- Backend entity: `WorkspaceLink` (`workspace_links` table)
- Backend module/service/controller: `LinksModule`, `LinksService`, `LinksController`
- Backend route prefix: `@Controller('links')`
- Frontend type file: `frontend/src/types/link.ts` → `WorkspaceLink`, `CreateLinkPayload`
- Frontend API object: `linksApi` in `client.ts`
- Frontend page: `LinksPage.tsx`, route `/links`
- Nav label: `קישורים`

---

## IMPLEMENTATION PLAN

### Phase 1: Docs Infinite Scroll (backend)

Add `limit` and `offset` to the DTO and wire them into the query builder.

### Phase 2: Docs Infinite Scroll (frontend)

Rewrite the `DocsPage` data-loading logic to append pages and observe the scroll sentinel.

### Phase 3: Links — Backend

Migration + entity + module + service + controller + DTOs. Register in `AppModule`.

### Phase 4: Links — Frontend

Type file + API client entry + page component + route + nav entry.

---

## STEP-BY-STEP TASKS

### Task 1 — UPDATE `backend/src/docs/dto/query-doc.dto.ts`

- **ADD** `limit` and `offset` fields after the existing `teamId` field:
  ```typescript
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
  ```
- **IMPORTS**: Add to the import line from `class-validator`: `IsInt`, `Min`, `Max`. Add `import { Type } from 'class-transformer';` as a new import line.
- **GOTCHA**: Without `@Type(() => Number)`, query string params arrive as strings and `@IsInt()` rejects them. `class-transformer` is already a NestJS dependency — do NOT add it to `package.json`.
- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 2 — UPDATE `backend/src/docs/docs.service.ts`

- **ADD** pagination to `findAll()`. After the existing `teamId` block (line 98) and before `return qb.getMany()` (line 100), insert:
  ```typescript
  const take = Math.min(query.limit ?? 20, 100);
  const skip = query.offset ?? 0;
  qb.take(take).skip(skip);
  ```
- **GOTCHA**: Keep `return qb.getMany()` — do NOT change it to `getManyAndCount()`. The frontend detects end-of-feed by checking `response.length < limit`, which is simpler than returning total counts.
- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 3 — UPDATE `frontend/src/api/client.ts`

- **UPDATE** `docsApi.list()` params type (lines 170–176) to add `limit` and `offset`:
  ```typescript
  list: (params?: {
    q?: string;
    serviceId?: string;
    entityId?: string;
    fileType?: 'md' | 'pdf' | 'docx';
    teamId?: string;
    limit?: number;
    offset?: number;
  }) => http.get<Doc[]>('/docs', { params }).then(r => r.data),
  ```
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 4 — UPDATE `frontend/src/pages/DocsPage.tsx`

Full rewrite of the state and data-loading logic. The UI cards and filter panels stay the same — only the fetch mechanism changes.

**State changes:**
- Keep: `search`, `loading`, `error`, `teams`, `teamId`, `fileType`
- Remove: simple `docs: Doc[]` state
- Add:
  ```typescript
  const [docs, setDocs] = useState<Doc[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;
  ```

**Add `useRef` to React imports.**

**Replace the single `useEffect` that calls `docsApi.list()` with two effects:**

Effect 1 — reset on filter change:
```typescript
useEffect(() => {
  setDocs([]);
  setOffset(0);
  setHasMore(true);
}, [search, teamId, fileType]);
```

Effect 2 — load page when offset or filters change:
```typescript
useEffect(() => {
  setLoading(true);
  setError(null);
  const timeout = window.setTimeout(() => {
    docsApi
      .list({
        q: search.trim() || undefined,
        teamId: teamId || undefined,
        fileType: (fileType as 'md' | 'pdf' | 'docx') || undefined,
        limit: PAGE_SIZE,
        offset,
      })
      .then((page) => {
        setDocs((prev) => (offset === 0 ? page : [...prev, ...page]));
        setHasMore(page.length === PAGE_SIZE);
      })
      .catch((loadError) => {
        setError(getErrorMessage(loadError, 'טעינת המסמכים נכשלה'));
      })
      .finally(() => setLoading(false));
  }, 180);
  return () => window.clearTimeout(timeout);
}, [search, teamId, fileType, offset]);
```

**Add IntersectionObserver effect:**
```typescript
useEffect(() => {
  const el = sentinelRef.current;
  if (!el) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && hasMore && !loading) {
        setOffset((prev) => prev + PAGE_SIZE);
      }
    },
    { rootMargin: '200px' },
  );
  observer.observe(el);
  return () => observer.disconnect();
}, [hasMore, loading]);
```

**Add sentinel div** after the cards grid, inside the outer `div`:
```tsx
<div ref={sentinelRef} className="h-1" />
{!hasMore && docs.length > 0 && (
  <p className="text-center text-xs text-slate-600 py-4">סוף הרשימה</p>
)}
```

- **GOTCHA**: When filters change, reset runs first (offset → 0), then the load effect fires because `offset` is now 0 again. This is correct and intentional — the two-effect pattern avoids stale closures.
- **GOTCHA**: `offset === 0 ? page : [...prev, ...page]` ensures that after a filter change, the list replaces rather than appends.
- **GOTCHA**: Do NOT debounce the offset change effect by much — the 180ms debounce is only applied to avoid hammering on every keystroke in the search input; for offset increments it still applies but is harmless.
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

---

### Task 5 — CREATE `backend/src/migrations/1715000000000-AddWorkspaceLinks.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkspaceLinks1715000000000 implements MigrationInterface {
  name = 'AddWorkspaceLinks1715000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspace_links" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" text NOT NULL,
        "url" text NOT NULL,
        "description" text,
        "category" text,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_links" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_links"`);
  }
}
```

- **VALIDATE**: File must be importable — `cd backend && npx tsc --noEmit`

### Task 6 — CREATE `backend/src/links/workspace-link.entity.ts`

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('workspace_links')
export class WorkspaceLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  category: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
```

- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 7 — CREATE `backend/src/links/dto/create-link.dto.ts`

```typescript
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class CreateLinkDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsUrl({ require_protocol: true })
  url: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 8 — CREATE `backend/src/links/dto/update-link.dto.ts`

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreateLinkDto } from './create-link.dto';

export class UpdateLinkDto extends PartialType(CreateLinkDto) {}
```

- **GOTCHA**: `@nestjs/mapped-types` is already a dependency (used in other modules like `update-service.dto.ts`). Do NOT add it to package.json.
- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 9 — CREATE `backend/src/links/links.service.ts`

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceLink } from './workspace-link.entity';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';

@Injectable()
export class LinksService {
  constructor(
    @InjectRepository(WorkspaceLink)
    private readonly linksRepo: Repository<WorkspaceLink>,
  ) {}

  findAll(): Promise<WorkspaceLink[]> {
    return this.linksRepo.find({ order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<WorkspaceLink> {
    const link = await this.linksRepo.findOne({ where: { id } });
    if (!link) throw new NotFoundException(`Link ${id} not found`);
    return link;
  }

  async create(dto: CreateLinkDto): Promise<WorkspaceLink> {
    const link = this.linksRepo.create({
      ...dto,
      description: dto.description ?? null,
      category: dto.category ?? null,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.linksRepo.save(link);
  }

  async update(id: string, dto: UpdateLinkDto): Promise<WorkspaceLink> {
    const link = await this.findOne(id);
    Object.assign(link, dto);
    return this.linksRepo.save(link);
  }

  async remove(id: string): Promise<void> {
    const link = await this.findOne(id);
    await this.linksRepo.remove(link);
  }
}
```

- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 10 — CREATE `backend/src/links/links.controller.ts`

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { LinksService } from './links.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';

@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Get()
  findAll() {
    return this.linksService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.linksService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateLinkDto) {
    return this.linksService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLinkDto,
  ) {
    return this.linksService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.linksService.remove(id);
  }
}
```

- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 11 — CREATE `backend/src/links/links.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceLink } from './workspace-link.entity';
import { LinksService } from './links.service';
import { LinksController } from './links.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WorkspaceLink])],
  providers: [LinksService],
  controllers: [LinksController],
  exports: [LinksService],
})
export class LinksModule {}
```

- **VALIDATE**: `cd backend && npx tsc --noEmit`

### Task 12 — UPDATE `backend/src/app.module.ts`

- **ADD** import and registration:
  ```typescript
  import { LinksModule } from './links/links.module';
  ```
  Add `LinksModule` to the `imports` array after `DocsModule`.
- **VALIDATE**: `cd backend && npx tsc --noEmit`

---

### Task 13 — CREATE `frontend/src/types/link.ts`

```typescript
export interface WorkspaceLink {
  id: string;
  title: string;
  url: string;
  description: string | null;
  category: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLinkPayload {
  title: string;
  url: string;
  description?: string;
  category?: string;
  sortOrder?: number;
}
```

### Task 14 — UPDATE `frontend/src/api/client.ts`

- **ADD** import at top:
  ```typescript
  import type { WorkspaceLink, CreateLinkPayload } from '../types/link';
  ```
- **ADD** API object at the bottom of the file (after `aiApi`):
  ```typescript
  export const linksApi = {
    list: () => http.get<WorkspaceLink[]>('/links').then(r => r.data),
    create: (payload: CreateLinkPayload) =>
      http.post<WorkspaceLink>('/links', payload).then(r => r.data),
    update: (id: string, payload: Partial<CreateLinkPayload>) =>
      http.patch<WorkspaceLink>(`/links/${id}`, payload).then(r => r.data),
    delete: (id: string) => http.delete(`/links/${id}`),
  };
  ```
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 15 — CREATE `frontend/src/pages/LinksPage.tsx`

Full component. Groups links by category when present, flat list otherwise. Inline add/edit forms. Delete with confirmation.

```tsx
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { linksApi } from '../api/client';
import type { WorkspaceLink, CreateLinkPayload } from '../types/link';

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

const EMPTY_FORM: CreateLinkPayload = { title: '', url: '', description: '', category: '', sortOrder: 0 };

export default function LinksPage() {
  const [links, setLinks] = useState<WorkspaceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateLinkPayload>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function loadLinks() {
    setLoading(true);
    setError(null);
    try {
      setLinks(await linksApi.list());
    } catch (e) {
      setError(getErrorMessage(e, 'טעינת הקישורים נכשלה'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLinks(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: CreateLinkPayload = {
        title: form.title.trim(),
        url: form.url.trim(),
        description: form.description?.trim() || undefined,
        category: form.category?.trim() || undefined,
        sortOrder: form.sortOrder ?? 0,
      };
      if (editingId) {
        await linksApi.update(editingId, payload);
      } else {
        await linksApi.create(payload);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      await loadLinks();
    } catch (e) {
      setError(getErrorMessage(e, 'שמירת הקישור נכשלה'));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(link: WorkspaceLink) {
    setForm({
      title: link.title,
      url: link.url,
      description: link.description ?? '',
      category: link.category ?? '',
      sortOrder: link.sortOrder,
    });
    setEditingId(link.id);
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    try {
      await linksApi.delete(id);
      setConfirmDeleteId(null);
      await loadLinks();
    } catch (e) {
      setError(getErrorMessage(e, 'מחיקת הקישור נכשלה'));
    }
  }

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, WorkspaceLink[]>();
    for (const link of links) {
      const key = link.category ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(link);
    }
    return map;
  }, [links]);

  const categories = useMemo(() => {
    const keys = [...grouped.keys()];
    // Uncategorized (empty string) last
    return keys.sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });
  }, [grouped]);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">קישורים</h1>
            <p className="mt-2 text-sm text-slate-400">
              קישורים שכיחים לכלי העבודה של הצוות — Grafana, Lens, ו-runbooks.
            </p>
          </div>
          <button
            onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}
            className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            + קישור חדש
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {/* Add / Edit Form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-3"
          >
            <h2 className="text-sm font-semibold text-slate-300">
              {editingId ? 'עריכת קישור' : 'קישור חדש'}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                placeholder="כותרת *"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              />
              <input
                required
                type="url"
                placeholder="כתובת URL *"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-400 ltr"
                dir="ltr"
              />
              <input
                placeholder="תיאור (אופציונלי)"
                value={form.description ?? ''}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              />
              <input
                placeholder="קטגוריה (אופציונלי, למשל: Monitoring)"
                value={form.category ?? ''}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? 'שומר...' : 'שמור'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
              >
                ביטול
              </button>
            </div>
          </form>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 px-5 py-10 text-center text-slate-400">
            טוען קישורים...
          </div>
        )}

        {/* Empty state */}
        {!loading && links.length === 0 && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 px-5 py-10 text-center text-slate-400">
            עדיין אין קישורים. הוסף את הראשון!
          </div>
        )}

        {/* Link groups */}
        {!loading && categories.map(cat => (
          <div key={cat || '__uncategorized__'} className="space-y-3">
            {cat && (
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {cat}
              </h2>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.get(cat)!.map(link => (
                <div
                  key={link.id}
                  className="group relative rounded-3xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-slate-700 hover:bg-slate-900"
                >
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <h3 className="text-base font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors">
                      {link.title}
                    </h3>
                    {link.description && (
                      <p className="mt-1 text-sm text-slate-400 line-clamp-2">{link.description}</p>
                    )}
                    <p className="mt-2 text-xs text-slate-600 truncate" dir="ltr">{link.url}</p>
                  </a>
                  {/* Actions */}
                  <div className="absolute top-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(link)}
                      className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-900"
                    >
                      עריכה
                    </button>
                    {confirmDeleteId === link.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(link.id)}
                          className="rounded-lg border border-red-500/50 px-2 py-1 text-xs text-red-400 hover:text-red-200 bg-slate-900"
                        >
                          אשר מחיקה
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 bg-slate-900"
                        >
                          ביטול
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(link.id)}
                        className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-red-400 bg-slate-900"
                      >
                        מחיקה
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- **GOTCHA**: The URL input field has `dir="ltr"` because URLs are always LTR in a Hebrew RTL app. The rest of the form is RTL by default (inherited from `<html dir="rtl">` or Tailwind RTL class).
- **GOTCHA**: Action buttons use `opacity-0 group-hover:opacity-100` so they only appear on hover — keeps cards clean.
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 16 — UPDATE `frontend/src/App.tsx`

- **ADD** import:
  ```typescript
  import LinksPage from './pages/LinksPage';
  ```
- **ADD** route inside `<Routes>`, after the `/playgrounds/:id` route:
  ```tsx
  <Route path="/links" element={<LinksPage />} />
  ```
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

### Task 17 — UPDATE `frontend/src/components/layout/TopNav.tsx`

- **ADD** links nav item to `NAV_ITEMS` array, after `פלייגראונדים`:
  ```typescript
  { to: '/links', label: 'קישורים' },
  ```
- **VALIDATE**: `cd frontend && npx tsc --noEmit`

---

## TESTING STRATEGY

### No automated tests exist in this project

No `*.spec.ts` or `*.test.ts` files. Validation is TypeScript + manual.

### Edge Cases

**Infinite scroll:**
- Filter change mid-scroll → offset resets to 0, list replaces (not appends) ✓
- Fewer than `PAGE_SIZE` docs in DB → `hasMore` becomes false after first page, sentinel ignored
- Exactly `PAGE_SIZE` docs → `hasMore` stays true but second fetch returns 0 items → `setHasMore(false)`; sentinel fires one extra fetch, harmless
- Rapid filter changes → each change cancels previous timeout (clearTimeout in cleanup)
- All filters cleared → resets and reloads from offset 0

**Links page:**
- URL without protocol → `@IsUrl({ require_protocol: true })` rejects with 400 — frontend should show the error from `getErrorMessage()`
- Empty category → stored as null in DB, displayed in "uncategorized" group (empty key `''`)
- Two links in same category → grouped together
- All links uncategorized → single group with no header label
- Delete confirmation → two-step: first click shows confirm, second confirms

---

## VALIDATION COMMANDS

### Level 1: TypeScript
```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npx tsc --noEmit
```
```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/frontend && npx tsc --noEmit
```

### Level 2: Backend Start
```bash
cd /Users/rwmmtzqy/Documents/apex/fire-attack-hub/backend && npm run start:dev
```
Watch for `UnknownDependenciesException` or migration errors. The migration `1715000000000-AddWorkspaceLinks` must run and log `query: CREATE TABLE IF NOT EXISTS "workspace_links"`.

### Level 3: Manual API Validation
```bash
# List links (empty)
curl http://localhost:3001/links

# Create a link
curl -X POST http://localhost:3001/links \
  -H "Content-Type: application/json" \
  -d '{"title":"Grafana","url":"https://grafana.example.com","category":"Monitoring"}'

# List with pagination
curl "http://localhost:3001/docs?limit=5&offset=0"
curl "http://localhost:3001/docs?limit=5&offset=5"

# Pagination + filter combo
curl "http://localhost:3001/docs?limit=5&offset=0&fileType=pdf"
```

### Level 4: Frontend Manual
1. Open `http://localhost:5173/links`
2. Confirm nav has "קישורים" item and it's active
3. Click "+ קישור חדש", fill form with a URL like `https://grafana.com`, submit
4. Link card appears; click it — opens in new tab
5. Hover a card — edit/delete buttons appear
6. Edit: click "עריכה", change title, save — card updates
7. Delete: click "מחיקה", then "אשר מחיקה" — card removed
8. Add multiple links with different categories — verify grouping with category headers

9. Open `http://localhost:5173/docs`
10. Confirm first 20 docs load
11. Scroll to bottom — more docs load and append
12. Change a filter (e.g. file type) — list resets to first page
13. When no more pages, "סוף הרשימה" text appears

---

## ACCEPTANCE CRITERIA

- [ ] `GET /links` returns all workspace links ordered by sortOrder, then createdAt
- [ ] `POST /links` creates a link; missing protocol in URL returns 400
- [ ] `PATCH /links/:id` updates a link
- [ ] `DELETE /links/:id` removes a link and returns 204
- [ ] `GET /docs?limit=20&offset=0` returns first 20 docs
- [ ] `GET /docs?limit=20&offset=20` returns next 20 docs
- [ ] Changing any filter on DocsPage resets to first page (no stale appended results)
- [ ] IntersectionObserver triggers next page load when sentinel enters viewport
- [ ] "סוף הרשימה" text shown when last page is reached
- [ ] LinksPage renders grouped by category, alphabetically, uncategorized last
- [ ] Link cards open in new tab with `target="_blank" rel="noopener noreferrer"`
- [ ] Add/edit form clears and closes on successful save
- [ ] Delete requires two-click confirmation
- [ ] "קישורים" nav item added after "פלייגראונדים"
- [ ] `cd backend && npx tsc --noEmit` passes with zero errors
- [ ] `cd frontend && npx tsc --noEmit` passes with zero errors

---

## COMPLETION CHECKLIST

- [ ] Task 1: `query-doc.dto.ts` — `limit` + `offset` added with `@Type(() => Number)`
- [ ] Task 2: `docs.service.ts` — `.take()` / `.skip()` applied
- [ ] Task 3: `client.ts` — `docsApi.list()` params extended
- [ ] Task 4: `DocsPage.tsx` — two-effect pagination + IntersectionObserver + sentinel div
- [ ] Task 5: Migration `1715000000000-AddWorkspaceLinks.ts` created
- [ ] Task 6: `workspace-link.entity.ts` created
- [ ] Task 7: `dto/create-link.dto.ts` created
- [ ] Task 8: `dto/update-link.dto.ts` created
- [ ] Task 9: `links.service.ts` created
- [ ] Task 10: `links.controller.ts` created
- [ ] Task 11: `links.module.ts` created
- [ ] Task 12: `app.module.ts` — `LinksModule` registered
- [ ] Task 13: `frontend/src/types/link.ts` created
- [ ] Task 14: `client.ts` — `linksApi` added
- [ ] Task 15: `LinksPage.tsx` created
- [ ] Task 16: `App.tsx` — `/links` route added
- [ ] Task 17: `TopNav.tsx` — `קישורים` nav item added
- [ ] Backend TypeScript clean
- [ ] Frontend TypeScript clean
- [ ] Backend starts, migration runs
- [ ] All acceptance criteria verified

---

## NOTES

### Why two effects for infinite scroll instead of one
A single effect that depends on `[search, teamId, fileType, offset]` has a problem: when filters change, we need to reset `offset` to 0 first, then re-fetch. If we reset offset inside the same effect that fetches, we get stale state reads. The two-effect pattern is the React-idiomatic solution: one effect resets `offset` when filters change; the other effect fires whenever `offset` changes (which includes the reset).

### Why not return `{ items, total }` for pagination
Counting is an extra query. Since all we need is "is there a next page?" we can detect it cheaply by comparing `response.length < limit`. If the backend returns exactly `limit` items, we assume there's more and fetch the next page; if that returns 0 items, `hasMore` becomes false. One wasted fetch at most.

### Why `rootMargin: '200px'` on the IntersectionObserver
This loads the next page before the user actually hits the bottom, making the scroll feel seamless. 200px is a comfortable lookahead for this type of list.

### Category display in LinksPage
Categories are user-freeform strings. The frontend sorts them alphabetically with uncategorized (null/empty) always last. No predefined category list — users type whatever they want.
