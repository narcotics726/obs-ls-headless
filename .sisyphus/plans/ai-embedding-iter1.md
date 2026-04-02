# AI Embedding Iteration 1: AI 子域骨架与事件契约

## Goal

搭建 `src/ai/` 子域骨架，定义核心接口、类型、占位实现，并在 `src/types/index.ts` 中增加 `NoteUpserted` / `NoteDeleted` 事件类型。本轮不实现复杂业务逻辑，只建立边界和骨架。

## References

- Design: `docs/plan/AI-Embedding-Design.md`
- Implementation Plan: `docs/plan/AI-Embedding-Implementation-Plan.md` (Iteration 1)
- Existing types: `src/types/index.ts`
- Event bus: `src/core/event-bus.ts`
- Main entry: `src/index.ts`

## TODOs

- [x] T1: Add NoteUpserted and NoteDeleted event types to `src/types/index.ts`
  - Add `NoteUpserted = 'NoteUpserted'` and `NoteDeleted = 'NoteDeleted'` to the `EventType` enum
  - Add typed event payload interfaces: `NoteUpsertedPayload` (noteId, path, mtime, contentHash, syncMode, syncRunId, lastSeq?) and `NoteDeletedPayload` (noteId, path?, syncMode, syncRunId, lastSeq?)
  - Existing tests and build must still pass

- [x] T2: Create AI domain type definitions in `src/ai/types/`
  - Create `src/ai/types/index.ts` with:
    - `SemanticChunk` interface (chunkId, noteId, order, text, start?, end?, headingContext?)
    - `NoteEmbeddingIndex` interface (schemaVersion, noteId, notePath, sourceMtime, indexedAt, embeddingModelId, chunkerVersion, contentHash, chunks: ChunkEmbedding[])
    - `ChunkEmbedding` interface (chunkId, order, text, start?, end?, embedding: number[])
    - `SearchRequest` interface (query, topK?, minScore?)
    - `SearchResult` interface (noteId, notePath, chunkId, chunkText, score, order)
    - Export all types

- [x] T3: Create Chunker interface and placeholder in `src/ai/chunking/`
  - Create `src/ai/chunking/chunker.ts` with `IChunker` interface: `chunk(noteId: string, content: string): SemanticChunk[]`
  - Create `src/ai/chunking/placeholder-chunker.ts` with `PlaceholderChunker` that implements `IChunker` with a stub (returns single chunk of full content)
  - Create `src/ai/chunking/index.ts` barrel export

- [x] T4: Create EmbeddingProvider interface and stub in `src/ai/providers/`
  - Create `src/ai/providers/embedding-provider.ts` with `IEmbeddingProvider` interface: `embed(texts: string[]): Promise<number[][]>`, `modelId(): string`, `dimensions(): number`
  - Create `src/ai/providers/stub-embedding-provider.ts` with `StubEmbeddingProvider` that returns zero vectors
  - Create `src/ai/providers/index.ts` barrel export

- [x] T5: Create EmbeddingRepository interface and placeholder in `src/ai/repositories/`
  - Create `src/ai/repositories/embedding-repository.ts` with `IEmbeddingRepository` interface: `save(index: NoteEmbeddingIndex): Promise<void>`, `load(noteId: string): Promise<NoteEmbeddingIndex | null>`, `delete(noteId: string): Promise<void>`, `listAll(): Promise<NoteEmbeddingIndex[]>`
  - Create `src/ai/repositories/placeholder-embedding-repository.ts` with in-memory `PlaceholderEmbeddingRepository`
  - Create `src/ai/repositories/index.ts` barrel export

- [x] T6: Create service skeletons in `src/ai/services/`
  - Create `src/ai/services/embedding-index-service.ts` with `EmbeddingIndexService` class skeleton (constructor takes IChunker, IEmbeddingProvider, IEmbeddingRepository; methods: `indexNote(note: Note): Promise<void>`, `deleteNoteIndex(noteId: string): Promise<void>`, `shouldReindex(noteId: string, contentHash: string): Promise<boolean>`)
  - Create `src/ai/services/semantic-search-service.ts` with `SemanticSearchService` class skeleton (constructor takes IEmbeddingProvider, IEmbeddingRepository; method: `search(request: SearchRequest): Promise<SearchResult[]>`)
  - Create `src/ai/services/index.ts` barrel export
  - Methods should have minimal placeholder implementations (e.g., empty arrays, no-ops, return true for shouldReindex)

- [x] T7: Create AI runtime wiring placeholder in `src/ai/runtime/`
  - Create `src/ai/runtime/ai-runtime.ts` with `AIRuntime` class:
    - Constructor takes `IEventBus`, `EmbeddingIndexService`, `SemanticSearchService`
    - `start()` method that subscribes to NoteUpserted/NoteDeleted events (with placeholder handlers that only log)
    - `stop()` method that unsubscribes
  - Create `src/ai/runtime/index.ts` barrel export
  - Create `src/ai/index.ts` top-level barrel export for entire ai module

- [x] T8: Write unit tests for AI skeleton
  - Test type instantiation (create instances of all AI types)
  - Test PlaceholderChunker returns valid SemanticChunk
  - Test StubEmbeddingProvider returns correct dimensions and zero vectors
  - Test PlaceholderEmbeddingRepository CRUD operations
  - Test EmbeddingIndexService and SemanticSearchService can be instantiated with stubs
  - Test AIRuntime start/stop subscribes/unsubscribes events
  - All tests in `src/ai/__tests__/` directory

## Final Verification Wave

- [x] F1: TypeScript build passes (`npm run build`) with zero errors
- [x] F2: All tests pass (`npx vitest --pool=threads --no-watch`) including new AI tests
- [x] F3: LSP diagnostics clean across all new files
- [x] F4: Code review — all files follow project conventions (ES module imports with .js extension, interface-based design, proper barrel exports)
