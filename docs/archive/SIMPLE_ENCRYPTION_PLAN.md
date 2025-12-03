# 简化加密实现方案

## 核心发现

**只需要 `octagonal-wheels` 包！**

不需要完整的 livesync-commonlib，只需要：
1. 安装 `octagonal-wheels`
2. 从 milestone 文档获取 PBKDF2 salt
3. 调用 `decryptHKDF()` 函数

## 实现步骤

### 步骤 1：安装依赖

```bash
npm install octagonal-wheels
```

### 步骤 2：创建简化的加密工具

创建 `src/utils/livesync-crypto.ts`：

```typescript
import { decrypt as decryptHKDF } from 'octagonal-wheels/encryption/hkdf';
import type { IDocumentStorage } from '../core/interfaces.js';
import logger from './logger.js';

const MILESTONE_DOCID = '_local/obsydian_livesync_milestone';
const HKDF_PREFIX = '%=';

/**
 * LiveSync 加密工具（仅解密）
 */
export class LiveSyncCrypto {
  private pbkdf2Salt?: Uint8Array;

  constructor(
    private storage: IDocumentStorage,
    private passphrase: string
  ) {}

  /**
   * 从 milestone 文档获取 PBKDF2 Salt
   */
  private async getPBKDF2Salt(): Promise<Uint8Array> {
    if (this.pbkdf2Salt) {
      return this.pbkdf2Salt;
    }

    try {
      const milestone = await this.storage.getDocument(MILESTONE_DOCID);

      if (!milestone) {
        throw new Error('Milestone document not found');
      }

      // milestone 文档结构：
      // {
      //   _id: "_local/obsydian_livesync_milestone",
      //   tweak_values: {
      //     [timestamp]: {
      //       pbkdf2Salt: "base64-encoded-salt",
      //       ...
      //     }
      //   }
      // }

      const tweakValues = (milestone as any).tweak_values;
      if (!tweakValues) {
        throw new Error('tweak_values not found in milestone');
      }

      // 获取最新的 tweak value（通常只有一个）
      const latestTweak = Object.values(tweakValues)[0] as any;
      if (!latestTweak || !latestTweak.pbkdf2Salt) {
        throw new Error('pbkdf2Salt not found in milestone');
      }

      // 转换 base64 到 Uint8Array
      const saltBase64 = latestTweak.pbkdf2Salt;
      this.pbkdf2Salt = new Uint8Array(
        Buffer.from(saltBase64, 'base64')
      );

      logger.info({ saltLength: this.pbkdf2Salt.length }, 'PBKDF2 salt loaded');
      return this.pbkdf2Salt;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get PBKDF2 salt');
      throw error;
    }
  }

  /**
   * 检查数据是否加密
   */
  isEncrypted(data: string): boolean {
    return data.startsWith(HKDF_PREFIX);
  }

  /**
   * 解密单个 chunk
   */
  async decrypt(encryptedData: string): Promise<string> {
    // 如果不是加密数据，直接返回
    if (!this.isEncrypted(encryptedData)) {
      logger.debug('Data is not encrypted, returning as-is');
      return encryptedData;
    }

    try {
      const salt = await this.getPBKDF2Salt();

      // 调用 octagonal-wheels 的 HKDF 解密
      const decrypted = await decryptHKDF(
        encryptedData,
        this.passphrase,
        salt
      );

      logger.debug({
        encryptedLength: encryptedData.length,
        decryptedLength: decrypted.length
      }, 'Chunk decrypted successfully');

      return decrypted;
    } catch (error: any) {
      logger.error({
        error: error.message,
        dataPreview: encryptedData.substring(0, 50)
      }, 'Failed to decrypt chunk');
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * 批量解密
   */
  async decryptBatch(chunks: string[]): Promise<string[]> {
    return await Promise.all(
      chunks.map(chunk => this.decrypt(chunk))
    );
  }
}
```

### 步骤 3：更新 ChunkAssembler

修改 `src/core/chunk-assembler.ts`：

```typescript
import { LiveSyncCrypto } from '../utils/livesync-crypto.js';

export class ChunkAssembler implements IDocumentAssembler {
  private crypto?: LiveSyncCrypto;

  constructor(
    private storage: IDocumentStorage,
    passphrase?: string
  ) {
    if (passphrase) {
      this.crypto = new LiveSyncCrypto(storage, passphrase);
    }
  }

  private async assembleFromChildren(children: string[]): Promise<string> {
    // ... 现有的 bulk fetch 代码 ...

    const chunks: string[] = [];

    for (const chunkId of children) {
      const chunk = chunkDocs.get(chunkId);

      if (!chunk || !chunk.data) {
        throw new Error(`Chunk not found or has no data: ${chunkId}`);
      }

      // 解密或解码
      let decryptedChunk: string;
      if (this.crypto) {
        // 使用 LiveSync 加密解密
        decryptedChunk = await this.crypto.decrypt(chunk.data);
      } else {
        // 无加密，直接 base64 解码
        decryptedChunk = Buffer.from(chunk.data, 'base64').toString('utf-8');
      }

      chunks.push(decryptedChunk);
      stats.successfulChunks++;
    }

    return chunks.join('');
  }

  // Eden 同样处理
  private async assembleFromEden(
    eden: Record<string, { data: string; epoch: number }>
  ): Promise<string> {
    const sortedChunks = Object.entries(eden)
      .sort(([, a], [, b]) => a.epoch - b.epoch);

    const decryptedChunks: string[] = [];

    for (const [chunkId, chunk] of sortedChunks) {
      if (this.crypto) {
        const decrypted = await this.crypto.decrypt(chunk.data);
        decryptedChunks.push(decrypted);
      } else {
        const decoded = Buffer.from(chunk.data, 'base64').toString('utf-8');
        decryptedChunks.push(decoded);
      }
    }

    return decryptedChunks.join('');
  }
}
```

### 步骤 4：更新 package.json

```json
{
  "dependencies": {
    // ... 现有依赖 ...
    "octagonal-wheels": "^0.1.44"
  }
}
```

## 优势

1. **极简依赖**：只需要一个 npm 包
2. **无需子模块**：不需要 git submodule
3. **直接使用**：octagonal-wheels 已经是 npm 包
4. **官方实现**：使用 LiveSync 作者的加密库
5. **快速实现**：约 1-2 小时即可完成

## 测试步骤

1. 安装依赖：`npm install octagonal-wheels`
2. 实现上述代码
3. 运行 `npm run debug-sync`
4. 验证能否正确解密和显示笔记内容

## 预期结果

运行 debug-sync 后应该看到：

```
=== Random Note Content Sample ===
Selected random note: {
  path: "Inbox/202510251914.md",
  totalLength: 4301  // 不再是 0！
}

--- Random Paragraphs ---
[Paragraph 1/10]
# 这是笔记标题

这是笔记的第一段内容...
```

## 工作量

- **代码实现**：1 小时
- **测试调试**：1 小时
- **总计**：约 2 小时

## 下一步

准备好开始实现了吗？我可以：
1. 立即开始编写代码
2. 先创建一个最小测试来验证 octagonal-wheels 能否工作
