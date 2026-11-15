import type { DayKey } from './dates.ts';
import type { NoonRule, Placements, Puzzle } from './engine/types.ts';

/** What the client may know about a town: everything except the solution. */
export type PublicTown = {
  date: DayKey;
  /** Town No. n, counted from the day the app was installed in this subreddit. */
  number: number;
  title: string;
  level: number;
  band: string;
  puzzle: Puzzle;
  noonRule: NoonRule;
};

export type PostKind = 'hub' | 'daily';

export type SavedProgress = { placements: Placements; timeMs: number };

export type SolveRecord = {
  placements: Placements;
  timeMs: number;
  hints: number;
  adjustedMs: number;
  moves: number;
  solvedAt: number;
};

/** Per-player settings. Kept in Redis because localStorage is wiped on every app update. */
export type Settings = { tutorialDone: boolean; muted: boolean };

export type SettingsRequest = { tutorialDone?: boolean; muted?: boolean };

export type InitResponse = {
  type: 'init';
  town: PublicTown;
  postKind: PostKind;
  isToday: boolean;
  today: DayKey;
  msUntilNext: number;
  user: { loggedIn: boolean; username: string | null };
  settings: Settings;
  progress: SavedProgress | null;
  result: SolveRecord | null;
};

export type ProgressRequest = {
  date: DayKey;
  placements: Placements;
  timeMs: number;
};

export type SubmitRequest = {
  date: DayKey;
  placements: Placements;
  timeMs: number;
  hints: number;
  moves: number;
};

export type SubmitResponse = {
  type: 'submit';
  result: SolveRecord;
  saved: boolean;
};

export type OkResponse = { type: 'ok' };

export type ErrorResponse = { type: 'error'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlacements(value: unknown): value is Placements {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every((c) => Number.isInteger(c))
  );
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isProgressRequest(value: unknown): value is ProgressRequest {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    isPlacements(value.placements) &&
    isFiniteNonNegative(value.timeMs)
  );
}

export function isSubmitRequest(value: unknown): value is SubmitRequest {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    isPlacements(value.placements) &&
    isFiniteNonNegative(value.timeMs) &&
    Number.isInteger(value.hints) &&
    Number.isInteger(value.moves)
  );
}

export function isSettingsRequest(value: unknown): value is SettingsRequest {
  if (!isRecord(value)) return false;
  const { tutorialDone, muted } = value;
  return (
    (tutorialDone === undefined || typeof tutorialDone === 'boolean') &&
    (muted === undefined || typeof muted === 'boolean')
  );
}
