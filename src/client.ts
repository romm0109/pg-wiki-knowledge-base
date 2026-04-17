import 'reflect-metadata';
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
import { InitialSchema1700000000000 } from './migrations/1700000000000-InitialSchema';
import { deleteSource, ingestSource, IngestContext } from './ingest';
import { getPage, listPages, QueryContext } from './query';
import type {
  ClientConfig,
  MetadataFilters,
  IngestResult,
  DeleteResult,
  QueryResult,
  PageSummary,
  PageDetail,
} from './types';

type TenantArg<TTenant extends Record<string, unknown>> = [TTenant] extends [never]
  ? {}
  : { tenant: TTenant };

export class Client<TTenant extends Record<string, unknown> = never> {
  readonly dataSource: DataSource;
  readonly schema: string;
  private readonly _config: ClientConfig<TTenant>;

  constructor(dataSource: DataSource, schema: string, config: ClientConfig<TTenant>) {
    this.dataSource = dataSource;
    this.schema = schema;
    this._config = config;
  }

  async ingestSource(
    source: {
      content: string;
      type: 'text' | 'markdown' | 'html' | 'pdf' | 'url' | 'record';
      metadata?: Record<string, unknown>;
    } & TenantArg<TTenant>
  ): Promise<IngestResult> {
    const ctx: IngestContext<TTenant> = {
      dataSource: this.dataSource,
      schema: this.schema,
      config: this._config,
    };
    return ingestSource(ctx, source);
  }

  async deleteSource(
    id: string,
    opts: TenantArg<TTenant>
  ): Promise<DeleteResult> {
    const ctx: IngestContext<TTenant> = {
      dataSource: this.dataSource,
      schema: this.schema,
      config: this._config,
    };
    return deleteSource(ctx, id, opts);
  }

  async query(
    text: string,
    opts: {
      filters?: MetadataFilters;
      mode?: 'pages-only' | 'synthesize';
    } & TenantArg<TTenant>
  ): Promise<QueryResult> {
    void text;
    void opts;
    throw new Error('not implemented');
  }

  async listPages(
    opts: {
      filters?: MetadataFilters;
      limit?: number;
      offset?: number;
    } & TenantArg<TTenant>
  ): Promise<PageSummary[]> {
    const ctx: QueryContext<TTenant> = {
      dataSource: this.dataSource,
      schema: this.schema,
      config: this._config,
    };
    return listPages(ctx, opts);
  }

  async getPage(
    id: string,
    opts: TenantArg<TTenant>
  ): Promise<PageDetail> {
    const ctx: QueryContext<TTenant> = {
      dataSource: this.dataSource,
      schema: this.schema,
      config: this._config,
    };
    return getPage(ctx, id, opts);
  }
}

export async function createClient<TTenant extends Record<string, unknown> = never>(
  config: ClientConfig<TTenant>
): Promise<Client<TTenant>> {
  const schema = config.schema ?? 'public';

  const dataSource = new DataSource({
    type: 'postgres',
    url: config.connectionString,
    schema,
    entities: [
      Source,
      SourceFragment,
      WikiPage,
      WikiPageVersion,
      WikiLink,
      WikiClaim,
      ClaimEvidence,
      Job,
      JobEvent,
    ],
    migrations: [InitialSchema1700000000000],
    migrationsRun: false,
    synchronize: false,
    logging: false,
    migrationsTableName: config.migrations?.tableName ?? 'typeorm_migrations',
  });

  await dataSource.initialize();

  if (config.migrations?.run !== false) {
    await dataSource.runMigrations();
  }

  return new Client<TTenant>(dataSource, schema, config);
}
