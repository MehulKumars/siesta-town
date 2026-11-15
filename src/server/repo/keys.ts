// Every Redis key and its lifetime, in one place (docs/03-ARCHITECTURE.md §3).
// Any key that holds a user id expires within 30 days: Devvit has no account-deletion trigger.
import type { DayKey } from '../../shared/dates.ts';

const DAY_SECONDS = 86_400;

export const keys = {
  launchDate: () => 'cfg:launchDate',
  hubPostId: () => 'cfg:hubPostId',
  generatedTown: (date: DayKey) => `gen:${date}`,
  firstSeen: (date: DayKey, userId: string) => `seen:${date}:${userId}`,
  progress: (date: DayKey, userId: string) => `progress:${date}:${userId}`,
  result: (date: DayKey, userId: string) => `result:${date}:${userId}`,
} as const;

export const ttlSeconds = {
  generatedTown: 60 * DAY_SECONDS,
  firstSeen: 3 * DAY_SECONDS,
  progress: 3 * DAY_SECONDS,
  result: 30 * DAY_SECONDS,
} as const;

export function expiresIn(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}
