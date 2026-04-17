import 'reflect-metadata';
import { createClient, Client } from '../../src/index';
import type { LLMAdapter } from '../../src/llm';
import { Client as PgClient } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

const mockLlm: LLMAdapter = {
  async complete(): Promise<string> {
    return '{}';
  },
};

const PGWIKI_TABLES = [
  'pgwiki_sources',
  'pgwiki_source_fragments',
  'pgwiki_wiki_pages',
  'pgwiki_wiki_page_versions',
  'pgwiki_wiki_links',
  'pgwiki_wiki_claims',
  'pgwiki_claim_evidence',
  'pgwiki_jobs',
  'pgwiki_job_events',
];

describe('createClient integration', () => {
  let client: Client;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await dropExistingTables(DATABASE_URL);
    client = await createClient({ connectionString: DATABASE_URL, llm: mockLlm });
  });

  afterAll(async () => {
    if (!client) return;

    const queryRunner = client.dataSource.createQueryRunner();
    try {
      // Drop pgwiki_ tables in reverse dependency order
      const tables = [
        'pgwiki_job_events',
        'pgwiki_jobs',
        'pgwiki_claim_evidence',
        'pgwiki_wiki_claims',
        'pgwiki_wiki_links',
        'pgwiki_wiki_page_versions',
        'pgwiki_wiki_pages',
        'pgwiki_source_fragments',
        'pgwiki_sources',
        'typeorm_migrations',
      ];
      for (const table of tables) {
        await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      }
    } finally {
      await queryRunner.release();
      await client.dataSource.destroy();
    }
  });

  it('skips if DATABASE_URL is not set', () => {
    if (!DATABASE_URL) {
      console.warn('Skipping integration tests: DATABASE_URL not set');
      return;
    }
    expect(true).toBe(true);
  });

  it('creates a client successfully', () => {
    if (!DATABASE_URL) return;
    expect(client).toBeDefined();
    expect(client.dataSource.isInitialized).toBe(true);
  });

  it('defaults schema to public', () => {
    if (!DATABASE_URL) return;
    expect(client.schema).toBe('public');
  });

  it('creates all 9 pgwiki_ tables', async () => {
    if (!DATABASE_URL) return;

    const result = await client.dataSource.query<{ table_name: string }[]>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name LIKE 'pgwiki_%'
      ORDER BY table_name
    `, [client.schema]);

    const tableNames = result.map((r: { table_name: string }) => r.table_name);

    for (const expected of PGWIKI_TABLES) {
      expect(tableNames).toContain(expected);
    }
    expect(tableNames.length).toBe(PGWIKI_TABLES.length);
  });

  it('creates GIN indexes on metadata columns', async () => {
    if (!DATABASE_URL) return;

    const result = await client.dataSource.query<{ indexname: string }[]>(`
      SELECT indexname
      FROM pg_indexes
      WHERE indexname LIKE 'idx_pgwiki_%'
      ORDER BY indexname
    `);

    const indexNames = result.map((r: { indexname: string }) => r.indexname);

    const expectedGinIndexes = [
      'idx_pgwiki_sources_metadata',
      'idx_pgwiki_source_fragments_metadata',
      'idx_pgwiki_wiki_pages_metadata',
      'idx_pgwiki_wiki_claims_metadata',
      'idx_pgwiki_wiki_links_metadata',
      'idx_pgwiki_jobs_metadata',
      'idx_pgwiki_wiki_pages_search',
    ];

    for (const expected of expectedGinIndexes) {
      expect(indexNames).toContain(expected);
    }
  });

  it('does not fail when called twice (migrations are idempotent)', async () => {
    if (!DATABASE_URL) return;

    const client2 = await createClient({ connectionString: DATABASE_URL!, llm: mockLlm });
    expect(client2.dataSource.isInitialized).toBe(true);
    await client2.dataSource.destroy();
  });

  it('does not run migrations when migrations.run is false', async () => {
    if (!DATABASE_URL) return;

    // Tables already exist from the first client; this just tests no error is thrown
    const client3 = await createClient({
      connectionString: DATABASE_URL!,
      llm: mockLlm,
      migrations: { run: false },
    });
    expect(client3.dataSource.isInitialized).toBe(true);
    await client3.dataSource.destroy();
  });
});

async function dropExistingTables(connectionString: string): Promise<void> {
  const pg = new PgClient({ connectionString });
  await pg.connect();

  try {
    const tables = [
      'pgwiki_job_events',
      'pgwiki_jobs',
      'pgwiki_claim_evidence',
      'pgwiki_wiki_claims',
      'pgwiki_wiki_links',
      'pgwiki_wiki_page_versions',
      'pgwiki_wiki_pages',
      'pgwiki_source_fragments',
      'pgwiki_sources',
      'typeorm_migrations',
    ];

    for (const table of tables) {
      await pg.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
  } finally {
    await pg.end();
  }
}
