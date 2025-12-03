# Docs overview (2024-xx)
- Active docs (docs/):
  - Project-Overview.md: purpose, architecture, key components, Dev & Ops (compose layout for obs-ls-headless + caddy).
  - Couchdb-Pull.md: goals, LiveSync data model, pull flow, decryption/assembly, troubleshooting.
  - Plugin.md: plugin system objectives, lifecycle/protocol (JSON-RPC via stdin/stdout), event model, HTTP exposure, roadmap.
- Archived (docs/archive/):
  - CHUNK_IMPLEMENTATION_SUMMARY.md, ENCRYPTION_IMPLEMENTATION_PLAN.md, ENCRYPTION_IMPLEMENTATION_SUMMARY.md, IMPLEMENTATION_PLAN.md, persistence-plan.md, PLAN_SUMMARY_ZH.md, PLUGINS_PLAN.md, SIMPLE_ENCRYPTION_PLAN.md, SECURITY.md.
- Notes: archive holds prior plans/summaries/security notes; new docs are concise entry points. Use .env for config, compose ships obs-ls-headless + caddy with /state and /data volumes.