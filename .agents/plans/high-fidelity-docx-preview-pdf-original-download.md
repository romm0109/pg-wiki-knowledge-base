# Feature: High-Fidelity DOCX Preview With Original DOCX Download

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

Upgrade the Docs domain so uploaded `.docx` files render with high visual fidelity in the app while still downloading as the original `.docx`. The backend should keep the original DOCX in S3/MinIO, extract plain text for search, and generate a separate PDF preview artifact server-side. The frontend should preview the generated PDF exactly like native PDF docs and keep the existing "download original" action pointing at the source DOCX.

This replaces the current Mammoth HTML iframe preview for DOCX, which is useful for extraction but does not preserve formatting such as font sizes, spacing, page layout, or document styling closely enough.

## User Story

As an engineer
I want DOCX files to preview in the app with their original formatting preserved
So that I can read uploaded technical documents accurately without losing the original editable DOCX download

## Problem Statement

The current DOCX preview path uses `mammoth.convertToHtml()` and injects the resulting HTML into an iframe. That is acceptable for search extraction and loose reading, but not for faithful presentation. Users notice formatting loss immediately: font sizes, layout, spacing, and richer document styling are not represented well enough.

At the moment:

- the backend stores only one object key per doc (`storage_key`) and treats the uploaded file as both source and preview,
- the `docs.preview` API exposes a `docx` preview mode that assumes HTML rendering,
- the frontend has a dedicated DOCX HTML branch in the preview component,
- the reindex flow only refreshes extracted text and legacy HTML preview data.

If this is not redesigned carefully, likely failure modes are:

- overwriting the original DOCX with a PDF preview artifact,
- returning PDF downloads instead of the original DOCX,
- generating previews in a way that fails under concurrent conversions because LibreOffice profile state collides,
- introducing a brittle npm wrapper around LibreOffice instead of using the existing backend/storage patterns directly,
- leaving existing DOCX docs without a backfill path.

## Solution Statement

Implement server-side DOCX to PDF preview generation using LibreOffice's headless CLI (`soffice`) invoked from NestJS with `execFile`, isolated per conversion in a unique temp directory. Persist the original DOCX and a separate preview PDF artifact under stable S3 keys. Keep DOCX text extraction in the backend for search, but stop using HTML as the primary DOCX preview.

Recommended design:

- Keep original upload in `docs/{docId}/source.docx`.
- Generate preview PDF in `docs/{docId}/preview.pdf`.
- Continue extracting raw text from DOCX using Mammoth for search indexing.
- Stream `preview.pdf` from `GET /docs/:id/preview-file` when the source file is DOCX.
- Keep `GET /docs/:id/download` streaming the original source file.
- Normalize preview semantics so the frontend only needs `markdown` and `pdf` preview modes.
- Add a migration for preview artifact columns and a reindex/backfill path for existing DOCX docs.

This yields the user-visible behavior you want:

- inline preview looks like the original DOCX,
- download still returns the original editable DOCX,
- search still works on extracted text,
- PDFs and Markdown keep their current behavior.

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: High
**Primary Systems Affected**: backend docs/document-processing/storage/config/migrations, frontend docs preview/types/API client, local runtime setup
**Dependencies**: LibreOffice `soffice` CLI installed on the host, Node `child_process`/`fs/promises`, existing S3-compatible storage, existing Mammoth extraction

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `CLAUDE.md:1-4` - Project rule: never commit unless explicitly asked.
- `backend/src/docs/docs.service.ts:48-80` - Docs list filtering pattern and relation loading for the docs domain.
- `backend/src/docs/docs.service.ts:100-149` - Current create flow: source upload, extraction, metadata persistence.
- `backend/src/docs/docs.service.ts:186-225` - Current replace-file flow and source object lifecycle.
- `backend/src/docs/docs.service.ts:234-301` - Current preview/download behavior; this is the exact area that must be redesigned for DOCX preview artifacts.
- `backend/src/document-processing/document-processing.service.ts:21-78` - Existing extraction logic for `.md`, `.pdf`, `.docx`; currently DOCX returns HTML preview content.
- `backend/src/storage/storage.service.ts:45-90` - Existing S3/MinIO abstraction. Reuse this instead of introducing a second storage client or direct SDK calls elsewhere.
- `backend/src/docs/docs.controller.ts:40-71` - Existing `preview` and `preview-file` endpoint structure. Keep controllers thin.
- `backend/src/docs/doc.entity.ts:20-69` - Current docs persistence shape. This will need preview artifact metadata columns.
- `backend/src/docs/docs.module.ts:13-28` - Module registration pattern for docs dependencies.
- `backend/src/config/env.validation.ts:19-107` - Existing env validation and dev/test fallback pattern; add converter-specific env vars here.
- `backend/src/config/typeorm.config.ts:16-42` - Explicit entity registration list.
- `backend/src/app.module.ts:20-45` - Root module registration pattern.
- `backend/src/migrations/1714500000000-AddDocs.ts:7-112` - Docs migration style and current docs schema.
- `backend/package.json:6-49` - Available backend scripts. No test framework is configured today.
- `backend/src/docs/reindex-docs.ts:1-80` - Existing maintenance command pattern for docs backfills/reprocessing.
- `docker-compose.yml:1-51` - Local infra only includes Postgres and MinIO. There is currently no app container or conversion sidecar.
- `frontend/src/types/doc.ts:4-48` - Current preview type contract includes a `docx` branch that assumes HTML preview.
- `frontend/src/api/client.ts:168-190` - Grouped docs API client pattern and preview/download URL helpers.
- `frontend/src/components/docs/DocPreview.tsx:10-50` - Current preview rendering logic; DOCX is currently rendered from `srcDoc`.
- `frontend/src/components/docs/DocViewer.tsx:20-69` - Existing preview fetch/error/loading pattern.
- `frontend/src/pages/DocDetailPage.tsx:66-141` - Reader page composition and download action; this is where the "preview PDF, download DOCX" behavior must remain clear.
- `frontend/src/pages/DocsPage.tsx:43-117` - Docs browser card/list behavior.
- `frontend/src/components/docs/DocUploadForm.tsx:182-205` - Current file picker copy and accepted extensions.

### New Files to Create

- `backend/src/migrations/<timestamp>-AddDocPreviewArtifacts.ts` - Migration adding preview artifact columns and backfilling/normalizing preview semantics.
- `backend/src/document-processing/docx-preview-conversion.service.ts` - Focused LibreOffice conversion service if extraction and conversion should be split cleanly.
- `backend/src/document-processing/dto/` or helper file only if needed - Only create additional helpers if temp-dir / CLI orchestration would make `document-processing.service.ts` too dense.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [LibreOffice Help: Starting LibreOffice Software With Parameters](https://help.libreoffice.org/latest/hr/text/shared/guide/start_parameters.html)
  - Specific section: `--headless`, `--convert-to`, `--outdir`, and `-env:UserInstallation=...`
  - Why: This is the core official reference for converting DOCX to PDF safely in headless mode and isolating profile state per conversion.
- [Node.js `child_process.execFile`](https://nodejs.org/api/child_process.html#child_processexecfilefile-args-options-callback)
  - Specific section: `execFile` API
  - Why: Prefer `execFile` over `exec` so conversion commands do not go through a shell and argument escaping stays correct.
- [Node.js `fsPromises.mkdtemp`](https://nodejs.org/api/fs.html#fspromisesmkdtempprefix-options)
  - Specific section: temporary directory creation
  - Why: Each LibreOffice conversion should run in its own temp workspace and user profile directory to avoid collisions.
- [NestJS Streaming Files](https://docs.nestjs.com/techniques/streaming-files)
  - Specific section: `StreamableFile`
  - Why: Preview/download endpoints should continue streaming artifacts through the backend rather than exposing storage URLs.
- [AWS SDK for JavaScript v3 S3 Code Examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
  - Specific section: `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`
  - Why: Preview artifact storage should reuse the existing S3 abstraction and lifecycle patterns.
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js)
  - Specific section: `extractRawText`
  - Why: DOCX extraction for search should remain Mammoth-based even after HTML preview is removed from the reader path.

### Patterns to Follow

**Thin NestJS Controllers**

Mirror the existing docs controller pattern:

```ts
@Get(':id/preview-file')
async previewFile(
  @Param('id', ParseUUIDPipe) id: string,
  @Res({ passthrough: true }) response: Response,
): Promise<StreamableFile> {
  const result = await this.docsService.previewFile(id);
  response.setHeader('Content-Type', result.contentType);
  return result.file;
}
```

Source: `backend/src/docs/docs.controller.ts:59-70`

Do not put LibreOffice branching or artifact lookup logic in the controller.

**Single Storage Abstraction**

Mirror the current storage access pattern:

```ts
await this.storageService.putObject({
  key: storageKey,
  body: file.buffer,
  contentType: processed.mimeType,
});
```

Source: `backend/src/docs/docs.service.ts:123-128`

Do not instantiate a second S3 client in the conversion path.

**Docs Service Owns File Lifecycle**

Current docs create/replace/remove flow already owns upload and cleanup:

```ts
const previousStorageKey = doc.storageKey;
...
if (previousStorageKey !== storageKey) {
  await this.storageService.deleteObject(previousStorageKey);
}
```

Source: `backend/src/docs/docs.service.ts:203-224`

Keep preview artifact creation/deletion in this same service lifecycle so source and preview stay consistent.

**QueryBuilder-Based Filtering**

Docs list uses `QueryBuilder` and explicit joins:

```ts
const qb: SelectQueryBuilder<Doc> = this.docsRepo
  .createQueryBuilder('doc')
  .leftJoinAndSelect('doc.docServices', 'docService')
  .leftJoinAndSelect('docService.service', 'service')
  .leftJoinAndSelect('doc.docEntities', 'docEntity')
  .leftJoinAndSelect('docEntity.entity', 'entity')
  .orderBy('doc.updated_at', 'DESC');
```

Source: `backend/src/docs/docs.service.ts:48-55`

If preview metadata is added to filtering or admin tooling later, keep using this pattern.

**Frontend Preview Branching**

Current preview component branches on a typed preview response:

```tsx
if (preview.type === 'docx') {
  return <iframe srcDoc={...} />;
}

return <iframe src={docsApi.previewFileUrl(doc.id)} ... />;
```

Source: `frontend/src/components/docs/DocPreview.tsx:19-49`

The recommended change is to collapse DOCX into the PDF preview path so the frontend only needs one artifact-stream branch.

**Virtualized Attachment Picker**

The docs form already contains a local virtualized list implementation:

```tsx
const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
const endIndex = Math.min(options.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
```

Source: `frontend/src/components/docs/DocUploadForm.tsx:39-49`

If preview generation status or converter warnings are exposed in the editor later, keep the current component style and avoid replacing it with a new list library.

**Migration Style**

Handwritten raw-SQL additive migration pattern:

```ts
await queryRunner.query(`
  ALTER TABLE "doc_entities"
  ADD CONSTRAINT "FK_doc_entities_entity"
  FOREIGN KEY ("entity_id") REFERENCES "entities"("id")
  ON DELETE CASCADE
`).catch(() => undefined);
```

Source: `backend/src/migrations/1714500000000-AddDocs.ts:95-100`

Follow this style for preview artifact columns and any data backfill.

**Anti-Patterns To Avoid**

- Do not replace the original DOCX object with the generated PDF.
- Do not expose raw MinIO/S3 URLs to the browser.
- Do not call `exec` with an interpolated shell command; use `execFile`.
- Do not reuse the default LibreOffice user profile across requests; use `-env:UserInstallation=file:///...` with a temp dir.
- Do not add a second preview rendering path in the frontend if DOCX can share the existing PDF iframe path.

---

## IMPLEMENTATION PLAN

### Phase 1: Preview Artifact Data Model

Extend the docs schema so a doc can have both a source file and an optional derived preview artifact.

**Tasks:**

- Add nullable preview artifact columns to `docs`
- Decide and normalize `previewType` semantics (`markdown` or `pdf` recommended)
- Keep `fileExtension` and source metadata representing the original uploaded file
- Backfill existing DOCX docs into the new preview semantics

### Phase 2: Backend Conversion Pipeline

Implement a server-side DOCX-to-PDF conversion flow using LibreOffice headless mode and isolated temp directories.

**Tasks:**

- Add conversion config/env vars
- Create a conversion helper/service using `execFile`
- Generate preview PDF during DOCX create/replace and store it in S3/MinIO
- Preserve Mammoth raw-text extraction for search
- Fail DOCX upload/replace when conversion cannot produce a preview PDF

### Phase 3: Preview/Download API Integration

Update preview endpoints so the frontend streams the preview artifact while downloads continue serving the original source.

**Tasks:**

- Update `previewFile()` to serve `preview_storage_key` when present
- Keep `downloadFile()` serving the source object unmodified
- Simplify `getPreview()` contract so DOCX now resolves to the PDF preview path
- Clean up derived preview artifact objects during replace/delete flows
- Extend `docs:reindex` to regenerate preview PDFs for existing DOCX docs

### Phase 4: Frontend Reader Simplification

Remove HTML-based DOCX rendering and route DOCX preview through the existing PDF iframe reader.

**Tasks:**

- Update docs types and preview response union
- Remove the `srcDoc` DOCX branch from `DocPreview`
- Keep "download original" clearly labeled in the detail page
- Add friendly UI states for "preview unavailable" during partial backfill or conversion failure

### Phase 5: Runtime & Validation

Make the converter dependency explicit and validate the full end-to-end workflow manually.

**Tasks:**

- Document `soffice` host dependency
- Add startup or lazy validation with actionable error messages when the converter is missing
- Validate create/replace/delete/reindex flows against MinIO and Postgres

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### UPDATE `backend/src/docs/doc.entity.ts`

- **IMPLEMENT**: Add nullable preview artifact metadata columns such as `previewStorageKey`, `previewContentType`, and `previewFileSizeBytes`. Keep `storageKey`/`mimeType`/`fileExtension` representing the original source file only.
- **PATTERN**: Mirror explicit TypeORM columns from `backend/src/docs/doc.entity.ts:20-57`.
- **IMPORTS**: Reuse `@Column`/`@Index`/timestamp decorators already in the file.
- **GOTCHA**: Do not rename source-file columns in this task; keep migration risk low.
- **VALIDATE**: `cd backend && npm run typecheck`

### CREATE `backend/src/migrations/<timestamp>-AddDocPreviewArtifacts.ts`

- **IMPLEMENT**: Add raw-SQL migration for new preview artifact columns on `docs`. Backfill existing rows so:
  - `.pdf` docs keep `preview_type = 'pdf'` and no derived preview key
  - `.md` docs keep `preview_type = 'markdown'`
  - `.docx` docs are marked for PDF preview semantics and prepared for reindex/backfill
- **PATTERN**: Follow raw SQL + `catch(() => undefined)` style from `backend/src/migrations/1714500000000-AddDocs.ts:6-112`.
- **IMPORTS**: `MigrationInterface`, `QueryRunner`
- **GOTCHA**: Do not drop `preview_html` in the same migration unless you also clean every code path and backfill. It can remain deprecated for now.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE `backend/src/config/env.validation.ts`

- **IMPLEMENT**: Add converter-specific env vars, e.g. `DOCX_PREVIEW_COMMAND`, `DOCX_PREVIEW_TIMEOUT_MS`, and optionally `DOCX_PREVIEW_ENABLED`.
- **PATTERN**: Mirror env validation style in `backend/src/config/env.validation.ts:28-107`.
- **IMPORTS**: Existing class-validator decorators only; do not add a new config system.
- **GOTCHA**: Keep the same dev/test defaulting philosophy currently used for S3 at `backend/src/config/env.validation.ts:82-107`.
- **VALIDATE**: `cd backend && npm run typecheck`

### UPDATE `backend/.env.example`

- **IMPLEMENT**: Document the converter env vars with sane local defaults, making it explicit that `soffice` must be available on the host PATH or configured explicitly.
- **PATTERN**: Mirror the simple flat env layout already used in the example file.
- **IMPORTS**: None
- **GOTCHA**: Do not imply Docker Compose already provisions LibreOffice; it does not.
- **VALIDATE**: `cd backend && npm run build`

### CREATE `backend/src/document-processing/docx-preview-conversion.service.ts`

- **IMPLEMENT**: Build a focused service that:
  - creates a temp workspace with `mkdtemp`
  - writes the DOCX to disk
  - runs `soffice --headless --convert-to pdf:writer_pdf_Export --outdir ... -env:UserInstallation=file:///...`
  - reads the produced PDF back into a Buffer
  - cleans up temp files
- **PATTERN**: Keep business orchestration in a single injectable service, following the one-service-per-module style in `backend/src/document-processing/document-processing.service.ts:19-78`.
- **IMPORTS**: `node:child_process`, `node:fs/promises`, `node:path`, `node:os`
- **GOTCHA**: Use `execFile`, not `exec`. Use a unique `UserInstallation` path per conversion to avoid LibreOffice profile locking across concurrent requests.
- **VALIDATE**: `cd backend && npm run typecheck`

### UPDATE `backend/src/document-processing/document-processing.service.ts`

- **IMPLEMENT**: Keep Mammoth `extractRawText()` for DOCX search extraction, but stop treating Mammoth HTML as the primary preview. Return a processed result that supports separate preview artifact generation.
- **PATTERN**: Reuse file-extension dispatch from `backend/src/document-processing/document-processing.service.ts:21-77`.
- **IMPORTS**: Inject/use the new conversion service if created.
- **GOTCHA**: Do not remove raw text extraction for DOCX; search depends on it. Do not make DOCX extraction contingent on preview conversion success.
- **VALIDATE**: `cd backend && npm run typecheck`

### UPDATE `backend/src/docs/docs.module.ts`

- **IMPLEMENT**: Register the conversion service in the existing document-processing/docs module graph.
- **PATTERN**: Mirror provider/import registration style from `backend/src/docs/docs.module.ts:13-28`.
- **IMPORTS**: Add only the new service/module wiring needed.
- **GOTCHA**: Keep `DocsModule` depending on `StorageModule` and `DocumentProcessingModule`; do not create circular imports.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE `backend/src/docs/docs.service.ts`

- **IMPLEMENT**: In create/replace flows, when the source file is `.docx`:
  - upload the original DOCX to `source.docx`
  - generate preview PDF
  - upload preview PDF to a stable preview key
  - persist preview artifact metadata
  - set preview semantics so `getPreview()` resolves to PDF mode
- **PATTERN**: Follow the current source-file lifecycle structure at `backend/src/docs/docs.service.ts:100-149` and `:186-225`.
- **IMPORTS**: Reuse `StorageService`, `DocumentProcessingService`, and existing `StreamableFile`/repository utilities.
- **GOTCHA**: Source download and preview stream must not read from the same object key for DOCX anymore. Replacing/removing a DOCX must delete both old source and old preview artifacts if they changed.
- **VALIDATE**: `cd backend && npm run typecheck`

### UPDATE `backend/src/docs/docs.service.ts`

- **IMPLEMENT**: Change `getPreview()` and `previewFile()` so DOCX docs now use the PDF preview artifact path. Recommended shape:
  - `getPreview()` returns `{ type: 'markdown' }` only for Markdown docs
  - `getPreview()` returns `{ type: 'pdf' }` for source PDFs and DOCX-with-preview
  - `previewFile()` streams `previewStorageKey ?? storageKey`
- **PATTERN**: Mirror current endpoint-supporting logic at `backend/src/docs/docs.service.ts:234-301`.
- **IMPORTS**: None beyond existing backend imports.
- **GOTCHA**: Keep `downloadFile()` untouched semantically: it must always stream the original uploaded source file.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE `backend/src/docs/docs.controller.ts`

- **IMPLEMENT**: Keep the endpoint surface the same unless there is a strong reason to add a status endpoint. If a new endpoint is needed (for example converter health), keep it thin and feature-specific.
- **PATTERN**: Mirror current controller shape from `backend/src/docs/docs.controller.ts:26-103`.
- **IMPORTS**: Reuse `ParseUUIDPipe`, `Response`, `StreamableFile`.
- **GOTCHA**: Do not add shell/process logic here.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE `backend/src/storage/storage.service.ts`

- **IMPLEMENT**: If needed, add small helper methods for derived preview artifact lifecycle only. Keep storage semantics centralized.
- **PATTERN**: Mirror `putObject` / `getObject` / `deleteObject` helpers in `backend/src/storage/storage.service.ts:45-90`.
- **IMPORTS**: Existing AWS SDK v3 commands only.
- **GOTCHA**: Do not leak artifact-key construction into multiple call sites; centralize key naming either here or in `DocsService`.
- **VALIDATE**: `cd backend && npm run typecheck`

### UPDATE `backend/src/docs/reindex-docs.ts`

- **IMPLEMENT**: Extend reindex to regenerate preview PDFs for existing DOCX docs, normalize preview semantics, and clear/update deprecated HTML preview fields as needed.
- **PATTERN**: Mirror the current reindex flow pattern and config bootstrap in `backend/src/docs/reindex-docs.ts`.
- **IMPORTS**: Reuse `StorageService` and `DocumentProcessingService`; do not create a one-off conversion client.
- **GOTCHA**: Existing docs may have source DOCX objects but no preview PDF. The reindex task must be the supported backfill path.
- **VALIDATE**: `cd backend && npx tsc -p tsconfig.seed.json --noEmit`

### UPDATE `frontend/src/types/doc.ts`

- **IMPLEMENT**: Simplify preview response types so DOCX no longer implies HTML preview. Recommended union:
  - `{ type: 'markdown'; content: string }`
  - `{ type: 'pdf'; content: null }`
- **PATTERN**: Follow current flat type-export style from `frontend/src/types/doc.ts:4-48`.
- **IMPORTS**: None beyond existing type imports.
- **GOTCHA**: Keep `fileExtension: 'docx'` intact on the doc model so the UI still knows the original source type.
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE `frontend/src/components/docs/DocPreview.tsx`

- **IMPLEMENT**: Remove the DOCX `srcDoc` iframe branch. DOCX should render via the same PDF iframe path as PDFs by calling `docsApi.previewFileUrl(doc.id)`.
- **PATTERN**: Mirror the existing PDF iframe branch at `frontend/src/components/docs/DocPreview.tsx:44-49`.
- **IMPORTS**: Keep `docsApi` URL helper usage.
- **GOTCHA**: Do not change the Markdown reader branch.
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE `frontend/src/components/docs/DocViewer.tsx`

- **IMPLEMENT**: Keep loading/error handling intact, but make preview-unavailable copy clearer for DOCX rows that have not yet been backfilled or failed conversion.
- **PATTERN**: Reuse the current axios error normalization and loading states in `frontend/src/components/docs/DocViewer.tsx:20-69`.
- **IMPORTS**: Existing imports only unless a typed "preview unavailable" response is introduced.
- **GOTCHA**: If you introduce a third preview state, keep the union explicit and update all callers.
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE `frontend/src/pages/DocDetailPage.tsx`

- **IMPLEMENT**: Keep the existing `הורד מקור` action unchanged and, if helpful, add a small note for DOCX docs that preview is rendered from a generated PDF while downloads remain the original file.
- **PATTERN**: Mirror the current header/action layout in `frontend/src/pages/DocDetailPage.tsx:69-109`.
- **IMPORTS**: None unless new metadata chips are added.
- **GOTCHA**: Do not route the download button to the preview artifact.
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE `frontend/src/api/client.ts`

- **IMPLEMENT**: Keep grouped axios APIs, but update docs preview typing if the response contract changes.
- **PATTERN**: Mirror the grouped `docsApi` pattern at `frontend/src/api/client.ts:168-190`.
- **IMPORTS**: Update only `DocPreviewResponse` type usage.
- **GOTCHA**: Do not add a second docs fetch utility outside this file.
- **VALIDATE**: `cd frontend && npm run build`

### UPDATE `backend/package.json`

- **IMPLEMENT**: If you add any new runtime validation or maintenance scripts (for example a converter check), register them here using the existing flat script style.
- **PATTERN**: Mirror scripts layout from `backend/package.json:6-17`.
- **IMPORTS**: None
- **GOTCHA**: Avoid adding a dependency wrapper like `libreoffice-convert` unless you have a concrete advantage over direct `execFile`.
- **VALIDATE**: `cd backend && npm run build`

### UPDATE `docker-compose.yml` OR project docs if needed

- **IMPLEMENT**: Do not add a LibreOffice Docker service unless you are also changing how the backend executes conversions. Preferred plan is to document host installation requirements instead.
- **PATTERN**: Current compose file only provisions infra at `docker-compose.yml:1-51`.
- **IMPORTS**: None
- **GOTCHA**: A conversion sidecar is a different architecture. Do not mix the two approaches in one implementation.
- **VALIDATE**: `docker compose config`

---

## TESTING STRATEGY

The repo currently has no configured automated test framework or test files. Do not assume Jest/Vitest/Nest test harnesses already exist. This feature should therefore validate primarily through typecheck/build, migration execution, and explicit manual end-to-end checks. If you decide to introduce automated tests, do it only if the scope remains tight and the team explicitly wants a new harness.

### Unit Tests

No established backend/frontend unit-test framework exists today. If adding tests is considered worthwhile, limit them to pure conversion-orchestration helpers that can be mocked without shelling out to LibreOffice. Otherwise rely on build + manual verification for this feature.

### Integration Tests

Manual integration is the primary path:

- upload DOCX
- confirm source object and preview object are both created
- confirm preview renders as PDF
- confirm download returns original DOCX
- replace DOCX and verify old preview artifact cleanup
- delete doc and verify both artifacts are removed
- run reindex and verify existing DOCX docs gain preview artifacts

### Edge Cases

- DOCX conversion binary missing from PATH
- DOCX conversion times out
- LibreOffice writes no output file
- Concurrent DOCX uploads with isolated user profile temp dirs
- Replace DOCX with another DOCX and ensure old preview PDF is cleaned up
- Replace DOCX with PDF and ensure stale preview artifact is deleted
- Existing DOCX docs created before this feature; preview should backfill via `docs:reindex`
- Failed DOCX conversion should not leave orphaned preview objects
- MinIO/S3 upload succeeds for source but fails for preview artifact, and vice versa
- Hebrew filenames remain normalized end to end

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Syntax & Style

```bash
cd backend && npm run typecheck
cd backend && npm run build
cd frontend && npm run build
```

### Level 2: Migration & Maintenance

```bash
cd backend && npm run migration:run
cd backend && npx tsc -p tsconfig.seed.json --noEmit
cd backend && npm run docs:reindex
```

### Level 3: Runtime Dependency Validation

```bash
which soffice
soffice --version
docker compose up -d postgres minio minio-init
```

### Level 4: Manual Validation

1. Start backend and frontend locally.
2. Upload a formatted `.docx` containing visibly different font sizes, spacing, headings, tables, and at least one code snippet / preformatted block.
3. Open the new doc detail page and verify the preview renders as PDF with preserved formatting.
4. Specifically verify that code snippets remain visually distinct in the preview PDF:
   - monospaced or clearly code-like styling is preserved when present in the source DOCX
   - indentation and line breaks are preserved
   - code blocks are not collapsed into normal paragraph text
4. Click `הורד מקור` and verify the downloaded file is still `.docx`.
5. Upload a regular PDF and verify PDF preview behavior is unchanged.
6. Upload Markdown and verify Markdown preview behavior is unchanged.
7. Replace an existing DOCX with a new DOCX and confirm the preview changes accordingly.
8. Run `npm run docs:reindex` and verify existing DOCX docs now preview as PDF.
9. Delete a DOCX doc and verify both `source.docx` and `preview.pdf` disappear from MinIO.

### Level 5: Agent Browser Validation

Use the `agent-browser` skill at the end of implementation for browser-based verification against the running app.

Required browser checks:

1. Open the docs browser and upload a DOCX fixture containing:
   - multiple heading levels
   - mixed font sizes
   - a table
   - a code snippet / preformatted block
2. Navigate to the created doc detail page.
3. Confirm the inline preview is rendered through the PDF artifact path rather than HTML injection.
4. Visually verify that:
   - headings remain distinct
   - font-size differences survive conversion
   - table layout remains intact
   - code snippet formatting remains clearly preserved
5. Click the download button and confirm the downloaded asset is the original `.docx`.
6. Replace the DOCX with a second DOCX fixture and confirm the preview updates.
7. If possible, capture a screenshot of the final preview state for implementation evidence.

### Level 6: Storage Verification (Optional)

Use MinIO Console or `mc` to inspect artifact keys:

```bash
mc alias set local http://localhost:9000 minioadmin minioadmin
mc ls --recursive local/service-catalog/docs
```

Expected for a DOCX doc:

- `docs/{docId}/source.docx`
- `docs/{docId}/preview.pdf`

---

## ACCEPTANCE CRITERIA

- [ ] DOCX docs render in-app from a generated PDF preview artifact, not Mammoth HTML
- [ ] Original DOCX downloads still return the uploaded `.docx`
- [ ] PDF and Markdown preview behavior remain unchanged
- [ ] DOCX extracted text remains searchable in Postgres
- [ ] DOCX code snippets / preformatted blocks remain visually distinct in the generated PDF preview
- [ ] Preview artifacts are stored separately from source objects
- [ ] Replace/delete flows clean up stale preview artifacts correctly
- [ ] Existing DOCX docs can be backfilled with `npm run docs:reindex`
- [ ] Missing/failed converter scenarios produce actionable errors
- [ ] All validation commands pass with zero errors
- [ ] Final browser validation is executed with the `agent-browser` skill
- [ ] Code follows existing NestJS, TypeORM, grouped axios, and storage patterns

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Backend build passes
- [ ] Frontend build passes
- [ ] Migration applied successfully
- [ ] Manual DOCX preview/download testing confirms expected behavior
- [ ] Agent-browser validation confirms preview fidelity and original-download behavior
- [ ] Existing PDF/Markdown behavior manually rechecked
- [ ] No regressions in docs create/edit/detail flows
- [ ] Converter dependency and local setup documented clearly

---

## NOTES

- Recommended architecture: host-installed LibreOffice invoked via `execFile`. This is the lowest-friction fit for the current repo because the backend runs on the host and `docker-compose.yml` only provisions infra.
- Do not implement a Docker conversion sidecar and host binary invocation at the same time. Pick one. For this repo, host binary is the simpler and more compatible choice.
- Keep `preview_html` only as a deprecated compatibility field unless you have time to remove it safely in a follow-up cleanup.
- If DOCX conversion fails during create/replace, prefer rejecting the request rather than silently accepting a DOCX with a low-fidelity fallback preview. The feature goal is specifically high-fidelity preview.
- Confidence Score: 8/10 that implementation will succeed on the first attempt if the converter dependency is installed and the task order is followed.
