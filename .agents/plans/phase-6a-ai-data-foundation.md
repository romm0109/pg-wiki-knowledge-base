# Feature: Phase 6A — AI Data Foundation

The following plan should be complete, but validate documentation and codebase patterns before implementing.

Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Enable semantic search over uploaded documents by building the embedding pipeline that powers the Phase 6B AI chat. Every doc upload and file replacement automatically chunks the extracted text and stores embeddings in a `doc_chunks` table backed by `pgvector`. A standalone `reindex-docs.ts` script handles backfilling existing docs.

## User Story

As a developer building the AI assistant,
I want every uploaded document to be automatically chunked and embedded,
So that the chat endpoint in Phase 6B can perform semantic search over document content.

## Problem Statement

Docs are already extracted and stored as `extracted_text` in Postgres. There is no chunking, no embedding, and no vector index. Phase 6B cannot do RAG without this foundation.

## Solution Statement

- New migration: enable `pgvector`, create `doc_chunks` (with `vector(1536)` column + ivfflat index) and `ai_sessions` (stub for 6B)
- `ChunkingService`: splits `extracted_text` using `@langchain/textsplitters`
- `EmbeddingService`: calls OpenAI-compatible embeddings API, returns `number[][]`
- `EmbeddingModule`: exports both services; `DocsModule` imports it
- `DocsService.create()` and `DocsService.replaceFile()` call a new private `indexDocChunks()` method after saving
- `reindex-docs.ts` extended to delete + re-embed all existing docs

## Feature Metadata

**Feature Type**: New Capability  
**Estimated Complexity**: Medium  
**Primary Systems Affected**: `docs/`, new `ai/` directory, migrations  
**Dependencies**: `@langchain/textsplitters`, `pgvector` (npm)

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ THESE BEFORE IMPLEMENTING

- `backend/src/docs/docs.service.ts` (lines 100–150, 186–226) — `create()` and `replaceFile()` patterns; this is where `indexDocChunks()` is called after `docsRepo.save(doc)`
- `backend/src/docs/reindex-docs.ts` — standalone script pattern: manual `DataSource`, manual service instantiation (no DI), `for...of` loop with `await`; extend this same file
- `backend/src/document-processing/document-processing.service.ts` — pattern for a simple `@Injectable()` service with no constructor dependencies; `ChunkingService` mirrors this
- `backend/src/config/env.validation.ts` — how env vars are declared with class-validator decorators; add optional AI vars here
- `backend/src/migrations/1714600000000-DropDocConnections.ts` — migration file pattern: `MigrationInterface`, `up()` and `down()` with `queryRunner.query()`
- `backend/src/migrations/1714500000000-AddDocs.ts` — how to create tables + triggers + GIN indexes in a migration
- `backend/src/docs/docs.module.ts` — module import/export pattern; add `EmbeddingModule` import here
- `backend/src/app.module.ts` — where to register the new `AiModule` (Phase 6B stub only — not needed in 6A)
- `backend/src/docs/doc.entity.ts` — TypeORM entity pattern; `DocChunk` mirrors this structure

### New Files to Create

- `backend/src/ai/doc-chunk.entity.ts` — TypeORM entity for `doc_chunks` table
- `backend/src/ai/ai-session.entity.ts` — TypeORM entity stub for `ai_sessions` (used in Phase 6B)
- `backend/src/ai/chunking.service.ts` — `ChunkingService`
- `backend/src/ai/embedding.service.ts` — `EmbeddingService`
- `backend/src/ai/embedding.module.ts` — `EmbeddingModule` (exports both services)
- `backend/src/migrations/1714700000000-AddAiFoundation.ts` — migration

### Files to Modify

- `backend/package.json` — add `@langchain/textsplitters`, `pgvector`
- `backend/src/config/env.validation.ts` — add optional `AI_BASE_URL`, `AI_API_KEY`, `AI_EMBEDDING_MODEL`
- `backend/.env.example` — add AI env var stubs
- `backend/src/docs/docs.module.ts` — import `EmbeddingModule`
- `backend/src/docs/docs.service.ts` — inject `ChunkingService` + `EmbeddingService`, add `indexDocChunks()`, call it in `create()` and `replaceFile()`
- `backend/src/docs/reindex-docs.ts` — extend to delete + re-embed all docs

### Relevant Documentation

- `@langchain/textsplitters` npm: https://www.npmjs.com/package/@langchain/textsplitters
  - `RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap })` + `.splitText(text)` → `Promise<string[]>`
  - `MarkdownTextSplitter({ chunkSize, chunkOverlap })` + `.splitText(text)` → `Promise<string[]>`
- `pgvector` npm (Node.js): https://github.com/pgvector/pgvector-node
  - `toSql(embedding: number[]): string` → `"[0.1,0.2,...]"` (Postgres vector literal)
  - `fromSql(value: string): number[]`
  - Used as a `ValueTransformer` on TypeORM column

### Patterns to Follow

**Module pattern** (mirror `DocumentProcessingModule`):
```typescript
@Module({ providers: [MyService], exports: [MyService] })
export class MyModule {}
```

**ConfigService injection** (mirror any existing service that reads env):
```typescript
constructor(private readonly configService: ConfigService) {}
const val = this.configService.get<string>('MY_VAR');
```

**Optional env var** (in `env.validation.ts`):
```typescript
@IsOptional()
@IsString()
@IsNotEmpty()
AI_BASE_URL?: string;
```

**TypeORM ValueTransformer for pgvector**:
```typescript
import { toSql, fromSql } from 'pgvector';

const vectorTransformer: ValueTransformer = {
  to: (v: number[] | null) => (v != null ? toSql(v) : null),
  from: (v: string | null) => (v != null ? fromSql(v) : null),
};

@Column({ type: 'text', nullable: true, transformer: vectorTransformer })
embedding: number[] | null;
```

**Raw query for batch insert** (used in `indexDocChunks`):
```typescript
await this.dataSource.query(
  `INSERT INTO doc_chunks (id, doc_id, chunk_index, content, embedding)
   VALUES ${placeholders}`,
  params,
);
```

**Migration pattern** (from `1714600000000-DropDocConnections.ts`):
```typescript
export class MyMigration1234 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`...`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`...`);
  }
}
```

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation — packages, env, migration, entities

Install dependencies, extend env validation, create the migration and the two TypeORM entities (`DocChunk`, `AiSession`).

### Phase 2: Core Services — ChunkingService + EmbeddingService

Implement both services and bundle them in `EmbeddingModule`.

### Phase 3: Integration — wire into DocsService

Add `indexDocChunks()` private method to `DocsService`. Call it inside `create()` and `replaceFile()`.

### Phase 4: Reindex script

Extend `reindex-docs.ts` to delete all existing chunks and re-embed every doc.

---

## STEP-BY-STEP TASKS

### TASK 1 — UPDATE `backend/package.json`

- **ADD** to `dependencies`:
  ```json
  "@langchain/textsplitters": "^0.1.0",
  "pgvector": "^0.2.0"
  ```
- **VALIDATE**: `cd backend && npm install` completes without errors

---

### TASK 2 — UPDATE `backend/src/config/env.validation.ts`

- **ADD** three optional fields to the `EnvironmentVariables` class after the S3 block:
  ```typescript
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  AI_BASE_URL?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  AI_API_KEY?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  AI_EMBEDDING_MODEL?: string;
  ```
- **GOTCHA**: `@IsOptional()` must come before `@IsString()` / `@IsNotEmpty()`. Without it, an absent value will fail `@IsNotEmpty()`.
- **VALIDATE**: `cd backend && npm run typecheck`

---

### TASK 3 — UPDATE `backend/.env.example`

- **ADD** at the end of the file:
  ```
  # AI (OpenAI-compatible)
  AI_BASE_URL=http://localhost:11434/v1
  AI_API_KEY=your-api-key
  AI_EMBEDDING_MODEL=text-embedding-ada-002
  ```

---

### TASK 4 — CREATE `backend/src/migrations/1714700000000-AddAiFoundation.ts`

- **IMPLEMENT** migration with `up()` and `down()`
- **up()** must:
  1. `CREATE EXTENSION IF NOT EXISTS vector`
  2. Create `doc_chunks` table:
     ```sql
     CREATE TABLE doc_chunks (
       id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
       doc_id        uuid    NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
       chunk_index   integer NOT NULL,
       content       text    NOT NULL,
       embedding     vector(1536),
       created_at    timestamptz DEFAULT now()
     )
     ```
  3. Create ivfflat index:
     ```sql
     CREATE INDEX doc_chunks_embedding_idx
       ON doc_chunks USING ivfflat (embedding vector_cosine_ops)
       WITH (lists = 100)
     ```
     - **GOTCHA**: ivfflat index requires at least one row to build. Add `WITH (lists = 100)` but the index will be deferred until there's data — this is fine.
  4. Create `ai_sessions` table:
     ```sql
     CREATE TABLE ai_sessions (
       id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
       messages    jsonb NOT NULL DEFAULT '[]',
       created_at  timestamptz DEFAULT now(),
       updated_at  timestamptz DEFAULT now()
     )
     ```
- **down()** must drop `doc_chunks`, `ai_sessions`, and the extension (in that order)
- **PATTERN**: `backend/src/migrations/1714600000000-DropDocConnections.ts`
- **VALIDATE**: `cd backend && npm run migration:run` succeeds

---

### TASK 5 — CREATE `backend/src/ai/doc-chunk.entity.ts`

- **IMPLEMENT** TypeORM entity:
  ```typescript
  import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm';
  import { toSql, fromSql } from 'pgvector';
  import { Doc } from '../docs/doc.entity';

  const vectorTransformer: ValueTransformer = {
    to: (v: number[] | null) => (v != null ? toSql(v) : null),
    from: (v: string | null) => (v != null ? fromSql(v) : null),
  };

  @Entity('doc_chunks')
  export class DocChunk {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'doc_id' })
    docId: string;

    @ManyToOne(() => Doc, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'doc_id' })
    doc: Doc;

    @Column({ name: 'chunk_index' })
    chunkIndex: number;

    @Column({ type: 'text' })
    content: string;

    @Column({ type: 'text', nullable: true, transformer: vectorTransformer })
    embedding: number[] | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
  }
  ```
- **GOTCHA**: The column is declared as `type: 'text'` in TypeORM but the migration creates it as `vector(1536)`. Since `synchronize: false`, TypeORM will never try to alter it. The transformer handles serialization correctly.
- **VALIDATE**: `cd backend && npm run typecheck`

---

### TASK 6 — CREATE `backend/src/ai/ai-session.entity.ts`

- **IMPLEMENT** stub entity (used by Phase 6B; registered now so the migration entity list stays consistent):
  ```typescript
  import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

  @Entity('ai_sessions')
  export class AiSession {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'jsonb', default: [] })
    messages: object[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
  }
  ```
- **VALIDATE**: `cd backend && npm run typecheck`

---

### TASK 7 — CREATE `backend/src/ai/chunking.service.ts`

- **IMPLEMENT**:
  ```typescript
  import { Injectable } from '@nestjs/common';
  import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

  const CHUNK_SIZE = 600;
  const CHUNK_OVERLAP = 100;

  @Injectable()
  export class ChunkingService {
    async chunkText(text: string, fileExtension: 'md' | 'pdf' | 'docx'): Promise<string[]> {
      if (!text?.trim()) return [];

      if (fileExtension === 'md') {
        const splitter = new MarkdownTextSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP });
        return splitter.splitText(text);
      }

      const splitter = new RecursiveCharacterTextSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP });
      return splitter.splitText(text);
    }
  }
  ```
- **PATTERN**: mirrors `DocumentProcessingService` — simple `@Injectable()` with no constructor dependencies
- **VALIDATE**: `cd backend && npm run typecheck`

---

### TASK 8 — CREATE `backend/src/ai/embedding.service.ts`

- **IMPLEMENT**:
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';

  @Injectable()
  export class EmbeddingService {
    private readonly logger = new Logger(EmbeddingService.name);
    private readonly baseUrl: string | undefined;
    private readonly apiKey: string | undefined;
    private readonly model: string | undefined;

    constructor(private readonly configService: ConfigService) {
      this.baseUrl = this.configService.get<string>('AI_BASE_URL');
      this.apiKey = this.configService.get<string>('AI_API_KEY');
      this.model = this.configService.get<string>('AI_EMBEDDING_MODEL');
    }

    async embed(texts: string[]): Promise<number[][]> {
      if (!texts.length) return [];

      if (!this.baseUrl || !this.apiKey || !this.model) {
        this.logger.warn('AI env vars not configured — skipping embedding');
        return texts.map(() => []);
      }

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: texts }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Embedding API error ${response.status}: ${body}`);
      }

      const data = await response.json() as { data: Array<{ embedding: number[]; index: number }> };
      // Sort by index to guarantee order matches input order
      return data.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    }
  }
  ```
- **GOTCHA**: OpenAI-compatible APIs return `data` sorted by index but it is best practice to sort explicitly.
- **GOTCHA**: `fetch` is available in Node 18+. No extra import needed.
- **VALIDATE**: `cd backend && npm run typecheck`

---

### TASK 9 — CREATE `backend/src/ai/embedding.module.ts`

- **IMPLEMENT**:
  ```typescript
  import { Module } from '@nestjs/common';
  import { TypeOrmModule } from '@nestjs/typeorm';
  import { ChunkingService } from './chunking.service';
  import { EmbeddingService } from './embedding.service';
  import { DocChunk } from './doc-chunk.entity';
  import { AiSession } from './ai-session.entity';

  @Module({
    imports: [TypeOrmModule.forFeature([DocChunk, AiSession])],
    providers: [ChunkingService, EmbeddingService],
    exports: [ChunkingService, EmbeddingService, TypeOrmModule],
  })
  export class EmbeddingModule {}
  ```
- **GOTCHA**: Export `TypeOrmModule` so that importing modules can inject `DocChunk` and `AiSession` repositories.
- **VALIDATE**: `cd backend && npm run typecheck`

---

### TASK 10 — UPDATE `backend/src/docs/docs.module.ts`

- **ADD** `EmbeddingModule` to the `imports` array:
  ```typescript
  import { EmbeddingModule } from '../ai/embedding.module';
  // ...
  @Module({
    imports: [
      TypeOrmModule.forFeature([Doc, DocService, DocEntity, Service, CatalogEntity]),
      StorageModule,
      DocumentProcessingModule,
      EmbeddingModule,  // ← add this
    ],
    // ...
  })
  ```
- **VALIDATE**: `cd backend && npm run typecheck`

---

### TASK 11 — UPDATE `backend/src/docs/docs.service.ts`

#### Transaction and error handling design

S3 and Postgres cannot share a transaction. The correct layering is:

```
create():
  1. S3 putObject                             ← if this fails: clean, nothing in DB
  2. DB transaction {                         ← atomic: doc save + attachments together
       docsRepo.save(doc)
       syncAttachments(id, attachmentIds)
     }
  3. If transaction throws → S3 deleteObject  ← compensating action for S3 orphan
  4. After commit → try { insertChunks() }    ← best-effort; never fails the upload
                    catch { logger.error }

replaceFile():
  1. S3 putObject (new file)                  ← if this fails: clean, old file/chunks intact
  2. DB transaction {                         ← atomic: update doc + clear stale chunks
       docsRepo.save(doc)
       DELETE doc_chunks WHERE doc_id         ← inside tx: stale chunks gone only if doc update commits
     }
  3. If transaction throws → S3 deleteObject(newStorageKey)  ← compensating
  4. After commit → try { insertChunks() }    ← best-effort
                    catch { logger.error }
  5. After commit → try { S3 deleteObject(oldStorageKey) }   ← best-effort
                    catch { logger.error }
```

**Key rules:**
- Embedding calls an external API — **never** hold a DB transaction open across it
- `DELETE doc_chunks` goes inside the transaction for `replaceFile` so stale chunks are removed atomically with the doc update. If the tx rolls back, old chunks are preserved.
- Embedding failure must never fail the upload. Doc is saved; it's just not searchable via AI until a reindex.

#### Implementation

- **ADD** imports:
  ```typescript
  import { DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
  import { InjectDataSource } from '@nestjs/typeorm';
  import { ChunkingService } from '../ai/chunking.service';
  import { EmbeddingService } from '../ai/embedding.service';
  ```
  (`randomUUID` is already imported)

- **ADD** to constructor (after existing injects):
  ```typescript
  @InjectDataSource()
  private readonly dataSource: DataSource,
  private readonly chunkingService: ChunkingService,
  private readonly embeddingService: EmbeddingService,
  ```

- **ADD** private method `insertChunks()` — only responsible for embed + insert, never deletes:
  ```typescript
  private async insertChunks(
    docId: string,
    extractedText: string,
    fileExtension: 'md' | 'pdf' | 'docx',
  ): Promise<void> {
    const chunks = await this.chunkingService.chunkText(extractedText, fileExtension);
    if (!chunks.length) return;

    const embeddings = await this.embeddingService.embed(chunks);
    if (!embeddings.length) return;

    const values: unknown[] = [];
    const placeholders = chunks.map((chunk, i) => {
      const base = i * 5;
      const id = randomUUID();
      values.push(id, docId, i, chunk, embeddings[i]?.length ? embeddings[i] : null);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::vector)`;
    });

    await this.dataSource.query(
      `INSERT INTO doc_chunks (id, doc_id, chunk_index, content, embedding) VALUES ${placeholders.join(', ')}`,
      values,
    );
  }
  ```

- **REPLACE** `create()` body with transaction + compensating S3 delete + best-effort embedding:
  ```typescript
  async create(dto: CreateDocDto, file?: DocUploadFile): Promise<Doc> {
    if (!file) throw new BadRequestException('File upload is required');
    this.validateUploadedFile(file);

    const id = randomUUID();
    const normalizedFileName = this.normalizeUploadedFileName(file.originalname);
    const processed = await this.documentProcessingService.processFile(
      normalizedFileName, file.mimetype, file.buffer,
    );
    const attachmentIds = this.normalizeAttachments(dto);
    await this.ensureAttachmentsExist(attachmentIds);

    const storageKey = this.buildStorageKey(id, processed.fileExtension);

    // Step 1: S3 upload — if this fails, nothing in DB yet
    await this.storageService.putObject({ key: storageKey, body: file.buffer, contentType: processed.mimeType });

    // Step 2: DB transaction — doc save + attachments atomically
    try {
      await this.dataSource.transaction(async (manager) => {
        const doc = manager.create(Doc, {
          id,
          title: dto.title?.trim() || this.deriveTitle(normalizedFileName),
          description: dto.description?.trim() || null,
          fileName: normalizedFileName,
          mimeType: processed.mimeType,
          fileExtension: processed.fileExtension,
          storageKey,
          fileSizeBytes: file.size,
          previewType: processed.previewType,
          previewHtml: processed.previewHtml,
          extractedText: processed.extractedText,
        });
        await manager.save(doc);
        await this.syncAttachmentsWithManager(manager, id, attachmentIds);
      });
    } catch (dbError) {
      // Step 3: compensate — remove the S3 file we just uploaded
      await this.storageService.deleteObject(storageKey).catch((e) =>
        this.logger.error(`Failed to clean up S3 object ${storageKey} after DB error`, e),
      );
      throw dbError;
    }

    // Step 4: best-effort embedding — never fails the upload
    await this.insertChunks(id, processed.extractedText, processed.fileExtension).catch((e) =>
      this.logger.error(`Embedding failed for doc ${id} — doc saved without chunks`, e),
    );

    return this.findOne(id);
  }
  ```

- **REPLACE** `replaceFile()` body:
  ```typescript
  async replaceFile(id: string, file?: DocUploadFile): Promise<Doc> {
    if (!file) throw new BadRequestException('Replacement file is required');
    this.validateUploadedFile(file);

    const doc = await this.findOne(id);
    const normalizedFileName = this.normalizeUploadedFileName(file.originalname);
    const processed = await this.documentProcessingService.processFile(
      normalizedFileName, file.mimetype, file.buffer,
    );
    const previousStorageKey = doc.storageKey;
    const newStorageKey = this.buildStorageKey(id, processed.fileExtension);

    // Step 1: S3 upload new file — if this fails, old file and chunks are intact
    await this.storageService.putObject({ key: newStorageKey, body: file.buffer, contentType: processed.mimeType });

    // Step 2: DB transaction — update doc metadata + delete stale chunks atomically
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(Doc, id, {
          fileName: normalizedFileName,
          mimeType: processed.mimeType,
          fileExtension: processed.fileExtension,
          storageKey: newStorageKey,
          fileSizeBytes: file.size,
          previewType: processed.previewType,
          previewHtml: processed.previewHtml,
          extractedText: processed.extractedText,
        });
        // Delete stale chunks inside transaction — if tx rolls back, old chunks are preserved
        await manager.query(`DELETE FROM doc_chunks WHERE doc_id = $1`, [id]);
      });
    } catch (dbError) {
      // Step 3: compensate — remove the new S3 file we just uploaded
      await this.storageService.deleteObject(newStorageKey).catch((e) =>
        this.logger.error(`Failed to clean up S3 object ${newStorageKey} after DB error`, e),
      );
      throw dbError;
    }

    // Step 4: best-effort insert new chunks
    await this.insertChunks(id, processed.extractedText, processed.fileExtension).catch((e) =>
      this.logger.error(`Embedding failed for doc ${id} — doc updated without chunks`, e),
    );

    // Step 5: best-effort delete old S3 file (after everything else succeeded)
    if (previousStorageKey !== newStorageKey) {
      await this.storageService.deleteObject(previousStorageKey).catch((e) =>
        this.logger.error(`Failed to delete old S3 object ${previousStorageKey}`, e),
      );
    }

    return this.findOne(id);
  }
  ```

- **ADD** private helper `syncAttachmentsWithManager()` — same logic as `syncAttachments()` but uses the transactional `EntityManager` instead of bare repos:
  ```typescript
  private async syncAttachmentsWithManager(
    manager: import('typeorm').EntityManager,
    docId: string,
    attachmentIds: AttachmentIds,
  ): Promise<void> {
    await manager.delete(DocService, { docId });
    await manager.delete(DocEntity, { docId });

    if (attachmentIds.serviceIds.length) {
      await manager.save(DocService, attachmentIds.serviceIds.map((serviceId) =>
        manager.create(DocService, { docId, serviceId }),
      ));
    }
    if (attachmentIds.entityIds.length) {
      await manager.save(DocEntity, attachmentIds.entityIds.map((entityId) =>
        manager.create(DocEntity, { docId, entityId }),
      ));
    }
  }
  ```

- **ADD** `Logger` to class:
  ```typescript
  private readonly logger = new Logger(DocsService.name);
  ```
  Import: `import { ..., Logger } from '@nestjs/common';`

- **GOTCHA**: `$${base + 5}::vector` cast is required — TypeORM raw query sends `number[]` as a JSON array string; Postgres needs an explicit cast to `vector`.
- **GOTCHA**: `embeddings[i]` may be `[]` when AI vars are absent — store `null` rather than an invalid zero-length vector.
- **GOTCHA**: `syncAttachments()` (the original, using bare repos) is now only called from `update()`. Do not remove it — `update()` doesn't need a transaction since it only touches metadata and attachments with no S3 involvement and no compensating actions needed.
- **VALIDATE**: `cd backend && npm run typecheck && npm run start:dev` — upload a doc, confirm no crash, confirm `doc_chunks` has rows

---

### TASK 12 — UPDATE `backend/src/docs/reindex-docs.ts`

- **ADD** imports at the top (after existing ones):
  ```typescript
  import { ChunkingService } from '../ai/chunking.service';
  import { EmbeddingService } from '../ai/embedding.service';
  ```
- **UPDATE** `createConfigService()` to also pass AI vars:
  ```typescript
  function createConfigService() {
    return new ConfigService({
      // existing S3 keys...
      AI_BASE_URL: process.env.AI_BASE_URL,
      AI_API_KEY: process.env.AI_API_KEY,
      AI_EMBEDDING_MODEL: process.env.AI_EMBEDDING_MODEL,
    });
  }
  ```
- **UPDATE** `run()` to instantiate services and re-embed:
  ```typescript
  const chunkingService = new ChunkingService();
  const embeddingService = new EmbeddingService(configService);
  ```
- **ADD** re-embed logic inside the `for...of` loop after `await docsRepo.save(doc)`:
  ```typescript
  // Re-embed chunks
  if (doc.extractedText) {
    const chunks = await chunkingService.chunkText(doc.extractedText, processed.fileExtension);
    const embeddings = await embeddingService.embed(chunks);
    await ds.query(`DELETE FROM doc_chunks WHERE doc_id = $1`, [doc.id]);
    if (chunks.length && embeddings.length) {
      const values: unknown[] = [];
      const placeholders = chunks.map((chunk, i) => {
        const base = i * 5;
        const id = randomUUID();
        values.push(id, doc.id, i, chunk, embeddings[i]?.length ? embeddings[i] : null);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::vector)`;
      });
      await ds.query(
        `INSERT INTO doc_chunks (id, doc_id, chunk_index, content, embedding) VALUES ${placeholders.join(', ')}`,
        values,
      );
    }
  }
  console.log(`Reindexed + embedded doc ${doc.id}: ${doc.title}`);
  ```
- **ADD** `import { randomUUID } from 'crypto'` to the import block if not already present
- **PATTERN**: mirrors existing `for...of` loop style in the file
- **VALIDATE**: `cd backend && npm run docs:reindex` — confirm it runs without crashing (even if AI not configured, it should complete with a warning)

---

## TESTING STRATEGY

### Manual Validation

1. Upload a `.md` doc → query `SELECT count(*) FROM doc_chunks WHERE doc_id = '<id>'` — should be > 0
2. Upload a `.pdf` doc → same check
3. Replace a file → chunks for old version are gone, new chunks exist
4. Delete a doc → `SELECT count(*) FROM doc_chunks WHERE doc_id = '<id>'` → 0 (CASCADE)
5. Run `npm run docs:reindex` with AI vars set → all existing docs get chunks

### Edge Cases

- Empty `extractedText` (e.g. scanned PDF with no text) → `chunkText()` returns `[]` → `indexDocChunks()` returns early → no crash
- AI env vars absent → `EmbeddingService.embed()` returns `[][]` and logs a warning → chunks are stored with `null` embedding → no crash
- Very large doc → chunking produces many chunks → bulk INSERT with many placeholders — test with a 50-page PDF

---

## VALIDATION COMMANDS

### Level 1: Type check
```bash
cd backend && npm run typecheck
```

### Level 2: Start dev server
```bash
cd backend && npm run start:dev
```
Confirm no startup errors.

### Level 3: Migration
```bash
cd backend && npm run migration:run
```
Confirm `1714700000000-AddAiFoundation` runs cleanly.

### Level 4: Manual upload test
```bash
# Upload a test doc and inspect chunks
curl -X POST http://localhost:3000/docs \
  -F "file=@/path/to/test.md" \
  -F "title=Test Doc"

# Then in psql:
# SELECT chunk_index, left(content, 80) FROM doc_chunks ORDER BY chunk_index;
```

### Level 5: Reindex script
```bash
cd backend && npm run docs:reindex
```

---

## ACCEPTANCE CRITERIA

- [ ] Migration runs cleanly: `pgvector` extension enabled, `doc_chunks` and `ai_sessions` tables created
- [ ] Uploading a `.md` doc creates rows in `doc_chunks`
- [ ] Uploading a `.pdf` or `.docx` doc creates rows in `doc_chunks`
- [ ] Replacing a file deletes old chunks and inserts new ones
- [ ] Deleting a doc cascades to remove all its chunks
- [ ] `npm run docs:reindex` processes all existing docs without crashing
- [ ] App starts and upload endpoints work normally when AI env vars are absent (graceful degradation)
- [ ] `npm run typecheck` passes with zero errors

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] `npm install` succeeds with new packages
- [ ] `npm run typecheck` passes
- [ ] Migration runs without error
- [ ] Dev server starts without error
- [ ] Doc upload creates chunks in DB
- [ ] File replace deletes and recreates chunks
- [ ] Reindex script runs successfully
- [ ] Acceptance criteria all met

---

## NOTES

### Transaction and consistency model

Three failure scenarios and their outcomes:

| Failure point | S3 state | DB state | Chunks | Outcome |
|---|---|---|---|---|
| S3 putObject fails | nothing uploaded | untouched | untouched | clean error ✅ |
| DB transaction fails after S3 | new file uploaded (orphan) | untouched | untouched | compensating `deleteObject` removes orphan ✅ |
| Embedding fails after DB commit | new file in place | doc saved ✅ | null (no chunks) | logged, upload succeeds — degraded AI only ✅ |

For `replaceFile` specifically:
- `DELETE doc_chunks` lives **inside** the DB transaction. If the transaction rolls back (e.g. the `manager.update` fails), the old chunks are preserved. If it commits, stale chunks are gone atomically with the doc update.
- Old S3 file is deleted **last**, after everything else succeeds. If that delete fails it leaks a file but the user data is correct. Acceptable trade-off.

### Why embedding is best-effort

Embedding calls an external API. Two reasons it must be outside the transaction:
1. **Performance**: holding a Postgres transaction open during an HTTP call blocks connections unnecessarily.
2. **Correctness**: the embedding API is not part of the atomicity guarantee. A doc without chunks is a degraded but valid state — it still has FTS (`search_vector`), preview, and download. Only AI semantic search is affected.

### Why `EmbeddingModule` not `AiModule`

Phase 6B's `AiModule` will need to inject `DocsService` (for the `search_docs` tool). If `DocsModule` imported `AiModule` and `AiModule` imported `DocsModule`, that would be a circular dependency. The solution is a separate `EmbeddingModule` that has no dependency on `DocsModule`. Both `DocsModule` (6A) and `AiModule` (6B) import `EmbeddingModule`.

### Why raw SQL for chunk insert

TypeORM's `save()` with an array entity is fine for small sets but pgvector's `vector` type requires a `::vector` cast that TypeORM's query builder cannot emit. Raw `dataSource.query()` with explicit `$N::vector` placeholders is the correct and most readable approach here.

### Graceful degradation when AI is unconfigured

The app must not break if `AI_BASE_URL` / `AI_API_KEY` / `AI_EMBEDDING_MODEL` are absent. `EmbeddingService.embed()` returns `[]` arrays and logs a warning. Chunks are stored with `null` embedding. FTS (`search_vector`) still works. The only degraded behaviour is that semantic search in Phase 6B will return no results for that doc.

### ivfflat index and empty table

The ivfflat index is created in the migration but will be effectively empty until data is inserted. This is normal — Postgres will build it as rows are added. No special handling needed.
