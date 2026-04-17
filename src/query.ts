import { DataSource, SelectQueryBuilder } from 'typeorm';
import {
  WikiPage,
  WikiPageVersion,
  WikiClaim,
  ClaimEvidence,
  SourceFragment,
  Source,
} from './entities';
import type { ClientConfig, PageDetail } from './types';

export interface QueryContext<TTenant extends Record<string, unknown> = never> {
  dataSource: DataSource;
  schema: string;
  config: ClientConfig<TTenant>;
}

type TenantOpts<TTenant extends Record<string, unknown>> = [TTenant] extends [never]
  ? {}
  : { tenant: TTenant };

type TenantValue = Record<string, unknown> | null;

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
