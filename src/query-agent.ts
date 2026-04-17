import type { QueryContext } from './query';
import { getPage, listPages, runPagesOnlyQuery } from './query';
import type { MetadataFilters, QueryResult } from './types';
import type { LLMToolDefinition, LLMToolCall, LLMMessage } from './llm';
import { buildSynthesizeSystemPrompt } from './prompts';

const MAX_QUERY_TOOL_STEPS = 6;

type TenantOpts<TTenant extends Record<string, unknown>> = [TTenant] extends [never]
  ? Record<string, never>
  : { tenant: TTenant };

type SynthesizeOpts<TTenant extends Record<string, unknown>> = TenantOpts<TTenant> & {
  filters?: MetadataFilters;
  mode?: 'pages-only' | 'synthesize';
};

const WIKI_TOOLS: LLMToolDefinition[] = [
  {
    name: 'wiki_search',
    description:
      'Search wiki pages using full-text search. Returns matching pages and supporting evidence fragments. Use this to find pages relevant to a topic or question.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The search query text.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'wiki_list_pages',
    description:
      'List available wiki page summaries. Use to browse topics before fetching full content.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of pages to return.',
        },
        offset: {
          type: 'number',
          description: 'Number of pages to skip for pagination.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'wiki_get_page',
    description:
      'Fetch the full content, claims, and evidence for a specific wiki page by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The UUID of the wiki page to retrieve.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

function truncate(text: string, max = 2000): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}...`;
}

type ToolCallResult = {
  content: string;
  pages: { id: string; title: string; excerpt: string }[];
  evidence: { fragmentId: string; text: string; sourceId: string }[];
};

async function executeToolCall<TTenant extends Record<string, unknown>>(
  ctx: QueryContext<TTenant>,
  toolCall: LLMToolCall,
  opts: SynthesizeOpts<TTenant>
): Promise<ToolCallResult> {
  const args = toolCall.arguments;

  switch (toolCall.name) {
    case 'wiki_search': {
      const text = args.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error(`wiki_search: text argument must be a non-empty string`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await runPagesOnlyQuery(ctx, text.trim(), opts as any);
      return {
        content: JSON.stringify({
          pages: result.pages,
          evidence: result.evidence.map((e) => ({
            fragmentId: e.fragmentId,
            text: truncate(e.text, 500),
            sourceId: e.sourceId,
          })),
        }),
        pages: result.pages,
        evidence: result.evidence,
      };
    }

    case 'wiki_list_pages': {
      const limit = args.limit !== undefined ? Number(args.limit) : 20;
      const offset = args.offset !== undefined ? Number(args.offset) : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const summaries = await listPages(ctx, { ...opts, limit, offset } as any);
      const pages = summaries.map((s) => ({ id: s.id, title: s.title, excerpt: '' }));
      return {
        content: JSON.stringify({
          pages: summaries.map((s) => ({
            id: s.id,
            title: s.title,
            type: s.type,
            status: s.status,
          })),
        }),
        pages,
        evidence: [],
      };
    }

    case 'wiki_get_page': {
      const id = args.id;
      if (typeof id !== 'string') {
        throw new Error(`wiki_get_page: id argument must be a string`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = await getPage(ctx, id, opts as any);
      const excerpt = detail.content.length <= 220
        ? detail.content
        : `${detail.content.slice(0, 220).trimEnd()}...`;
      return {
        content: JSON.stringify({
          id: detail.id,
          title: detail.title,
          content: truncate(detail.content),
          claims: detail.claims,
          evidence: detail.evidence.map((e) => ({
            fragmentId: e.fragmentId,
            text: truncate(e.text, 500),
            sourceId: e.sourceId,
          })),
        }),
        pages: [{ id: detail.id, title: detail.title, excerpt }],
        evidence: detail.evidence,
      };
    }

    default:
      throw new Error(`unknown tool: ${toolCall.name}`);
  }
}

export async function runSynthesizeQueryAgent<TTenant extends Record<string, unknown> = never>(
  ctx: QueryContext<TTenant>,
  text: string,
  opts: SynthesizeOpts<TTenant>
): Promise<QueryResult> {
  const { llm } = ctx.config;

  if (!llm.respondWithTools) {
    throw new Error('synthesize mode requires a tool-capable llm adapter');
  }

  const systemPrompt = buildSynthesizeSystemPrompt();
  const messages: LLMMessage[] = [{ role: 'user', content: text }];

  const accumulatedPages = new Map<string, { id: string; title: string; excerpt: string }>();
  const accumulatedEvidence = new Map<
    string,
    { fragmentId: string; text: string; sourceId: string }
  >();

  for (let step = 0; step < MAX_QUERY_TOOL_STEPS; step++) {
    const response = await llm.respondWithTools({ systemPrompt, messages, tools: WIKI_TOOLS });

    if (response.answer) {
      return {
        answer: response.answer,
        pages: Array.from(accumulatedPages.values()),
        evidence: Array.from(accumulatedEvidence.values()),
      };
    }

    if (!response.toolCalls || response.toolCalls.length === 0) {
      throw new Error(
        'synthesize mode: LLM response contained neither a final answer nor tool calls'
      );
    }

    messages.push({ role: 'assistant', toolCalls: response.toolCalls });

    const toolResults = [];
    for (const toolCall of response.toolCalls) {
      const result = await executeToolCall(ctx, toolCall, opts);

      for (const page of result.pages) {
        if (!accumulatedPages.has(page.id)) {
          accumulatedPages.set(page.id, page);
        }
      }
      for (const ev of result.evidence) {
        if (!accumulatedEvidence.has(ev.fragmentId)) {
          accumulatedEvidence.set(ev.fragmentId, ev);
        }
      }

      toolResults.push({ toolCallId: toolCall.id, content: result.content });
    }

    messages.push({ role: 'tool', toolResults });
  }

  throw new Error(
    `synthesize query exceeded maximum tool steps (${MAX_QUERY_TOOL_STEPS})`
  );
}
