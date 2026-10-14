import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit recommended for GCM
const TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Derives a 32-byte Buffer key from the configured hex or string encryption key.
 */
function getDerivedKey(rawKey: string): Buffer {
  if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }
  // Otherwise hash with SHA-256 to ensure exact 32-byte key length
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypts sensitive text using AES-256-GCM authenticated encryption.
 * Output format: iv_hex:tag_hex:ciphertext_hex
 */
export function encryptToken(plaintext: string, secretKey: string): string {
  if (!plaintext) return '';
  const key = getDerivedKey(secretKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted text.
 * Expects input format: iv_hex:tag_hex:ciphertext_hex
 */
export function decryptToken(encryptedPayload: string, secretKey: string): string {
  if (!encryptedPayload) return '';
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format. Expected iv:tag:ciphertext');
  }

  const [ivHex, tagHex, cipherHex] = parts;
  const key = getDerivedKey(secretKey);
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generates an SHA-256 hash formatted as hex for idempotency keys or tokens.
 */
export function generateHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
