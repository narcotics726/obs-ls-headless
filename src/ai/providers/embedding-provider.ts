/**
 * Interface for generating text embeddings.
 * Abstracts away the specific embedding API/model.
 */
export interface IEmbeddingProvider {
  /** Generate embeddings for an array of text inputs */
  embed(texts: string[]): Promise<number[][]>;
  /** Return the model identifier string */
  modelId(): string;
  /** Return the embedding vector dimensions */
  dimensions(): number;
}
