import type { IEmbeddingProvider } from "./embedding-provider.js";

/**
 * Stub embedding provider that returns zero vectors.
 * Used for testing and development before a real provider is integrated.
 */
export class StubEmbeddingProvider implements IEmbeddingProvider {
  private readonly _dimensions: number;

  constructor(dimensions: number = 384) {
    this._dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(this._dimensions).fill(0));
  }

  modelId(): string {
    return "stub-v1";
  }

  dimensions(): number {
    return this._dimensions;
  }
}
