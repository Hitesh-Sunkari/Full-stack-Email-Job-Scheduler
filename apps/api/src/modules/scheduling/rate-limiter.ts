import { getRedisClient } from '../../config/redis';
import { logger } from '../../config/logger';

/**
 * Returns formatted UTC hour window string, e.g., "2026101411"
 */
export function getUtcHourWindow(date: Date = new Date()): { windowKey: string; nextHourDate: Date; msRemainingInHour: number } {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const windowKey = `${year}${month}${day}${hour}`;

  // Next UTC hour start (at :00:00.000)
  const nextHourDate = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1, 0, 0, 0));
  const msRemainingInHour = Math.max(1000, nextHourDate.getTime() - date.getTime());

  return { windowKey, nextHourDate, msRemainingInHour };
}

export interface HourlyRateLimitResult {
  allowed: boolean;
  currentCount: number;
  windowKey: string;
  nextEligibleTime: Date;
}

/**
 * Atomic reservation of 1 email send quota for the given sender in the current UTC hour.
 * Uses atomic Lua script in Redis to prevent race conditions across parallel workers.
 */
export async function reserveHourlyQuota(
  senderId: string,
  hourlyLimit: number,
  now: Date = new Date()
): Promise<HourlyRateLimitResult> {
  const redis = getRedisClient();
  const { windowKey, nextHourDate, msRemainingInHour } = getUtcHourWindow(now);
  const key = `rate:sender:${senderId}:${windowKey}`;

  // Lua script: check current count vs limit, increment atomically if below limit
  // TTL is set to msRemainingInHour + 1 hour grace period (7200s buffer)
  const luaScript = `
    local key = KEYS[1]
    local limit = tonumber(ARGV[1])
    local ttlMs = tonumber(ARGV[2])

    local current = tonumber(redis.call('get', key) or '0')
    if current >= limit then
      return {0, current}
    else
      local newVal = redis.call('incr', key)
      if newVal == 1 then
        redis.call('pexpire', key, ttlMs)
      end
      return {1, newVal}
    end
  `;

  try {
    const ttlBufferMs = msRemainingInHour + 3600000;
    const result = (await redis.eval(luaScript, 1, key, hourlyLimit, ttlBufferMs)) as [number, number];
    const allowed = result[0] === 1;
    const currentCount = result[1];

    return {
      allowed,
      currentCount,
      windowKey,
      nextEligibleTime: nextHourDate,
    };
  } catch (error) {
    logger.error({ error, senderId, key }, 'Error executing hourly rate limit Lua script');
    // On unexpected Redis failure, fail closed or report
    throw error;
  }
}

export interface MinimumDelayResult {
  allowed: boolean;
  waitMs: number;
}

/**
 * Coordinates minimum delay between sends for the same sender across distributed workers.
 * Uses atomic Lua script to inspect last sent timestamp and claim new send slot.
 */
export async function reserveMinimumDelaySlot(
  senderId: string,
  minDelayMs: number,
  nowMs: number = Date.now()
): Promise<MinimumDelayResult> {
  const redis = getRedisClient();
  const key = `throttle:sender:${senderId}`;

  const luaScript = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local minDelay = tonumber(ARGV[2])

    local lastSent = tonumber(redis.call('get', key) or '0')
    local elapsed = now - lastSent

    if elapsed < minDelay then
      local waitMs = minDelay - elapsed
      return {0, waitMs}
    else
      -- Update lastSent timestamp with a safe TTL
      redis.call('set', key, now, 'PX', minDelay * 10)
      return {1, 0}
    end
  `;

  try {
    const result = (await redis.eval(luaScript, 1, key, nowMs, minDelayMs)) as [number, number];
    const allowed = result[0] === 1;
    const waitMs = result[1];

    return { allowed, waitMs };
  } catch (error) {
    logger.error({ error, senderId, key }, 'Error executing minimum delay Lua script');
    throw error;
  }
}
