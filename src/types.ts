import { LLMAdapter, EmbeddingAdapter } from './llm';

export interface ClientConfig<TTenant extends Record<string, unknown> = never> {
  connectionString: string;
  llm: LLMAdapter;
  schema?: string;
  tenant?: TenantConfig<TTenant>;
  conflictResolution?: 'flag' | 'auto-resolve';
  deleteOrphanPages?: 'stale' | 'delete';
  embeddings?: EmbeddingAdapter;
  migrations?: {
    run?: boolean;
    tableName?: string;
  };
}

export interface TenantConfig<TTenant extends Record<string, unknown>> {
  key: keyof TTenant & string;
}

export type WithTenant<TTenant> = [TTenant] extends [never]
  ? Record<string, never>
  : { tenant: TTenant };

export interface MetadataFilters {
  [key: string]: unknown | { $in: unknown[] } | { $nin: unknown[] } | null;
}

export interface IngestResult {
  sourceId: string;
  pages: { id: string; title: string; action: 'created' | 'updated' }[];
}

export interface DeleteResult {
  sourceId: string;
  pages: { id: string; title: string; action: 'updated' | 'deleted' }[];
}

export interface QueryResult {
  answer?: string;
  pages: { id: string; title: string; excerpt: string }[];
  evidence: { fragmentId: string; text: string; sourceId: string }[];
}

export interface PageSummary {
  id: string;
  title: string;
  type: string;
  status: 'draft' | 'published' | 'stale' | 'conflicted';
  metadata: Record<string, unknown>;
}

export interface PageDetail {
  id: string;
  title: string;
  content: string;
  versions: { id: string; createdAt: Date; changeSummary: string }[];
  claims: { id: string; text: string; status: string }[];
  evidence: { fragmentId: string; text: string; sourceId: string }[];
}
