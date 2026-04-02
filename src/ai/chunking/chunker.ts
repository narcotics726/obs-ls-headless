import type { SemanticChunk } from "../types/index.js";

/**
 * Interface for splitting note content into semantic chunks.
 * Implementations define the chunking strategy.
 */
export interface IChunker {
  /** Split note content into semantic chunks */
  chunk(noteId: string, content: string): SemanticChunk[];
  /** Return the chunker version identifier */
  version(): string;
}
