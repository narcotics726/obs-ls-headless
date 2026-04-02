# Decisions

## [2026-04-02] Event Types

- NoteUpserted and NoteDeleted will be added to existing EventType enum
- They carry typed payloads (NoteUpsertedPayload, NoteDeletedPayload)
- SyncCompleted remains batch-level summary

## [2026-04-02] Directory Structure

- All AI code under `src/ai/` as a self-contained sub-domain
- Subdirectories: types/, chunking/, providers/, repositories/, services/, runtime/
- Each has barrel exports (index.ts)
- Top-level `src/ai/index.ts` re-exports everything

## [2026-04-02] Chunking API Scaffold

- Introduce `IChunker` as the public chunking contract
- Keep `PlaceholderChunker` as a minimal single-chunk implementation until a real strategy is ready

## [2026-04-02] Runtime Barrel

- Add `src/ai/runtime/index.ts` and top-level `src/ai/index.ts` as pure barrels so later AI bootstrap work can import from one stable module path
- Keep runtime logic as a placeholder subscription layer only; no bootstrap wiring in this task
