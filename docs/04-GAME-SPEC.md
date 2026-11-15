# 04 — Game spec

> **How to use this file:** Section A is the **selected game**. To switch games, replace Section A with one of the
> concepts in Section C (or a new one) using the template in Section B, and log the switch in DECISIONS.md.
> Agents may refine anything here (see CLAUDE.md §4). Keep this file the single source of truth for the game.

**Current selection: SIESTA** *(v2, 2026-11-15. Confirmed or replaced after the Phase 0 prototype playtests. See PLAN Phase 0)*

---

## A. SIESTA: cats looking for shade

### A1. One-line pitch
Place a few buildings in a sunny little town so every cat is in shade at its nap time, and every flower stays in the sun all day.

### A2. Why it can win (per criterion)
- **Delightful UX:** you drag a building and its shadow slides along with your finger. When you solve it, the day
  plays back and the cats fall asleep one by one.
- **Polish:** a small, tractable scope, so time goes into feel, art and sound.
- **Reddit-y:** an original identity (no Reddit theming). Sunday towns are built by players and credited to them
  (creativity, meritocracy); "where everyone started" is revealed after you solve; streak flair; results shared in the
  daily thread; "challenge a friend" through Reddit's own share sheet.
- **Daily Content:** a new seeded town every day, a Mon→Sun difficulty curve, community towns on Sundays, and a recap
  of yesterday in each day's sticky comment.

### A3. Rules (v2. Tune in the Phase 0 prototype)
- **Board:** square grid. Tiles: ground, **cat** (with a nap-time badge), **flower**, **well**. A well is flat: you
  can't build on it and it casts no shadow. (It replaces v1's "rock", because players expect a rock to cast a shadow.)
- **Tray:** buildings with heights `1..k` (each height used once unless the day says otherwise).
- **Placing:** drag a building from the tray onto an empty ground tile. While you drag, its shadow for the current
  time of day follows your finger. Drop to place. Drag a placed building to move it, or back to the tray to remove it.
  **Tap-to-place also works** (tap a building, then a tile) for accessibility and mouse users.
  Buildings can't go on cats, flowers or wells.
- **Sun and shadows** (three times of day):
  - **Morning:** sun in the east → a building of height *h* shades the *h* tiles to its **west**.
  - **Noon:** sun high in the south → every building shades **1 tile** to its **north**.
    *(Prototype A/B against v1's `ceil(h/2)` tiles. Keep the rule that more fresh players can explain back correctly.)*
  - **Evening:** sun in the west → it shades the *h* tiles to its **east**.
  - Shadows pass over everything (cats, flowers, wells, other buildings). They stop at the board edge.
- **Cats** have a nap time badge (AM / noon / PM) and must be **in shade at that time**.
- **Flowers** must be **in sun at all three times**.
- **Solved** when every building is placed and all conditions hold.
- **Time toggle:** a Morning / Noon / Evening control; the shadows sweep across when you switch. A three-sun strip
  shows ✓/✗ for each time; counters show cats asleep and flowers lit. **The strip and counters update when a building
  is dropped, not during the drag.** The drag preview shows one time of day, so reasoning still matters.

### A4. Daily structure and difficulty curve (targets. The generator enforces them)
| Day | Grid | Buildings | Cats | Flowers | Wells | Solutions |
|---|---|---|---|---|---|---|
| Mon | 5×5 | 2 (h1,h2) | 2 | 2 | 0 | ≤ 3 |
| Tue | 5×5 | 3 | 3 | 2 | 0–1 | ≤ 2 |
| Wed | 6×6 | 3 | 3 | 3 | 1 | unique |
| Thu | 6×6 | 3 | 4 | 4 | 1 | unique |
| Fri | 6×6 | 4 | 4 | 4 | 2 | unique |
| Sat | 7×7 | 4 | 5 | 4 | 2 | unique |
| Sun | **Community town** (approved, from the Town Builder), else a hand-made team town or a 7×7 special | | | | | unique |

Target solve times for an engaged player: Mon under 90 s · Wed about 2–3 min · Sat about 4–6 min.

### A5. Scoring
- **Time is the score.** The clock runs only while the game is visible (it pauses on `visibilitychange`). It isn't shown
  during play (it's a siesta, not a race); it appears on the result card.
- **Hints** (max 2): lock one building onto its correct tile. Each adds 30 s.
- **Clean nap:** a mark for solving with no hints.
- **Leaderboard:** adjusted time (time + hint penalty), lowest first; ties go to whoever solved first.
- **Server checks:** reject a reported time longer than the server-measured time since this player's first progress
  save on this puzzle (plus slack), or faster than 2 s per building.
- Moves are still recorded (for "where everyone started" and stats) but don't affect the score.

*Why not moves, as in v1:* you could only see a shadow by placing a building, so trying ideas cost points, and careful
players all tied at par. Daily logic puzzles that thrive (LinkedIn's Queens, NYT's Pips) let you place freely and score by time.

### A6. Generator and solver (in `src/shared/engine`)
- **Generate:** seeded RNG(date) → pick grid/day params → place wells → place buildings randomly (valid tiles) →
  compute shadow sets AM/Noon/PM → choose cat tiles from shaded tiles with a nap time whose shadow covers them (prefer
  tiles shaded at only that time = more interesting) → choose flower tiles from always-lit tiles (prefer tiles near
  shadow edges = decoys) → strip the buildings → the solver counts solutions → accept if within the day's
  solution limit and difficulty band, else retry (cap attempts; log stats).
- **Solve:** backtracking, tallest building first; prune when a flower becomes shaded; at the end, check every cat.
  Return solution count (stop at limit+1) and search-node count. The same solver validates Town Builder submissions.
- **Difficulty grade:** a function of search nodes, decoy tiles, multi-time cats and the number of plausible first
  moves. Calibrate against prototype and playtest times; log both.
- **Town names:** two curated word lists in `content/town-words.json` (e.g. "Sleepy", "Little", "Upper" +
  "Harbour", "Market", "Steps"), combined by the seed. The Town Builder offers the same lists as a picker. No free text.

### A7. Screens
1. **Splash (inline, taps only, fits the post).** Wordmark, the town name, "No. 14, Monday 14 December", a small static
   drawing of today's town (from the puzzle, no solution), difficulty dots (1–7), my streak, "Town by u/…" on community
   days, and one call to action: "Play today's town". A returning solved player sees "Napped in 1:42. Streak: 7 days." and
   the button becomes "See results". On an **old daily post**: "This was No. 12." with a button "Go to today's town"
   (`navigateTo`) and a quieter "Play No. 12 anyway". With challenge share data: "A friend napped this town in 1:42."
   *(No middle-dot meta strings and no "→" on buttons: both are listed AI-design tells in `.claude/skills/frontend-design`.)*
2. **First-time tutorial (expanded).** Three tiny interactive boards: (1) one cat, one building, morning only
   ("Drag the house so the cat is in its shadow"); (2) the time toggle, with a noon cat; (3) a flower that must stay lit.
   Under 40 seconds, skippable, at most 15 words per step. Never a wall of text.
3. **Play.** Time toggle, board, three-sun strip, tray, counters. Hint, reset (with confirm), mute and "How to play"
   sit behind one small menu button. Everything fits the viewport; nothing else on screen.
4. **The siesta (the signature moment).** On solve, the sun sweeps morning → noon → evening in about 2.4 s. Each cat
   curls up as its shade arrives, the flowers open, then the light warms and the town settles. Then the result card
   slides up. Reduced motion: a 300 ms crossfade to the sleeping town. This is also the first shot of the demo video.
5. **Result (one card).**
   - Headline in the game's voice (e.g. "Little Harbour is asleep."), time, hints, streak.
   - **One** community line, small-N aware: "Most nappers started by the well (34%). You started by the harbour."
     Tapping "See where everyone started" shows the heat overlay on the board.
   - Primary: **"Post my result (as u/you)"**. It shows the exact comment text first, then replies under today's sticky comment.
   - Secondary: **"Challenge a friend"** (Reddit's share sheet).
   - Footer: countdown to the next town · "Join r/‹sub›" · "Yesterday's town".
6. **Archive (light).** A strip of the last 14 towns with my status. Past towns are playable (no streak credit).
7. **Town Builder.** See A8.

### A8. Community layer
- **Where everyone started:** `first:{d}` counts the tile of each player's first building drop. Shown only after
  solving. Under 10 players: "You're one of the first N to nap this town" instead of percentages.
- **Stats:** `stats:{d}` = solves, clean naps, time distribution buckets.
- **Streaks:** Reddit's bitfield pattern (PLATFORM §3), keyed by the puzzle's date. Opt-in flair: "Siesta streak N".
- **Share text** (spoiler-free; emoji are fine inside a comment), two short lines:
  `Siesta No. 14, Little Harbour: asleep in 1:42, no hints. Streak: 7 days.` / `🌅✓ ☀️✓ 🌇✓`
- **Challenge a friend:** `showShareSheet({ text: "I put every cat in Little Harbour to sleep in 1:42. Your turn?",
  data: '{"d":"2026-12-14","t":102}' })`. The recipient's splash reads it with `getShareData()`. Show it only if `d`
  matches the post's date, and never show a name from share data (it can be faked).
- **Daily recap:** each day's sticky comment opens with yesterday's real numbers ("Yesterday 23 nappers put Hilltop
  Market to sleep. Quickest: 0:58.") and invites results below. Small-N wording when few played.
- **Town Builder (creativity and meritocracy, a core feature):**
  - Build on a 6×6 grid: place cats (pick each nap time), flowers, wells and 2–4 buildings. Live shadows help.
  - **"Test it":** the buildings go back to the tray and you must solve your own town.
  - The server proves it has **exactly one** solution with the solver. The name comes from the word picker.
  - Submit → queued for the mods. Mods approve or reject from the subreddit menu ("Review community towns").
  - Approved towns run on Sundays (oldest approved first), credited "Town by u/author" on the splash, the result card and
    the sticky comment. Fallback: a hand-made team town, credited to the team.
  - After solving a community town, a player can tap **"Lovely town"** once. The author sees the count in their builder
    list ("loved by 41 nappers"). Opt-in flair: "Town maker".
  - Authors can delete their own towns at any time. Every community town has "Report this town".
  - **Ship it by Dec 2** so playtesters (r/Devvit Feedback Friday, Dec 4) make real towns before judging.
    Sunday Dec 13 falls inside the judging window.

### A9. Stretch twists (only after core polish; pick at most one)
- **Trees** (fixed buildings you can't move), **awnings** (shade at noon only), a **sleepy dog** (must be in
  sun), a **lantern-lit night** puzzle on Saturdays.
- A custom share image per daily post (`shareImageUrl`), if `media.upload` works with a bundled image.

### A10. Art and audio direction: "print-shop siesta" (a human signs this off in Phase 0–1)
- **Look:** a riso-style print of a whitewashed town at noon: a sun-baked yellow board, white houses and cats drawn in
  one blue ink, pink flowers. Flat shapes, ink outlines, optionally a fine grain (one small tiled texture, not a CSS filter).
- **Shade is hatching.** Shadows are diagonal blue hatching over the yellow ground, not just a darker fill. It reads
  instantly, doesn't depend on colour (colour-blind safe by texture and lightness), and gives the game a look no other
  entry will have. Sunlit tiles stay clean yellow.
- **Palette (candidate, used in the Phase 0 prototype):** whitewash sky `#E9EFF6`, blue ink `#1B2766`, shade blue
  `#2F49A6`, sun yellow `#F3C94F`, deep sun `#E0A91F`, flower pink `#E8378A`, well water `#9CC6EA`, white `#FFFFFF`.
  *v1's sand + terracotta palette was dropped:* "warm cream background, high-contrast serif display, terracotta accent" is
  the first AI-design cliché listed in `.claude/skills/frontend-design`. Don't drift back to it.
- **Type:** one display face with character plus one readable text face, both OFL and bundled. **Not** Fredoka, Nunito,
  Poppins, Inter or Montserrat (the faces AI tools default to), and not a high-contrast editorial serif. A human picks
  from a shortlist of three, seen on the real board.
- **Drawn by a human (SVG):** the cats (awake, curling, asleep), four building heights, the flower (open, wilted), the
  well and the wordmark. If AI helps with sketches, a human redraws them in one consistent hand.
- **Reference board:** 5–10 images in `docs/references/` (prints, posters, picture books), for direction only, never to copy.
- **Motion:** the shadow tracks the drag with no lag; time switch sweep 300 ms ease; cats curl; flowers wilt in shade and
  reopen in sun; the siesta sequence (A7.4). Respect reduced motion.
- **Sound:** a soft wooden "tok" on drop, a paper slide on lift, a purr when a cat falls asleep, a low chime on solve;
  ambient cicadas off by default. Sound starts after the first tap, has a mute button, and mutes when the page is hidden.

### A11. Journeys mapping
`App.Ready` (board interactive) · `Journey.Start` (call `startJourney()` on the player's first committed action in the
game view, i.e. the first drop or first time switch; never on load, and always before any other telemetry call, because
`progress()`/`interaction()` auto-start a journey) · `Journey.Progress` (fraction of conditions satisfied, only on
improvement, at most about 10 per session) · `Journey.Interaction` (`time_toggle` throttled, `hint_used`, `lift`,
`share_clicked`, `challenge_clicked`, `subscribe_clicked`, `tutorial_done`, `town_submitted`) · `Journey.End` (sent by the
**server** from `/api/submit` with the verified score: `complete: true, game: { win: true, score }`).

### A12. Risks and mitigations
- *Not fun* → the Phase 0 prototype and 5 silent playtests come before any infrastructure (go/no-go in PLAN).
- *Too easy with live previews* → previews show one time of day; the strip and counters update on drop; Saturday adds
  cats and wells. Tune in the prototype.
- *Noon rule feels arbitrary* → A/B it in the prototype; show the sun's position on the toggle.
- *Looks generic* → hatching and the print look, a human-drawn tile set, human-picked type, human-written copy.
- *Town Builder empty during judging* → ship by Dec 2, invite playtesters, honest team towns as fallback.
- *User-made content rules* → structured input, picked names, mod approval, author delete, report button. Ask the Devvit
  team whether each town also needs a comment posted as its author.

---

## B. Template for any game (fill this to switch)

```
## A. <NAME>: <subtitle>
A1 Pitch · A2 Why it can win (4 criteria) · A3 Rules · A4 Daily structure/curve table · A5 Scoring
A6 Generator + solver (how solvability and difficulty are proven) · A7 Screens (splash, tutorial, play, solve moment,
result, archive, editor) · A8 Community layer (aggregates, share text, challenge, flair, UGC) · A9 Stretch twists
· A10 Art/audio · A11 Journeys mapping · A12 Risks
```

---

## C. Alternative concepts (condensed. Expand with the template if chosen)

### C1. STILL WATER: ripples that interfere
- **Rules:** an N×N pond; place K stones on open water. Each stone adds **+1** to tiles at Manhattan distance 1 and
  **−1** at distance 2; effects sum. Each lily pad shows a target (e.g. 2, 1, 0, −1); it **blooms** when its water
  level equals the target. Stones can't be placed on pads. Solved when all pads bloom.
- **Generator:** place stones randomly → compute levels → put pads on tiles with interesting sums (prefer
  interference tiles) → the solver confirms a unique solution.
- **Community:** first-stone heatmap; a weekly shared pond that blooms as the community solves; share as a ripple pattern.
- **Risk:** the rule needs a strong interactive tutorial; a depth-number overlay (toggle) helps.

### C2. TIDEPOOL: keep the ecosystem alive
- **Rules:** a rock-pool grid with fixed rocks and algae; place today's creatures. Each species has one adjacency rule
  (crab eats smaller orthogonal neighbours; snail needs algae beside it; anemone stings adjacent fish; starfish must
  touch a rock; glass shrimp must be next to an anemone). Press "Let the tide in" to check; all must survive.
- **Generator:** constraint satisfaction; the solver counts placements; species mix per weekday.
- **Community:** a weekly **species workshop**: players compose a new species from predefined rule parts; votes
  choose the next week's species.
- **Risk:** art volume (6–10 creatures); rule balance.

### C3. HIVEMIND: sort it the way everyone else would (evolved from our Label Hunt)
- **Rules:** a daily prompt with three jars (e.g. Breakfast / Lunch / Dinner) and 12 items. Sort freely; jars hold any
  number. Lock in. **Score = average share of players who agreed with each of your placements.**
- **Fairness:** score against the live distribution at lock time, re-score at day end ("final hive score") and show both.
  Seed day 1 with team plus playtester answers.
- **Community:** the most divisive item; a "you went against the hive" list; comment prompts; player-submitted
  prompts from predefined item packs.
- **Risk:** may read as a Connections clone at a glance. The splash must say "no right answers". Needs crowds; small-N
  copy matters. A lone judge in a small subreddit sees little of what makes it good.

### C4. NIGHT SHIFT: light the ward, one vote per hour
- **Rules:** a 5×5 grid; a light source enters from an edge; mirrors (`/`, `\`) rotate on tap; lamps light when the beam
  passes through them. Light every lamp. **Each hour the community votes which mirror locks**; locked tiles freeze
  for everyone for the rest of the day, so the board evolves.
- **Generator:** design the path → place lamps on it → add decoy mirrors → the solver ensures the puzzle is solvable
  for every plausible lock outcome (or only offer lockable tiles that keep it solvable).
- **Community:** hourly votes (realtime or polling), "lit by X% tonight", Night Owl flair.
- **Risk:** the most complex; the vote loop must still be fun for one judge in a tiny subreddit (a solo fallback: you
  can vote and see your lock apply).
