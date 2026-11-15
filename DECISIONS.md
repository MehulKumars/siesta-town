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
