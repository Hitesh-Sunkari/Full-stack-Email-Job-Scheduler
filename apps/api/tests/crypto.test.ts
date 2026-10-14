import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken, generateHash } from '../src/lib/crypto';

describe('Crypto & Token Encryption (AES-256-GCM)', () => {
  const secretKey = '4a2e5d9c7f1b8a3e0f5c9d2b7e4a1f8c6e3b0a7d9f2c5e8a1b4d7f0c3e6a9b2d';

  it('should encrypt and decrypt plaintext accurately', () => {
    const sensitiveData = 'xoxb-1234567890-my-super-secret-slack-bot-token';
    const encrypted = encryptToken(sensitiveData, secretKey);

    expect(encrypted).not.toBe(sensitiveData);
    expect(encrypted.split(':')).toHaveLength(3); // iv:tag:ciphertext

    const decrypted = decryptToken(encrypted, secretKey);
    expect(decrypted).toBe(sensitiveData);
  });

  it('should generate distinct ciphertexts for identical plaintexts using random IVs', () => {
    const password = 'my_ethereal_password_123';
    const enc1 = encryptToken(password, secretKey);
    const enc2 = encryptToken(password, secretKey);

    expect(enc1).not.toBe(enc2);
    expect(decryptToken(enc1, secretKey)).toBe(password);
    expect(decryptToken(enc2, secretKey)).toBe(password);
  });

  it('should fail decryption if ciphertext or authentication tag is tampered with', () => {
    const sensitiveData = 'smtp_super_secret';
    const encrypted = encryptToken(sensitiveData, secretKey);
    const parts = encrypted.split(':');

    // Tamper with ciphertext
    const tamperedCipher = parts[2].slice(0, -2) + 'ff';
    const tamperedPayload = `${parts[0]}:${parts[1]}:${tamperedCipher}`;

    expect(() => decryptToken(tamperedPayload, secretKey)).toThrow();
  });

  it('should compute consistent SHA-256 hashes for idempotency keys', () => {
    const key1 = generateHash('campaign:123:recipient:test@example.com');
    const key2 = generateHash('campaign:123:recipient:test@example.com');
    const key3 = generateHash('campaign:123:recipient:other@example.com');

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).toHaveLength(64);
  });
});
