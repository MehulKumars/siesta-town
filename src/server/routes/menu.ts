import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createHubPost } from '../core/post.ts';

export const menu = new Hono();

menu.post('/create-hub', async (c) => {
  try {
    const post = await createHubPost();
    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error('Could not create the hub post', error);
    return c.json<UiResponse>({ showToast: 'Could not create the post' }, 400);
  }
});
