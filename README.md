# obs-ls-headless

Headless Obsidian LiveSync client for server-side note synchronization with CouchDB.

## Features

- **Core Sync Engine**: Synchronize Obsidian notes from CouchDB (compatible with obsidian-livesync)
- **Chunk Assembly**: Automatically assembles chunked documents from LiveSync storage
- **End-to-End Encryption**: Full support for LiveSync's HKDF-based encryption
- **REST API**: Manage configuration, monitor sync status, and control sync operations
- **AI Analysis** (planned): Analyze note content and provide insights via API/web interface

## 🔐 Encryption Support

**Full E2EE Support**: This version **fully supports** Obsidian LiveSync's End-to-End Encryption (E2EE).

- ✅ HKDF-based encryption/decryption
- ✅ Automatic chunk assembly and decryption
- ✅ Works with encrypted LiveSync databases
- ✅ Compatible with all LiveSync encryption settings

Simply provide your encryption passphrase in the `.env` file:
```env
COUCHDB_PASSPHRASE=your-encryption-passphrase
```

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your CouchDB credentials and encryption passphrase
   ```

   **Important**:
   - If your LiveSync database uses encryption, you **must** set `COUCHDB_PASSPHRASE` to match your Obsidian LiveSync passphrase.
   - Set `VAULT_PATH` to the directory where synchronized notes should be stored (defaults to `./vault` if omitted).

3. Run in development mode:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   npm start
   ```

## Project Structure

```
src/
├── core/           # Core sync engine and CouchDB client
├── api/            # REST API routes and handlers
├── services/       # Business logic (sync, AI analysis)
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

## API Endpoints

- `GET /health` - Health check
- `GET /sync/status` - Get current sync status
- `POST /sync/trigger` - Manually trigger sync
- `GET /config` - Get current configuration
- `PUT /config` - Update configuration

## Local Vault Storage

`VAULT_PATH` controls where assembled notes are written on disk. By default it resolves to `<project-root>/vault`, but you can point it to any absolute path (for example a mounted volume). The repository mirrors the original Obsidian paths under this directory, so a note stored as `folder/note.md` in CouchDB becomes `<VAULT_PATH>/folder/note.md`. When documents are deleted upstream, files are removed immediately rather than moved to a trash directory, so ensure the target path is version-controlled or backed up if you need recovery.

Before enabling the planned disk-backed repository, make sure:
- The directory referenced by `VAULT_PATH` already exists (e.g. run `mkdir -p /srv/vault && chown obsls:obsls /srv/vault`).
- The service account has read/write/execute permission on every parent directory (`ls -ld /srv /srv/vault` should show the correct owner and `rwx` bits).
- The filesystem has enough free space and inodes; low-disk situations will surface as write errors in the logs.
- When troubleshooting missing files, first confirm the process can touch a sentinel file (`sudo -u obsls touch "$VAULT_PATH/.health"`), then inspect the SyncService logs for any file write error entries (e.g., permission denied, disk full, etc.). If a dedicated "Vault write failed" log message is introduced in a future release, it will be documented here.

## Development

- `npm run dev` - Start development server with hot reload
- `npm run debug-sync` - Run single sync operation for debugging
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run lint` - Lint code
- `npm run format` - Format code with Prettier

## Debugging

To test the sync functionality without starting the full server:

```bash
npm run debug-sync
```

This will:
- Connect to CouchDB
- Perform a single sync operation
- Display database info and sync status
- Show sample notes (first 5)
- Help diagnose connection or encryption issues

## License

MIT
