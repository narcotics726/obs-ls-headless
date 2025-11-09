# 加密功能实现方案

## 发现

通过分析 obsidian-livesync 的实现，发现：

1. **obsidian-livesync 使用 Node.js + TypeScript**
2. **livesync-commonlib 作为 git submodule** 引入到 `src/lib`
3. **直接导入 TypeScript 源文件**：`import { xxx } from "../lib/src/..."`
4. **依赖 `octagonal-wheels` npm 包**（提供加密功能）
5. **使用 esbuild 构建**

## 实现方案

### 方案：集成 livesync-commonlib 和 octagonal-wheels

#### 步骤 1：添加依赖

```bash
# 添加 octagonal-wheels（加密库）
npm install octagonal-wheels

# 添加 livesync-commonlib 作为 git submodule
git submodule add https://github.com/vrtmrz/livesync-commonlib src/lib
git submodule update --init --recursive
```

#### 步骤 2：创建加密适配器

创建 `src/utils/livesync-encryption.ts`：

```typescript
import { decryptHKDFWorker } from '../lib/src/worker/bgWorker.ts';
import { MILESTONE_DOCID } from '../lib/src/common/types.ts';
import type { IDocumentStorage } from '../core/interfaces.js';

/**
 * LiveSync 加密工具
 * 使用 livesync-commonlib 的加密实现
 */
export class LiveSyncEncryption {
  private pbkdf2Salt?: Uint8Array;

  constructor(
    private storage: IDocumentStorage,
    private passphrase: string
  ) {}

  /**
   * 获取 PBKDF2 Salt（从 milestone 文档）
   */
  async getPBKDF2Salt(): Promise<Uint8Array> {
    if (this.pbkdf2Salt) {
      return this.pbkdf2Salt;
    }

    const milestone = await this.storage.getDocument(MILESTONE_DOCID);
    if (!milestone || !('tweak_values' in milestone)) {
      throw new Error('Milestone document not found or invalid');
    }

    // 从 milestone 提取 salt
    const tweakValues = Object.values(milestone.tweak_values)[0];
    if (!tweakValues || !tweakValues.pbkdf2Salt) {
      throw new Error('PBKDF2 salt not found in milestone');
    }

    // 转换为 Uint8Array
    this.pbkdf2Salt = new Uint8Array(
      Buffer.from(tweakValues.pbkdf2Salt, 'base64')
    );

    return this.pbkdf2Salt;
  }

  /**
   * 解密 chunk 数据
   */
  async decryptChunk(encryptedData: string): Promise<string> {
    // 检查是否是 HKDF 加密（以 %=  开头）
    if (!encryptedData.startsWith('%=')) {
      // 不是加密数据，直接返回
      return encryptedData;
    }

    const salt = await this.getPBKDF2Salt();
    return await decryptHKDFWorker(encryptedData, this.passphrase, salt);
  }

  /**
   * 批量解密
   */
  async decryptChunks(chunks: string[]): Promise<string[]> {
    return await Promise.all(
      chunks.map(chunk => this.decryptChunk(chunk))
    );
  }
}
```

#### 步骤 3：更新 ChunkAssembler

修改 `src/core/chunk-assembler.ts`：

```typescript
import { LiveSyncEncryption } from '../utils/livesync-encryption.js';

export class ChunkAssembler implements IDocumentAssembler {
  private encryption?: LiveSyncEncryption;

  constructor(
    private storage: IDocumentStorage,
    passphrase?: string
  ) {
    if (passphrase) {
      this.encryption = new LiveSyncEncryption(storage, passphrase);
    }
  }

  private async assembleFromChildren(children: string[]): Promise<string> {
    // ... 现有代码 ...

    for (const chunkId of children) {
      const chunk = chunkDocs.get(chunkId);
      // ... 验证代码 ...

      // 使用 LiveSync 加密解密
      let decryptedChunk: string;
      if (this.encryption) {
        decryptedChunk = await this.encryption.decryptChunk(chunk.data);
      } else {
        // 无加密，直接 base64 解码
        decryptedChunk = Buffer.from(chunk.data, 'base64').toString('utf-8');
      }

      chunks.push(decryptedChunk);
      stats.successfulChunks++;
    }

    return chunks.join('');
  }
}
```

#### 步骤 4：更新 TypeScript 配置

修改 `tsconfig.json`，允许导入 `.ts` 文件：

```json
{
  "compilerOptions": {
    // ... 现有配置 ...
    "allowImportingTsExtensions": true,
    "paths": {
      "@lib/*": ["./src/lib/src/*"]
    }
  },
  "include": ["src/**/*", "src/lib/src/**/*"]
}
```

#### 步骤 5：处理构建

由于 livesync-commonlib 使用 Deno 风格的导入（`.ts` 扩展名），需要配置构建工具：

**选项 A：使用 esbuild（推荐）**

创建 `esbuild.config.js`：

```javascript
import esbuild from 'esbuild';

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/index.js',
  format: 'esm',
  resolveExtensions: ['.ts', '.js'],
  loader: {
    '.ts': 'ts'
  }
});
```

**选项 B：使用 tsx 运行时**

开发时直接使用 tsx（已经支持 `.ts` 导入）：
```bash
npm run dev  # 使用 tsx watch
```

生产构建使用 esbuild 打包。

## 实现步骤总结

1. ✅ 添加 `octagonal-wheels` 依赖
2. ✅ 添加 `livesync-commonlib` 子模块
3. ✅ 创建 `LiveSyncEncryption` 类
4. ✅ 更新 `ChunkAssembler` 使用新的解密
5. ✅ 配置 TypeScript 和构建工具
6. ✅ 测试加密数据库

## 预期工作量

- **代码实现**：2-3 小时
- **测试调试**：1-2 小时
- **文档更新**：30 分钟

**总计**：约 4-6 小时

## 优势

1. **使用官方实现**：直接使用 livesync-commonlib 的加密代码
2. **保持同步**：可以通过 git submodule 更新到最新版本
3. **完整支持**：支持所有 LiveSync 加密格式（V1, V2, HKDF）
4. **Node.js 兼容**：不需要 Deno，继续使用 Node.js

## 潜在问题和解决方案

### 问题 1：Worker 依赖

livesync-commonlib 使用 Web Workers 进行加密。

**解决方案**：
- 在 Node.js 中使用 `worker_threads`
- 或者直接调用同步版本的加密函数

### 问题 2：浏览器 API 依赖

某些代码可能依赖浏览器 API。

**解决方案**：
- 使用 Node.js 的 `crypto` 模块 polyfill
- `octagonal-wheels` 已经处理了大部分兼容性

### 问题 3：类型定义

TypeScript 可能无法正确解析 `.ts` 导入。

**解决方案**：
- 使用 `tsx` 运行时（开发）
- 使用 `esbuild` 构建（生产）
- 配置 `paths` 别名

## 下一步

你想要我：
1. **立即开始实现**这个方案？
2. **先做一个 POC**（概念验证）来测试可行性？
3. **继续使用未加密数据库**，将加密支持作为未来功能？
