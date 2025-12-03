# CouchDB Pull & Assembly

## Goals
- 从 LiveSync CouchDB 拉取笔记元数据与分块，组装成明文成品（Markdown/二进制），供 API 与本地持久化使用。
- 兼容 LiveSync 的 HKDF 加密与多种存储形态（direct data / children / eden）。

## Data Model
- 元数据文档：`type` 为 `newnote`/`plain`，包含 `path`、`children`、`eden`、`mtime/ctime/size`，可选 `data`。
- Chunk 文档：`type=leaf`，`_id` 以 `h:`/`h:+` 开头，`data` 为 base64（可能加密）。
- PBKDF2 salt 存于 `_local/obsidian_livesync_sync_parameters`，用于解密 `%=` 前缀的内容。

## Pull Flow
- CouchDBClient 实现 `getAllDocuments/getDocument/getDocuments`，先拉取元数据（跳过 `h:`/`ps:` 等内部文档）。
- SyncService 过滤删除/无效类型 → 交给 ChunkAssembler 组装 → 转换为 Note → 通过 NoteRepository 持久化（内存/磁盘）。
- 支持定时自动同步与手动触发；状态写入 `/state`。

## Decryption & Assembly
- ChunkAssembler 优先级：direct data → eden（按 epoch 排序） → children（按列表顺序 bulk fetch）。
- Decrypt 路径：配置 passphrase 时调用 LiveSyncCrypto，`%=` 前缀走 HKDF 解密，未加密则原样返回；未配置 passphrase 时直接对 chunk/base64 内容解码。
- 缺失/无数据的 chunk 记错误日志并中断该文档组装。

## Troubleshooting
- 盐缺失/错误 passphrase：解密失败，日志提示，从 `_local/obsidian_livesync_sync_parameters` 获取 pbkdf2salt。
- 文档过滤：确保跳过 `_id` 含 `:` 的内部文档，仅处理 `newnote`/`plain`。
- 大文件：确保 bulk fetch 开启，减少往返；关注 eden 缓存是否可用。
