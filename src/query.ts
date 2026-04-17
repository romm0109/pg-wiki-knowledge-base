import { Brackets, DataSource, SelectQueryBuilder } from 'typeorm';
import {
  WikiPage,
  WikiPageVersion,
  WikiClaim,
  ClaimEvidence,
  SourceFragment,
  Source,
} from './entities';
import type {
  ClientConfig,
  MetadataFilters,
  PageDetail,
  PageSummary,
  QueryResult,
} from './types';

export interface QueryContext<TTenant extends Record<string, unknown> = never> {
  dataSource: DataSource;
  schema: string;
  config: ClientConfig<TTenant>;
}

type TenantOpts<TTenant extends Record<string, unknown>> = [TTenant] extends [never]
  ? {}
  : { tenant: TTenant };

type ListPagesOpts<TTenant extends Record<string, unknown>> =
  TenantOpts<TTenant> & {
    filters?: MetadataFilters;
    limit?: number;
    offset?: number;
  };

type QueryOpts<TTenant extends Record<string, unknown>> =
  TenantOpts<TTenant> & {
    filters?: MetadataFilters;
    mode?: 'pages-only' | 'synthesize';
  };

type TenantValue = Record<string, unknown> | null;

type QueryMode = 'pages-only' | 'synthesize';

type QueryPageRow = {
  id: string;
  title: string;
  content: string;
  rank: string;
};

type QueryEvidenceRow = {
  fragmentId: string;
  text: string;
  sourceId: string;
  charOffsetStart: string;
  pageId: string;
};

function resolveTenantValue<TTenant extends Record<string, unknown>>(
  config: ClientConfig<TTenant>,
  input: TenantOpts<TTenant>
): TenantValue {
  return config.tenant != null && 'tenant' in input
    ? ((input as { tenant: TTenant }).tenant as Record<string, unknown>)
    : null;
}

function applyPageTenantScope(
  queryBuilder: SelectQueryBuilder<WikiPage>,
  tenantValue: TenantValue
): SelectQueryBuilder<WikiPage> {
  if (tenantValue !== null) {
    return queryBuilder.andWhere('p.tenant @> :tenant::jsonb', {
      tenant: JSON.stringify(tenantValue),
    });
  }

  return queryBuilder.andWhere('p.tenant IS NULL');
}

function isInFilter(value: unknown): value is { $in: unknown[] } {
  return typeof value === 'object' && value !== null && '$in' in value;
}

function isNinFilter(value: unknown): value is { $nin: unknown[] } {
  return typeof value === 'object' && value !== null && '$nin' in value;
}

function applyMetadataFilters(
  queryBuilder: SelectQueryBuilder<WikiPage>,
  filters?: MetadataFilters
): SelectQueryBuilder<WikiPage> {
  if (!filters) {
    return queryBuilder;
  }

  const entries = Object.entries(filters);
  for (const [index, [key, value]] of entries.entries()) {
    if (value === null) {
      const metadataKeyParam = `metadataKey${index}`;
      const metadataNullParam = `metadataNull${index}`;

      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where(`NOT (p.metadata ? :${metadataKeyParam})`, {
            [metadataKeyParam]: key,
          }).orWhere(`p.metadata @> :${metadataNullParam}::jsonb`, {
            [metadataNullParam]: JSON.stringify({ [key]: null }),
          });
        })
      );
      continue;
    }

    if (isInFilter(value)) {
      if (value.$in.length === 0) {
        queryBuilder.andWhere('1 = 0');
        continue;
      }

      queryBuilder.andWhere(
        new Brackets((qb) => {
          value.$in.forEach((entry, entryIndex) => {
            const paramName = `metadataIn${index}_${entryIndex}`;
            const clause = `p.metadata @> :${paramName}::jsonb`;
            const params = {
              [paramName]: JSON.stringify({ [key]: entry }),
            };

            if (entryIndex === 0) {
              qb.where(clause, params);
              return;
            }

            qb.orWhere(clause, params);
          });
        })
      );
      continue;
    }

    if (isNinFilter(value)) {
      if (value.$nin.length === 0) {
        continue;
      }

      queryBuilder.andWhere(
        new Brackets((qb) => {
          value.$nin.forEach((entry, entryIndex) => {
            const paramName = `metadataNin${index}_${entryIndex}`;
            const clause = `NOT (p.metadata @> :${paramName}::jsonb)`;
            const params = {
              [paramName]: JSON.stringify({ [key]: entry }),
            };

            if (entryIndex === 0) {
              qb.where(clause, params);
              return;
            }

            qb.andWhere(clause, params);
          });
        })
      );
      continue;
    }

    const paramName = `metadataExact${index}`;
    queryBuilder.andWhere(`p.metadata @> :${paramName}::jsonb`, {
      [paramName]: JSON.stringify({ [key]: value }),
    });
  }

  return queryBuilder;
}

function validateListPagesOptions(limit?: number, offset?: number): void {
  const hasInvalidLimit =
    limit !== undefined && (!Number.isInteger(limit) || limit < 1);
  const hasInvalidOffset =
    offset !== undefined && (!Number.isInteger(offset) || offset < 0);

  if (hasInvalidLimit || hasInvalidOffset) {
    throw new Error('Invalid pagination options');
  }
}

function resolveQueryMode(mode?: QueryMode): QueryMode {
  return mode ?? 'pages-only';
}

function validateQueryText(text: string): string {
  const normalizedText = text.trim();

  if (normalizedText.length === 0) {
    throw new Error('Invalid query text');
  }

  return normalizedText;
}

function createExcerpt(content: string, maxLength = 220): string {
  const normalizedContent = content.trim();

  if (normalizedContent.length <= maxLength) {
    return normalizedContent;
  }

  return `${normalizedContent.slice(0, maxLength).trimEnd()}...`;
}

export async function listPages<TTenant extends Record<string, unknown> = never>(
  ctx: QueryContext<TTenant>,
  opts: ListPagesOpts<TTenant>
): Promise<PageSummary[]> {
  validateListPagesOptions(opts.limit, opts.offset);

  const tenantValue = resolveTenantValue(ctx.config, opts);
  const manager = ctx.dataSource.manager;

  let pageQuery = manager
    .createQueryBuilder(WikiPage, 'p')
    .select(['p.id', 'p.title', 'p.type', 'p.status', 'p.metadata']);

  pageQuery = applyPageTenantScope(pageQuery, tenantValue);
  pageQuery = applyMetadataFilters(pageQuery, opts.filters);
  pageQuery = pageQuery.orderBy('p.title', 'ASC').addOrderBy('p.id', 'ASC');

  if (opts.limit !== undefined) {
    pageQuery = pageQuery.take(opts.limit);
  }

  if (opts.offset !== undefined) {
    pageQuery = pageQuery.skip(opts.offset);
  }

  const pages = await pageQuery.getMany();
  return pages.map((page) => ({
    id: page.id,
    title: page.title,
    type: page.type,
    status: page.status,
    metadata: page.metadata ?? {},
  }));
}

export async function getPage<TTenant extends Record<string, unknown> = never>(
  ctx: QueryContext<TTenant>,
  id: string,
  opts: TenantOpts<TTenant>
): Promise<PageDetail> {
  const tenantValue = resolveTenantValue(ctx.config, opts);
  const manager = ctx.dataSource.manager;

  let pageQuery = manager
    .createQueryBuilder(WikiPage, 'p')
    .select(['p.id', 'p.title', 'p.content'])
    .where('p.id = :id', { id });

  pageQuery = applyPageTenantScope(pageQuery, tenantValue);

  const page = await pageQuery.getOne();
  if (!page) {
    throw new Error(`Page not found: ${id}`);
  }

  const versions = await manager
    .createQueryBuilder(WikiPageVersion, 'v')
    .select(['v.id', 'v.createdAt', 'v.changeSummary'])
    .where('v.page_id = :pageId', { pageId: page.id })
    .orderBy('v.created_at', 'DESC')
    .addOrderBy('v.id', 'DESC')
    .getMany();

  const claims = await manager
    .createQueryBuilder(WikiClaim, 'c')
    .select(['c.id', 'c.text', 'c.status'])
    .where('c.page_id = :pageId', { pageId: page.id })
    .orderBy('c.created_at', 'ASC')
    .addOrderBy('c.id', 'ASC')
    .getMany();

  const evidenceRows = await manager
    .createQueryBuilder(ClaimEvidence, 'ce')
    .innerJoin(WikiClaim, 'c', 'c.id = ce.claim_id')
    .innerJoin(SourceFragment, 'sf', 'sf.id = ce.fragment_id')
    .innerJoin(Source, 's', 's.id = sf.source_id')
    .select('sf.id', 'fragmentId')
    .addSelect('sf.text', 'text')
    .addSelect('s.id', 'sourceId')
    .addSelect('sf.char_offset_start', 'charOffsetStart')
    .where('c.page_id = :pageId', { pageId: page.id })
    .orderBy('sf.char_offset_start', 'ASC')
    .addOrderBy('sf.id', 'ASC')
    .getRawMany<{
      fragmentId: string;
      text: string;
      sourceId: string;
      charOffsetStart: string;
    }>();

  const evidence = Array.from(
    new Map(
      evidenceRows.map((row) => [
        row.fragmentId,
        {
          fragmentId: row.fragmentId,
          text: row.text,
          sourceId: row.sourceId,
        },
      ])
    ).values()
  );

  return {
    id: page.id,
    title: page.title,
    content: page.content,
    versions: versions.map((version) => ({
      id: version.id,
      createdAt: version.createdAt,
      changeSummary: version.changeSummary ?? '',
    })),
    claims: claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      status: claim.status,
    })),
    evidence,
  };
}

export async function runPagesOnlyQuery<TTenant extends Record<string, unknown> = never>(
  ctx: QueryContext<TTenant>,
  text: string,
  opts: QueryOpts<TTenant>
): Promise<QueryResult> {
  const tenantValue = resolveTenantValue(ctx.config, opts);
  const manager = ctx.dataSource.manager;
  const tsQuery = `websearch_to_tsquery('english', :text)`;

  let pageQuery = manager
    .createQueryBuilder(WikiPage, 'p')
    .select('p.id', 'id')
    .addSelect('p.title', 'title')
    .addSelect('p.content', 'content')
    .addSelect(`ts_rank_cd(p.search_vector, ${tsQuery})`, 'rank')
    .where(`p.search_vector @@ ${tsQuery}`, { text });

  pageQuery = applyPageTenantScope(pageQuery, tenantValue);
  pageQuery = applyMetadataFilters(pageQuery, opts.filters);
  pageQuery = pageQuery
    .orderBy('rank', 'DESC')
    .addOrderBy('p.title', 'ASC')
    .addOrderBy('p.id', 'ASC');

  const pageRows = await pageQuery.getRawMany<QueryPageRow>();
  if (pageRows.length === 0) {
    return { pages: [], evidence: [] };
  }

  const pages = pageRows.map((row) => ({
    id: row.id,
    title: row.title,
    excerpt: createExcerpt(row.content),
  }));
  const pageIds = pageRows.map((row) => row.id);

  const evidenceRows = await manager
    .createQueryBuilder(ClaimEvidence, 'ce')
    .innerJoin(WikiClaim, 'c', 'c.id = ce.claim_id')
    .innerJoin(SourceFragment, 'sf', 'sf.id = ce.fragment_id')
    .innerJoin(Source, 's', 's.id = sf.source_id')
    .select('sf.id', 'fragmentId')
    .addSelect('sf.text', 'text')
    .addSelect('s.id', 'sourceId')
    .addSelect('sf.char_offset_start', 'charOffsetStart')
    .addSelect('c.page_id', 'pageId')
    .where('c.page_id IN (:...pageIds)', { pageIds })
    .orderBy('c.page_id', 'ASC')
    .addOrderBy('sf.char_offset_start', 'ASC')
    .addOrderBy('sf.id', 'ASC')
    .getRawMany<QueryEvidenceRow>();

  const evidence = Array.from(
    new Map(
      evidenceRows.map((row) => [
        row.fragmentId,
        {
          fragmentId: row.fragmentId,
          text: row.text,
          sourceId: row.sourceId,
        },
      ])
    ).values()
  );

  return { pages, evidence };
}

export async function query<TTenant extends Record<string, unknown> = never>(
  ctx: QueryContext<TTenant>,
  text: string,
  opts: QueryOpts<TTenant>
): Promise<QueryResult> {
  const normalizedText = validateQueryText(text);
  const mode = resolveQueryMode(opts.mode);

  if (mode === 'synthesize') {
    if (!ctx.config.llm.respondWithTools) {
      throw new Error('synthesize mode requires a tool-capable llm adapter');
    }
    const { runSynthesizeQueryAgent } = await import('./query-agent');
    return runSynthesizeQueryAgent(ctx, normalizedText, opts);
  }

  return runPagesOnlyQuery(ctx, normalizedText, opts);
}
