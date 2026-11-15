import { redis } from '@devvit/web/server';
import type { Settings, SettingsRequest } from '../../shared/api.ts';
import { keys, ttlSeconds } from '../repo/keys.ts';

export const defaultSettings: Settings = { tutorialDone: false, muted: false };

/** Reads the player's settings and renews their 30-day lifetime (it rolls while they keep playing). */
export async function getSettings(userId: string): Promise<Settings> {
  const key = keys.user(userId);
  const fields = await redis.hGetAll(key);
  if (Object.keys(fields).length > 0) await redis.expire(key, ttlSeconds.user);
  return {
    tutorialDone: fields.tutorialDone === '1',
    muted: fields.muted === '1',
  };
}

export async function saveSettings(
  userId: string,
  request: SettingsRequest
): Promise<void> {
  const fields: Record<string, string> = {};
  if (request.tutorialDone !== undefined)
    fields.tutorialDone = request.tutorialDone ? '1' : '0';
  if (request.muted !== undefined) fields.muted = request.muted ? '1' : '0';
  if (Object.keys(fields).length === 0) return;
  const key = keys.user(userId);
  await redis.hSet(key, fields);
  await redis.expire(key, ttlSeconds.user);
}
