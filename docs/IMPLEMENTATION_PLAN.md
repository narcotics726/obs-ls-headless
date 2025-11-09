# LiveSync Chunk 组合实现方案

## 问题分析

### LiveSync 文档存储机制

根据 livesync-commonlib 的源码分析，LiveSync 使用以下文档结构：

#### 1. 文档类型 (EntryTypes)
```typescript
{
  NOTE_BINARY: "newnote",    // 二进制/Markdown 文件
  NOTE_PLAIN: "plain",       // 纯文本文件
  CHUNK: "leaf",             // 数据块
  CHUNK_PACK: "chunkpack",   // 打包的数据块
}
```

#### 2. 文档结构

**元数据文档 (NewEntry/PlainEntry)**:
```typescript
{
  _id: string;                    // 文档路径（可能经过混淆）
  _rev: string;
  type: "newnote" | "plain";
  path: FilePathWithPrefix;       // 文件路径
  children: string[];             // Chunk ID 列表（指向 leaf 文档）
  ctime: number;
  mtime: number;
  size: number;
  deleted?: boolean;
  eden?: Record<DocumentID, EdenChunk>;  // Eden 缓存（可选）
}
```

**Chunk 文档 (EntryLeaf)**:
```typescript
{
  _id: "h:xxxxx" | "h:+xxxxx";   // h: 前缀（未加密）或 h:+ 前缀（加密）
  _rev: string;
  type: "leaf";
  data: string;                   // Base64 编码的数据块
}
```

#### 3. 文档 ID 前缀含义
- `h:` - 未加密的 chunk（hash-based）
- `h:+` - 加密的 chunk
- `ps:` - Path-to-hash 映射（路径混淆时使用）
- `ix:` - 索引文档
- `leaf:` - （旧版本？）
- 无前缀 - 元数据文档（文件路径或混淆后的 ID）

### 为什么我们看不到笔记？

当前实现的问题：
1. 我们过滤掉了所有包含 `:` 的文档（包括 `h:` 开头的 chunk）
2. 我们只读取元数据文档，但元数据文档只有 `children` 字段，没有 `data` 字段
3. 需要根据 `children` 字段去读取对应的 chunk 文档，然后组合成完整内容

## 实现方案

### 方案概述

实现一个简化版的 chunk 组合逻辑，支持：
1. 读取元数据文档（type="newnote" 或 "plain"）
2. 根据 `children` 字段读取所有 chunk 文档
3. 组合 chunk 数据并解密
4. 支持 Eden 缓存（可选优化）

### 实现步骤

#### 第 1 步：更新类型定义

```typescript
// src/types/index.ts

export interface LiveSyncDocument {
  _id: string;
  _rev?: string;
  type?: 'newnote' | 'plain' | 'leaf' | 'chunkpack';
  path?: string;

  // 元数据文档字段
  children?: string[];  // Chunk IDs

  // Chunk 文档字段
  data?: string;        // Base64 编码的内容（chunk 或完整内容）

  // 通用字段
  mtime?: number;
  ctime?: number;
  size?: number;
  deleted?: boolean;
  _deleted?: boolean;

  // Eden 缓存（可选）
  eden?: Record<string, { data: string; epoch: number }>;
}
```

#### 第 2 步：实现 Chunk 读取和组合

创建新文件 `src/core/chunk-assembler.ts`:

```typescript
import { CouchDBClient } from './couchdb-client.js';
import { LiveSyncDocument } from '../types/index.js';
import { tryDecrypt } from '../utils/encryption.js';
import logger from '../utils/logger.js';

export class ChunkAssembler {
  constructor(
    private client: CouchDBClient,
    private passphrase?: string
  ) {}

  /**
   * 组合文档的所有 chunks
   */
  async assembleDocument(doc: LiveSyncDocument): Promise<string | null> {
    // 情况 1: 文档直接包含 data（旧格式或小文件）
    if (doc.data) {
      return tryDecrypt(doc.data, this.passphrase);
    }

    // 情况 2: 文档使用 children（chunk 分块存储）
    if (doc.children && doc.children.length > 0) {
      return await this.assembleFromChildren(doc.children);
    }

    // 情况 3: 检查 Eden 缓存
    if (doc.eden && Object.keys(doc.eden).length > 0) {
      return await this.assembleFromEden(doc.eden);
    }

    logger.warn({ docId: doc._id }, 'Document has no data, children, or eden');
    return null;
  }

  /**
   * 从 children 字段组合数据
   */
  private async assembleFromChildren(children: string[]): Promise<string> {
    const chunks: string[] = [];

    for (const chunkId of children) {
      const chunk = await this.client.getDocument(chunkId);

      if (!chunk) {
        logger.error({ chunkId }, 'Chunk not found');
        throw new Error(`Chunk not found: ${chunkId}`);
      }

      if (chunk.type !== 'leaf') {
        logger.warn({ chunkId, type: chunk.type }, 'Unexpected chunk type');
      }

      if (!chunk.data) {
        logger.error({ chunkId }, 'Chunk has no data');
        throw new Error(`Chunk has no data: ${chunkId}`);
      }

      // Chunk 数据可能是加密的
      const decryptedChunk = tryDecrypt(chunk.data, this.passphrase);
      chunks.push(decryptedChunk);
    }

    // 组合所有 chunks
    return chunks.join('');
  }

  /**
   * 从 Eden 缓存组合数据（优化路径）
   */
  private async assembleFromEden(
    eden: Record<string, { data: string; epoch: number }>
  ): Promise<string> {
    // Eden 是一个优化的缓存机制，包含最近的 chunks
    // 按 epoch 排序并组合
    const sortedChunks = Object.entries(eden)
      .sort(([, a], [, b]) => a.epoch - b.epoch)
      .map(([, chunk]) => tryDecrypt(chunk.data, this.passphrase));

    return sortedChunks.join('');
  }
}
```

#### 第 3 步：更新 SyncService

修改 `src/services/sync-service.ts`:

```typescript
import { ChunkAssembler } from '../core/chunk-assembler.js';

export class SyncService {
  private client: CouchDBClient;
  private assembler: ChunkAssembler;
  // ... 其他字段

  constructor(client: CouchDBClient, passphrase?: string) {
    this.client = client;
    this.passphrase = passphrase;
    this.assembler = new ChunkAssembler(client, passphrase);
    // ...
  }

  private async processDocuments(documents: LiveSyncDocument[]): Promise<void> {
    for (const doc of documents) {
      // 跳过 chunk 文档（h:, h:+）
      if (doc._id.startsWith('h:')) {
        continue;
      }

      // 跳过其他内部文档
      if (doc._id.includes(':')) {
        continue;
      }

      // 跳过已删除的文档
      if (doc.deleted || doc._deleted) {
        continue;
      }

      // 只处理笔记类型
      if (!doc.type || (doc.type !== 'newnote' && doc.type !== 'plain')) {
        continue;
      }

      // 必须有 path
      if (!doc.path) {
        logger.warn({ docId: doc._id }, 'Document missing path');
        continue;
      }

      try {
        // 组合文档内容
        const content = await this.assembler.assembleDocument(doc);

        if (content === null) {
          logger.warn({ docId: doc._id, path: doc.path }, 'Failed to assemble document content');
          continue;
        }

        const note: Note = {
          id: doc._id,
          path: doc.path,
          content,
          mtime: doc.mtime ? new Date(doc.mtime) : new Date(),
          ctime: doc.ctime ? new Date(doc.ctime) : new Date(),
          size: doc.size || 0,
        };

        this.notes.set(doc._id, note);
        logger.debug({ docId: doc._id, path: doc.path }, 'Note processed successfully');
      } catch (error) {
        logger.error({ error, docId: doc._id, path: doc.path }, 'Failed to process document');
      }
    }
  }
}
```

#### 第 4 步：优化 - 批量读取 Chunks

为了提高性能，可以批量读取 chunks：

```typescript
// src/core/couchdb-client.ts

export class CouchDBClient {
  // ... 现有方法

  /**
   * 批量获取文档
   */
  async getDocuments(ids: string[]): Promise<Map<string, LiveSyncDocument>> {
    try {
      const result = await this.db.fetch({
        keys: ids,
      });

      const docs = new Map<string, LiveSyncDocument>();
      for (const row of result.rows) {
        if (row.doc && !row.error) {
          docs.set(row.id, row.doc as LiveSyncDocument);
        }
      }

      return docs;
    } catch (error) {
      logger.error({ error, ids }, 'Failed to fetch documents');
      throw error;
    }
  }
}
```

然后在 ChunkAssembler 中使用批量读取：

```typescript
private async assembleFromChildren(children: string[]): Promise<string> {
  // 批量读取所有 chunks
  const chunkDocs = await this.client.getDocuments(children);

  const chunks: string[] = [];
  for (const chunkId of children) {
    const chunk = chunkDocs.get(chunkId);

    if (!chunk || !chunk.data) {
      throw new Error(`Chunk not found or has no data: ${chunkId}`);
    }

    const decryptedChunk = tryDecrypt(chunk.data, this.passphrase);
    chunks.push(decryptedChunk);
  }

  return chunks.join('');
}
```

## 测试计划

### 1. 单元测试
- 测试 ChunkAssembler.assembleDocument() 的各种情况
- 测试加密和未加密的 chunks
- 测试 Eden 缓存

### 2. 集成测试
- 使用真实的 LiveSync CouchDB 数据库测试
- 验证能否正确读取和组合笔记

### 3. 调试步骤
1. 运行 `npm run debug-sync`
2. 检查日志输出，确认：
   - 找到了多少个元数据文档
   - 每个文档有多少个 children
   - Chunk 读取是否成功
   - 内容组合是否正确

## 潜在问题和解决方案

### 问题 1: 路径混淆 (Path Obfuscation)
如果启用了路径混淆，`doc.path` 可能是混淆后的值。

**解决方案**：
- 需要 `obfuscatePassphrase` 来解混淆
- 查看 livesync-commonlib 中的 `id2path_base()` 函数
- 暂时可以先显示混淆后的路径

### 问题 2: Chunk 加密
Chunk 的 `data` 字段可能是加密的。

**解决方案**：
- 使用 `tryDecrypt()` 处理每个 chunk
- 如果解密失败，可能是密码错误或 chunk 未加密

### 问题 3: 性能问题
大量文件时，逐个读取 chunk 会很慢。

**解决方案**：
- 使用批量读取 API (`db.fetch()`)
- 实现并发控制（如 Promise.all 配合限流）
- 考虑缓存机制

### 问题 4: Eden 缓存
Eden 是一个优化机制，可能包含部分或全部内容。

**解决方案**：
- 优先使用 Eden（如果存在）
- 如果 Eden 不完整，回退到 children

## 下一步行动

1. **实现 ChunkAssembler 类**
2. **更新 SyncService 使用 ChunkAssembler**
3. **添加批量读取支持到 CouchDBClient**
4. **测试并调试**
5. **优化性能**（如果需要）

## 参考资料

- livesync-commonlib: `/home/nark/workspace/obs-ls-headless/livesync-commonlib`
- 关键文件：
  - `src/common/types.ts` - 类型定义
  - `src/API/DirectFileManipulatorV2.ts` - 文件操作 API
  - `src/pouchdb/LiveSyncLocalDB.ts` - 数据库操作
