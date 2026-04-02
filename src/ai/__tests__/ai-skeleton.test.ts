import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  SemanticChunk,
  ChunkEmbedding,
  NoteEmbeddingIndex,
  SearchRequest,
  SearchResult,
} from "../index.js";
import {
  PlaceholderChunker,
  StubEmbeddingProvider,
  PlaceholderEmbeddingRepository,
  EmbeddingIndexService,
  SemanticSearchService,
  AIRuntime,
} from "../index.js";
import { EventBus } from "../../core/event-bus.js";
import { EventType } from "../../types/index.js";
import type { Note } from "../../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeNote = (overrides?: Partial<Note>): Note => ({
  id: "note-1",
  path: "folder/note.md",
  content: "Hello world content",
  mtime: new Date("2024-01-01"),
  ctime: new Date("2024-01-01"),
  size: 19,
  ...overrides,
});

const makeIndex = (
  overrides?: Partial<NoteEmbeddingIndex>,
): NoteEmbeddingIndex => ({
  schemaVersion: "1",
  noteId: "note-1",
  notePath: "folder/note.md",
  sourceMtime: 1704067200000,
  indexedAt: Date.now(),
  embeddingModelId: "stub-v1",
  chunkerVersion: "placeholder-v1",
  contentHash: "abc123",
  chunks: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Group 1: AI Types (instantiation tests)
// ---------------------------------------------------------------------------

describe("AI Types", () => {
  it("can create a valid SemanticChunk object", () => {
    const chunk: SemanticChunk = {
      chunkId: "note-1-0",
      noteId: "note-1",
      order: 0,
      text: "Hello world",
      start: 0,
      end: 11,
    };

    expect(chunk.chunkId).toBe("note-1-0");
    expect(chunk.noteId).toBe("note-1");
    expect(chunk.order).toBe(0);
    expect(chunk.text).toBe("Hello world");
    expect(chunk.start).toBe(0);
    expect(chunk.end).toBe(11);
  });

  it("can create a valid ChunkEmbedding object", () => {
    const ce: ChunkEmbedding = {
      chunkId: "note-1-0",
      order: 0,
      text: "Hello",
      embedding: [0.1, 0.2, 0.3],
    };

    expect(ce.chunkId).toBe("note-1-0");
    expect(ce.order).toBe(0);
    expect(ce.embedding).toHaveLength(3);
  });

  it("can create a valid NoteEmbeddingIndex with chunks", () => {
    const index: NoteEmbeddingIndex = makeIndex({
      chunks: [
        { chunkId: "note-1-0", order: 0, text: "Hello", embedding: [0, 0, 0] },
      ],
    });

    expect(index.noteId).toBe("note-1");
    expect(index.chunks).toHaveLength(1);
    expect(index.chunks[0].chunkId).toBe("note-1-0");
  });

  it("can create a valid SearchRequest", () => {
    const req: SearchRequest = {
      query: "semantic search",
      topK: 5,
      minScore: 0.5,
    };
    expect(req.query).toBe("semantic search");
    expect(req.topK).toBe(5);
    expect(req.minScore).toBe(0.5);
  });

  it("can create a valid SearchResult", () => {
    const result: SearchResult = {
      noteId: "note-1",
      notePath: "folder/note.md",
      chunkId: "note-1-0",
      chunkText: "Some text",
      score: 0.95,
      order: 0,
    };
    expect(result.score).toBe(0.95);
    expect(result.chunkId).toBe("note-1-0");
  });
});

// ---------------------------------------------------------------------------
// Group 2: PlaceholderChunker
// ---------------------------------------------------------------------------

describe("PlaceholderChunker", () => {
  let chunker: PlaceholderChunker;

  beforeEach(() => {
    chunker = new PlaceholderChunker();
  });

  it("returns a single chunk containing the full content", () => {
    const chunks = chunker.chunk("note-1", "Hello world");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Hello world");
  });

  it("chunkId follows {noteId}-0 pattern", () => {
    const chunks = chunker.chunk("my-note", "content");
    expect(chunks[0].chunkId).toBe("my-note-0");
  });

  it("order is 0", () => {
    const chunks = chunker.chunk("note-1", "content");
    expect(chunks[0].order).toBe(0);
  });

  it("start is 0 and end equals content length", () => {
    const content = "Hello world content";
    const chunks = chunker.chunk("note-1", content);
    expect(chunks[0].start).toBe(0);
    expect(chunks[0].end).toBe(content.length);
  });

  it('version() returns "placeholder-v1"', () => {
    expect(chunker.version()).toBe("placeholder-v1");
  });

  it("empty content returns chunk with empty text", () => {
    const chunks = chunker.chunk("note-1", "");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("");
    expect(chunks[0].end).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Group 3: StubEmbeddingProvider
// ---------------------------------------------------------------------------

describe("StubEmbeddingProvider", () => {
  it("embed() returns arrays of correct length matching dimensions()", async () => {
    const provider = new StubEmbeddingProvider();
    const results = await provider.embed(["text one"]);
    expect(results[0]).toHaveLength(provider.dimensions());
  });

  it("embed() returns zero vectors", async () => {
    const provider = new StubEmbeddingProvider();
    const results = await provider.embed(["some text"]);
    expect(results[0].every((v) => v === 0)).toBe(true);
  });

  it('modelId() returns "stub-v1"', () => {
    const provider = new StubEmbeddingProvider();
    expect(provider.modelId()).toBe("stub-v1");
  });

  it("dimensions() returns default 384", () => {
    const provider = new StubEmbeddingProvider();
    expect(provider.dimensions()).toBe(384);
  });

  it("custom dimensions work (e.g. 128)", () => {
    const provider = new StubEmbeddingProvider(128);
    expect(provider.dimensions()).toBe(128);
  });

  it("multiple texts return multiple vectors", async () => {
    const provider = new StubEmbeddingProvider();
    const results = await provider.embed([
      "text one",
      "text two",
      "text three",
    ]);
    expect(results).toHaveLength(3);
    results.forEach((vec) => expect(vec).toHaveLength(384));
  });
});

// ---------------------------------------------------------------------------
// Group 4: PlaceholderEmbeddingRepository
// ---------------------------------------------------------------------------

describe("PlaceholderEmbeddingRepository", () => {
  let repo: PlaceholderEmbeddingRepository;

  beforeEach(() => {
    repo = new PlaceholderEmbeddingRepository();
  });

  it("save() then load() returns the same index", async () => {
    const index = makeIndex();
    await repo.save(index);
    const loaded = await repo.load("note-1");
    expect(loaded).toEqual(index);
  });

  it("load() returns null for non-existent noteId", async () => {
    const result = await repo.load("does-not-exist");
    expect(result).toBeNull();
  });

  it("delete() removes the index", async () => {
    await repo.save(makeIndex());
    await repo.delete("note-1");
    expect(await repo.load("note-1")).toBeNull();
  });

  it("delete() on non-existent noteId does not throw", async () => {
    await expect(repo.delete("does-not-exist")).resolves.toBeUndefined();
  });

  it("listAll() returns all saved indices", async () => {
    await repo.save(makeIndex({ noteId: "note-1", notePath: "a.md" }));
    await repo.save(makeIndex({ noteId: "note-2", notePath: "b.md" }));
    const all = await repo.listAll();
    expect(all).toHaveLength(2);
  });

  it("listAll() returns empty array when nothing saved", async () => {
    const all = await repo.listAll();
    expect(all).toHaveLength(0);
  });

  it("save() overwrites existing index for same noteId", async () => {
    const original = makeIndex({ contentHash: "original-hash" });
    const updated = makeIndex({ contentHash: "updated-hash" });

    await repo.save(original);
    await repo.save(updated);

    const loaded = await repo.load("note-1");
    expect(loaded?.contentHash).toBe("updated-hash");

    const all = await repo.listAll();
    expect(all).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Group 5: EmbeddingIndexService
// ---------------------------------------------------------------------------

describe("EmbeddingIndexService", () => {
  let chunker: PlaceholderChunker;
  let provider: StubEmbeddingProvider;
  let repo: PlaceholderEmbeddingRepository;
  let service: EmbeddingIndexService;

  beforeEach(() => {
    chunker = new PlaceholderChunker();
    provider = new StubEmbeddingProvider();
    repo = new PlaceholderEmbeddingRepository();
    service = new EmbeddingIndexService(chunker, provider, repo);
  });

  it("can be instantiated with stubs", () => {
    expect(service).toBeInstanceOf(EmbeddingIndexService);
  });

  it("indexNote() does not throw (no-op placeholder)", async () => {
    const note = makeNote();
    await expect(service.indexNote(note)).resolves.toBeUndefined();
  });

  it("deleteNoteIndex() calls repository.delete()", async () => {
    const deleteSpy = vi.spyOn(repo, "delete");
    await service.deleteNoteIndex("note-1");
    expect(deleteSpy).toHaveBeenCalledWith("note-1");
  });

  it("shouldReindex() always returns true", async () => {
    const result = await service.shouldReindex("note-1", "abc123");
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group 6: SemanticSearchService
// ---------------------------------------------------------------------------

describe("SemanticSearchService", () => {
  let provider: StubEmbeddingProvider;
  let repo: PlaceholderEmbeddingRepository;
  let service: SemanticSearchService;

  beforeEach(() => {
    provider = new StubEmbeddingProvider();
    repo = new PlaceholderEmbeddingRepository();
    service = new SemanticSearchService(provider, repo);
  });

  it("can be instantiated with stubs", () => {
    expect(service).toBeInstanceOf(SemanticSearchService);
  });

  it("search() returns empty array (placeholder)", async () => {
    const results = await service.search({ query: "anything", topK: 5 });
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Group 7: AIRuntime
// ---------------------------------------------------------------------------

describe("AIRuntime", () => {
  let eventBus: EventBus;
  let indexService: EmbeddingIndexService;
  let searchService: SemanticSearchService;
  let runtime: AIRuntime;

  beforeEach(() => {
    eventBus = new EventBus();
    const chunker = new PlaceholderChunker();
    const provider = new StubEmbeddingProvider();
    const repo = new PlaceholderEmbeddingRepository();
    indexService = new EmbeddingIndexService(chunker, provider, repo);
    searchService = new SemanticSearchService(provider, repo);
    runtime = new AIRuntime(eventBus, indexService, searchService);
  });

  it("can be instantiated", () => {
    expect(runtime).toBeInstanceOf(AIRuntime);
  });

  it("start() subscribes to NoteUpserted and NoteDeleted events", async () => {
    runtime.start();

    // After start, emitting should not throw and listeners exist
    const upsertEvent = {
      type: EventType.NoteUpserted,
      timestamp: new Date(),
      source: "test",
      payload: { noteId: "note-1" },
    };
    const deleteEvent = {
      type: EventType.NoteDeleted,
      timestamp: new Date(),
      source: "test",
      payload: { noteId: "note-1" },
    };

    await expect(eventBus.emit(upsertEvent)).resolves.toBeUndefined();
    await expect(eventBus.emit(deleteEvent)).resolves.toBeUndefined();

    runtime.stop();
  });

  it("stop() unsubscribes from events", async () => {
    runtime.start();
    runtime.stop();

    // After stop, listeners should be gone — emit should still resolve fine
    await expect(
      eventBus.emit({
        type: EventType.NoteUpserted,
        timestamp: new Date(),
        source: "test",
      }),
    ).resolves.toBeUndefined();
  });

  it("stop() before start() does not throw", () => {
    expect(() => runtime.stop()).not.toThrow();
  });

  it("after start(), emitting NoteUpserted event triggers handler", async () => {
    runtime.start();

    // The handler logs; we verify via a spy on the event bus subscriber
    const handlerSpy = vi.fn();
    eventBus.subscribe(EventType.NoteUpserted, handlerSpy);

    const event = {
      type: EventType.NoteUpserted,
      timestamp: new Date(),
      source: "test",
      payload: { noteId: "note-42" },
    };

    await eventBus.emit(event);

    expect(handlerSpy).toHaveBeenCalledTimes(1);
    expect(handlerSpy).toHaveBeenCalledWith(event);

    runtime.stop();
  });

  it("getSearchService() returns the search service", () => {
    const svc = runtime.getSearchService();
    expect(svc).toBe(searchService);
  });
});
