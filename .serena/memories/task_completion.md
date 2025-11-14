## Task completion checklist
- Ensure TypeScript compiles (`pnpm build`) when changing runtime code.
- Run Vitest suite (`pnpm test`) and add/adjust tests for regressions.
- Lint + format (`pnpm lint`, `pnpm format`) if touching source files.
- Update README or docs when altering env requirements, APIs, or workflows.
- Confirm `.env.example` matches any new environment variables.
- Communicate any manual setup (e.g., CouchDB credentials) in PR/task notes.