import type { IEmbeddingProvider } from "../providers/index.js";
import type { IEmbeddingRepository } from "../repositories/index.js";
import type { SearchRequest, SearchResult } from "../types/index.js";

/**
 * Performs semantic search across indexed note embeddings.
 * Coordinates query embedding generation, similarity computation, and result ranking.
 */
export class SemanticSearchService {
  constructor(
    private readonly provider: IEmbeddingProvider,
    private readonly repository: IEmbeddingRepository,
  ) {}

  async search(_request: SearchRequest): Promise<SearchResult[]> {
    void this.provider;
    void this.repository;
    return [];
  }
}
