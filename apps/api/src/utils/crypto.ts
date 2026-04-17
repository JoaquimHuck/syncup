/**
 * Encryption utilities for securing OAuth tokens at rest.
 * Uses AES-256-GCM with a random IV per encryption operation.
 */
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY env variable is not set');
  // Accept 64-char hex (32 bytes) or 32-char raw
  const buf = Buffer.from(key.length === 64 ? key : Buffer.from(key).toString('hex'), 'hex');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  return buf;
}

/**
 * Encrypt a plaintext string.
 * Returns: "<iv_hex>:<tag_hex>:<ciphertext_hex>"
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a ciphertext string produced by `encrypt()`.
 */
export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid ciphertext format');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}

/** Safely parse encrypted JSON — returns null if decrypt/parse fails. */
export function decryptJson<T>(ciphertext: string | null | undefined): T | null {
  if (!ciphertext) return null;
  try {
    return JSON.parse(decrypt(ciphertext)) as T;
  } catch {
    return null;
  }
}

/** Encrypt an object to a JSON string. */
export function encryptJson(obj: unknown): string {
  return encrypt(JSON.stringify(obj));
}
