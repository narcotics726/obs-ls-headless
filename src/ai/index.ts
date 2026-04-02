export type {
  SemanticChunk,
  ChunkEmbedding,
  NoteEmbeddingIndex,
  SearchRequest,
  SearchResult,
} from "./types/index.js";

export type { IChunker } from "./chunking/index.js";
export { PlaceholderChunker } from "./chunking/index.js";

export type { IEmbeddingProvider } from "./providers/index.js";
export { StubEmbeddingProvider } from "./providers/index.js";

export type { IEmbeddingRepository } from "./repositories/index.js";
export { PlaceholderEmbeddingRepository } from "./repositories/index.js";

export { EmbeddingIndexService } from "./services/index.js";
export { SemanticSearchService } from "./services/index.js";

export { AIRuntime } from "./runtime/index.js";
