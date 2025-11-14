## Suggested commands
- Install deps: `pnpm install` (lockfile is pnpm; npm also works if preferred).
- Dev server with hot reload: `pnpm dev`.
- Build + run: `pnpm build && pnpm start`.
- Single sync/debug helper: `pnpm debug-sync`.
- Run tests: `pnpm test` or watch mode `pnpm test:watch`.
- Lint/format: `pnpm lint`, `pnpm lint:fix`, `pnpm format`.
- Coverage report: `pnpm test -- --coverage` (Vitest v8 coverage config ready).
- Detox stale build artifacts: remove `dist/` before rebuilding if TypeScript artifacts conflict.