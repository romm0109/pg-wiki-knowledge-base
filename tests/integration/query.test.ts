import 'reflect-metadata';
import { createClient, Client } from '../../src/index';
import type { LLMAdapter } from '../../src/llm';
import { Client as PgClient } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

const mockLlm: LLMAdapter = {
  async complete(prompt: string): Promise<string> {
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

describe('query integration', () => {
  let client: Client;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      return;
    }

    await dropExistingTables(DATABASE_URL);
    client = await createClient({ connectionString: DATABASE_URL, llm: mockLlm });
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

  it('getPage returns full page detail', async () => {
    if (!DATABASE_URL) {
      return;
    }

    const ingested = await client.ingestSource({
      content: 'TypeScript is a typed superset of JavaScript. It adds static types to JS.',
      type: 'text',
    });

    const page = await client.getPage(ingested.pages[0].id, {});

    expect(page.id).toBe(ingested.pages[0].id);
    expect(page.title).toBe('TypeScript');
    expect(page.content).toContain('TypeScript');
    expect(page.versions.length).toBeGreaterThanOrEqual(1);
    expect(page.claims.length).toBeGreaterThanOrEqual(1);
    expect(page.evidence.length).toBeGreaterThanOrEqual(1);
    expect(page.evidence[0].fragmentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(page.evidence[0].text).toContain('TypeScript');
    expect(page.evidence[0].sourceId).toBe(ingested.sourceId);
  });

  it('getPage returns stable version history after second ingest', async () => {
    if (!DATABASE_URL) {
      return;
    }

    const first = await client.ingestSource({
      content: 'TypeScript is a typed superset of JavaScript.',
      type: 'text',
    });

    await client.ingestSource({
      content: 'TypeScript is a typed superset of JavaScript. Updated details.',
      type: 'text',
    });

    const page = await client.getPage(first.pages[0].id, {});

    expect(page.versions).toHaveLength(2);
    for (const version of page.versions) {
      expect(typeof version.changeSummary).toBe('string');
    }
  });

  it('getPage throws for missing page', async () => {
    if (!DATABASE_URL) {
      return;
    }

    await expect(
      client.getPage('00000000-0000-0000-0000-000000000000', {})
    ).rejects.toThrow('Page not found');
  });

  it('getPage enforces tenant scope', async () => {
    if (!DATABASE_URL) {
      return;
    }

    const tenantClient = await createClient<{ workspaceId: string }>({
      connectionString: DATABASE_URL,
      llm: mockLlm,
      tenant: { key: 'workspaceId' },
      migrations: { run: false },
    });

    try {
      const ingested = await tenantClient.ingestSource({
        content: 'TypeScript is a typed superset of JavaScript.',
        type: 'text',
        tenant: { workspaceId: 'a' },
      });

      const sameTenantPage = await tenantClient.getPage(ingested.pages[0].id, {
        tenant: { workspaceId: 'a' },
      });
      expect(sameTenantPage.id).toBe(ingested.pages[0].id);

      await expect(
        tenantClient.getPage(ingested.pages[0].id, {
          tenant: { workspaceId: 'b' },
        })
      ).rejects.toThrow('Page not found');
    } finally {
      await tenantClient.dataSource.destroy();
    }
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
