import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnAppUpgradeRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { ensureHubPost } from '../core/post.ts';
import { launchDate } from '../services/calendar.ts';

export const triggers = new Hono();

/** Install and upgrade both make sure day No. 1 is recorded and the pinned hub post exists. */
type SetupResult = TriggerResponse & { ok: boolean; message: string };

async function setUp(trigger: string): Promise<SetupResult> {
  try {
    const launch = await launchDate();
    const hub = await ensureHubPost();
    return {
      ok: true,
      message: `${trigger}: hub post ${hub.id} ${hub.created ? 'created' : 'already there'} in r/${context.subredditName}; town No. 1 is ${launch}`,
    };
  } catch (error) {
    console.error(`${trigger} setup failed`, error);
    return { ok: false, message: 'Failed to set up the app' };
  }
}

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  const result = await setUp(input.type ?? 'install');
  return c.json<TriggerResponse>(result, result.ok ? 200 : 400);
});

triggers.post('/on-app-upgrade', async (c) => {
  const input = await c.req.json<OnAppUpgradeRequest>();
  const result = await setUp(input.type ?? 'upgrade');
  return c.json<TriggerResponse>(result, result.ok ? 200 : 400);
});
