# AI Embedding 实施计划

## 目标

本文档用于把 `docs/plan/AI-Embedding-Design.md` 中已经确定的设计，转化为一份可以按迭代执行的实施计划。

本计划面向当前阶段的目标是：

- 先搭建 `src/ai/` 子域骨架
- 以小步迭代方式逐步补齐逻辑实现
- 每一轮都配套最小可验证测试
- 在保证边界稳定的前提下，延后不阻塞主线的算法与 provider 细节决策

本文档不重复解释完整架构设计，而是聚焦：

- 每一轮要做什么
- 会改哪些文件
- 如何验证完成
- 哪些问题可延后，哪些不能延后

## 实施原则

### 先骨架，后逻辑

第一步不是追求功能完整，而是先把目录结构、接口、类型、空实现与 wiring 骨架搭起来。

这样做的目标是：

- 先把边界固定下来
- 避免后续逻辑实现反向污染架构
- 让测试可以从接口层开始覆盖

### 小步增量，循环验证

每一轮迭代都应满足：

- 只推进一个明确增量
- 修改范围尽量局部
- 完成后可编译、可测试、可回读

不采用“一次性把所有 AI 模块铺开”的方式。

### 先抽象，后真实实现

能先用 stub、fake、in-memory 替代的地方，优先用替代实现打通工作流，再逐步接入真实 provider 或更复杂逻辑。

典型包括：

- 先用 stub `EmbeddingProvider`
- 先实现最小 `Chunker`
- 先以 JSON full scan 完成搜索闭环

### 优先保证可恢复性

在当前事件总线非持久化的前提下，任何只依赖“事件必达”的方案都不应作为完成标准。

因此执行中必须优先落实：

- note 级事件契约
- 删除闭环
- reconciliation 兜底

### 文档与代码同步演进

每个重要阶段完成后，应及时回写设计与计划文档，避免实现已经偏移而文档仍停留在旧状态。

## 迭代计划

### Iteration 1：AI 子域骨架与事件契约

目标：先搭建最小结构，使 AI 模块在代码组织上落地，但暂不实现复杂业务逻辑。

建议新增或修改：

- `src/types/index.ts`
  - 增加 `NoteUpserted` / `NoteDeleted` 事件类型
- `src/ai/types/`
  - AI 域类型定义
- `src/ai/chunking/`
  - `Chunker` 接口与占位实现
- `src/ai/providers/`
  - `EmbeddingProvider` 接口与 stub 实现
- `src/ai/repositories/`
  - `EmbeddingRepository` 接口与占位实现
- `src/ai/services/`
  - `EmbeddingIndexService` / `SemanticSearchService` 骨架
- `src/ai/runtime/`
  - AI runtime wiring 占位

本轮完成标准：

- `src/ai/` 目录结构建立
- 核心接口与基础类型稳定
- 主程序可以创建 AI runtime，但默认不执行实际索引逻辑
- 相关类型检查通过

本轮测试重点：

- 类型结构与基础实例化测试
- runtime 占位 wiring 测试

### Iteration 2：在同步链路中发出 note 级事件

目标：让 sync 层具备向 AI 暴露稳定变化信号的能力。

建议修改：

- `src/services/sync-service.ts`
  - 在 note 成功持久化后发出 `NoteUpserted`
  - 在 note 删除后发出 `NoteDeleted`
- 相关测试文件
  - 扩展 sync-service 的事件行为测试

本轮完成标准：

- 增量同步可发出 `NoteUpserted` / `NoteDeleted`
- `SyncCompleted` 仍保留批次摘要语义
- 事件 payload 满足设计文档中的最小字段要求

本轮测试重点：

- 新增/更新/删除三种路径的事件测试
- 空变更场景测试
- full / incremental 两条分支的事件行为测试

### Iteration 3：JSON 版 EmbeddingRepository 最小实现

目标：先把 embedding index 的本地落盘闭环建立起来。

建议新增：

- `src/ai/repositories/json-embedding-repository.ts`
- 对应测试文件

建议能力：

- 保存单个 note 索引
- 读取单个 note 索引
- 删除单个 note 索引
- 遍历所有索引

本轮完成标准：

- 可以把符合最小 schema 的 note index 写入本地 JSON
- 可以读取、删除、遍历
- 文件路径与命名策略明确

本轮测试重点：

- 写入/覆盖测试
- 读取不存在文件测试
- 删除测试
- 遍历测试
- 路径安全与目录初始化测试

### Iteration 4：最小 Chunker

目标：先实现一个足够简单但可用的 chunking v1。

建议新增：

- 默认 chunker 实现
- 对应单元测试

建议 v1 策略：

- 先按简单文本块切分
- 保留 order 与基础 offset
- 暂不追求复杂语义策略

本轮完成标准：

- 对给定 note 文本可稳定产出 chunk 列表
- 输出元数据满足索引 schema 需要

本轮测试重点：

- 空文本
- 短文本
- 长文本
- 多段文本
- offset/order 正确性

### Iteration 5：Stub Provider + EmbeddingIndexService 打通

目标：不依赖真实外部服务，先打通从 note 事件到索引写入的完整主链路。

建议实现：

- stub `EmbeddingProvider`
  - 返回固定维度、可预测 embedding
- `EmbeddingIndexService`
  - 处理 upsert
  - 处理 delete
  - 根据 `content_hash` 跳过重复构建

建议修改：

- `src/ai/runtime/`
  - 订阅 `NoteUpserted` / `NoteDeleted`
  - 调用 `EmbeddingIndexService`

本轮完成标准：

- 收到 note 级事件后可生成并写入索引
- 删除事件可触发索引删除
- 重复内容不会重复生成 embedding

本轮测试重点：

- upsert 流程测试
- delete 流程测试
- skip unchanged 测试
- runtime 订阅到 service 调用的集成测试

### Iteration 6：SemanticSearchService 最小可用版

目标：先做一个 JSON full scan 的可用查询闭环。

建议实现：

- query embedding
- 读取所有 note index
- 相似度计算
- top-k 排序与结果整形

本轮完成标准：

- 给定查询可返回可解释的匹配结果
- 结果至少包含 note 与 chunk 上下文

本轮测试重点：

- 相似度排序测试
- top-k 测试
- 空索引集测试
- 查询结果整形测试

### Iteration 7：Reconciliation 与删除完整闭环

目标：补上仅靠事件无法保证的一致性闭环。

建议实现：

- note repository 与 embedding repository 的对账器
- orphan index 清理
- 缺失索引补建
- 版本漂移重建

同时完善：

- full sync 的 mark-and-sweep 删除策略
- 对账触发入口（手动或定时）

本轮完成标准：

- 可以发现并修复索引漂移
- full sync 删除闭环在设计与实现层统一

本轮测试重点：

- orphan index 清理测试
- 缺失 index 补建测试
- version mismatch 重建测试
- full sync prune 测试

### Iteration 8：真实 Provider 接入与优化

目标：在主链路已经稳定后，再引入真实 embedding backend。

建议实现：

- 一个真实 `EmbeddingProvider`
- provider 配置注入
- 限流、批处理、错误归一化

本轮完成标准：

- 在不改变上层编排的前提下切换到真实 provider
- 基础错误处理与重试策略可用

本轮测试重点：

- provider 适配测试
- 失败重试测试
- 配置注入测试
- 必要的集成测试

## 验证策略

### 每一轮都做的验证

每次迭代结束后至少执行：

- 相关单元测试
- 受影响模块的集成测试
- 类型检查

如果该轮改动影响主程序启动 wiring，还应补充：

- 启动路径验证
- 事件流验证

### 测试优先级

建议按以下顺序构建测试：

1. 纯类型与接口行为测试
2. 单模块单元测试
3. orchestration 集成测试
4. 涉及真实 provider 的集成测试

### Mock / Stub 使用策略

为了维持迭代速度，建议优先使用：

- fake note 数据
- stub `EmbeddingProvider`
- 临时目录下的 JSON repository 测试
- 事件总线的测试替身或真实内存实现

这样可以把“业务编排是否正确”和“外部 provider 是否稳定”分开验证。

### 文档回写要求

以下变化发生后，应同步更新设计或实施计划文档：

- schema 字段调整
- 事件 payload 调整
- iteration 边界调整
- 删除/对账策略变化

## 风险与待决项

### 当前已知风险

- 当前事件总线非持久化，不能把事件当作唯一事实来源
- full sync 删除闭环尚未落地前，索引可能发生漂移
- provider 真实接入前，搜索质量评估只能依赖 stub 行为
- chunking v1 过于简单时，后续可能需要重建既有索引

### 当前允许延后的问题

以下问题可以延后到对应迭代中决定，而不阻塞当前计划启动：

- chunking v1 的精确规则
- 首个真实 provider 选型
- 相似度度量最终方案
- reconciliation 的触发频率
- 搜索 API 的对外形态

### 当前不能再延后的问题

以下问题必须在实现前两轮内固定：

- `NoteUpserted` / `NoteDeleted` 的事件契约
- 最小 JSON schema
- embedding index 的目录与文件命名策略
- `src/ai/runtime` 如何接入现有 `src/index.ts`

### 完成信号

当以下条件满足时，可认为第一版 AI embedding 主链路已经建立：

- sync 可以发出稳定的 note 级事件
- AI runtime 可以消费事件并驱动索引服务
- embedding index 可以稳定落盘与删除
- semantic search 可以完成最小可用查询
- reconciliation 可以发现并修复常见漂移
