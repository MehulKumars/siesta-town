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

## Next
- [ ] **Human:** `npm run login` in this folder (opens the browser to authorise the Devvit CLI)
- [ ] **Human:** 5 silent playtests of the prototype on phones → paste the log into prompts/01 "Phase 0b"
- [ ] **Human:** create the dev subreddit (private) and the demo subreddit (public, under 200 members)
- [ ] **Human:** start `docs/references/` (5–10 images); try hatched shade on paper or in Figma
- [ ] Agent, after login: first `npm run dev` playtest of the untouched template to prove the pipeline
- [ ] Agent, after GO: Phase 1 (engine in TypeScript, bank, splash → game, /api/init, /api/submit, hub post)

## Questions to send (not blocking; record the date sent and the answer)
- [ ] Devvit team: Journeys allowlisting and journey-map approval for our app
- [ ] Devvit team: can `runAs: 'USER'` be enabled for hackathon apps before publishing?
- [ ] Hackathon manager (email, in writing): may we upload app bug fixes during judging (Dec 9–16)?
- [ ] Devvit team: is a structured, mod-approved community town with an in-app report button enough for the
      user-content attribution rule, or does each town need a comment posted as its author?
- Snoovatars in the webview: the agent will test this itself in Phase 1 (no need to ask).

## Known bugs
- Prototype only: on a 360×640 screen the toast can cover the bottom row of the board for 1.6 s.

## Needs a human
- Go/no-go after the prototype playtests
- Art direction sign-off, type choice, the drawn tile set
- Writing or approving every string in `copy.ts`
