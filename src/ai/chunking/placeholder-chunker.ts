import type { SemanticChunk } from "../types/index.js";
import type { IChunker } from "./chunker.js";

/**
 * Placeholder chunker that returns the entire content as a single chunk.
 * Will be replaced with a real implementation in a later iteration.
 */
export class PlaceholderChunker implements IChunker {
  chunk(noteId: string, content: string): SemanticChunk[] {
    return [
      {
        chunkId: `${noteId}-0`,
        noteId,
        order: 0,
        text: content,
        start: 0,
        end: content.length,
      },
    ];
  }

  version(): string {
    return "placeholder-v1";
  }
}
