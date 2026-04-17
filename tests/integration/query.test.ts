import 'reflect-metadata';
import { createClient, Client } from '../../src/index';
import type { LLMAdapter } from '../../src/llm';
import { Client as PgClient } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

function resolveMockTitle(prompt: string): string {
  const markerMatch = prompt.match(/\b([A-Za-z]+)Marker\b/);
  return markerMatch?.[1] ?? 'TypeScript';
}

const mockLlm: LLMAdapter = {
  async complete(prompt: string): Promise<string> {
    const title = resolveMockTitle(prompt);
    const isUpdated = prompt.includes('Updated details');
    const content =
      title === 'TypeScript'
        ? isUpdated
          ? 'TypeScript is a typed superset of JavaScript. Updated details.'
          : 'TypeScript is a typed superset of JavaScript.'
        : isUpdated
          ? `${title} page content. Updated details.`
          : `${title} page content.`;
    const claimText =
      title === 'TypeScript'
        ? 'TypeScript adds static types to JavaScript.'
        : `${title} page claim.`;

    return JSON.stringify({
      pages: [
        {
          title,
          type: 'concept',
          content,
          changeSummary: isUpdated ? 'Updated summary' : 'Initial version',
          claims: [
            {
              text: claimText,
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

  it('listPages returns page summaries', async () => {
    if (!DATABASE_URL) {
      return;
    }

    await client.ingestSource({
      content: 'TypeScript is a typed superset of JavaScript.',
      type: 'text',
    });

    const pages = await client.listPages({});

    expect(Array.isArray(pages)).toBe(true);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      id: expect.any(String),
      title: 'TypeScript',
      type: 'concept',
      status: 'published',
      metadata: {},
    });
  });

  it('listPages applies exact metadata filters', async () => {
    if (!DATABASE_URL) {
      return;
    }

    const billing = await client.ingestSource({
      content: 'BillingMarker content for billing workflows.',
      type: 'text',
    });
    const support = await client.ingestSource({
      content: 'SupportMarker content for support workflows.',
      type: 'text',
    });

    await updatePageMetadata(client, billing.pages[0].id, { project: 'billing' });
    await updatePageMetadata(client, support.pages[0].id, { project: 'support' });

    const pages = await client.listPages({
      filters: { project: 'billing' },
    });

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      id: billing.pages[0].id,
      title: 'Billing',
      metadata: { project: 'billing' },
    });
  });

  it('listPages applies $in and $nin metadata filters', async () => {
    if (!DATABASE_URL) {
      return;
    }

    const billing = await client.ingestSource({
      content: 'BillingMarker content for billing workflows.',
      type: 'text',
    });
    const support = await client.ingestSource({
      content: 'SupportMarker content for support workflows.',
      type: 'text',
    });
    const internal = await client.ingestSource({
      content: 'InternalMarker content for internal workflows.',
      type: 'text',
    });

    await updatePageMetadata(client, billing.pages[0].id, { project: 'billing' });
    await updatePageMetadata(client, support.pages[0].id, { project: 'support' });
    await updatePageMetadata(client, internal.pages[0].id, { project: 'internal' });

    const includedPages = await client.listPages({
      filters: { project: { $in: ['billing', 'support'] } },
    });
    const excludedPages = await client.listPages({
      filters: { project: { $nin: ['internal'] } },
    });
    const emptyInPages = await client.listPages({
      filters: { project: { $in: [] } },
    });
    const emptyNinPages = await client.listPages({
      filters: { project: { $nin: [] } },
    });

    expect(includedPages.map((page) => page.title)).toEqual(['Billing', 'Support']);
    expect(excludedPages.map((page) => page.title)).toEqual(['Billing', 'Support']);
    expect(emptyInPages).toEqual([]);
    expect(emptyNinPages.map((page) => page.title)).toEqual([
      'Billing',
      'Internal',
      'Support',
    ]);
  });

  it('listPages treats null filters as missing key or explicit null', async () => {
    if (!DATABASE_URL) {
      return;
    }

    const explicitNull = await client.ingestSource({
      content: 'NullMarker content for explicit null metadata.',
      type: 'text',
    });
    const missing = await client.ingestSource({
      content: 'MissingMarker content for missing metadata.',
      type: 'text',
    });
    const billing = await client.ingestSource({
      content: 'BillingMarker content for billing workflows.',
      type: 'text',
    });

    await updatePageMetadata(client, explicitNull.pages[0].id, { project: null });
    await updatePageMetadata(client, missing.pages[0].id, {});
    await updatePageMetadata(client, billing.pages[0].id, { project: 'billing' });

    const pages = await client.listPages({
      filters: { project: null },
    });

    expect(pages.map((page) => page.title)).toEqual(['Missing', 'Null']);
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

  it('listPages enforces tenant scope', async () => {
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
      await tenantClient.ingestSource({
        content: 'TenantAMarker content for tenant A.',
        type: 'text',
        tenant: { workspaceId: 'a' },
      });
      await tenantClient.ingestSource({
        content: 'TenantBMarker content for tenant B.',
        type: 'text',
        tenant: { workspaceId: 'b' },
      });

      const tenantAPages = await tenantClient.listPages({
        tenant: { workspaceId: 'a' },
      });

      expect(tenantAPages.map((page) => page.title)).toEqual(['TenantA']);
    } finally {
      await tenantClient.dataSource.destroy();
    }
  });

  it('listPages applies deterministic pagination and validates inputs', async () => {
    if (!DATABASE_URL) {
      return;
    }

    await client.ingestSource({
      content: 'AlphaMarker content for ordering.',
      type: 'text',
    });
    await client.ingestSource({
      content: 'BravoMarker content for ordering.',
      type: 'text',
    });
    await client.ingestSource({
      content: 'CharlieMarker content for ordering.',
      type: 'text',
    });

    const firstPage = await client.listPages({ limit: 2, offset: 0 });
    const secondPage = await client.listPages({ limit: 2, offset: 2 });

    expect(firstPage.map((page) => page.title)).toEqual(['Alpha', 'Bravo']);
    expect(secondPage.map((page) => page.title)).toEqual(['Charlie']);

    await expect(client.listPages({ limit: 0 })).rejects.toThrow(
      'Invalid pagination options'
    );
    await expect(client.listPages({ offset: -1 })).rejects.toThrow(
      'Invalid pagination options'
    );
    await expect(
      client.listPages({ limit: 1.5 } as { limit: number })
    ).rejects.toThrow('Invalid pagination options');
  });

  it('query returns matched pages and evidence', async () => {
    if (!DATABASE_URL) {
      return;
    }

    const ingested = await client.ingestSource({
      content: 'TypeScript is a typed superset of JavaScript. It adds static types to JS.',
      type: 'text',
    });

    const result = await client.query('typed superset', {});

    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    expect(result.pages[0]).toMatchObject({
      id: ingested.pages[0].id,
      title: 'TypeScript',
      excerpt: expect.stringContaining('typed superset'),
    });
    expect(result.evidence.length).toBeGreaterThanOrEqual(1);
    expect(result.evidence[0].sourceId).toBe(ingested.sourceId);
  });

  it('query defaults to pages-only mode', async () => {
    if (!DATABASE_URL) {
      return;
    }

    await client.ingestSource({
      content: 'TypeScript is a typed superset of JavaScript.',
      type: 'text',
    });

    const defaultResult = await client.query('typescript', {});
    const explicitResult = await client.query('typescript', { mode: 'pages-only' });

    expect(defaultResult.pages.map((page) => page.id)).toEqual(
      explicitResult.pages.map((page) => page.id)
    );
    expect(defaultResult).not.toHaveProperty('answer');
    expect(explicitResult).not.toHaveProperty('answer');
  });

  it('query applies metadata filters', async () => {
    if (!DATABASE_URL) {
      return;
    }

    const billing = await client.ingestSource({
      content: 'BillingMarker shared content for query filtering.',
      type: 'text',
    });
    const support = await client.ingestSource({
      content: 'SupportMarker shared content for query filtering.',
      type: 'text',
    });

    await updatePageMetadata(client, billing.pages[0].id, { project: 'billing' });
    await updatePageMetadata(client, support.pages[0].id, { project: 'support' });

    const result = await client.query('content', {
      filters: { project: 'billing' },
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({
      id: billing.pages[0].id,
      title: 'Billing',
    });
    expect(result.evidence.every((row) => row.sourceId === billing.sourceId)).toBe(true);
  });

  it('query enforces tenant scope', async () => {
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
      await tenantClient.ingestSource({
        content: 'TenantAMarker content for tenant scoped query checks.',
        type: 'text',
        tenant: { workspaceId: 'a' },
      });
      await tenantClient.ingestSource({
        content: 'TenantBMarker content for tenant scoped query checks.',
        type: 'text',
        tenant: { workspaceId: 'b' },
      });

      const result = await tenantClient.query('content', {
        tenant: { workspaceId: 'a' },
      });

      expect(result.pages.map((page) => page.title)).toEqual(['TenantA']);
    } finally {
      await tenantClient.dataSource.destroy();
    }
  });

  it('query returns empty arrays for no matches and rejects blank input', async () => {
    if (!DATABASE_URL) {
      return;
    }

    await client.ingestSource({
      content: 'TypeScript is a typed superset of JavaScript.',
      type: 'text',
    });

    await expect(client.query('   ', {})).rejects.toThrow('Invalid query text');

    await expect(client.query('definitely-not-present', {})).resolves.toEqual({
      pages: [],
      evidence: [],
    });
  });

  it('query rejects unsupported synthesize mode', async () => {
    if (!DATABASE_URL) {
      return;
    }

    await client.ingestSource({
      content: 'TypeScript is a typed superset of JavaScript.',
      type: 'text',
    });

    await expect(
      client.query('typescript', { mode: 'synthesize' })
    ).rejects.toThrow('synthesize mode not implemented');
  });
});

async function updatePageMetadata(
  client: Client,
  pageId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await client.dataSource.query(
    'UPDATE pgwiki_wiki_pages SET metadata = $2::jsonb WHERE id = $1',
    [pageId, JSON.stringify(metadata)]
  );
}

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
