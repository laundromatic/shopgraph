import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, isValidKeyFormat } from '../api-keys.js';

describe('api-keys', () => {
  describe('generateApiKey', () => {
    it('returns a string with sg_live_ prefix', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^sg_live_/);
    });

    it('returns correct total length (prefix + 32 hex chars)', () => {
      const key = generateApiKey();
      expect(key.length).toBe('sg_live_'.length + 32);
    });

    it('generates unique keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('hashApiKey', () => {
    it('returns a consistent SHA-256 hash', () => {
      const key = 'sg_live_abc123';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });

    it('returns a 64-character hex string', () => {
      const hash = hashApiKey('sg_live_test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces different hashes for different keys', () => {
      const hash1 = hashApiKey('sg_live_key1');
      const hash2 = hashApiKey('sg_live_key2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('isValidKeyFormat', () => {
    it('accepts valid keys', () => {
      const key = generateApiKey();
      expect(isValidKeyFormat(key)).toBe(true);
    });

    it('rejects keys without sg_live_ prefix', () => {
      expect(isValidKeyFormat('sk_test_abc123abc123abc123abc123abc123ab')).toBe(false);
    });

    it('rejects keys that are too short', () => {
      expect(isValidKeyFormat('sg_live_short')).toBe(false);
    });

    it('rejects keys that are too long', () => {
      expect(isValidKeyFormat('sg_live_' + 'a'.repeat(64))).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidKeyFormat('')).toBe(false);
    });
  });
});
