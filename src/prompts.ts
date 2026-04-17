export interface LLMClaimAction {
  text: string;
  status: string;
}

export interface LLMLinkAction {
  toPageTitle: string;
  type: string;
}

export interface LLMPageAction {
  title: string;
  type: string;
  content: string;
  changeSummary?: string;
  claims?: LLMClaimAction[];
  links?: LLMLinkAction[];
}

export interface LLMIngestResponse {
  pages: LLMPageAction[];
}

export function buildIngestPrompt(params: {
  fragments: string[];
  existingPageTitles: string[];
  sourceType: string;
}): string {
  const payload = {
    sourceType: params.sourceType,
    existingPageTitles: params.existingPageTitles,
    fragments: params.fragments,
  };

  return [
    'You are curating a Postgres-backed wiki from source material.',
    'Return only a JSON object with no markdown, no code fences, and no prose.',
    'The JSON must match this shape exactly: {"pages":[{"title":"string","type":"string","content":"string","changeSummary":"string?","claims":[{"text":"string","status":"string"}],"links":[{"toPageTitle":"string","type":"string"}]}]}.',
    'Each page must include title, type, and full markdown content.',
    'Use type values such as "concept", "procedure", or "reference" when appropriate.',
    'claims should be atomic factual assertions extractable from the content, and every claim status should be "verified".',
    'links should point to related page titles using toPageTitle.',
    'Use existingPageTitles to decide whether a page should be updated instead of created.',
    'If the source is not meaningful enough to create or update any page, return {"pages":[]}.',
    `Input: ${JSON.stringify(payload)}`,
  ].join('\n');
}

export function buildSynthesizeSystemPrompt(): string {
  return [
    'You are a helpful assistant with access to a wiki knowledge base.',
    'Use the provided tools to search and retrieve relevant wiki content before answering.',
    'Always ground your answers in the fetched wiki data. Do not invent facts not present in the retrieved content.',
    'When you have gathered enough information, provide a clear, concise answer.',
    'If no relevant content is found after searching, say so directly.',
  ].join('\n');
}

export function parseLLMResponse(raw: string): LLMIngestResponse {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('pages' in parsed) ||
    !Array.isArray((parsed as { pages?: unknown }).pages)
  ) {
    throw new Error('LLM response missing pages array');
  }

  return parsed as LLMIngestResponse;
}
