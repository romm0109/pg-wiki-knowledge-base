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
import type {
  ClientConfig,
  WithTenant,
  MetadataFilters,
  IngestResult,
  DeleteResult,
  QueryResult,
  PageSummary,
  PageDetail,
} from './types';

export class Client<TTenant extends Record<string, unknown> = never> {
  readonly dataSource: DataSource;
  readonly schema: string;

  constructor(dataSource: DataSource, schema: string) {
    this.dataSource = dataSource;
    this.schema = schema;
  }

  async ingestSource(
    source: {
      content: string;
      type: 'text' | 'markdown' | 'html' | 'pdf' | 'url' | 'record';
      metadata?: Record<string, unknown>;
    } & WithTenant<TTenant>
  ): Promise<IngestResult> {
    void source;
    throw new Error('not implemented');
  }

  async deleteSource(
    id: string,
    opts: WithTenant<TTenant>
  ): Promise<DeleteResult> {
    void id;
    void opts;
    throw new Error('not implemented');
  }

  async query(
    text: string,
    opts: {
      filters?: MetadataFilters;
      mode?: 'pages-only' | 'synthesize';
    } & WithTenant<TTenant>
  ): Promise<QueryResult> {
    void text;
    void opts;
    throw new Error('not implemented');
  }

  async listPages(
    opts: {
      filters?: MetadataFilters;
    } & WithTenant<TTenant>
  ): Promise<PageSummary[]> {
    void opts;
    throw new Error('not implemented');
  }

  async getPage(
    id: string,
    opts: WithTenant<TTenant>
  ): Promise<PageDetail> {
    void id;
    void opts;
    throw new Error('not implemented');
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

  return new Client<TTenant>(dataSource, schema);
}
