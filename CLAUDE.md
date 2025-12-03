# CLAUDE.md

This file provides guidance to ai agent when working with code in this repository.

## Tools

Always use the Context7 MCP tools to resolve library id and get library docs without me having to explicitly ask.
Always use the Serena MCP tools (like find_symbol, find_referencing_symbols and insert_after_symbol) when trying to locate or modify code in this repository.


## Communication
Always communicate in Chinese, but write code comments and documentation in English.

When modifying code, do it in small, incremental steps. After each step, explain what you changed and why.
When adding new files, only add skeleton codes (e.g. empty classes/functions with comments) first, then fill in the implementation in subsequent steps.

Between each step, explain, discuss, and get confirmation before proceeding to the next step.

## Project Overview

obs-ls-headless is a headless Obsidian LiveSync client that runs on servers to synchronize notes from CouchDB. It provides a REST API for managing sync operations and querying notes, with planned AI analysis features.

**Core functionality:**
- Sync Obsidian notes from CouchDB (compatible with obsidian-livesync plugin)
- Full support for LiveSync's HKDF-based end-to-end encryption
- Automatic chunk assembly for large files
- REST API for configuration, sync status, and note queries
- Future: AI-powered note analysis and insights

## Technology Stack

- **Runtime**: Node.js with TypeScript (ES modules)
- **Web Framework**: Fastify for REST API
- **Database Client**: Nano for CouchDB interaction
- **Encryption**: octagonal-wheels (HKDF-based encryption)
- **Logging**: Pino with pino-pretty
- **Testing**: Vitest
- **Build**: TypeScript compiler (tsc)

## Development Commands

```bash
# Install dependencies
npm install

# Development with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Testing
npm test              # Run all tests
npm run test:watch    # Watch mode

# Code quality
npm run lint          # Check linting
npm run lint:fix      # Fix linting issues
npm run format        # Format with Prettier
```

## Architecture

### Directory Structure

```
src/
├── core/           # Core sync engine and CouchDB client
│   ├── couchdb-client.ts    # CouchDB connection and operations
│   ├── chunk-assembler.ts   # Chunk assembly logic
│   └── interfaces.ts        # Core interfaces (IDocumentAssembler, IDocumentStorage)
├── api/            # REST API layer
│   └── routes.ts            # API endpoint definitions
├── services/       # Business logic
│   └── sync-service.ts      # Sync orchestration and note management
├── types/          # TypeScript type definitions
│   └── index.ts             # Shared types (LiveSyncDocument, Note, EdenChunk, etc.)
├── utils/          # Utility functions
│   ├── config.ts            # Configuration loader
│   ├── livesync-crypto.ts   # LiveSync HKDF encryption/decryption
│   └── logger.ts            # Pino logger setup
└── index.ts        # Application entry point
```

### Key Components

**CouchDBClient** (`src/core/couchdb-client.ts`):
- Implements `IDocumentStorage` interface
- Low-level CouchDB operations using Nano
- Handles authentication and connection management
- Methods: `getAllDocuments()`, `getDocument()`, `getDocuments()` (bulk fetch), `getDatabaseInfo()`

**ChunkAssembler** (`src/core/chunk-assembler.ts`):
- Implements `IDocumentAssembler` interface
- Assembles documents from chunks (children, eden, or direct data)
- Integrates with LiveSyncCrypto for decryption
- Supports three assembly strategies: direct data, children chunks, eden cache

**LiveSyncCrypto** (`src/utils/livesync-crypto.ts`):
- HKDF-based encryption/decryption using octagonal-wheels
- Retrieves PBKDF2 salt from `_local/obsidian_livesync_sync_parameters`
- Automatically detects encrypted data (`%=` prefix)
- Key methods: `decrypt()`, `decryptBatch()`, `isEncrypted()`

**SyncService** (`src/services/sync-service.ts`):
- Orchestrates synchronization logic
- Uses ChunkAssembler to handle document assembly and decryption
- Converts LiveSync documents to Note objects
- Manages auto-sync intervals
- Provides note search and retrieval
- Key methods: `sync()`, `startAutoSync()`, `stopAutoSync()`, `getNotes()`, `searchNotes()`
- Supports swappable assembler implementations via constructor injection

**API Routes** (`src/api/routes.ts`):
- Fastify route handlers
- Endpoints: `/health`, `/sync/status`, `/sync/trigger`, `/notes`, `/notes/:id`, `/notes/search`, `/config`

### Data Flow

1. **Sync Process**:
   - SyncService calls CouchDBClient.getAllDocuments()
   - Documents are filtered (skip internal docs with `:`, skip deleted, require valid type)
   - For each document, ChunkAssembler.assembleDocument() is called
   - ChunkAssembler tries three strategies: direct data → eden cache → children chunks
   - If encrypted, LiveSyncCrypto decrypts each chunk using HKDF
   - Chunks are combined in order
   - LiveSyncDocument → Note conversion
   - Notes stored in memory (Map)

2. **API Requests**:
   - Client → Fastify routes → SyncService → ChunkAssembler → CouchDBClient → CouchDB

3. **Encryption/Decryption Flow**:
   - LiveSyncCrypto retrieves PBKDF2 salt from `_local/obsidian_livesync_sync_parameters`
   - For each chunk, check if data starts with `%=` (HKDF encryption marker)
   - If encrypted: call `octagonal-wheels/encryption/hkdf.decrypt(data, passphrase, salt)`
   - If not encrypted: decode as base64
   - Return decrypted/decoded plain text

4. **Chunk Assembly Flow**:
   - **Direct data**: Small files with `data` field → decrypt/decode directly
   - **Eden cache**: Documents with `eden` object → sort by epoch, decrypt each chunk, combine
   - **Children chunks**: Documents with `children` array → bulk fetch chunk docs (IDs like `h:+xxx`), decrypt each, combine in order

### Obsidian LiveSync Document Format

LiveSync stores notes in CouchDB with this structure:

**Metadata Document** (note entry):
```typescript
{
  _id: string;           // Document ID (file path)
  _rev: string;          // CouchDB revision
  type: 'newnote' | 'plain';  // Document type
  path: string;          // Note path (e.g., "folder/note.md")

  // One of the following:
  data?: string;         // Direct data (small files)
  children?: string[];   // Chunk IDs (e.g., ["h:+abc", "h:+def"])
  eden?: Record<string, EdenChunk>;  // Cached chunks

  mtime: number;         // Modified timestamp
  ctime: number;         // Created timestamp
  size: number;          // File size
  deleted?: boolean;     // Deletion flag
}
```

**Chunk Document** (referenced by children):
```typescript
{
  _id: "h:+xxxxx";       // Chunk ID (h:+ = encrypted, h: = plain)
  _rev: string;
  type: "leaf";
  data: string;          // Base64-encoded, possibly encrypted with HKDF
}
```

**Document Filtering Rules** (based on livesync-bridge implementation):
1. **Skip chunk documents**: `_id` starting with `h:` or `h:+` (these are fetched separately)
2. **Skip other internal documents**: `_id` containing `:` (e.g., `ps:`, `ix:`, `leaf:`)
   - `h:` / `h:+` = chunk storage (plain / encrypted)
   - `ps:` = path-to-hash mapping
   - `ix:` = index documents
   - `leaf:` = tree structure
3. **Skip deleted documents**: Check both `deleted` and `_deleted` flags
4. **Require essential fields**: Must have `path` and valid `type`
5. **Valid types**: Only `newnote` (binary/markdown) and `plain` (plain text) are processed
6. **Encryption**: Chunks may be encrypted with HKDF (data starts with `%=`)

## Configuration

Environment variables (see `.env.example`):
- `COUCHDB_URL`: CouchDB server URL
- `COUCHDB_USERNAME`, `COUCHDB_PASSWORD`: Authentication
- `COUCHDB_DATABASE`: Database name (default: obsidian-livesync)
- `COUCHDB_PASSPHRASE`: Encryption passphrase (optional, required if LiveSync uses encryption)
- `PORT`, `HOST`: Server configuration
- `SYNC_INTERVAL`: Auto-sync interval in milliseconds
- `AUTO_SYNC_ENABLED`: Enable/disable auto-sync on startup

Configuration is loaded via `loadConfig()` in `src/utils/config.ts`.

**Encryption Setup**:
- If your Obsidian LiveSync is configured with end-to-end encryption, you MUST provide `COUCHDB_PASSPHRASE`
- The passphrase must match the one configured in your Obsidian LiveSync plugin
- The system automatically retrieves the PBKDF2 salt from `_local/obsidian_livesync_sync_parameters`
- Encryption is detected automatically (chunks starting with `%=`)
- Without the correct passphrase, encrypted notes cannot be decrypted
- If LiveSync is not using encryption, leave `COUCHDB_PASSPHRASE` empty

## Testing Strategy

When writing tests:
- Use Vitest for unit and integration tests
- Mock `IDocumentStorage` for ChunkAssembler tests
- Mock `IDocumentAssembler` for SyncService tests
- Test sync logic with sample LiveSync documents (metadata + chunks)
- Verify chunk assembly (direct data, children, eden)
- Test HKDF encryption/decryption with octagonal-wheels
- Test both encrypted (`%=` prefix) and plain text content
- Test API endpoints with Fastify's inject method
- Use `npm run debug-sync` for integration testing with real CouchDB

## Common Development Tasks

### Adding a New API Endpoint

1. Define route handler in `src/api/routes.ts`
2. Add business logic to appropriate service
3. Update types in `src/types/index.ts` if needed
4. Write tests

### Extending Sync Logic

1. Modify `SyncService.processDocuments()` for document processing
2. Update `LiveSyncDocument` or `Note` types if schema changes
3. Consider impact on existing notes in memory

### Adding AI Analysis (Future)

1. Create new service: `src/services/ai-service.ts`
2. Add AI provider configuration to `src/types/index.ts` and `src/utils/config.ts`
3. Integrate with SyncService to analyze notes
4. Add API endpoints in `src/api/routes.ts`

## Important Notes

- **ES Modules**: This project uses ES modules. All imports must include `.js` extension (even for `.ts` files)
- **Memory Storage**: Notes are currently stored in memory. Consider persistence for production use
- **CouchDB Compatibility**: Designed to work with obsidian-livesync's CouchDB schema
- **Encryption**:
  - Uses HKDF-based encryption via `octagonal-wheels` library
  - Compatible with LiveSync's encryption (data starting with `%=`)
  - PBKDF2 salt retrieved from `_local/obsidian_livesync_sync_parameters` document
  - Automatically detects and decrypts encrypted chunks
  - Gracefully handles both encrypted and plain text content
  - Based on official LiveSync encryption implementation
- **Chunk Assembly**: Large files are split into chunks (referenced by `children` array or cached in `eden`)
- **Interface-Based Design**: Core components use interfaces (`IDocumentAssembler`, `IDocumentStorage`) for flexibility
- **Type Safety**: Maintain strict TypeScript types for all CouchDB interactions
- **Security**: Never commit `.env` file with real credentials or passphrases

## Dependencies

Use `pnpm` to manage dependencies, run tasks and scripts.

Remember to use `vitest --pool=threads --no-watch` to run tests in agent mode.

- **octagonal-wheels**: Official LiveSync encryption library (HKDF, PBKDF2)
- **nano**: CouchDB client for Node.js
- **fastify**: Fast web framework for REST API
- **pino**: High-performance logging
