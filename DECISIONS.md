# DECISIONS.md: design and tech decision log

Format: `YYYY-MM-DD · decision · why · alternatives considered · who`

- 2026-11-15 · Default game = Siesta (pending team confirmation after prototypes) · best balance of readability, originality and scope · Still Water, Tidepool, Hivemind, Night Shift · team
- 2026-11-15 · Content keyed by UTC date; hourly idempotent posting job · no dependency on the cron timezone; survives the post-deadline freeze · a single daily cron · kit
- 2026-11-15 · No runtime AI and no external fetch · Devvit Rules approval burden; "AI slop" penalty; reliability · Gemini/OpenAI via fetch · kit

### Kit review, 2026-11-15 (checked against the official Devpost pages in docs/sources/ and the live Devvit docs)
- 2026-11-15 · Event name corrected to "Reddit's Game of the Day Hackathon" · that's the official title · — · review
- 2026-11-15 · Dec 31 posting is our safety margin, not a rule · the rules only require availability until judging ends (Dec 16, 6 PM PT) · — · review
- 2026-11-15 · Video, gallery images and text treated as core deliverables (rough video Dec 2, final Dec 6) · rules §4: judges may score from text, images and video alone · leave to the last days · review
- 2026-11-15 · Ask the organizers in writing whether app bug fixes are allowed during judging; freeze until answered · rules lock the Devpost submission but are silent on app updates; §11 requires written clarification requests · assume either way · review
- 2026-11-15 · Pinned "Today's town" hub post (always today's date) is the demo link · "Judging will score your game based on the demo link"; a fixed daily post would be stale for judges on Dec 9–16 and give no streak credit · submit a daily post · review
- 2026-11-15 · New Phase 0: throwaway prototype + 5 silent playtests + go/no-go before any infrastructure · fun was first tested around Nov 26 in v1 of the plan · build the engine first · review
- 2026-11-15 · Drag with a live shadow preview (plus tap-to-place); strip and counters update on drop · exploring is the fun part; the preview shows one time of day so reasoning still matters · tap-only placement · review
- 2026-11-15 · Score by time (+30 s per hint), not moves · moves punished exploration and caused mass ties at par · moves vs par · review
- 2026-11-15 · Noon rule A/B in the prototype; default "1 tile north" · one formula per time of day was the readability risk in v1 · ceil(h/2) · review
- 2026-11-15 · "Rock" renamed "well" (flat, no shadow) · players expect rocks to cast shadows · keep rocks · review
- 2026-11-15 · Heatmap = "where everyone started" (first drops), not final positions · with unique solutions every final position is identical, so v1's heatmap showed one hot tile · final positions · review
- 2026-11-15 · Signature solve moment, "the siesta" (2.4 s day sweep, cats fall asleep in turn) · memorable, explains the solution, opens the video · a chime · review
- 2026-11-15 · Art direction "print-shop siesta": hatched shade, 2–3 inks on paper, human-drawn SVG set, human-picked type (not Fredoka/Nunito/etc.) · distinctive, colour-blind safe by texture, cheap; avoids the default AI look · flat pastel + Fredoka/Nunito · review
- 2026-11-15 · All player-facing copy in `copy.ts`, written or approved by a human · generic copy is the fastest AI giveaway · agent-written copy · review
- 2026-11-15 · Town Builder promoted from "second cut" to core; ship by Dec 2 · rules text stresses community, meritocracy, creativity and "user creativity"; Sunday Dec 13 is in judging week · cut early · review
- 2026-11-15 · Added "Challenge a friend" (showShareSheet + getShareData) and a daily recap in the sticky comment · native, cheap, Reddit-y; share sheet doesn't post as the user · — · review
- 2026-11-15 · Result card: one community line, one primary (post my result), one secondary (challenge), quiet footer · v1 listed ~7 elements, contradicting the quality bar · — · review
- 2026-11-15 · Every screen fits the viewport; inline is taps only, < 1 s, Lighthouse > 80; sound mutes on visibilitychange · Reddit's AI-slop wording and the inline requirements for approval/featuring · — · review
- 2026-11-15 · Settings/tutorial/progress in Redis, not localStorage · localStorage is wiped on every app version · localStorage · review
- 2026-11-15 · Every user-ID key has a TTL ≤ 30 days (rolling); streaks use Reddit's bitfield pattern · no account-deletion trigger exists; rules require deleted accounts' IDs to go · permanent user records · review
- 2026-11-15 · UGC queues use sorted sets · Devvit Redis has no lists or plain sets · lists · review
- 2026-11-15 · Journey.Start via an explicit startJourney() before any other call; the server ends the journey with the verified score · interaction()/progress() auto-start journeys · start on first placement implicitly · review
- 2026-11-15 · Content bank Nov 17, 2026 → Dec 31, 2027 · v1 started Dec 1, so late-November dev testing would hit the fallback; a year costs nothing · Dec 1 → Jan 15 · review
- 2026-11-15 · Bundle budgets: splash ≤ 50 KB gz, game ≤ 250 KB gz · 600 KB was loose for a grid puzzle in a feed · v1 budgets · review

### Project setup, 2026-11-15
- 2026-11-15 · Project created by cloning reddit/devvit-template-react (the same template `npm create devvit` uses) instead of running the interactive wizard · the wizard needs an interactive Reddit login; the clone gives the identical official structure · wizard · agent
- 2026-11-15 · App name `siesta-town` (placeholder; checked for availability at first `devvit upload`) · the template ships `<% name %>` placeholders · — · agent
- 2026-11-15 · Removed the template's `public/snoo.png` · Devvit Rules: no Snoo or Reddit trademarks · keep until art arrives · agent
- 2026-11-15 · Node 24+ (template `engines` and `.nvmrc` 24.18.0), not 22.2+ as the kit said · the template's requirement wins · — · agent
- 2026-11-15 · Unit tests use the template's `node --test` runner (`npm run test:unit`), not Vitest · already configured in the template and CI; one less dependency · Vitest · agent
- 2026-11-15 · Server framework is Hono (from the template) · template default · Express · agent
- 2026-11-15 · Installed Anthropic's `frontend-design` skill in `.claude/skills/`; skipped `webapp-testing` (needs Python, not installed) and use Node Playwright directly · design quality is a judging criterion · — · agent
- 2026-11-15 · Palette changed from sand + terracotta to whitewash, blue ink, sun yellow and pink · frontend-design lists cream + serif + terracotta as the #1 AI-design cliché · keep v1 palette · agent
- 2026-11-15 · No middle-dot meta strings or "→" in UI copy · both are listed AI-design tells · — · agent
- 2026-11-15 · Prototype: selecting a time fades the cats that don't nap then; tapping a cat says when it naps · the nap badges alone were cryptic in screenshots · text labels on every cat · agent

### Phase 1 build and UX pass, 2026-11-15
- 2026-11-15 · Client written in plain TypeScript, no React · the prototype's imperative drag code ports straight over; splash ~8 KB gz, game ~15 KB gz · React from the template · agent
- 2026-11-15 · Bank starts 2026-11-15 (not 11-17) · the dev subreddit's day No. 1 is today · — · agent
- 2026-11-15 · onAppUpgrade also ensures the hub post exists · existing installs get the pinned post without reinstalling · install only · agent
- 2026-11-15 · First-time players get three interactive lessons (skippable, replayable from help); "tutorial done" and mute live in Redis (`user:{id}`, rolling 30-day TTL) · learn by doing; localStorage is wiped on app updates · text tutorial; localStorage · agent
- 2026-11-15 · A coach line under the title always says what to do next; once every house is placed it names the failing time/cat/flower · players otherwise can't tell why a full board isn't solved · status icons only · agent
- 2026-11-15 · Problem rings only at the selected time · ringing every problem at once was noisy, and this teaches switching times · ring everything · agent
- 2026-11-15 · How to play is three shadow diagrams plus three one-line rules · visual beats a wall of text · text sheet · agent
- 2026-11-15 · The sun moves along a dotted arc around the board (east, south, west) · shows where the sun is and why shadows point the other way · straight jump · agent
- 2026-11-15 · Two-column layout for landscape phones and short windows; tuned spacing for short and tall portrait screens · Reddit's expanded view can be any shape · one layout · agent
- 2026-11-15 · Provisional font: Shantell Sans (OFL), bundled from @fontsource (latin 400/700/800) · most distinctive and hand-made of three candidates (Shantell Sans, Young Serif headings, Baloo 2); comparison screenshots in docs/screens/2026-11-15-ux/font-options · **awaiting human sign-off** · agent
- 2026-11-15 · Code pushed to a private GitHub repo, MehulKumars/siesta-town · backup and authorship history; can go public at submission (optional on Devpost) · public now · user
- 2026-11-15 · CI runs typecheck, lint, unit tests and build in sequence (the template used a parallel-steps syntax GitHub rejected); Dependabot config removed · CI must actually run; automatic dependency bumps mid-hackathon are risky · keep Dependabot · agent

### Phase 2: the Reddit layer, 2026-11-15
- 2026-11-15 · The daily-post job runs every 15 minutes (`1,16,31,46 * * * *`), not hourly · today's post appears within ~15 min of UTC midnight; a run that finds the post is one Redis read · hourly · agent
- 2026-11-15 · Locks and rate limits use atomic `incrBy` counters with a short expiry · `set` with `nx` doesn't clearly report whether it won in the 0.15.3 client · `set nx` · agent
- 2026-11-15 · Text the app writes onto Reddit (post titles, the sticky comment, shared results, report modmail) lives in `src/shared/reddit-copy.ts`, not `copy.ts` · the server posts it and the client previews it word for word, so both need it; a human signs it off with `copy.ts` · duplicate the strings · agent
- 2026-11-15 · "Post as the user" uses `reddit.scope: "user"` plus the client's `canRunAsUser(event)` inside the tap, not the `asUser` list · the 0.15.3 config schema marks `asUser` as not in use · `asUser` · agent
- 2026-11-15 · If Reddit posts a shared result from the app account (app not yet approved), the server edits it to name the player ("u/name put … to sleep") · otherwise the comment wouldn't say whose result it is · leave it · agent
- 2026-11-15 · One shared result per player and town; the card then offers "See your comment" · prevents spam in the daily thread · allow repeats · agent
- 2026-11-15 · Shares from the hub post reply under that day's daily post's sticky comment (made on demand if the job hasn't run yet) · score shares must reply to a sticky comment; the hub is permanent and would pile up comments across days · a sticky on the hub · agent
- 2026-11-15 · "Report a problem" is a Reddit form with four fixed categories, sent to the subreddit's modmail with `createModNotification`; the reporter stays anonymous · mods act where they already work; no free text to moderate · a Redis queue with a mod menu · agent
- 2026-11-15 · The result card is a "postcard": while it's open, the controls step aside and the board shrinks to fit above the card (beside it in landscape) · the sleeping town is the reward and the first card covered it entirely · a full-screen card · agent
- 2026-11-15 · Community line copy is short and honest at every size ("You're one of the first 4 nappers here", "40 nappers so far. 25% started where you did"); the start map appears from 3 solvers · percentages of a handful mislead; a map of one tile is pointless · — · agent
- 2026-11-15 · Only solving the current day's town marks the streak; the shared text mentions the streak only on that day · Reddit's streak guidance; an old town shouldn't extend today's streak · count any solve · agent
- 2026-11-15 · Journeys: the official server router is Express, so `src/server/routes/telemetry.ts` mirrors its five endpoints in Hono; the server ends the journey in `/api/submit` with the verified adjusted time in seconds as the score · we use Hono; scores must come from the server · skip Journeys until allowlisted · agent
- 2026-11-15 · Opt-in streak flair postponed (cut-list item 5) · needs mod rights for the app account and adds a setting; everything else in Phase 2 matters more · build now · agent
