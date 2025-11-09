import { createHash, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';
import { DecryptedContent } from '../types/index.js';
import logger from './logger.js';

/**
 * Encryption utilities for Obsidian LiveSync
 * Based on livesync-commonlib implementation
 */

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derive encryption key from passphrase using PBKDF2
 */
function deriveKey(passphrase: string, salt: Buffer, iterations: number = 100000): Buffer {
  return pbkdf2Sync(passphrase, salt, iterations, KEY_LENGTH, 'sha256');
}


/**
 * Decrypt content using AES-256-GCM
 */
export function decryptContent(
  encryptedData: string,
  passphrase: string
): DecryptedContent {
  try {
    // Decode base64
    const buffer = Buffer.from(encryptedData, 'base64');

    // Check if content appears to be encrypted
    if (buffer.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      // Content is too short to be encrypted, likely plain text
      return {
        content: buffer.toString('utf-8'),
        isEncrypted: false,
      };
    }

    // Extract components
    let offset = 0;
    const salt = buffer.subarray(offset, offset + SALT_LENGTH);
    offset += SALT_LENGTH;

    const iv = buffer.subarray(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;

    const authTag = buffer.subarray(offset, offset + AUTH_TAG_LENGTH);
    offset += AUTH_TAG_LENGTH;

    const ciphertext = buffer.subarray(offset);

    // Derive key
    const key = deriveKey(passphrase, salt);

    // Decrypt
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return {
      content: decrypted.toString('utf-8'),
      isEncrypted: true,
    };
  } catch (error: any) {
    // If decryption fails, it might be plain text or wrong passphrase
    logger.debug({ error: error.message }, 'Decryption failed, treating as plain text');

    try {
      // Try to decode as plain base64
      const buffer = Buffer.from(encryptedData, 'base64');
      return {
        content: buffer.toString('utf-8'),
        isEncrypted: false,
      };
    } catch {
      // If even base64 decoding fails, return as-is
      return {
        content: encryptedData,
        isEncrypted: false,
      };
    }
  }
}

/**
 * Encrypt content using AES-256-GCM
 */
export function encryptContent(
  plaintext: string,
  passphrase: string,
  iterations: number = 100000
): string {
  // Generate random salt and IV
  const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(SALT_LENGTH)));
  const iv = Buffer.from(crypto.getRandomValues(new Uint8Array(IV_LENGTH)));

  // Derive key
  const key = deriveKey(passphrase, salt, iterations);

  // Encrypt
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Combine: salt + iv + authTag + ciphertext
  const result = Buffer.concat([salt, iv, authTag, encrypted]);

  // Return as base64
  return result.toString('base64');
}

/**
 * Try to decrypt content, fallback to plain text if decryption fails
 */
export function tryDecrypt(data: string, passphrase?: string): string {
  if (!passphrase) {
    // No passphrase provided, decode as plain base64
    try {
      return Buffer.from(data, 'base64').toString('utf-8');
    } catch {
      return data;
    }
  }

  const result = decryptContent(data, passphrase);
  return result.content;
}

/**
 * Hash passphrase for verification (not used for encryption)
 */
export function hashPassphrase(passphrase: string): string {
  return createHash('sha256').update(passphrase).digest('hex');
}
