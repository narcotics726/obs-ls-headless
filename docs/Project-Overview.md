# Project Overview

## Purpose
- Headless Obsidian LiveSync 客户端：从 CouchDB 同步、解密、组装笔记，提供 REST API 管理与查询。
- 目标运行场景：服务器/容器内常驻服务，未来支持插件化（备份、AI）。

## Architecture
- Node.js + TypeScript，ESM 模式；Fastify 提供 `/api` 前缀的 HTTP 接口。
- 分层：core（CouchDB 访问与组装）、services（业务 orchestration）、api（路由）、utils/types（通用模块）。
- 以接口抽象（IDocumentStorage/IDocumentAssembler/NoteRepository）支撑可替换实现。

## Key Components
- CouchDBClient：实现 IDocumentStorage，封装 getAll/get/get bulk fetch。
- ChunkAssembler：实现 IDocumentAssembler，支持 direct data / eden / children，集成 HKDF 解密。
- LiveSyncCrypto：HKDF 解密工具，从 `_local/obsidian_livesync_sync_parameters` 取 PBKDF2 salt。
- SyncService：调用存储+组装，转换 LiveSyncDocument → Note，管理自动同步/查询。
- NoteRepository：内存/磁盘实现，负责成品笔记持久化到 vault 路径。

## Dev & Ops
- 脚本：`pnpm dev`（热更新）、`pnpm build` + `pnpm start`（生产）、`pnpm debug-sync`（一次性同步调试）。
- 配置：CouchDB 连接、`COUCHDB_PASSPHRASE`、`SYNC_INTERVAL`、`vaultPath` 等通过 `.env` 配置。
- 日志与存储：Pino；建议反代加基础认证，数据卷 `/state`（状态）与 `/data`（笔记/生成物）。
- docker-compose 结构：应用容器 `obs-ls-headless`（挂载 `/state`、`/data`，加载 `.env`），前置反代 `caddy` 暴露 8001 端口，并有各自数据卷（`caddy_data`/`caddy_config`）。默认重启策略为 `unless-stopped`。
