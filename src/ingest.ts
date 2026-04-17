import { DataSource } from 'typeorm';
import {
  Source,
  SourceFragment,
  WikiPage,
  WikiPageVersion,
  WikiLink,
  WikiClaim,
  ClaimEvidence,
  Job,
  JobEvent,
} from './entities';
import { fragmentContent } from './fragment';
import {
  buildIngestPrompt,
  parseLLMResponse,
  LLMPageAction,
} from './prompts';
import type { ClientConfig, DeleteResult, IngestResult, WithTenant } from './types';

export interface IngestContext<TTenant extends Record<string, unknown> = never> {
  dataSource: DataSource;
  schema: string;
  config: ClientConfig<TTenant>;
}

type IngestInput<TTenant extends Record<string, unknown>> = {
  content: string;
  type: 'text' | 'markdown' | 'html' | 'pdf' | 'url' | 'record';
  metadata?: Record<string, unknown>;
} & ([TTenant] extends [never] ? {} : { tenant: TTenant });

type DeleteInput<TTenant extends Record<string, unknown>> = [TTenant] extends [never]
  ? {}
  : { tenant: TTenant };

type TenantValue = Record<string, unknown> | null;

function resolveTenantValue<TTenant extends Record<string, unknown>>(
  config: ClientConfig<TTenant>,
  input: WithTenant<TTenant>
): TenantValue {
  return config.tenant != null && 'tenant' in input
    ? ((input as { tenant: TTenant }).tenant as Record<string, unknown>)
    : null;
}

export async function ingestSource<TTenant extends Record<string, unknown> = never>(
  ctx: IngestContext<TTenant>,
  input: IngestInput<TTenant>
): Promise<IngestResult> {
  const tenantValue = resolveTenantValue(ctx.config, input);
  const jobRepo = ctx.dataSource.getRepository(Job);
  const job = jobRepo.create({
    type: 'ingest',
    status: 'running',
    tenant: tenantValue,
    metadata: {},
  });
  await jobRepo.save(job);

  const queryRunner = ctx.dataSource.createQueryRunner();
  let sourceId = '';

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const source = await queryRunner.manager.save(Source, {
      content: input.content,
      type: input.type,
      tenant: tenantValue,
      metadata: input.metadata ?? {},
    });
    sourceId = source.id;

    const chunks = fragmentContent(input.content);
    const fragments = await queryRunner.manager.save(
      SourceFragment,
      chunks.map((chunk) => ({
        text: chunk.text,
        charOffsetStart: chunk.charOffsetStart,
        charOffsetEnd: chunk.charOffsetEnd,
        metadata: {},
        source,
      }))
    );

    let pageQuery = queryRunner.manager
      .createQueryBuilder(WikiPage, 'p')
      .select(['p.id', 'p.title', 'p.content', 'p.status', 'p.type', 'p.currentVersionId']);

    if (tenantValue !== null) {
      pageQuery = pageQuery.where('p.tenant @> :tenant::jsonb', {
        tenant: JSON.stringify(tenantValue),
      });
    } else {
      pageQuery = pageQuery.where('p.tenant IS NULL');
    }
    const existingPages = await pageQuery.getMany();

    const prompt = buildIngestPrompt({
      fragments: fragments.map((fragment) => fragment.text),
      existingPageTitles: existingPages.map((page) => page.title),
      sourceType: input.type,
    });
    const raw = await ctx.config.llm.complete(prompt);

    await queryRunner.manager.save(JobEvent, {
      type: 'llm_call',
      data: { promptLength: prompt.length, responseLength: raw.length },
      job,
    });

    const llmResponse = parseLLMResponse(raw);
    const results: IngestResult['pages'] = [];
    const pageByNormalizedTitle = new Map(
      existingPages.map((page) => [page.title.toLocaleLowerCase(), page] as const)
    );
    const affectedPages: WikiPage[] = [];

    for (const pageAction of llmResponse.pages) {
      const normalizedTitle = pageAction.title.toLocaleLowerCase();
      const existingPage = pageByNormalizedTitle.get(normalizedTitle);
      const page = existingPage
        ? await updateExistingPage(queryRunner, existingPage, pageAction, ctx.config.conflictResolution)
        : await createNewPage(queryRunner, pageAction, tenantValue);

      await syncClaims(queryRunner, page, pageAction, fragments);

      results.push({
        id: page.id,
        title: page.title,
        action: existingPage ? 'updated' : 'created',
      });
      affectedPages.push(page);
      pageByNormalizedTitle.set(normalizedTitle, page);

      await queryRunner.manager.save(JobEvent, {
        type: 'page_action',
        data: { pageId: page.id, action: existingPage ? 'updated' : 'created' },
        job,
      });

      if (page.status === 'conflicted') {
        await queryRunner.manager.save(JobEvent, {
          type: 'conflict',
          data: { pageId: page.id },
          job,
        });
      }
    }

    for (const page of affectedPages) {
      const pageAction = llmResponse.pages.find(
        (candidate) => candidate.title.toLocaleLowerCase() === page.title.toLocaleLowerCase()
      );

      if (pageAction) {
        await syncLinks(queryRunner, page, pageAction, pageByNormalizedTitle);
      }

      await queryRunner.query(
        `UPDATE pgwiki_wiki_pages SET search_vector = to_tsvector('english', $1 || ' ' || $2) WHERE id = $3`,
        [page.title, page.content, page.id]
      );
    }

    await queryRunner.commitTransaction();
    job.status = 'succeeded';
    await jobRepo.save(job);

    return { sourceId, pages: results };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    job.status = 'failed';
    job.errorMessage = error instanceof Error ? error.message : String(error);
    await jobRepo.save(job);
    throw error;
  } finally {
    await queryRunner.release();
  }
}

export async function deleteSource<TTenant extends Record<string, unknown> = never>(
  ctx: IngestContext<TTenant>,
  id: string,
  opts: DeleteInput<TTenant>
): Promise<DeleteResult> {
  const tenantValue = resolveTenantValue(ctx.config, opts);
  const jobRepo = ctx.dataSource.getRepository(Job);
  const job = jobRepo.create({
    type: 'delete',
    status: 'running',
    tenant: tenantValue,
    metadata: { sourceId: id },
  });
  await jobRepo.save(job);

  const queryRunner = ctx.dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const sourceQuery = queryRunner.manager.createQueryBuilder(Source, 's').where('s.id = :id', {
      id,
    });

    if (tenantValue !== null) {
      sourceQuery.andWhere('s.tenant @> :tenant::jsonb', {
        tenant: JSON.stringify(tenantValue),
      });
    } else {
      sourceQuery.andWhere('s.tenant IS NULL');
    }

    const source = await sourceQuery.getOne();
    if (!source) {
      throw new Error(`Source not found: ${id}`);
    }

    const pageBuilder = queryRunner.manager
      .createQueryBuilder(WikiPage, 'p')
      .innerJoin(WikiClaim, 'c', 'c.page_id = p.id')
      .innerJoin(ClaimEvidence, 'ce', 'ce.claim_id = c.id')
      .innerJoin(SourceFragment, 'sf', 'sf.id = ce.fragment_id')
      .where('sf.source_id = :sourceId', { sourceId: id })
      .select(['p.id', 'p.title', 'p.status'])
      .distinct(true);

    if (tenantValue !== null) {
      pageBuilder.andWhere('p.tenant @> :tenant::jsonb', {
        tenant: JSON.stringify(tenantValue),
      });
    } else {
      pageBuilder.andWhere('p.tenant IS NULL');
    }

    const affectedPages = await pageBuilder.getMany();

    await queryRunner.manager.delete(Source, { id: source.id });

    const results: DeleteResult['pages'] = [];

    for (const page of affectedPages) {
      const remainingEvidence = await queryRunner.manager
        .createQueryBuilder(ClaimEvidence, 'ce')
        .innerJoin(WikiClaim, 'c', 'c.id = ce.claim_id')
        .where('c.page_id = :pageId', { pageId: page.id })
        .getCount();

      if (remainingEvidence !== 0) {
        continue;
      }

      let action: 'updated' | 'deleted';
      if (ctx.config.deleteOrphanPages === 'delete') {
        await queryRunner.manager.delete(WikiPage, { id: page.id });
        action = 'deleted';
      } else {
        await queryRunner.manager.update(WikiPage, { id: page.id }, { status: 'stale' });
        action = 'updated';
      }

      results.push({ id: page.id, title: page.title, action });
      await queryRunner.manager.save(JobEvent, {
        type: 'page_action',
        data: { pageId: page.id, action },
        job,
      });
    }

    await queryRunner.commitTransaction();
    job.status = 'succeeded';
    await jobRepo.save(job);

    return { sourceId: id, pages: results };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    job.status = 'failed';
    job.errorMessage = error instanceof Error ? error.message : String(error);
    await jobRepo.save(job);
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async function createNewPage(
  queryRunner: ReturnType<DataSource['createQueryRunner']>,
  pageAction: LLMPageAction,
  tenantValue: TenantValue
): Promise<WikiPage> {
  let page = await queryRunner.manager.save(WikiPage, {
    title: pageAction.title,
    content: pageAction.content,
    type: pageAction.type,
    status: 'published',
    tenant: tenantValue,
    metadata: {},
    currentVersionId: null,
  });

  const version = await queryRunner.manager.save(WikiPageVersion, {
    content: pageAction.content,
    changeSummary: pageAction.changeSummary ?? 'Initial version',
    page,
  });

  page.currentVersionId = version.id;
  page = await queryRunner.manager.save(WikiPage, page);
  return page;
}

async function updateExistingPage(
  queryRunner: ReturnType<DataSource['createQueryRunner']>,
  existingPage: WikiPage,
  pageAction: LLMPageAction,
  conflictResolution: 'flag' | 'auto-resolve' | undefined
): Promise<WikiPage> {
  const contentChanged = existingPage.content !== pageAction.content;

  const version = await queryRunner.manager.save(WikiPageVersion, {
    content: existingPage.content,
    changeSummary: contentChanged ? (pageAction.changeSummary ?? 'Updated') : 'No change',
    page: existingPage,
  });

  existingPage.content = pageAction.content;
  existingPage.type = pageAction.type;
  existingPage.currentVersionId = version.id;

  if (!contentChanged) {
    existingPage.status = 'published';
  } else if (conflictResolution === 'auto-resolve') {
    existingPage.status = 'published';
  } else {
    existingPage.status = 'conflicted';
  }

  return queryRunner.manager.save(WikiPage, existingPage);
}

async function syncClaims(
  queryRunner: ReturnType<DataSource['createQueryRunner']>,
  page: WikiPage,
  pageAction: LLMPageAction,
  fragments: SourceFragment[]
): Promise<void> {
  await queryRunner.manager.delete(WikiClaim, { page: { id: page.id } });

  for (const claimAction of pageAction.claims ?? []) {
    const claim = await queryRunner.manager.save(WikiClaim, {
      text: claimAction.text,
      status: claimAction.status,
      metadata: {},
      page,
    });

    if (fragments.length > 0) {
      await queryRunner.manager.save(
        ClaimEvidence,
        fragments.map((fragment) => ({
          claim,
          fragment,
        }))
      );
    }
  }
}

async function syncLinks(
  queryRunner: ReturnType<DataSource['createQueryRunner']>,
  page: WikiPage,
  pageAction: LLMPageAction,
  pageByNormalizedTitle: Map<string, WikiPage>
): Promise<void> {
  await queryRunner.manager.delete(WikiLink, { fromPage: { id: page.id } });

  for (const linkAction of pageAction.links ?? []) {
    const toPage = pageByNormalizedTitle.get(linkAction.toPageTitle.toLocaleLowerCase());
    if (!toPage) {
      continue;
    }

    await queryRunner.manager.save(WikiLink, {
      type: linkAction.type,
      metadata: {},
      fromPage: page,
      toPage,
    });
  }
}
