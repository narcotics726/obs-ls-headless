import type { Note } from "../../types/index.js";
import type { IChunker } from "../chunking/index.js";
import type { IEmbeddingProvider } from "../providers/index.js";
import type { IEmbeddingRepository } from "../repositories/index.js";

/**
 * Orchestrates the building and refreshing of note embedding indices.
 * Coordinates Chunker, EmbeddingProvider, and EmbeddingRepository.
 */
export class EmbeddingIndexService {
  constructor(
    private readonly chunker: IChunker,
    private readonly provider: IEmbeddingProvider,
    private readonly repository: IEmbeddingRepository,
  ) {}

  async indexNote(_note: Note): Promise<void> {
    void this.chunker;
    void this.provider;
  }

  async deleteNoteIndex(noteId: string): Promise<void> {
    await this.repository.delete(noteId);
  }

  async shouldReindex(_noteId: string, _contentHash: string): Promise<boolean> {
    return true;
  }
}
