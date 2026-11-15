# PROGRESS.md: running status (agents update this at the end of every session)

## Current phase
Phase 0: prove the fun, and set up (Sun Nov 15 – Tue Nov 17)

## Done
- Kit added and reviewed against the official Devpost pages (docs/sources/) and the live Devvit docs (2026-11-15).
  See DECISIONS.md "Kit review".
- Project created from the official React template (Devvit 0.15.3, Hono, React 19, Vite); `npm install` done;
  git repo started.
- Phase 0 prototype: `prototype/siesta.html` (built by `node prototype/build.mjs` from `engine.js` + `app.html`).
  - 3 hand-made lessons + 9 generated towns (Mon×2, Tue×2, Wed×2, Thu, Fri, Sat), all solver-verified; Wed–Sat unique.
  - Drag with a live shadow preview, tap-to-place, time toggle with shadow sweep, sun marker on the board edge,
    three-sun strip and counters (update on drop), off-time cats fade, tap a cat for its nap time.
  - The siesta solve sequence, result card, help sheet, synthesised sounds (start on first tap, mute, pause when hidden).
  - Host panel: noon rule A/B ("1 tile" vs "half the height"), player numbers, jump list, log with copy-as-TSV.
  - Verified with Playwright at 360×640, 390×844 and 1280×800: no page scroll, tray on screen, slots ≥ 44 px,
    no console errors, lessons and a Saturday town solved by dragging.

- Devvit CLI logged in (u/Lordlitachi); developer account set up; app `siesta-town` registered.
- First playtest of the untouched template works: https://www.reddit.com/r/siesta_town_dev/?playtest=siesta-town
  (dev subreddit r/siesta_town_dev created by the CLI; version v0.0.1.1). The broken image in the template post is the
  removed Snoo placeholder; the real splash replaces it in Phase 1.

## Next
- [ ] **Human:** 5 silent playtests of the prototype on phones → paste the log into prompts/01 "Phase 0b"
- [ ] **Human:** create the demo subreddit (public, under 200 members) when the game name is settled
- [ ] **Human:** start `docs/references/` (5–10 images); try hatched shade on paper or in Figma
- [ ] Agent: Phase 1 (engine in TypeScript, bank, splash → game, /api/init, /api/submit, hub post); the noon rule stays
      a parameter until the playtests decide
- [ ] Agent: README.md for the app (the CLI warns it's missing; required by the Devvit Rules and the hackathon)

## Questions to send (not blocking; record the date sent and the answer)
- [ ] Devvit team: Journeys allowlisting and journey-map approval for our app
- [ ] Devvit team: can `runAs: 'USER'` be enabled for hackathon apps before publishing?
- [ ] Hackathon manager (email, in writing): may we upload app bug fixes during judging (Dec 9–16)?
- [ ] Devvit team: is a structured, mod-approved community town with an in-app report button enough for the
      user-content attribution rule, or does each town need a comment posted as its author?
- Snoovatars in the webview: the agent will test this itself in Phase 1 (no need to ask).

## Phase 1 plan (started 2026-11-15)
1. Engine in `src/shared/engine` (TypeScript, no enums, explicit `.ts` imports so `node --test` can run it): types,
   rules, rng, solver, generator, difficulty, scoring, town validation, bank checks. Tests next to each module.
2. `src/shared/dates.ts`: UTC day keys, weekdays, puzzle numbers, time to next UTC midnight.
3. `scripts/generate-puzzles.ts` → `src/server/content/bank.json` (2026-11-17 → 2027-12-31), noon rule `one` for now;
   `src/server/content/bank.test.ts` validates every day.
4. Server: `repo/keys.ts`, puzzle service (bank, then runtime fallback), `/api/init` (hub → today, daily → its date;
   never the solution), `/api/progress`, `/api/submit` (replay + time check + store), hub post on install and via menu.
5. Client, no React (smaller, and the imperative drag code from the prototype ports straight over):
   `splash.html` (inline, taps only, fetches init after first paint) and `game.html` (board, drag + preview,
   tap-to-place, time toggle, strip, siesta, simple result card, How to play). All strings in `copy.ts`.
6. Check: types, lint, unit tests, Playwright screenshots against a mocked API, then a Reddit playtest.
7. README.md for the app.
Risks: Node's TS stripping vs the tsc project setup; JSON import attributes in the server bundle; drag inside the
Reddit webview on iOS.

## Known bugs
- Prototype only: on a 360×640 screen the toast can cover the bottom row of the board for 1.6 s.

## Needs a human
- Go/no-go after the prototype playtests
- Art direction sign-off, type choice, the drawn tile set
- Writing or approving every string in `copy.ts`
