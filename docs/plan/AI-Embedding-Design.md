# AI Embedding 与语义搜索设计

## 文档目标

本文档定义 `obs-ls-headless` 中 AI 索引与语义搜索能力的第一版设计。

目标是在当前代码库基础上引入一套**最小可用、可持续演进**的架构，使其能够：

- 保持同步逻辑与 AI 处理逻辑解耦
- 在同步完成后为笔记建立 embedding 索引
- 第一版使用本地 JSON 文件保存 embedding 数据
- 在不提前绑定数据库或向量库的前提下提供未来的语义搜索能力
- 为后续迁移到更明确的插件边界保留路径

本文档不包含代码示例，重点是边界、职责、数据模型与运行时约束。

## 范围

本文档覆盖以下内容：

- 笔记到语义分块的处理边界
- embedding provider 抽象
- embedding persistence 抽象
- 索引编排流程
- 语义搜索编排流程
- 本地 JSON 存储布局
- 与现有同步流程的事件驱动集成
- 删除、重建、对账与一致性策略

本文档暂不定义以下内容：

- 精确的 chunking 算法细节
- 精确的 embedding 模型供应商
- 生产级向量数据库选型
- reranking
- answer generation
- 对外部第三方 AI 插件暴露的宿主能力契约

## 设计原则

### 将 AI 与同步解耦

AI 索引逻辑不应直接嵌入同步核心流程。同步系统仍然只负责：

- 从 CouchDB 拉取变更
- 组装笔记内容
- 持久化笔记
- 发出领域事件

AI 模块作为这些事件的下游消费者运行。

### 使用语义 chunk，而不是 LiveSync 存储 chunk

LiveSync 的 chunk 机制服务于存储与同步，不适合作为 embedding 的直接输入单位。

AI 索引必须始终基于**已经完整组装、必要时已解密**的笔记内容，然后再执行专用的语义分块策略。

### 先用文件存储，但保留迁移路径

第一版优先使用本地 JSON 文件，因为它简单、可读、便于调试。

同时，接口层必须从一开始就保证：后续迁移到 SQLite 或向量数据库时，不需要重写上层服务编排逻辑。

### 将索引与查询视为不同工作流

构建 embedding 和查询 embedding 相关，但不是同一件事。

因此应拆分为两个服务：

- `EmbeddingIndexService`
- `SemanticSearchService`

### 一致性优先于事件“看起来更实时”

当前仓库中的事件总线是进程内、内存态、非持久化的，不能被视为唯一的一致性来源。

因此第一版必须采用：

- **增量事件驱动**作为快路径
- **周期性对账（reconciliation）**作为慢路径兜底

也就是说，事件负责加速更新，对账负责修复漂移。

## 高层架构

第一版 AI 索引与语义搜索设计包含五个核心角色：

1. `Chunker`
2. `EmbeddingProvider`
3. `EmbeddingRepository`
4. `EmbeddingIndexService`
5. `SemanticSearchService`

这些角色保持分离，以确保每个模块职责窄而稳定。

## 组件职责

### Chunker

`Chunker` 负责将一篇完整笔记拆分成适合 AI 处理的语义片段。

输入：

- 一篇已经完整组装的笔记

输出：

- 一组语义 chunk
- 每个 chunk 附带结构化元数据，而不仅是纯文本

建议输出的元数据包括：

- 笔记标识
- chunk 标识
- chunk 文本
- chunk 顺序
- 可选的字符范围
- 可选的标题或章节上下文

`Chunker` 不应：

- 了解外部 embedding API
- 执行持久化
- 计算相似度
- 依赖 LiveSync 存储 chunk 边界

### EmbeddingProvider

`EmbeddingProvider` 负责与外部 embedding API 通信。

它的职责包括：

- 构造请求
- 处理 provider 鉴权
- 在需要时进行批处理
- 归一化错误
- 以 provider 无关的内部格式返回 embedding

`EmbeddingProvider` 不应：

- 决定如何切分笔记
- 负责 embedding 持久化
- 实现搜索排序逻辑

这一抽象非常重要，因为后续可能切换 provider，或支持多个 provider。

### EmbeddingRepository

`EmbeddingRepository` 负责 embedding 索引数据的持久化与读取。

第一版存储介质为本地 JSON 文件。

它的职责包括：

- 保存某篇笔记的 embedding 索引
- 读取某篇笔记的 embedding 索引
- 删除某篇笔记的 embedding 索引
- 遍历所有已存储索引
- 为查询服务提供足够的读取能力以完成候选扫描
- 为对账流程提供枚举与清理能力

`EmbeddingRepository` 不应：

- 调用 embedding API
- 决定某篇笔记是否需要重建索引
- 负责 top-k 选择或相似度排序

它是持久化抽象，不是搜索引擎。

### EmbeddingIndexService

`EmbeddingIndexService` 负责构建与刷新笔记的 embedding 索引。

它是索引工作流的协调者。

职责包括：

- 接收需要索引的笔记
- 判断是否需要重建
- 调用 `Chunker`
- 调用 `EmbeddingProvider`
- 通过 `EmbeddingRepository` 写入 chunk embedding

它应负责以下策略：

- 跳过未变化的笔记
- 强制重建
- 当笔记删除时清理陈旧索引
- 在 schema、chunker 或模型版本变化时触发重建

`EmbeddingIndexService` 不应：

- 实现用户侧语义搜索
- 拥有同步逻辑

### SemanticSearchService

`SemanticSearchService` 负责针对已索引 chunk 执行语义检索。

职责包括：

- 通过 `EmbeddingProvider` 为用户查询生成 embedding
- 从 `EmbeddingRepository` 读取候选 embedding
- 计算向量相似度
- 排序结果
- 选出 top-k 匹配
- 将 chunk 匹配结果整形成 note 级搜索结果

它应拥有：

- 相似度度量逻辑
- 排序逻辑
- chunk 到 note 的结果整形逻辑

它不应：

- 在常规查询处理中构建索引
- 决定 chunking 策略

## 与当前系统的集成建议

### 事件驱动集成

当前代码库已经有 event bus，因此 AI 索引流程应通过领域事件集成，而不是直接在 `SyncService` 内部调用 AI 逻辑。

建议的事件分层如下：

- `SyncStarted` / `SyncCompleted` / `SyncFailed`
  - 用于表达一次同步批次的开始、完成与失败
  - 仍然保留为**批次级摘要事件**
- `NoteUpserted`
  - 表达某篇笔记在同步后被新增或更新
- `NoteDeleted`
  - 表达某篇笔记在同步后被删除

这意味着：

- `SyncCompleted` 不承担详细 note 级变更传输职责
- AI 索引主要消费 note 生命周期事件
- `SyncCompleted` 用于监控、批次审计、收尾和统计

### 为什么不把全部变化详情都塞进 `SyncCompleted`

虽然理论上可以扩展 `SyncCompleted.payload` 来携带新增、更新、删除详情，但第一版不建议这样做，原因包括：

- `SyncCompleted` 当前语义是批次摘要，加入实体明细会混淆职责
- 事件会被桥接到插件系统，过大的 payload 会扩大插件侧解析与传输成本
- 下游若只关心 note 生命周期，使用专用事件更清晰
- 实体级事件更适合单条幂等、重试与增量索引

因此推荐：

- 保留 `SyncCompleted` 的批次语义
- 新增 note 级事件作为 AI 集成边界

### 推荐事件流

建议的运行流程为：

1. sync 完成笔记组装与持久化
2. 系统为本轮被新增或更新的笔记发出 `NoteUpserted`
3. 系统为本轮被删除的笔记发出 `NoteDeleted`
4. AI 索引逻辑订阅这些 note 级事件并异步执行
5. 一轮同步结束后系统发出 `SyncCompleted`

这样可以保持清晰分层：

- sync 仍然是 note 生命周期变化的事实来源
- AI 索引只是下游消费者
- 监控与批次统计由 `SyncCompleted` 承担

### 为什么不直接在 SyncService 中嵌入 embedding 调用

如果把 embedding 调用直接塞进 `SyncService`，会出现以下问题：

- 同步延迟受外部 AI API 延迟影响
- 同步失败与 AI 失败耦合在一起
- 重试逻辑更难推理
- 替换索引实现时需要修改同步核心

因此 `SyncService` 只应负责发出生命周期事件，而不应感知 embedding 细节。

## 事件契约建议

### NoteUpserted

建议至少包含：

- `noteId`
- `path`
- `mtime`
- `contentHash`
- `syncMode`
- `syncRunId`
- `lastSeq`（可选）

### NoteDeleted

建议至少包含：

- `noteId`
- `path`（如果可用）
- `syncMode`
- `syncRunId`
- `lastSeq`（可选）

### SyncCompleted

建议保留批次级字段：

- `syncRunId`
- `mode`
- `documentsCount`
- `processedCount`
- `changedCount`
- `deletedCount`
- `notesCount`
- `lastSeq`

如果后续确实有需要，也可以在 `SyncCompleted` 中加入轻量级 `changeSetSummary`，但不应让它替代 note 级事件。

## 数据模型

### 以 note 为单位的存储

第一版推荐的持久化单位是：

- 每篇笔记一个 JSON 文件

每个 note 级 JSON 文件应包含：

- 笔记标识元数据
- 重建决策元数据
- 该笔记全部语义 chunk
- 每个 chunk 的 embedding 向量

相比单一的大型全局 JSON 文件，这种方案更合适，因为：

- 单次更新只会触碰一篇笔记的索引文件
- 删除更直接
- 调试更容易
- 后续迁移更平滑

### 为什么不使用每个 chunk 一个 JSON 文件

第一版不建议每个 chunk 一个文件，因为：

- 文件数量会快速膨胀
- 删除一篇笔记会变成删除大量小文件
- 更新流程会过于碎片化
- 目录遍历与文件系统开销会增大

未来如果进入更高级的存储策略，这种方式可能有价值，但不适合作为第一步。

### 建议的最小 schema

第一版应尽早固定最小可演进 schema，以避免实现过程反向绑架设计。

每个 note 索引文件至少应包含：

- `schema_version`
- `note_id`
- `note_path`
- `source_mtime`
- `indexed_at`
- `embedding_model_id`
- `chunker_version`
- `content_hash`
- `chunks`

每个 chunk 条目至少应包含：

- `chunk_id`
- `order`
- `text`
- `start`
- `end`
- `embedding`

其中以下字段是第一版必须明确的关键字段：

- `schema_version`
- `content_hash`
- `embedding_model_id`
- `chunker_version`

### content hash 的作用

`content_hash` 是跳过无意义重建的核心信号。

当某篇笔记再次同步时，索引逻辑可以比较当前 `content_hash` 与已持久化值：

- 相同则跳过 embedding 生成
- 不同则重建该笔记索引

相比单纯依赖时间戳，这种方式更稳健。

### version 字段的作用

第一版必须承认：即使原始笔记未变化，以下情况也可能要求重建索引：

- schema 版本变化
- chunking 策略变化
- embedding 模型变化

因此重建策略不能只看 `content_hash`，还应同时比较：

- `schema_version`
- `chunker_version`
- `embedding_model_id`

## Chunking 策略

### 基本方向

系统应基于笔记语义而非存储布局来切分 chunk。

未来可参考的切分信号包括：

- Markdown 标题
- 段落边界
- 代码块边界
- 软长度限制
- 相邻 chunk 的重叠

具体算法在本文档中保持开放。

### 重要约束

chunking 必须发生在笔记已经完整组装、必要时已完成解密之后。

任何更早的阶段都在错误的数据单位上工作。

## 搜索流程

第一版语义搜索流程如下：

1. 接收用户查询
2. 通过 `EmbeddingProvider` 生成查询 embedding
3. 从 `EmbeddingRepository` 遍历所有 note 索引文件
4. 将查询 embedding 与每个 chunk embedding 逐一比较
5. 对结果排序
6. 返回带有 note 上下文的 top-k chunk 匹配结果

在数据规模仍小的第一版，这种 full scan 是可接受的。

### 可扩展性预期

基于 JSON 文件的 full scan 不是长期方案。

它适用于：

- 本地开发
- 早期验证
- 小规模笔记集合

随着 note 与 chunk 数量上升，它最终会成为瓶颈。

## 一致性与对账

### 为什么不能只依赖增量事件

当前仓库中的 event bus 是：

- 进程内
- 内存态
- 非持久化

这意味着：

- 进程异常退出时可能丢失事件
- 事件消费者异常时可能错过更新
- 仅依赖事件流无法保证索引长期一致

因此，第一版必须采用“双轨模型”：

- 增量事件负责低延迟更新
- 周期性对账负责修复漂移

### 增量事件

增量事件是快路径。

其职责是：

- 在同步后快速触发某篇笔记的索引更新
- 在删除后快速清理对应索引

这条路径优化的是实时性。

### 周期性对账

周期性对账是慢路径兜底。

其职责是定期检查：

- 有 note 但没有索引的情况
- 有索引但 note 已不存在的情况
- `content_hash` 不一致的情况
- `schema_version` / `chunker_version` / `embedding_model_id` 过期的情况

对账之后可执行：

- 补建
- 重建
- 删除陈旧索引

这条路径优化的是一致性与可恢复性。

### 推荐理解方式

第一版中：

- 事件负责“尽快追上变化”
- 对账负责“最终修正错误”

两者不是二选一，而是必须同时存在。

## 未来迁移路径

设计应保留清晰的升级路径。

### 阶段一

本地 JSON 文件 + full scan 检索。

### 阶段二

将 embedding persistence 迁移到 SQLite 或其他结构化本地存储。

潜在收益包括：

- 更快的元数据过滤
- 更好的更新处理
- 更方便的分页与统计

### 阶段三

引入专用向量索引或向量数据库。

潜在收益包括：

- ANN 检索
- 更好的扩展性
- 更低的查询延迟

本文档提出的服务接口应确保这些迁移主要局限于 persistence 和 retrieval 层。

## 插件方向

从架构角度看，AI 能力应被视为插件友好，但第一版不强制做成完全独立的外部插件。

### 推荐方式

短期：

- 在当前仓库内实现 AI 模块
- 通过清晰接口封装 AI 逻辑
- 通过事件驱动连接到现有系统

长期：

- 暴露稳定的宿主能力
- 允许独立 AI 插件订阅 note 级事件并管理自己的索引流程

这种“两阶段”路径既避免过度设计，也保留了模块化空间。

### 为什么不立即强制完整插件模型

当前插件系统虽然是事件导向的，但尚未明确以下能力契约：

- 插件自有持久化契约
- 宿主提供的 AI 存储 API
- 插件查询端点
- 插件结果与宿主搜索结果整合方式

在 AI 核心索引流程尚未验证前，立即外置化会引入额外宿主接口设计成本。

## 代码组织与迁移策略

### 首要实现原则

短期目标是在当前代码库上尽快验证方案，长期目标是保留迁移到插件形态的低成本路径。

因此代码组织应遵循：

- 当前直接在仓库中实现 AI 功能
- 以内部子域组织，而不是散落到现有宿主目录
- 保持宿主接缝尽可能小，方便后续抽离

### 推荐目录结构

建议第一版将 AI 相关代码放在单独根目录下：

- `src/ai/types/`
- `src/ai/chunking/`
- `src/ai/providers/`
- `src/ai/repositories/`
- `src/ai/services/`
- `src/ai/runtime/`

### 各目录职责

`src/ai/types/`

- AI 域共享类型
- embedding index 结构
- chunk 元数据
- search request/result 模型

这一层应尽量保持框架无关。

`src/ai/chunking/`

- `Chunker` 抽象
- 默认 chunking 实现
- 文本切分逻辑

这一层不应依赖 provider、repository 或宿主运行时。

`src/ai/providers/`

- `EmbeddingProvider` 抽象
- 具体 provider 接入实现
- provider 请求/响应适配

这一层只负责与 embedding backend 通信。

`src/ai/repositories/`

- `EmbeddingRepository` 抽象
- JSON 持久化实现

这一层仅聚焦持久化与读取。

`src/ai/services/`

- `EmbeddingIndexService`
- `SemanticSearchService`

这一层负责组合 chunking、provider 与 repository 来完成 AI 编排。

`src/ai/runtime/`

- 事件订阅 wiring
- 启动注册
- 宿主集成 glue code
- 当前应用中的 AI bootstrap 逻辑

这一层是 AI 模块中最感知宿主的一层。

### 为什么 `runtime` 很重要

`runtime` 是未来可抽离性的关键。

如果没有它，AI 逻辑很容易泄漏到：

- `src/index.ts`
- sync services
- API route wiring
- storage initialization

有了 `runtime` 后，可以保持：

- 领域逻辑放在 `src/ai/`
- 应用启动只调用 `src/ai/runtime/`
- 未来插件 bootstrap 只替换 runtime adapter

### 依赖方向

推荐依赖方向如下：

- `runtime` 依赖 `services`
- `services` 依赖 `chunking`、`providers`、`repositories`、`types`
- `repositories`、`providers`、`chunking` 依赖 `types`

应避免：

- `types` 依赖 Fastify、sync services 或 plugin manager 类型
- `chunking` 依赖外部 API client
- `repositories` 实现排序逻辑
- `services` 导入应用 bootstrap 代码

### 宿主层应保留什么

宿主应用应尽量只知道少量 AI 内部细节。

理想情况下，宿主层只负责：

- 根据配置创建 AI 依赖
- 启动 AI runtime wiring
- 暴露必要的顶层搜索入口

宿主层不应知道：

- chunking 策略细节
- embedding 文件 schema 细节
- provider 专有请求格式
- 相似度实现细节

### 不应做的事

为保留未来插件迁移的灵活性，AI 相关文件不应散落到以下宿主目录：

- `src/services/`
- `src/storage/`
- `src/utils/`

尤其是以下部分，必须保持在 `src/ai/` 内聚：

- 索引工作流代码
- 语义搜索逻辑
- provider 接入代码
- embedding persistence 逻辑

### 命名建议

命名应优先表达抽象边界，而不是具体实现品牌。

推荐：

- `EmbeddingProvider`，而不是供应商品牌作为抽象名
- `EmbeddingRepository`，而不是 `JsonRepository` 作为抽象名
- `EmbeddingIndexService`，而不是宿主专用索引命名
- `SemanticSearchService`，而不是 route 专用命名

### 未来迁移到插件形态时的影响范围

如果遵循上述结构，未来迁移到插件导向实现时，主要变化应局限于：

- runtime integration
- configuration injection
- persistence wiring
- host/plugin capability boundary

而以下部分应基本保持可复用：

- chunking 逻辑
- embedding provider 适配
- 索引编排
- 语义搜索编排
- AI 域类型

## 失败处理

第一版应将 AI 索引视为**对同步非阻塞**的能力。

这意味着：

- note 同步成功不依赖 embedding 成功
- embedding 失败应独立记录日志
- 索引失败应可重试

推荐行为：

- sync 先写入 note 内容
- AI 索引随后运行
- 如果 embedding 失败，现有 note API 仍然可用

## 删除处理

当同步源中某篇笔记被删除时，对应 embedding 索引也应被删除。

### 增量同步删除

在增量同步中：

- sync 层识别被删除 note
- 删除本地 note
- 发出 `NoteDeleted`
- AI 索引层删除对应 embedding 索引

### 全量同步删除

全量同步存在一个特别重要的约束：

- **不应在 full sync 开始时先无条件清空本地 note 或索引**

这样做会在同步失败时产生“空仓”窗口，造成比“数据陈旧”更糟糕的系统状态。

第一版推荐采用 **mark-and-sweep**：

1. full sync 开始时生成 `syncRunId`
2. 拉取并处理远端完整集合
3. 将本轮看到的 note 标记为 `seen`
4. full sync 成功结束后，仅删除未被本轮 `seen` 的本地残留 note
5. 对这些被清理的 note 发出 `NoteDeleted`

这样可以避免“先删后建”造成的大规模抖动与失败风险。

## 开放决策

以下问题仍刻意保持开放，留待实现时进一步细化：

- 精确的 chunking 算法
- 是否需要 chunk overlap
- 是否必须存储 chunk text，还是可按需重建
- 精确的相似度度量
- embedding API 的 batching 策略
- provider 瞬时错误的重试策略
- indexing 是 inline、queued 还是 background-scheduled
- reconciliation 的触发频率与扫描范围

## 推荐的第一版实现顺序

建议按以下顺序落地：

1. 定义 AI 核心类型、事件契约与最小 schema
2. 在 sync pipeline 中发出 `NoteUpserted` / `NoteDeleted`
3. 实现 JSON 版 `EmbeddingRepository`
4. 实现最小可用 `Chunker`
5. 实现一个 `EmbeddingProvider`
6. 实现 `EmbeddingIndexService`
7. 实现 `SemanticSearchService` 的 full scan 检索
8. 实现周期性 reconciliation

这个顺序能尽早验证架构边界，同时避免过早陷入 provider 或向量库细节。

## 总结

第一版推荐设计如下：

- 保持 sync 与 AI 关注点分离
- 使用 note 级事件作为 AI 集成边界
- 保留 `SyncCompleted` 作为批次级摘要事件
- 对完整 note 文本执行语义 chunking
- 每篇笔记一个 embedding index JSON 文件
- embedding 保持在 chunk 级别
- 由 `EmbeddingIndexService` 负责索引编排
- 由 `SemanticSearchService` 负责 query embedding、相似度计算与 top-k 排序
- 第一版接受 JSON full scan 检索
- 使用“增量事件 + 周期对账”保证长期一致性
- full sync 删除采用 mark-and-sweep，而不是先清空本地
- 保留迁移到更强插件边界和更强存储后端的路径
