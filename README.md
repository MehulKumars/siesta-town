# Siesta

A daily puzzle game that lives in a Reddit post. Every day there's a new little town in the sun. Place a few
houses so that every cat naps in the shade at its favourite time of day, while every flower stays in the sun.

Built for **Reddit's Game of the Day Hackathon** on the Reddit Developer Platform (Devvit Web).

> Status: in development. This README is a working draft and will be finished before submission.

## How to play

1. Open today's town from the pinned post. In the feed, tap **Play today's town**.
2. Drag a house from the tray onto empty ground. While you drag, you see its shadow.
3. Shadows fall away from the sun: **left in the morning, up at noon, right in the evening**. Morning and evening
   shadows are as long as the house is tall. At noon every shadow is one tile.
4. Each cat has a badge showing when it naps (morning, noon or evening). It needs shade at that time. Tap a cat to see
   when it naps. Switch the time of day at the top to check each time.
5. **Flowers need sun all day.** Keep them out of every shadow.
6. When every house is placed, every cat is asleep and every flower is in the sun, the town falls asleep.

Your score is your time. Towns get harder through the week: Monday is a small warm-up and Saturday is a big town.

## Daily schedule

- One new town per day, at midnight UTC. Every town was generated in advance and checked by a solver, so it always has
  an answer (from Wednesday on, exactly one).
- The pinned "Today's town" post always shows the current day.

## For moderators

- **Install:** the app records today as town No. 1 and creates the pinned "Today's town" post.
- **Menu (subreddit, moderators only):** "Create the Today's town post" makes a new pinned hub post if you ever need one.
- **No setup needed.** There are no settings, no outside services and nothing to configure.

## Data and privacy

- The app stores, per player: when they first opened a town, their in-progress board (3 days) and their result
  (30 days). All of it expires automatically within 30 days.
- No personal data beyond your Reddit user id is stored. Nothing is sent outside Reddit. No AI is used at runtime.

## Known limitations (development build)

- Coming next: automatic daily posts with a results thread, streaks, sharing your result, challenging a friend,
  the tutorial, and the Town Builder for player-made Sunday towns.
- Sounds and art are placeholders in the final style.

## Reporting a problem

Message the moderators of the subreddit where you play. An in-app "Report a problem" option is coming.

## For developers

```
npm install
npm run test:unit      # engine, dates and bank checks (node --test)
npm run test:types     # TypeScript
npm run lint
npm run dev            # playtest on Reddit (needs `npm run login`)
node --experimental-strip-types scripts/generate-puzzles.ts   # regenerate the town bank
```

Project docs live in `docs/`; start with `CLAUDE.md`.
