## Style & conventions
- TypeScript modules use ESNext syntax with `type: module`; prefer async/await and explicit return types for exported functions.
- ESLint (@typescript-eslint) + Prettier enforce formatting; run `pnpm lint` and `pnpm format` to stay consistent.
- Source layout mirrors feature areas (`core`, `api`, `services`, `types`, `utils`); tests live beside source files as `*.test.ts(x)` per `vitest.config.ts`.
- Env config via `.env`/`dotenv`; sensitive values (CouchDB credentials, `COUCHDB_PASSPHRASE`) pulled from process env.
- Logging handled through `pino`; REST routes built on Fastify, so follow Fastify handler patterns and schema typing.