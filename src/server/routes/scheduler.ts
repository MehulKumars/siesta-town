import { Hono } from 'hono';
import { ensureDailyPost } from '../core/daily.ts';
import { ensureHubPost } from '../core/post.ts';
import { today } from '../services/calendar.ts';

export const scheduler = new Hono();

/**
 * Runs every 15 minutes. Today's (UTC) post and sticky comment are made by whichever run comes first
 * after midnight; every other run finds them and does nothing. The cron timezone doesn't matter.
 */
scheduler.post('/ensure-daily-post', async (c) => {
  try {
    await ensureHubPost();
    const post = await ensureDailyPost(today());
    if (post?.created) console.log(`Scheduler made today's post ${post.postId}`);
  } catch (error) {
    console.error('ensure-daily-post failed', error);
  }
  return c.json({});
});
