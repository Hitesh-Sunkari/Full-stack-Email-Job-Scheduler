import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUtcHourWindow, reserveHourlyQuota, reserveMinimumDelaySlot } from '../src/modules/scheduling/rate-limiter';
import * as redisModule from '../src/config/redis';

describe('Distributed Rate Limiting and Sender Throttling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('UTC Hour Window Calculation', () => {
    it('should generate consistent UTC hour strings', () => {
      const fixedDate = new Date('2026-10-14T11:45:30.000Z');
      const { windowKey, nextHourDate, msRemainingInHour } = getUtcHourWindow(fixedDate);

      expect(windowKey).toBe('2026101411');
      expect(nextHourDate.toISOString()).toBe('2026-10-14T12:00:00.000Z');
      expect(msRemainingInHour).toBe(14 * 60 * 1000 + 30 * 1000); // 14 mins 30s
    });

    it('should correctly handle year and month boundaries for UTC next hour', () => {
      const newYearsEve = new Date('2026-12-31T23:59:59.000Z');
      const { windowKey, nextHourDate } = getUtcHourWindow(newYearsEve);

      expect(windowKey).toBe('2026123123');
      expect(nextHourDate.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });
  });

  describe('Hourly Quota Reservation (Atomic Lua)', () => {
    it('should allow reservation when under the hourly limit', async () => {
      const mockRedis = {
        eval: vi.fn().mockResolvedValue([1, 45]), // allowed=1, count=45
      };
      vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(mockRedis as unknown as import('ioredis').Redis);

      const senderId = 'sender-uuid-123';
      const result = await reserveHourlyQuota(senderId, 200, new Date('2026-10-14T10:00:00Z'));

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(45);
      expect(result.windowKey).toBe('2026101410');
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    });

    it('should deny reservation and compute deferral time when limit is exhausted', async () => {
      const mockRedis = {
        eval: vi.fn().mockResolvedValue([0, 200]), // allowed=0, count=200
      };
      vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(mockRedis as unknown as import('ioredis').Redis);

      const senderId = 'sender-uuid-123';
      const testDate = new Date('2026-10-14T10:15:00Z');
      const result = await reserveHourlyQuota(senderId, 200, testDate);

      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(200);
      expect(result.nextEligibleTime.toISOString()).toBe('2026-10-14T11:00:00.000Z');
    });
  });

  describe('Minimum Inter-Send Delay Throttling', () => {
    it('should allow send if elapsed time exceeds minimum delay', async () => {
      const mockRedis = {
        eval: vi.fn().mockResolvedValue([1, 0]), // allowed=1, waitMs=0
      };
      vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(mockRedis as unknown as import('ioredis').Redis);

      const senderId = 'sender-uuid-123';
      const result = await reserveMinimumDelaySlot(senderId, 2000, Date.now());

      expect(result.allowed).toBe(true);
      expect(result.waitMs).toBe(0);
    });

    it('should require waiting if parallel send attempted within minimum delay window', async () => {
      const mockRedis = {
        eval: vi.fn().mockResolvedValue([0, 1400]), // allowed=0, waitMs=1400
      };
      vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(mockRedis as unknown as import('ioredis').Redis);

      const senderId = 'sender-uuid-123';
      const result = await reserveMinimumDelaySlot(senderId, 2000, Date.now());

      expect(result.allowed).toBe(false);
      expect(result.waitMs).toBe(1400);
    });
  });
});
