import { reddit, redis } from '@devvit/web/server';
import { keys } from '../repo/keys.ts';

/**
 * The pinned "Today's town" post. Its post data has no date, so it always shows the current day:
 * this is the link judges open (docs/03-ARCHITECTURE.md §1.2).
 */
export async function createHubPost() {
  const post = await reddit.submitCustomPost({
    title: 'Siesta: a new town to put to sleep every day',
    entry: 'default',
    postData: { kind: 'hub' },
  });
  await redis.set(keys.hubPostId(), post.id);
  try {
    await post.sticky(1);
  } catch (error) {
    console.warn('Could not pin the hub post', error);
  }
  return post;
}
