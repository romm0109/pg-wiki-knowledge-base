import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pgwiki_sources" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "content" text NOT NULL,
        "type" varchar NOT NULL,
        "tenant" jsonb,
        "metadata" jsonb DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pgwiki_sources" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "pgwiki_source_fragments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "text" text NOT NULL,
        "char_offset_start" int NOT NULL,
        "char_offset_end" int NOT NULL,
        "metadata" jsonb DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "source_id" uuid,
        CONSTRAINT "PK_pgwiki_source_fragments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pgwiki_source_fragments_source" FOREIGN KEY ("source_id")
          REFERENCES "pgwiki_sources"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "pgwiki_wiki_pages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" varchar NOT NULL,
        "content" text NOT NULL,
        "type" varchar NOT NULL,
        "status" varchar NOT NULL,
        "tenant" jsonb,
        "metadata" jsonb DEFAULT '{}',
        "current_version_id" uuid,
        "search_vector" tsvector,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pgwiki_wiki_pages" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "pgwiki_wiki_page_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "content" text NOT NULL,
        "change_summary" varchar,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "page_id" uuid,
        CONSTRAINT "PK_pgwiki_wiki_page_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pgwiki_wiki_page_versions_page" FOREIGN KEY ("page_id")
          REFERENCES "pgwiki_wiki_pages"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "pgwiki_wiki_links" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "type" varchar NOT NULL,
        "metadata" jsonb DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "from_page_id" uuid,
        "to_page_id" uuid,
        CONSTRAINT "PK_pgwiki_wiki_links" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pgwiki_wiki_links_from_page" FOREIGN KEY ("from_page_id")
          REFERENCES "pgwiki_wiki_pages"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pgwiki_wiki_links_to_page" FOREIGN KEY ("to_page_id")
          REFERENCES "pgwiki_wiki_pages"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "pgwiki_wiki_claims" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "text" text NOT NULL,
        "status" varchar NOT NULL,
        "metadata" jsonb DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "page_id" uuid,
        CONSTRAINT "PK_pgwiki_wiki_claims" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pgwiki_wiki_claims_page" FOREIGN KEY ("page_id")
          REFERENCES "pgwiki_wiki_pages"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "pgwiki_claim_evidence" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "claim_id" uuid,
        "fragment_id" uuid,
        CONSTRAINT "PK_pgwiki_claim_evidence" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pgwiki_claim_evidence_claim" FOREIGN KEY ("claim_id")
          REFERENCES "pgwiki_wiki_claims"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pgwiki_claim_evidence_fragment" FOREIGN KEY ("fragment_id")
          REFERENCES "pgwiki_source_fragments"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "pgwiki_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "type" varchar NOT NULL,
        "status" varchar NOT NULL,
        "error_message" text,
        "tenant" jsonb,
        "metadata" jsonb DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pgwiki_jobs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "pgwiki_job_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "type" varchar NOT NULL,
        "data" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "job_id" uuid,
        CONSTRAINT "PK_pgwiki_job_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pgwiki_job_events_job" FOREIGN KEY ("job_id")
          REFERENCES "pgwiki_jobs"("id") ON DELETE CASCADE
      )
    `);

    // GIN indexes on metadata JSONB columns
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_sources_metadata" ON "pgwiki_sources" USING GIN ("metadata")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_source_fragments_metadata" ON "pgwiki_source_fragments" USING GIN ("metadata")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_wiki_pages_metadata" ON "pgwiki_wiki_pages" USING GIN ("metadata")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_wiki_claims_metadata" ON "pgwiki_wiki_claims" USING GIN ("metadata")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_wiki_links_metadata" ON "pgwiki_wiki_links" USING GIN ("metadata")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_jobs_metadata" ON "pgwiki_jobs" USING GIN ("metadata")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_job_events_data" ON "pgwiki_job_events" USING GIN ("data") WHERE "data" IS NOT NULL`);

    // Full-text search GIN index on wiki_pages.search_vector
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_wiki_pages_search" ON "pgwiki_wiki_pages" USING GIN ("search_vector")`);

    // B-tree indexes on FK columns
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_source_fragments_source_id" ON "pgwiki_source_fragments" ("source_id")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_wiki_page_versions_page_id" ON "pgwiki_wiki_page_versions" ("page_id")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_wiki_links_from_page_id" ON "pgwiki_wiki_links" ("from_page_id")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_wiki_links_to_page_id" ON "pgwiki_wiki_links" ("to_page_id")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_wiki_claims_page_id" ON "pgwiki_wiki_claims" ("page_id")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_claim_evidence_claim_id" ON "pgwiki_claim_evidence" ("claim_id")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_claim_evidence_fragment_id" ON "pgwiki_claim_evidence" ("fragment_id")`);
    await queryRunner.query(`CREATE INDEX "idx_pgwiki_job_events_job_id" ON "pgwiki_job_events" ("job_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pgwiki_job_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pgwiki_jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pgwiki_claim_evidence"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pgwiki_wiki_claims"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pgwiki_wiki_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pgwiki_wiki_page_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pgwiki_wiki_pages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pgwiki_source_fragments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pgwiki_sources"`);
  }
}
