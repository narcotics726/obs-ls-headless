## obs-ls-headless overview
- Purpose: headless Obsidian LiveSync client that syncs CouchDB-stored notes server-side, exposes Fastify REST API to control sync, and plans AI analysis hooks.
- Tech stack: Node.js + TypeScript (ESM) with Fastify server, CouchDB via `nano`, logging with `pino`, encryption utilities from `octagonal-wheels`.
- Repo structure highlights: `src/core` (sync engine + CouchDB client), `src/api` (routes/handlers), `src/services` (sync + AI logic), `src/types`, and `src/utils`; entrypoint `src/index.ts`, plus debug helper `src/debug-sync.ts`.
- Tooling: TypeScript 5.9, Vitest for tests, ESLint + Prettier for lint/format, TSX for dev/debug scripts.
- Entry points: dev server via `pnpm dev` (tsx watch), production via `pnpm build` then `pnpm start`, single sync via `pnpm debug-sync`.
- Docs: `README.md` documents setup, env vars (e.g., `COUCHDB_PASSPHRASE`), and API endpoints.