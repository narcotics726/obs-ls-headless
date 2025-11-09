# Chunk Assembly Implementation Summary

## 实现完成

已成功实现 LiveSync 文档的 chunk 组合逻辑，支持从 CouchDB 读取和组装分块存储的笔记。

## 架构设计

### 1. 接口抽象层 (`src/core/interfaces.ts`)

创建了清晰的接口定义，便于后续切换实现：

```typescript
// 文档组装器接口
interface IDocumentAssembler {
  assembleDocument(doc: LiveSyncDocument): Promise<string | null>;
}

// 文档存储接口
interface IDocumentStorage {
  getDocument(id: string): Promise<LiveSyncDocument | null>;
  getDocuments(ids: string[]): Promise<Map<string, LiveSyncDocument>>;
  getAllDocuments(): Promise<LiveSyncDocument[]>;
}
```

**设计优势**：
- 逻辑内聚：每个接口职责单一明确
- 易于测试：可以轻松 mock 实现
- 可替换性：未来可以直接替换为 livesync-commonlib 的实现

### 2. CouchDB 客户端增强 (`src/core/couchdb-client.ts`)

**新增功能**：
- 实现 `IDocumentStorage` 接口
- 添加 `getDocuments()` 批量读取方法
- 使用 CouchDB 的 `fetch()` API 提高性能

**批量读取优势**：
- 减少网络往返次数
- 提高大文件（多 chunk）的读取效率
- 自动处理缺失的 chunk

### 3. Chunk 组装器 (`src/core/chunk-assembler.ts`)

**核心类**: `ChunkAssembler implements IDocumentAssembler`

**支持三种数据源**：

1. **Direct Data**（直接数据）
   - 小文件或旧格式
   - 直接从 `doc.data` 字段读取

2. **Children Chunks**（子块）
   - 大文件分块存储
   - 从 `doc.children` 数组读取 chunk IDs
   - 批量获取所有 chunks
   - 按顺序组合并解密

3. **Eden Cache**（Eden 缓存）
   - 优化的缓存机制
   - 从 `doc.eden` 对象读取
   - 按 epoch 排序后组合

**错误处理**：
- 详细的日志记录
- 缺失 chunk 的错误提示
- 统计信息（成功/失败 chunk 数量）

### 4. 同步服务更新 (`src/services/sync-service.ts`)

**主要改进**：

1. **依赖注入**：
   ```typescript
   constructor(client: CouchDBClient, passphrase?: string) {
     this.assembler = new ChunkAssembler(client, passphrase);
   }
   ```

2. **可替换实现**：
   ```typescript
   setAssembler(assembler: IDocumentAssembler): void {
     this.assembler = assembler;
   }
   ```

3. **改进的文档过滤**：
   - 跳过 chunk 文档（`h:`, `h:+`）
   - 跳过其他内部文档（`ps:`, `ix:` 等）
   - 只处理元数据文档（`type="newnote"` 或 `"plain"`）

4. **异步处理**：
   - `processDocuments()` 改为 async
   - 支持并发 chunk 读取

5. **详细统计**：
   - 处理成功/跳过/错误的文档数量
   - 每个笔记的内容长度

### 5. 类型定义更新 (`src/types/index.ts`)

**新增类型**：

```typescript
interface LiveSyncDocument {
  // ... 现有字段
  children?: string[];              // Chunk IDs
  eden?: Record<string, EdenChunk>; // Eden cache
  type?: 'newnote' | 'plain' | 'leaf' | 'chunkpack';
}

interface EdenChunk {
  data: string;  // Base64 encoded
  epoch: number; // Ordering
}
```

## 文档存储机制

### LiveSync 的三层存储结构

```
┌─────────────────────────────────────────┐
│     元数据文档 (Metadata Document)        │
│  _id: "path/to/note.md"                 │
│  type: "newnote"                        │
│  path: "path/to/note.md"                │
│  children: ["h:abc", "h:def", "h:ghi"]  │
│  eden: { "h:abc": {...}, ... }          │
└─────────────────────────────────────────┘
              │
              ├─────────────────┬─────────────────┐
              ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ Chunk h:abc  │  │ Chunk h:def  │  │ Chunk h:ghi  │
    │ type: "leaf" │  │ type: "leaf" │  │ type: "leaf" │
    │ data: "..."  │  │ data: "..."  │  │ data: "..."  │
    └──────────────┘  └──────────────┘  └──────────────┘
```

### 组装流程

```
1. 读取元数据文档
   ↓
2. 检查数据源优先级：
   - 有 data 字段？ → 直接使用
   - 有 eden 缓存？ → 使用 eden
   - 有 children？  → 读取 chunks
   ↓
3. 批量读取所有 chunks (如果需要)
   ↓
4. 解密每个 chunk
   ↓
5. 按顺序组合
   ↓
6. 返回完整内容
```

## 测试方法

### 运行调试脚本

```bash
npm run debug-sync
```

### 预期输出

```
=== Starting Debug Sync ===
Configuration loaded: { url: '...', database: '...', hasPassphrase: true }
Testing CouchDB connection...
CouchDB connection successful
Database info: { docCount: 1234, updateSeq: '...', dbName: '...' }
Starting sync operation...
Document processing summary: {
  total: 1234,
  processed: 50,
  skipped: 1180,
  errors: 4
}
Sync status: {
  lastSyncTime: '...',
  lastSyncSuccess: true,
  documentsCount: 1234
}
Notes retrieved: { notesCount: 50 }
=== Sample Notes ===
Note 1: {
  id: 'daily/2024-01-01.md',
  path: 'daily/2024-01-01.md',
  size: 1234,
  contentPreview: '# Daily Note...'
}
...
```

### 日志级别

调试时设置 `logger.level = 'debug'` 可以看到：
- 每个文档的处理过程
- Chunk 读取详情
- 组装统计信息

## 性能优化

### 已实现的优化

1. **批量读取**：使用 `db.fetch()` 一次性读取所有 chunks
2. **Eden 优先**：优先使用缓存的 chunks
3. **并发处理**：异步处理多个文档

### 未来可优化

1. **并发限制**：使用 `p-limit` 控制并发数
2. **缓存层**：缓存已组装的文档
3. **增量同步**：只处理变更的文档
4. **流式处理**：对超大文件使用流式组装

## 切换到 livesync-commonlib

如果未来需要使用官方的 DirectFileManipulator：

```typescript
// 创建适配器
class DirectFileManipulatorAdapter implements IDocumentAssembler {
  constructor(private manipulator: DirectFileManipulator) {}

  async assembleDocument(doc: LiveSyncDocument): Promise<string | null> {
    const entry = await this.manipulator.get(doc.path);
    if (!entry) return null;
    return entry.data;
  }
}

// 在 SyncService 中切换
const adapter = new DirectFileManipulatorAdapter(manipulator);
syncService.setAssembler(adapter);
```

## 已知限制

1. **路径混淆**：暂不支持路径混淆（需要 `obfuscatePassphrase`）
2. **压缩**：暂不支持压缩的 chunks
3. **ChunkPack**：暂不支持 `chunkpack` 类型（打包的 chunks）

## 文件清单

### 新增文件
- `src/core/interfaces.ts` - 接口定义
- `src/core/chunk-assembler.ts` - Chunk 组装器
- `IMPLEMENTATION_PLAN.md` - 实现规划
- `CHUNK_IMPLEMENTATION_SUMMARY.md` - 本文档

### 修改文件
- `src/core/couchdb-client.ts` - 添加批量读取
- `src/services/sync-service.ts` - 使用组装器
- `src/types/index.ts` - 更新类型定义

## 下一步

1. **测试验证**：运行 `npm run debug-sync` 验证功能
2. **性能测试**：测试大量文档的同步性能
3. **错误处理**：根据实际使用情况完善错误处理
4. **文档完善**：更新 CLAUDE.md 和 README.md
