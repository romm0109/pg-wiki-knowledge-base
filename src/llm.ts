export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMToolResult {
  toolCallId: string;
  content: string;
}

export type LLMMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string; toolCalls?: LLMToolCall[] }
  | { role: 'tool'; toolResults: LLMToolResult[] };

export interface LLMToolRequest {
  systemPrompt: string;
  messages: LLMMessage[];
  tools: LLMToolDefinition[];
}

export interface LLMToolResponse {
  answer?: string;
  toolCalls?: LLMToolCall[];
}

export interface LLMAdapter {
  complete(prompt: string): Promise<string>;
  embed?(text: string): Promise<number[]>;
  respondWithTools?(request: LLMToolRequest): Promise<LLMToolResponse>;
}

export interface EmbeddingAdapter {
  embed(text: string): Promise<number[]>;
}
