## 笔记持久化 TODO

> 进度完成后，请勾选，方便追踪。

- [x] **需求与配置**
  - [x] 在配置中新增 `vaultPath`（或类似字段），说明默认值、目录结构、删除策略。
  - [x] 更新 `AppConfig` 类型、`loadConfig` 以及 `.env.example`、README。

- [x] **抽象存储接口**
  - [x] 定义 `NoteRepository` 接口（写入、删除、读取单个/列表/搜索等方法）。
  - [x] 实现 `MemoryNoteRepository`（复用当前 Map 逻辑），确保现状功能不变。
  - [x] 让 `SyncService`、API、调试脚本改为依赖 `NoteRepository`。

- [ ] **文件系统实现（下一阶段）**
  - [x] `DiskNoteRepository`：基础写入/删除（含 markdown + 二进制）。
    - 已实现统一写入/删除逻辑，支持多级目录创建并通过 NoteRepository API 复用。
  - [x] `DiskNoteRepository`：目录创建、路径校验（防止越界、注入）。
    - 引入 sanitizeRelativePath 校验，拦截绝对路径与越界路径，并补充单元测试覆盖。
  - [x] 为 repository 提供配置注入（从 `vaultPath` 创建实例）。
    - `loadConfig` 中的 `vaultPath` 已通过入口脚本传入 `DiskNoteRepository`。
  - [x] 在 `index.ts` 等入口通过构造函数注入选择具体实现。
    - `index.ts`、`src/debug-sync.ts` 已改为注入磁盘实现，并记录 vault 路径日志。

- [ ] **启动与状态**
  - [x] `SyncService.initialize`：检测状态/目录异常时强制全量同步并记录告警。
    - 初始化时统计 repository 数量并对 lastSeq 进行一致性校验，发现不匹配即重置 state、日志告警。
  - [ ] （可选）`NoteRepository` 提供 `loadAll()` 以便后续缓存方案使用。

- [ ] **测试与文档**
  - [ ] 为 `NoteRepository` 接口编写单元测试（Mock 实现 + 真实文件实现）。
  - [ ] 扩展 `sync-service.test.ts`，校验 repository 的写入/删除被调用。
  - [ ] 更新 README，说明本地 vault 的位置和使用方式。
  - [ ] 补充 `NoteRepository` 错误/边界测试，覆盖删除缺失 ID、空搜索等情况。
  - [ ] 描述 vault 目录初始化、权限与常见异常的排查指引。

- [ ] **异常处理与告警**
  - [ ] `DiskNoteRepository` 对磁盘写入/删除失败时，抛出可识别错误并记录高优先级告警日志。
  - [ ] 在 `SyncService` 层捕获存储异常，更新状态（`lastSyncSuccess = false`，写入 `error`），并提供对外监控信息。
  - [ ] 记录运维指引（README 或运维文档），说明文件系统异常的处理办法与排查步骤。

## 潜在问题 / 风险点

> 讨论完成后使用 `~~条目~~` 划掉

- ~~**依赖注入方式**：`SyncService` 需要新的构造参数（repository、vault 配置等），需确保 `index.ts`、`api/routes.ts`、测试都能方便传入。~~（已确认沿用构造函数传参）
- ~~**删除策略未定**：是立即删除文件，还是移动到回收站？决定后才能实现一致的 API 语义和测试。~~（已决定直接删除文件）
- ~~**启动数据一致性**：若本地已有文件但 `lastSeq` 丢失，或反之，需要明确如何恢复（强制全量同步 vs 信任本地数据）。~~（已决定出现异常时总是执行全量同步，并记录告警日志）
- ~~**并发与长任务**：`startAutoSync` 仍使用 `setInterval`，同步耗时过长时可能重叠；后续若 repository 写入较慢，要考虑换成“任务完成后再 `setTimeout`”的节奏。~~（暂不优化，生产 interval 可≥30 分钟，实时性要求低）
- **文件系统异常**：磁盘满、权限不足等异常目前没有处理机制，`DiskNoteRepository` 需要返回错误供上层日志/告警。
- ~~**API 行为**：`/notes`、`/notes/search` 未来若直接读磁盘，需评估性能；如仍想保留缓存，必须定义缓存刷新方案，防止磁盘与内存不一致。~~（将通过 `NoteRepository` 访问文件系统，暂不实现内存缓存）
- ~~**测试隔离**：文件实现需要可配置的临时目录，避免污染真实 vault；确保 Vitest 环境下能够方便地 mock/stub。~~（方案：非文件相关测试使用 `MemoryNoteRepository`，文件实现测试使用系统临时目录）

> 后续如果发现新的风险或设计决策，可在此文件继续追加，方便跟踪与沟通。
  - [ ] `SyncService.initialize` 检查 `lastSeq` 与 repository 数据是否一致，异常时强制全量并记录告警。
  - [ ] 将初始化/目录异常信息暴露在 `/sync/status`，便于监控。
