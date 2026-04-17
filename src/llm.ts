export interface LLMAdapter {
  complete(prompt: string): Promise<string>;
  embed?(text: string): Promise<number[]>;
}

export interface EmbeddingAdapter {
  embed(text: string): Promise<number[]>;
}
