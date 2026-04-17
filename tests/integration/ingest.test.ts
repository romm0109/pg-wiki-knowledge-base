import 'reflect-metadata';
import { createClient, Client } from '../../src/index';
import type { LLMAdapter } from '../../src/llm';
import { Client as PgClient } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

const successLlm: LLMAdapter = {
  async complete(prompt: string): Promise<string> {
    if (prompt.includes('NoPageMarker')) {
      return JSON.stringify({ pages: [] });
    }

    if (prompt.includes('INVALID_JSON')) {
      return '{invalid';
    }

    if (prompt.includes('Updated details')) {
      return JSON.stringify({
        pages: [
          {
            title: 'TypeScript',
            type: 'concept',
            content: 'TypeScript is a typed superset of JavaScript. Updated details.',
            changeSummary: 'Updated summary',
            claims: [
              {
                text: 'TypeScript adds static types to JavaScript.',
                status: 'verified',
              },
            ],
            links: [],
          },
        ],
      });
    }

    return JSON.stringify({
      pages: [
        {
          title: 'TypeScript',
          type: 'concept',
          content: 'TypeScript is a typed superset of JavaScript.',
          changeSummary: 'Initial version',
          claims: [
            {
              text: 'TypeScript adds static types to JavaScript.',
              status: 'verified',
            },
          ],
          links: [],
        },
      ],
    });
  },
};

const failingLlm: LLMAdapter = {
  async complete(): Promise<string> {
    throw new Error('LLM down');
  },
};

describe('ingest integration', () => {
  let client: Client;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      return;
    }

    await dropExistingTables(DATABASE_URL);
    client = await createClient({ connectionString: DATABASE_URL, llm: successLlm });
  });

  afterAll(async () => {
    if (!client) {
      return;
    }

    const queryRunner = client.dataSource.createQueryRunner();
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
        await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      }
    } finally {
      await queryRunner.release();
      await client.dataSource.destroy();
    }
  });

  beforeEach(async () => {
    if (!DATABASE_URL || !client) {
      return;
    }

    await clearPgwikiTables(client);
  });

  it('skips if DATABASE_URL is not set', () => {
    if (!DATABASE_URL) {
      console.warn('Skipping integration tests: DATABASE_URL not set');
      return;
    }

    expect(true).toBe(true);
  });

  it('ingestSource creates source, fragments, wiki page, and job', async () => {
    if (!DATABASE_URL) {
      return;
    }

    const result = await client.ingestSource({
      content: 'TypeScript is a typed superset of JavaScript. It adds static types to JS.',
      type: 'text',
      metadata: { source: 'test' },
    });

    expect(result.sourceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    expect(result.pages[0].action).toBe('created');

    const sources = await client.dataSource.query<
      { id: string; content: string; type: string }[]
    >('SELECT id, content, type FROM pgwiki_sources WHERE id = $1', [result.sourceId]);
    expect(sources).toHaveLength(1);
    expect(sources[0].content).toContain('TypeScript');
    expect(sources[0].type).toBe('text');

    const fragments = await client.dataSource.query<{ id: string }[]>(
      'SELECT id FROM pgwiki_source_fragments WHERE source_id = $1',
      [result.sourceId]
    );
    expect(fragments.length).toBeGreaterThanOrEqual(1);

    const pages = await client.dataSource.query<{ status: string; search_vector: string }[]>(
      'SELECT status, search_vector::text AS search_vector FROM pgwiki_wiki_pages WHERE id = $1',
      [result.pages[0].id]
    );
    expect(pages).toHaveLength(1);
    expect(pages[0].status).toBe('published');
    expect(pages[0].search_vector).toContain('typescript');

    const versions = await client.dataSource.query<{ id: string }[]>(
      'SELECT id FROM pgwiki_wiki_page_versions WHERE page_id = $1',
      [result.pages[0].id]
    );
    expect(versions.length).toBeGreaterThanOrEqual(1);

    const jobs = await client.dataSource.query<{ id: string }[]>(
      "SELECT id FROM pgwiki_jobs WHERE type = 'ingest' AND status = 'succeeded'"
    );
    expect(jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('ingestSource updates existing page on second ingest', async () => {
    if (!DATABASE_URL) {
      return;
    }

    await client.ingestSource({
      content: 'TypeScript is a typed superset of JavaScript.',
      type: 'text',
    });

    const second = await client.ingestSource({
      content: 'TypeScript is a typed superset of JavaScript. Updated details.',
      type: 'text',
    });

    expect(second.pages).toHaveLength(1);
    expect(second.pages[0].action).toBe('updated');

    const versions = await client.dataSource.query<{ id: string }[]>(
      'SELECT id FROM pgwiki_wiki_page_versions WHERE page_id = $1 ORDER BY created_at ASC',
      [second.pages[0].id]
    );
    expect(versions).toHaveLength(2);
  });

  it('ingestSource rolls back on LLM failure', async () => {
    if (!DATABASE_URL) {
      return;
    }

    const failingClient = await createClient({
      connectionString: DATABASE_URL,
      llm: failingLlm,
      migrations: { run: false },
    });

    try {
      await expect(
        failingClient.ingestSource({
          content: 'This should fail.',
          type: 'text',
        })
      ).rejects.toThrow('LLM down');

      const sources = await client.dataSource.query<{ id: string }[]>(
        "SELECT id FROM pgwiki_sources WHERE content = 'This should fail.'"
      );
      expect(sources).toHaveLength(0);

      const jobs = await client.dataSource.query<{ id: string }[]>(
        "SELECT id FROM pgwiki_jobs WHERE type = 'ingest' AND status = 'failed'"
      );
      expect(jobs.length).toBeGreaterThanOrEqual(1);
    } finally {
      await failingClient.dataSource.destroy();
    }
  });

  it('deleteSource removes source and marks orphaned pages stale', async () => {
    if (!DATABASE_URL) {
      return;
    }

    const ingested = await client.ingestSource({
      content: 'TypeScript is a typed superset of JavaScript.',
      type: 'text',
    });

    const deleted = await client.deleteSource(ingested.sourceId, {});

    expect(deleted.sourceId).toBe(ingested.sourceId);
    expect(deleted.pages.length).toBeGreaterThanOrEqual(1);
    expect(['updated', 'deleted']).toContain(deleted.pages[0].action);

    const sources = await client.dataSource.query<{ id: string }[]>(
      'SELECT id FROM pgwiki_sources WHERE id = $1',
      [ingested.sourceId]
    );
    expect(sources).toHaveLength(0);

    const fragments = await client.dataSource.query<{ id: string }[]>(
      'SELECT id FROM pgwiki_source_fragments WHERE source_id = $1',
      [ingested.sourceId]
    );
    expect(fragments).toHaveLength(0);

    const pages = await client.dataSource.query<{ status: string }[]>(
      'SELECT status FROM pgwiki_wiki_pages WHERE id = $1',
      [ingested.pages[0].id]
    );
    expect(pages).toHaveLength(1);
    expect(pages[0].status).toBe('stale');

    const jobs = await client.dataSource.query<{ id: string }[]>(
      "SELECT id FROM pgwiki_jobs WHERE type = 'delete' AND status = 'succeeded'"
    );
    expect(jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('ingestSource persists source with no pages when LLM returns empty response', async () => {
    if (!DATABASE_URL) {
      return;
    }

    const result = await client.ingestSource({
      content: 'NoPageMarker',
      type: 'text',
    });

    expect(result.pages).toHaveLength(0);

    const sources = await client.dataSource.query<{ id: string }[]>(
      'SELECT id FROM pgwiki_sources WHERE id = $1',
      [result.sourceId]
    );
    expect(sources).toHaveLength(1);
  });

  it('ingestSource rolls back on invalid JSON response', async () => {
    if (!DATABASE_URL) {
      return;
    }

    await expect(
      client.ingestSource({
        content: 'INVALID_JSON',
        type: 'text',
      })
    ).rejects.toThrow('LLM returned invalid JSON');

    const sources = await client.dataSource.query<{ id: string }[]>(
      "SELECT id FROM pgwiki_sources WHERE content = 'INVALID_JSON'"
    );
    expect(sources).toHaveLength(0);

    const jobs = await client.dataSource.query<{ id: string }[]>(
      "SELECT id FROM pgwiki_jobs WHERE type = 'ingest' AND status = 'failed'"
    );
    expect(jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('deleteSource throws when the source does not exist', async () => {
    if (!DATABASE_URL) {
      return;
    }

    await expect(
      client.deleteSource('00000000-0000-0000-0000-000000000000', {})
    ).rejects.toThrow('Source not found');
  });
});

async function clearPgwikiTables(client: Client): Promise<void> {
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
  ];

  for (const table of tables) {
    await client.dataSource.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
  }
}

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
