# Feature: File-Backed Docs with S3 Storage, Preview, and Extracted Search

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to existing NestJS CRUD patterns, grouped axios APIs, and current React page/component composition. Do not invent a second data-access pattern, a second storage abstraction, or a second panel UI language when the repo already has clear conventions.

## Feature Description

Implement a real Docs domain for the Internal Service Catalog. Documents are first-class records backed by object storage from day one. Users can upload `.md`, `.pdf`, and `.docx` files, attach them to services, service connections, and entities, preview them inline, download the original file, and search across extracted text.

The backend owns storage, preview, extraction, and metadata. The frontend provides a docs browser, upload/edit flows, a detail page with type-specific preview, and integrations into the existing service / edge / entity surfaces so attached docs are discoverable from the map and entities graph.

## User Story

As an engineer
I want to upload, preview, search, and attach technical documents to services, edges, and entities
So that I can discover and read the right knowledge artifact without leaving the catalog

## Problem Statement

The repo currently has no working Docs feature. [`frontend/src/pages/DocsPage.tsx`](../../frontend/src/pages/DocsPage.tsx) is a placeholder, there is no backend `docs` module, and there is no storage integration even though [`docker-compose.yml`](../../docker-compose.yml) already provisions MinIO. The original PRD described Markdown-only authored docs, but the product direction is now broader: docs must support uploaded `.md`, `.pdf`, and `.docx` files from day one, with inline preview and full-text search across extracted content.

If implementation starts without a precise plan, the likely failure modes are:

- storing raw files incorrectly in Postgres instead of object storage,
- exposing bucket URLs directly to the frontend and coupling UI to storage details,
- adding attachments with an overly-generic polymorphic shape that is harder to query and validate,
- choosing extraction / preview libraries that drift from repo constraints or break MinIO compatibility,
- shipping a docs browser that is disconnected from existing map/entity workflows.

## Solution Statement

Implement a file-backed Docs domain with these decisions locked up front:

- Store original files in S3-compatible object storage using stable keys under `docs/{docId}/`.
- Store metadata, attachment relations, extracted text, and `tsvector` search indexes in Postgres.
- Use explicit join tables:
  - `doc_services`
  - `doc_connections`
  - `doc_entities`
- Use backend proxy endpoints for preview and download instead of exposing raw bucket URLs to the browser.
- For `.md`, render content as Markdown in the UI.
- For `.pdf`, preview the original PDF inline and extract text server-side for search.
- For `.docx`, extract raw text and HTML server-side using Mammoth; use the HTML preview payload in the detail page.
- Limit v1 to text-based PDFs. OCR for scanned PDFs stays out of scope, matching the PRD.

## Feature Metadata

**Feature Type**: New Capability  
**Estimated Complexity**: High  
**Primary Systems Affected**: backend docs/storage/config/modules, Postgres schema/migrations, frontend docs routes/pages/components, frontend API client/types, map/entity/service/edge integrations  
**Dependencies**: `@nestjs/platform-express`, `@aws-sdk/client-s3`, `mammoth`, `pdf-parse`, `react-markdown` or equivalent frontend Markdown renderer, Postgres `tsvector`, MinIO/S3-compatible object storage

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `PRD.md` (lines 87-94) - Locked scope for docs: `.md` / `.pdf` / `.docx`, inline preview, extracted full-text search.
- `PRD.md` (lines 264-317) - Detailed docs feature behavior: upload/edit flows, preview rules, storage and attachment expectations.
- `PRD.md` (lines 482-541) - Target docs schema, explicit join tables, and storage/indexing model.
- `PRD.md` (lines 621-650) - Target docs API and S3 layout.
- `CLAUDE.md` (lines 1-4) - Repo rule: never commit unless explicitly asked.

- `backend/src/main.ts` (lines 6-25) - Global `ValidationPipe` and CORS config; all DTO fields must be decorated and multipart endpoints must still coexist with current CORS methods.
- `backend/src/app.module.ts` (lines 17-39) - Root module registration pattern; new docs and storage modules must be imported here.
- `backend/package.json` (lines 6-15, 21-44) - Existing backend scripts and dependency baseline; there is no S3 or document-processing dependency yet.
- `backend/src/config/env.validation.ts` (entire file) - Pattern for mandatory environment variables; docs storage env vars must be added here.
- `backend/src/config/typeorm.config.ts` (entire file) - Explicit entity registration pattern; all new docs-related entities must be added here.
- `backend/src/services/service.entity.ts` (lines 13-56) - Canonical TypeORM entity style: explicit FK columns, timestamps, `search_vector`, comments.
- `backend/src/services/services.controller.ts` (lines 19-50) - Thin controller pattern: query DTOs, `ParseUUIDPipe`, `@HttpCode(NO_CONTENT)`.
- `backend/src/services/services.service.ts` (lines 16-72) - CRUD service pattern with `QueryBuilder`, relation loading, `NotFoundException`.
- `backend/src/entities/entities.controller.ts` (lines 20-56) - Another thin controller example for a domain with detail + list + nested graph endpoint.
- `backend/src/entities/entities.service.ts` (lines 27-170) - Search/query builder style and detail-loading with relations.
- `backend/src/playgrounds/playgrounds.controller.ts` (lines 19-55) - Example of a feature-specific non-CRUD helper endpoint alongside CRUD (`check-url`).
- `backend/src/playgrounds/playgrounds.service.ts` (lines 16-97) - Query builder list filters, detail relation loading, lightweight helper method pattern.
- `backend/src/migrations/1714300000000-AlignEntitiesWithPrd.ts` (lines 6-150) - Handwritten migration style: raw SQL, trigger creation, `catch(() => undefined)` on FK DDL.
- `backend/src/migrations/1714400000000-AddPlaygrounds.ts` (entire file) - Recent additive migration style and naming convention.
- `backend/.env.example` (lines 1-7) - Existing env vars; storage-related vars must be added here.
- `docker-compose.yml` (lines 19-47) - Local MinIO service and bucket bootstrap already exist; implementation should align with this local setup.

- `frontend/src/App.tsx` (lines 10-24) - Current route registration; docs detail/new/edit routes must be added here.
- `frontend/src/components/layout/TopNav.tsx` (lines 3-31) - Navigation source of truth; docs label is still placeholder English and will need alignment.
- `frontend/src/api/client.ts` (lines 27-145) - Grouped axios client pattern; docs APIs should be added here, not as a separate fetch utility.
- `frontend/package.json` (lines 6-34) - Frontend scripts/dependencies; there is no Markdown preview dependency yet.
- `frontend/src/pages/DocsPage.tsx` (lines 1-6) - Current placeholder route to replace.
- `frontend/src/pages/PlaygroundsPage.tsx` (entire file) - Canonical CRUD list page pattern: `loadData()`, inline form, `axios` error normalization, Hebrew copy.
- `frontend/src/pages/PlaygroundViewPage.tsx` (lines 67-76, 272-307) - Existing preview/fallback page pattern; useful reference for docs preview and “open in new tab / download original” affordances.
- `frontend/src/components/map/ServicePanel.tsx` - Existing service side panel; docs links need to surface here.
- `frontend/src/components/map/EdgePanel.tsx` - Existing edge panel; this is the natural place for connection-attached docs.
- `frontend/src/components/entities/EntityPanel.tsx` - Existing entity side panel; entity-attached docs should surface here.

### New Files to Create

**Backend**

- `backend/src/docs/doc.entity.ts` - Core docs metadata entity
- `backend/src/docs/doc-service.entity.ts` - Join entity for service attachments
- `backend/src/docs/doc-connection.entity.ts` - Join entity for connection attachments
- `backend/src/docs/doc-entity.entity.ts` - Join entity for entity attachments
- `backend/src/docs/dto/create-doc.dto.ts`
- `backend/src/docs/dto/update-doc.dto.ts`
- `backend/src/docs/dto/query-doc.dto.ts`
- `backend/src/docs/dto/replace-doc-file.dto.ts` or multipart interceptor-specific DTOs
- `backend/src/docs/docs.service.ts`
- `backend/src/docs/docs.controller.ts`
- `backend/src/docs/docs.module.ts`
- `backend/src/storage/storage.service.ts` - S3/MinIO abstraction
- `backend/src/storage/storage.module.ts`
- `backend/src/document-processing/document-processing.service.ts` - Markdown/PDF/DOCX extraction and preview preparation
- `backend/src/document-processing/document-processing.module.ts`
- `backend/src/migrations/<timestamp>-AddDocs.ts`

**Frontend**

- `frontend/src/types/doc.ts`
- `frontend/src/components/docs/DocUploadForm.tsx`
- `frontend/src/components/docs/DocViewer.tsx`
- `frontend/src/components/docs/DocPreview.tsx`
- `frontend/src/pages/DocDetailPage.tsx`
- `frontend/src/pages/DocEditPage.tsx`
- `frontend/src/pages/DocNewPage.tsx`

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [NestJS File Upload](https://docs.nestjs.com/techniques/file-upload)
  - Specific section: `FileInterceptor`, multipart handling, Multer integration
  - Why: `POST /docs` and `POST /docs/:id/file` need multipart upload endpoints inside the existing Nest controller structure.

- [NestJS Streaming Files](https://docs.nestjs.com/techniques/streaming-files)
  - Specific section: `StreamableFile` responses
  - Why: `GET /docs/:id/download` and PDF preview responses should stream file bodies from object storage without buffering large files in memory unnecessarily.

- [AWS SDK for JavaScript v3 S3 Code Examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
  - Specific section: `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`
  - Why: The backend storage service should use stable, first-party S3 client patterns that also work against MinIO-compatible endpoints.

- [AWS SDK for JavaScript v3: Amazon S3 considerations](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html)
  - Specific section: presigned URLs and streaming/buffered responses
  - Why: Confirms SDK v3 stream semantics and the tradeoff between presigned URLs and backend-proxied downloads/previews.

- [Mammoth.js](https://github.com/mwilliamson/mammoth.js)
  - Specific section: `convertToHtml` and `extractRawText`
  - Why: This is the most direct fit for DOCX HTML preview plus search-text extraction in Node.

- [pdf-parse](https://github.com/willmcpo/pdf-parse)
  - Specific section: Node usage returning extracted text
  - Why: Lightweight PDF text extraction for indexing text-based PDFs in the backend.

- [react-markdown](https://github.com/remarkjs/react-markdown)
  - Specific section: safe Markdown rendering in React
  - Why: `.md` previews should render in the frontend without unsafe HTML injection.

### Patterns to Follow

**Thin NestJS controllers**

Mirror the current controller style:

```ts
@Controller('services')
export class ServicesController {
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicesService.findOne(id);
  }
}
```

Source: `backend/src/services/services.controller.ts:19-50`

Docs controllers should stay thin. Put branching logic in services, not decorators or controllers.

**QueryBuilder-based list/search services**

Mirror the service list pattern:

```ts
const qb = this.playgroundsRepo
  .createQueryBuilder('p')
  .leftJoinAndSelect('p.team', 'team')
  .orderBy('p.name', 'ASC');
```

Source: `backend/src/playgrounds/playgrounds.service.ts:16-37`

Use `QueryBuilder` for docs filtering so team, attachment target, and full-text search can compose without building ad hoc repository calls.

**Explicit TypeORM columns and joins**

Mirror current entity style:

```ts
@Column({ name: 'team_id', type: 'uuid' })
teamId: string;

@ManyToOne(() => Team, (team) => team.services, { onDelete: 'RESTRICT' })
@JoinColumn({ name: 'team_id' })
team: Team;
```

Source: `backend/src/services/service.entity.ts:20-56`

Follow this in all docs entities and join entities. Do not hide FK columns behind relation-only fields.

**Additive SQL migrations**

Mirror recent migrations:

```ts
await queryRunner.query(`
  ALTER TABLE "playgrounds"
    ADD CONSTRAINT "FK_playgrounds_service"
    FOREIGN KEY ("service_id") REFERENCES "services"("id")
    ON DELETE SET NULL
`).catch(() => undefined);
```

Source: `backend/src/migrations/1714400000000-AddPlaygrounds.ts`

Keep migrations handwritten, explicit, and resilient to reruns.

**Grouped axios APIs**

Mirror `frontend/src/api/client.ts`:

```ts
export const playgroundsApi = {
  list: (params?: { q?: string; teamId?: string; serviceId?: string }) =>
    http.get<Playground[]>('/playgrounds', { params }).then(r => r.data),
};
```

Add `docsApi` here. Do not create a second HTTP client or ad hoc `fetch` calls.

**Page-level data loading and error normalization**

Mirror `PlaygroundsPage` and `PlaygroundViewPage`:

- `loadData()` functions with `setLoading(true)` / `setError(null)`
- `axios.isAxiosError` helper for message extraction
- local state, not React Query
- Hebrew UI copy

**Preview/fallback interaction pattern**

Mirror the embeddability check / conditional render shape from `PlaygroundViewPage:282-307`.

For docs:

- loading state while preview payload loads,
- preview renderer by file type,
- clear fallback when preview cannot be generated,
- always keep download action visible.

### Anti-Patterns to Avoid

- Do not store binary file contents in Postgres.
- Do not expose raw bucket paths in frontend code or state.
- Do not build polymorphic `doc_attachments(target_type, target_id)` tables when the PRD now specifies explicit join tables.
- Do not add OCR in this slice.
- Do not add React Query, Zustand, or another state layer for docs.
- Do not add a rich editor for PDF/DOCX; replacements should be upload-based.
- Do not silently index empty PDF extraction results as success; surface the limitation for scanned PDFs.

---

## IMPLEMENTATION PLAN

### Phase 1: Storage and Schema Foundation

Create the database schema, environment model, and backend storage abstraction so docs can exist as durable file-backed records.

**Tasks:**

- Add docs tables and attachment join tables via migration
- Add docs-related TypeORM entities
- Add storage env vars and MinIO/S3 config
- Add backend storage module/service for upload, download, delete

### Phase 2: Document Processing and Backend Docs API

Implement extraction, preview payload generation, and the full docs API surface.

**Tasks:**

- Add document-processing service for Markdown/PDF/DOCX
- Create multipart upload and file replacement endpoints
- Add docs list/detail/download/preview/delete endpoints
- Add attachment-aware list filtering and search
- Add search-vector update strategy

### Phase 3: Frontend Docs Experience

Replace the placeholder route with docs browser, upload, detail, and edit flows using the repo’s current UI patterns.

**Tasks:**

- Add docs types and grouped axios API
- Add docs pages and shared components
- Add type-specific preview renderer
- Add upload/edit forms and list filters

### Phase 4: Integration into Existing Surfaces

Surface attached docs where users already inspect services, edges, and entities.

**Tasks:**

- Add docs sections into service, edge, and entity details
- Add navigation from these panels into docs detail or filtered docs list
- Ensure attachment data loads through existing detail endpoints or dedicated attachment endpoints

### Phase 5: Validation and Hardening

Verify storage, indexing, preview, and attachment behavior end to end in local MinIO/Postgres.

**Tasks:**

- Run migrations and build checks
- Validate multipart upload and streaming endpoints
- Manually verify all three file types
- Verify scanned-PDF limitation handling

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### CREATE `backend/src/migrations/<timestamp>-AddDocs.ts`

- **IMPLEMENT**: Create `docs`, `doc_services`, `doc_connections`, and `doc_entities` tables. Include `file_name`, `file_extension`, `mime_type`, `file_size_bytes`, `s3_key`, optional `preview_s3_key`, optional `extracted_text`, `team_id`, `search_vector`, timestamps, and uniqueness constraints on each join table.
- **PATTERN**: Mirror `backend/src/migrations/1714300000000-AlignEntitiesWithPrd.ts:6-150` and `backend/src/migrations/1714400000000-AddPlaygrounds.ts`.
- **IMPORTS**: `MigrationInterface`, `QueryRunner` from `typeorm`.
- **GOTCHA**: Add a Postgres trigger/function to derive `search_vector` from `title`, `summary`, and `extracted_text`. This repo already uses DB-side trigger updates for `services` and `entities`; follow that pattern rather than manually recalculating in every service save path.
- **VALIDATE**: `cd backend && npm run build`

### CREATE backend docs entities

- **TARGETS**:
  - `backend/src/docs/doc.entity.ts`
  - `backend/src/docs/doc-service.entity.ts`
  - `backend/src/docs/doc-connection.entity.ts`
  - `backend/src/docs/doc-entity.entity.ts`
- **IMPLEMENT**: Explicit FK columns plus `@ManyToOne`/`@JoinColumn` relations to `Team`, `Service`, `ServiceConnection`, and `Entity`.
- **PATTERN**: Mirror `backend/src/services/service.entity.ts:13-56`.
- **GOTCHA**: Keep relation names predictable because frontend detail pages will need stable serialized shapes. Avoid `eager: true`; load relations in service queries.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE `backend/src/config/typeorm.config.ts`

- **IMPLEMENT**: Register all docs-related entities in the explicit `entities: []` list.
- **PATTERN**: Mirror the current explicit registration style in `backend/src/config/typeorm.config.ts`.
- **GOTCHA**: Missing entity registration will fail both runtime boot and migrations that depend on compiled entity metadata.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE backend env validation and example env files

- **TARGETS**:
  - `backend/src/config/env.validation.ts`
  - `backend/.env.example`
- **IMPLEMENT**: Add required vars such as `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_FORCE_PATH_STYLE`.
- **PATTERN**: Mirror `backend/src/config/env.validation.ts` numeric/string validation style.
- **GOTCHA**: MinIO local dev usually requires path-style addressing; make that explicit rather than implicit.
- **VALIDATE**: `cd backend && npm run build`

### CREATE `backend/src/storage/storage.service.ts` and `backend/src/storage/storage.module.ts`

- **IMPLEMENT**: Wrap S3 operations:
  - `putObject`
  - `getObjectStream`
  - `deleteObject`
  - `headObject`
  - stable key generation under `docs/{docId}/`
- **DOCS**: Use AWS SDK v3 S3 examples and stream semantics from the AWS docs linked above.
- **DESIGN**: Prefer backend-proxied preview/download endpoints over presigned URLs in this slice. It keeps the frontend storage-agnostic and leaves room for auth later.
- **GOTCHA**: Ensure `GetObject` streams are consumed correctly; SDK v3 returns streams, not already-buffered bodies.
- **VALIDATE**: `cd backend && npm run build`

### CREATE `backend/src/document-processing/document-processing.service.ts` and module

- **IMPLEMENT**:
  - `.md`: decode UTF-8, keep raw text, no binary conversion
  - `.pdf`: extract text via `pdf-parse`
  - `.docx`: use Mammoth `extractRawText` for indexing and `convertToHtml` for preview
- **OUTPUT CONTRACT**:
  - `extractedText: string | null`
  - `previewHtml: string | null`
  - `previewContentType: 'text/markdown' | 'text/html' | 'application/pdf'`
- **GOTCHA**: For PDF, preview should usually stream the original PDF, not convert it. Extraction is for search, not preview rendering.
- **GOTCHA**: If PDF extraction returns effectively empty text, treat the file as non-searchable and surface that as a known limitation instead of pretending indexing succeeded.
- **VALIDATE**: `cd backend && npm run build`

### CREATE backend docs DTOs

- **TARGETS**:
  - `backend/src/docs/dto/create-doc.dto.ts`
  - `backend/src/docs/dto/update-doc.dto.ts`
  - `backend/src/docs/dto/query-doc.dto.ts`
- **IMPLEMENT**:
  - `title`, optional `summary`, optional `teamId`
  - attachment arrays: `serviceIds`, `connectionIds`, `entityIds`
  - `fileType` filter in query DTO
- **PATTERN**: Mirror `backend/src/playgrounds/dto/create-playground.dto.ts:4-22` and current `Query*Dto` shapes.
- **GOTCHA**: For multipart requests, string arrays may arrive as repeated fields or JSON strings; decide and document one accepted format to avoid frontend/backend mismatch.
- **VALIDATE**: `cd backend && npm run build`

### CREATE `backend/src/docs/docs.service.ts`

- **IMPLEMENT**:
  - `findAll(query)`
  - `findOne(id)`
  - `create(metadata, file)`
  - `update(id, dto)`
  - `replaceFile(id, file)`
  - `remove(id)`
  - `download(id)`
  - `getPreview(id)`
- **PATTERN**: Mirror service CRUD from `backend/src/services/services.service.ts:16-72`, but wrap write operations in transactions because file metadata + join tables must update atomically.
- **SEARCH**: Use `QueryBuilder` for:
  - `q`
  - `team`
  - `service`
  - `entity`
  - `connection`
  - `fileType`
- **GOTCHA**: Delete must remove storage objects after or alongside DB cleanup without leaving orphaned rows or orphaned bucket objects.
- **GOTCHA**: `findOne` should load attachments in a frontend-friendly shape so the UI does not need a second hydration round-trip for related names.
- **VALIDATE**: `cd backend && npm run build`

### CREATE `backend/src/docs/docs.controller.ts` and `backend/src/docs/docs.module.ts`

- **IMPLEMENT**:
  - `GET /docs`
  - `POST /docs` with `FileInterceptor`
  - `GET /docs/:id`
  - `GET /docs/:id/download`
  - `GET /docs/:id/preview`
  - `PATCH /docs/:id`
  - `POST /docs/:id/file`
  - `DELETE /docs/:id`
- **PATTERN**: Mirror thin controllers in `backend/src/services/services.controller.ts:19-50`.
- **GOTCHA**: File upload endpoints must validate both metadata and uploaded file type/size. Reject unsupported extensions and MIME mismatches early.
- **GOTCHA**: `GET /docs/:id/download` should stream with correct `Content-Type` and `Content-Disposition`.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE `backend/src/app.module.ts`

- **IMPLEMENT**: Import new `DocsModule`, `StorageModule`, and `DocumentProcessingModule` if not nested under `DocsModule`.
- **PATTERN**: Mirror the feature-module imports already present in `backend/src/app.module.ts:17-39`.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE existing backend detail services for attachment visibility

- **TARGETS**:
  - `backend/src/services/services.service.ts`
  - `backend/src/entities/entities.service.ts`
  - `backend/src/connections/*` if a connection detail endpoint must be introduced
- **IMPLEMENT**:
  - Include attached docs in service detail responses
  - Include attached docs in entity detail responses
  - Add a connection detail/read path if the current edge panel cannot otherwise show attached docs
- **RATIONALE**: The PRD says docs must be accessible from nodes and edges, not only from `/docs`.
- **GOTCHA**: The current backend has no `GET /connections/:id`; if EdgePanel needs real docs data, add it rather than overloading `/map`.
- **VALIDATE**: `cd backend && npm run build`

### CREATE `frontend/src/types/doc.ts`

- **IMPLEMENT**:
  - list item shape
  - detail shape with attachment refs
  - create/update payload shapes
  - preview response shape
- **PATTERN**: Mirror `frontend/src/types/playground.ts:1-39` and current shared relation typing style.
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE `frontend/src/api/client.ts`

- **IMPLEMENT**: Add grouped `docsApi` methods:
  - `list`
  - `get`
  - `create`
  - `update`
  - `replaceFile`
  - `delete`
  - `getPreview`
  - helper for `downloadUrl(id)` or direct browser navigation
- **PATTERN**: Mirror the grouped resource style already used for services, entities, and playgrounds.
- **GOTCHA**: Multipart upload requests must not reuse the global JSON content-type header blindly. Build those requests with `FormData` and let the browser set the boundary.
- **VALIDATE**: `cd frontend && npm run build`

### CREATE frontend docs routes and pages

- **TARGETS**:
  - `frontend/src/pages/DocsPage.tsx`
  - `frontend/src/pages/DocDetailPage.tsx`
  - `frontend/src/pages/DocEditPage.tsx`
  - `frontend/src/pages/DocNewPage.tsx`
  - `frontend/src/App.tsx`
- **IMPLEMENT**:
  - docs list/browser
  - doc detail page
  - upload page
  - metadata/edit page
  - route registration for `/docs/:id`, `/docs/new`, `/docs/:id/edit`
- **PATTERN**: Use the current route/page structure from `frontend/src/App.tsx:10-24` and CRUD data-loading style from `PlaygroundsPage`.
- **GOTCHA**: Keep the list page read-first. Upload and edit can be separate routes instead of collapsing too much state into one monolithic page.
- **VALIDATE**: `cd frontend && npm run build`

### CREATE shared docs components

- **TARGETS**:
  - `frontend/src/components/docs/DocUploadForm.tsx`
  - `frontend/src/components/docs/DocViewer.tsx`
  - `frontend/src/components/docs/DocPreview.tsx`
- **IMPLEMENT**:
  - file picker + metadata form + attachment selectors
  - detail metadata header
  - preview switch by file type:
    - Markdown via `react-markdown`
    - PDF via `<iframe>` or `<object>` hitting backend preview/download endpoint
    - DOCX via sanitized HTML preview payload
- **PATTERN**: Mirror current dark-mode panel/page style from `PlaygroundsPage` and `PlaygroundViewPage`.
- **GOTCHA**: Do not use `dangerouslySetInnerHTML` for Markdown; only for trusted DOCX preview HTML if you control server conversion and sanitize or otherwise constrain it.
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE `frontend/src/components/layout/TopNav.tsx`

- **IMPLEMENT**: Replace placeholder English labels with Hebrew labels for docs/playgrounds if that still exists during implementation.
- **PATTERN**: Keep the existing static `NAV_ITEMS` structure.
- **GOTCHA**: Do not expand scope into broader i18n refactors.
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE service, edge, and entity UI surfaces to surface docs

- **TARGETS**:
  - `frontend/src/components/map/ServicePanel.tsx`
  - `frontend/src/components/map/EdgePanel.tsx`
  - `frontend/src/components/entities/EntityPanel.tsx`
- **IMPLEMENT**:
  - show attached docs lists
  - allow navigation to doc detail pages
  - optionally deep-link to `/docs/new` with preselected attachment context
- **PATTERN**: Preserve each panel’s current layout and interaction model. Add docs as one more section, not a redesign.
- **GOTCHA**: If connection detail data is newly introduced on the backend, EdgePanel may need to fetch detail instead of relying only on edge data from the map graph.
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE docs browser/search UX

- **IMPLEMENT**: Add filters for team, file type, and attachment type; add text search input that calls `GET /docs?q=...`.
- **PATTERN**: Mirror list filtering simplicity from `PlaygroundsPage`; keep local state and server-backed filtering.
- **GOTCHA**: Full global `/search` is a separate feature area. This slice should ensure docs are indexed and searchable in `/docs`; global search integration can follow existing project phasing unless explicitly expanded.
- **VALIDATE**: `cd frontend && npm run build`

### VALIDATE local object-storage flow end to end

- **IMPLEMENT**: Use local MinIO from `docker-compose.yml` and confirm:
  - file upload
  - metadata persistence
  - object existence in bucket
  - preview behavior
  - download streaming
  - extracted search
- **VALIDATE**:
  - `docker compose up -d postgres minio minio-init`
  - `cd backend && npm run migration:run`
  - `cd backend && npm run start:dev`
  - `cd frontend && npm run dev`

---

## TESTING STRATEGY

This repo currently has no visible automated test framework or test files. Planning should stay aligned with that reality instead of pretending there is an existing Jest/Vitest suite. The primary validation path for this slice is build checks plus manual end-to-end verification against local Postgres + MinIO.

### Unit Tests

- Current state: no existing unit test harness was found in `backend/package.json`, `frontend/package.json`, or tracked `*test*` / `*spec*` files.
- Recommendation: do not expand this slice by bootstrapping a full test framework unless the user explicitly wants that investment now.
- If a lightweight test harness is added during implementation, prioritize backend document-processing tests for:
  - Markdown extraction
  - DOCX raw text extraction
  - empty/unsupported PDF extraction results
  - attachment normalization logic

### Integration Tests

- Current state: no existing integration test harness was found.
- Manual integration should cover the full upload → preview → search → attachment → download lifecycle.

### Edge Cases

- Uploading unsupported file types should fail with a clear validation error.
- A `.pdf` with embedded text should index and match search results.
- A scanned/image-only PDF should upload and preview but show non-searchable behavior.
- A `.docx` file should render HTML preview and also be searchable by extracted text.
- Replacing a file should update `file_name`, `mime_type`, `file_size_bytes`, `extracted_text`, and search index.
- Deleting a doc should remove DB metadata, join-table rows, and storage objects.
- A doc attached to multiple targets should appear in all relevant detail surfaces.
- Empty attachment arrays in updates should remove existing join-table associations cleanly.
- Large files should stream correctly without backend crashes or broken responses.
- Missing storage objects should produce a clean backend error instead of hanging the request.

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and feature correctness within the current repo toolchain.

### Level 1: Syntax & Style

- `cd backend && npm run build`
- `cd backend && npm run typecheck`
- `cd frontend && npm run build`
- `cd frontend && npm run lint`

### Level 2: Automated Tests

- No existing automated test command is currently configured for this repo.
- If the implementation introduces tests, add the concrete commands to this section before execution.

### Level 3: Database & Storage Validation

- `docker compose up -d postgres minio minio-init`
- `cd backend && npm run migration:run`

### Level 4: Manual Validation

1. Start services:
   - `cd backend && npm run start:dev`
   - `cd frontend && npm run dev`
2. Upload one `.md`, one text-based `.pdf`, and one `.docx` through the UI.
3. Verify each upload creates a row in Postgres and an object in MinIO under `docs/{docId}/`.
4. Verify `/docs` lists all three items and filters by file type.
5. Verify detail pages:
   - Markdown renders as formatted content
   - PDF previews inline
   - DOCX shows converted preview HTML
6. Search for a unique phrase from each file and confirm `/docs?q=` returns it.
7. Attach a doc to:
   - one service
   - one service connection
   - one entity
8. Open the corresponding service panel, edge panel, and entity panel and confirm the docs link appears.
9. Replace one file and confirm preview/search update accordingly.
10. Delete one doc and confirm its file disappears from MinIO and it no longer appears in search or attachment surfaces.

### Level 5: Direct API Smoke Tests

- Example multipart upload:

```bash
curl -X POST http://localhost:3001/docs \
  -F "title=Payments RFC" \
  -F "summary=Service ownership and edge cases" \
  -F "teamId=<uuid>" \
  -F "serviceIds=<uuid>" \
  -F "file=@/absolute/path/to/file.docx"
```

- Example list search:

```bash
curl "http://localhost:3001/docs?q=payments"
```

- Example preview/download:

```bash
curl -I "http://localhost:3001/docs/<doc-id>/download"
curl -I "http://localhost:3001/docs/<doc-id>/preview"
```

---

## ACCEPTANCE CRITERIA

- [ ] Users can upload `.md`, `.pdf`, and `.docx` files through the app.
- [ ] Original files are stored in S3/MinIO-compatible object storage, not in Postgres.
- [ ] Docs metadata and attachment relations are stored in Postgres.
- [ ] Docs can be attached to services, service connections, and entities simultaneously.
- [ ] Markdown, PDF, and DOCX files all have a usable read path in the UI.
- [ ] Full-text docs search returns matches from Markdown body and extracted PDF / DOCX text.
- [ ] Scanned PDFs are handled gracefully as non-searchable, not as broken uploads.
- [ ] Service, edge, and entity surfaces expose their attached docs.
- [ ] All available build/lint/typecheck commands pass with zero errors.
- [ ] No regressions are introduced in existing map, entity, or playground flows.
- [ ] PRD-aligned docs routes exist: `/docs`, `/docs/:id`, `/docs/new`, `/docs/:id/edit`.
- [ ] Storage configuration is documented in `.env.example`.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Migration created and applied successfully
- [ ] Storage env vars and MinIO configuration validated locally
- [ ] Multipart upload endpoints implemented and manually verified
- [ ] Preview and download endpoints stream correctly
- [ ] Docs browser, detail, upload, and edit routes implemented
- [ ] Attachment visibility added to existing surfaces
- [ ] Search behavior verified for `.md`, `.pdf`, and `.docx`
- [ ] All validation commands executed successfully
- [ ] Manual end-to-end validation completed

---

## NOTES

- Recommended dependency choices:
  - `@aws-sdk/client-s3` for object storage
  - `mammoth` for DOCX HTML preview + raw text extraction
  - `pdf-parse` for PDF text extraction
  - `react-markdown` for Markdown preview
- Recommended architectural decision: keep preview/download behind backend endpoints for v1. This avoids coupling frontend code to storage URLs and keeps auth/privacy options open for later.
- Recommended scope boundary: do not implement the separate global `/search` feature in this slice unless explicitly requested. This slice should make docs indexable and searchable via `/docs`.
- Recommended follow-up after this slice: if search quality becomes critical for PDFs, consider a later OCR pipeline or asynchronous ingestion worker rather than blocking this initial implementation.

**Confidence Score**: 8/10 that execution will succeed on the first attempt
