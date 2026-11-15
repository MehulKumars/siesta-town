import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import {
  isProgressRequest,
  isSettingsRequest,
  isSubmitRequest,
} from '../../shared/api.ts';
import type {
  ErrorResponse,
  InitResponse,
  OkResponse,
  PostKind,
  Settings,
  SolveRecord,
  SubmitResponse,
} from '../../shared/api.ts';
import { isDayKey, msUntilNextDay } from '../../shared/dates.ts';
import type { DayKey } from '../../shared/dates.ts';
import { numberFor, today } from '../services/calendar.ts';
import { publicTown, townFor } from '../services/puzzles.ts';
import {
  firstSeenAt,
  getProgress,
  getResult,
  judgeSolve,
  markFirstSeen,
  saveProgress,
  saveResult,
} from '../services/results.ts';
import {
  defaultSettings,
  getSettings,
  saveSettings,
} from '../services/settings.ts';

export const api = new Hono();

/** Daily posts carry their date; the pinned hub post (or a post without data) always shows today. */
function postTarget(): { kind: PostKind; date: DayKey } {
  const data = context.postData;
  const date = data?.date;
  if (data?.kind === 'daily' && isDayKey(date)) return { kind: 'daily', date };
  return { kind: 'hub', date: today() };
}

const fail = (message: string): ErrorResponse => ({ type: 'error', message });

api.get('/init', async (c) => {
  try {
    const { kind, date } = postTarget();
    const [entry, number, username] = await Promise.all([
      townFor(date),
      numberFor(date),
      reddit.getCurrentUsername(),
    ]);
    const userId = context.userId;
    let progress = null;
    let result: SolveRecord | null = null;
    let settings: Settings = defaultSettings;
    if (userId) {
      [progress, result, settings] = await Promise.all([
        getProgress(date, userId),
        getResult(date, userId),
        getSettings(userId),
      ]);
      if (!result) await markFirstSeen(date, userId);
    }
    return c.json<InitResponse>({
      type: 'init',
      town: publicTown(entry, number),
      postKind: kind,
      isToday: date === today(),
      today: today(),
      msUntilNext: msUntilNextDay(new Date()),
      user: { loggedIn: Boolean(userId), username: username ?? null },
      settings,
      progress,
      result,
    });
  } catch (error) {
    console.error('init failed', error);
    return c.json(fail('Could not load the town.'), 500);
  }
});

api.post('/progress', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isProgressRequest(body) || !isDayKey(body.date))
    return c.json(fail('Bad progress.'), 400);
  const userId = context.userId;
  if (!userId) return c.json<OkResponse>({ type: 'ok' });
  const entry = await townFor(body.date);
  const saved = await saveProgress(
    body.date,
    userId,
    entry.puzzle,
    body.placements,
    body.timeMs
  );
  return saved
    ? c.json<OkResponse>({ type: 'ok' })
    : c.json(fail('Those houses don’t fit there.'), 400);
});

api.post('/submit', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isSubmitRequest(body) || !isDayKey(body.date))
    return c.json(fail('Bad submission.'), 400);
  try {
    const entry = await townFor(body.date);
    const userId = context.userId;
    const seen = userId ? await firstSeenAt(body.date, userId) : null;
    const verdict = await judgeSolve(entry.puzzle, body, seen);
    if (!verdict.ok) return c.json(fail(verdict.message), 400);
    if (!userId)
      return c.json<SubmitResponse>({
        type: 'submit',
        result: verdict.record,
        saved: false,
      });
    const record = await saveResult(body.date, userId, verdict.record);
    return c.json<SubmitResponse>({
      type: 'submit',
      result: record,
      saved: true,
    });
  } catch (error) {
    console.error('submit failed', error);
    return c.json(
      fail('Could not save your result. Try again in a moment.'),
      500
    );
  }
});

api.post('/settings', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isSettingsRequest(body)) return c.json(fail('Bad settings.'), 400);
  const userId = context.userId;
  if (userId) await saveSettings(userId, body);
  return c.json<OkResponse>({ type: 'ok' });
});
