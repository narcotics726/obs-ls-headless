# Learnings

## [2026-04-02] Initial Analysis

- Project uses ES modules — all imports must include `.js` extension
- EventType enum is in `src/types/index.ts` — currently has SyncStarted, SyncCompleted, SyncFailed, BackupTriggered, BackupCompleted, NoteIndexed
- EventBus interface is in `src/core/event-bus.ts` — supports subscribe/unsubscribe/emit with EventType | '\*'
- LiveSyncEvent has: type, timestamp, source, payload?, metadata?
- Build: `npm run build` (tsc)
- Tests: `npx vitest --pool=threads --no-watch` — 9 test files, 128 tests, all pass
- Note interface: { id, path, content, mtime, ctime, size }
- Package manager: npm (pnpm not available, bun not available)
- Main entry `src/index.ts` creates eventBus, syncService, pluginManager and wires them

## [2026-04-02] Event Type Extension Verification

- Added `NoteUpserted` and `NoteDeleted` to the existing `EventType` enum in `src/types/index.ts`
- Added typed payload interfaces immediately after `LiveSyncEvent` to keep event-related types grouped together
- `npx vitest --pool=threads --no-watch` passed with 128 tests
- `npm run build` completed successfully

## [2026-04-02] Chunker Scaffold

- `SemanticChunk` already has the fields needed for a placeholder chunker: chunkId, noteId, order, text, start, end, headingContext
- The chunking interface should expose both `chunk()` and `version()` so later index rebuilds can detect strategy changes

## [2026-04-02] AI Runtime Placeholder

- The new `src/ai/runtime/` barrel keeps runtime wiring isolated from services and allows future bootstrap integration without touching `src/index.ts`
- `AIRuntime` can safely keep placeholder listeners as long as it only logs events and exposes the search service accessor for future route wiring
