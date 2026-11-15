import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createHubPost } from '../core/post.ts';
import { launchDate } from '../services/calendar.ts';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const input = await c.req.json<OnAppInstallRequest>();
    const launch = await launchDate();
    const post = await createHubPost();
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Hub post ${post.id} created in r/${context.subredditName}; town No. 1 is ${launch} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error('Install setup failed', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to set up the app' },
      400
    );
  }
});
