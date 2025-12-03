/**
 * LiveSync Encryption/Decryption Utilities
 *
 * Uses octagonal-wheels library to decrypt LiveSync's HKDF-encrypted data.
 * Requires PBKDF2 salt from the milestone document.
 */

import { decrypt as decryptHKDF } from 'octagonal-wheels/encryption/hkdf.js';
import type { IDocumentStorage } from '../core/interfaces.js';
import logger from './logger.js';

const SYNC_PARAMS_DOCID = '_local/obsidian_livesync_sync_parameters';
const HKDF_PREFIX = '%=';

/**
 * LiveSync crypto utility for decrypting HKDF-encrypted chunks
 */
export class LiveSyncCrypto {
  private pbkdf2Salt?: Uint8Array<ArrayBuffer>;

  constructor(
    private storage: IDocumentStorage,
    private passphrase: string
  ) {}

  /**
   * Get PBKDF2 salt from sync parameters document
   * The salt is cached after first retrieval
   */
  private async getPBKDF2Salt(): Promise<Uint8Array<ArrayBuffer>> {
    if (this.pbkdf2Salt) {
      return this.pbkdf2Salt;
    }

    try {
      const syncParams = await this.storage.getDocument(SYNC_PARAMS_DOCID);

      if (!syncParams) {
        throw new Error('Sync parameters document not found. Make sure the database is a valid LiveSync database with encryption enabled.');
      }

      // Sync parameters document structure:
      // {
      //   _id: "_local/obsidian_livesync_sync_parameters",
      //   type: "sync-parameters",
      //   pbkdf2salt: "base64-encoded-salt",  // <-- Note: lowercase 'salt'
      //   ...
      // }

      // Debug: log sync params structure
      logger.debug({
        syncParamsKeys: Object.keys(syncParams),
        hasPbkdf2salt: 'pbkdf2salt' in syncParams,
      }, 'Sync parameters document structure');

      const saltBase64 = (syncParams as any).pbkdf2salt;
      if (!saltBase64) {
        throw new Error('pbkdf2salt not found in sync parameters document');
      }

      const buffer = Buffer.from(saltBase64, 'base64');
      this.pbkdf2Salt = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

      logger.info({
        saltLength: this.pbkdf2Salt.length,
      }, 'PBKDF2 salt loaded from sync parameters');

      return this.pbkdf2Salt;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get PBKDF2 salt');
      throw new Error(`Failed to load encryption salt: ${error.message}`);
    }
  }

  /**
   * Check if data is HKDF encrypted (starts with %=)
   */
  isEncrypted(data: string): boolean {
    return data.startsWith(HKDF_PREFIX);
  }

  /**
   * Decrypt a single chunk of data
   * If data is not encrypted, returns it as-is
   */
  async decrypt(encryptedData: string): Promise<string> {
    // If not encrypted, return as-is
    if (!this.isEncrypted(encryptedData)) {
      logger.debug('Data is not HKDF encrypted, returning as-is');
      return encryptedData;
    }

    try {
      const salt = await this.getPBKDF2Salt();

      // Call octagonal-wheels HKDF decryption
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
        dataPrefix: encryptedData.substring(0, 20)
      }, 'Failed to decrypt chunk');
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt multiple chunks in parallel
   */
  async decryptBatch(chunks: string[]): Promise<string[]> {
    return await Promise.all(
      chunks.map(chunk => this.decrypt(chunk))
    );
  }
}
