import './theme.css';
import './game.css';
import {
  IN_TRAY,
  TIMES,
  castShadow,
  evaluate,
  shadeByTime,
  tileMap,
} from '../shared/engine/index.ts';
import type {
  Evaluation,
  Placements,
  Puzzle,
  Tile,
  TimeOfDay,
} from '../shared/engine/index.ts';
import {
  canRunAsUser,
  navigateTo,
  navigateToPost,
  showForm,
  showLoginPrompt,
  showShareSheet,
} from '@devvit/web/client';
import type { T3 } from '@devvit/web/shared';
import type {
  InitResponse,
  PublicTown,
  Settings,
  SolveRecord,
} from '../shared/api.ts';
import { MIN_CROWD_FOR_MAP } from '../shared/community.ts';
import { formatClock, longDate } from '../shared/dates.ts';
import { LESSONS } from '../shared/lessons.ts';
import {
  REPORT_CATEGORIES,
  isReportCategory,
  shareText,
} from '../shared/reddit-copy.ts';
import type { ShareFacts } from '../shared/reddit-copy.ts';
import type { Lesson } from '../shared/lessons.ts';
import {
  CELL,
  catIconSvg,
  cellOrigin,
  drawCat,
  drawFlower,
  drawGround,
  drawHouse,
  drawShadowDiagram,
  drawTownPreview,
  drawWell,
  flowerIconSvg,
  houseSvg,
  sunIconSvg,
  svgEl,
} from './art.ts';
import { copy } from './copy.ts';
import {
  RejectedError,
  fetchInit,
  joinSubreddit,
  sendProgress,
  sendReport,
  sendSettings,
  shareResult,
  submitSolve,
} from './net.ts';
import * as journey from './journey.ts';
import { isMuted, setMuted, sound, unlockAudio } from './sound.ts';

/** Room around the board for the sun and its path. */
const MARGIN = 56;
const IDLE_MS = 20_000;
const SUN_ANGLE: Record<TimeOfDay, number> = {
  am: 0,
  noon: Math.PI / 2,
  pm: Math.PI,
};
const reducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;
const landscapeQuery = window.matchMedia(
  '(orientation: landscape) and (max-height: 560px)'
);

type Selection = { from: 'tray' | 'board'; i: number };
type Drag = {
  source: Selection | null;
  downCell: number | null;
  onTray: boolean;
  pointerId: number;
  x0: number;
  y0: number;
  moved: boolean;
  touch: boolean;
  target: number | null;
};
type Mode =
  { kind: 'loading' } | { kind: 'town' } | { kind: 'lesson'; index: number };

type State = {
  init: InitResponse | null;
  mode: Mode;
  /** What is on the board: today's town, or a lesson dressed as one. */
  town: PublicTown | null;
  lesson: Lesson | null;
  tiles: Tile[];
  placements: Placements;
  time: TimeOfDay;
  selected: Selection | null;
  drag: Drag | null;
  solving: boolean;
  solved: boolean;
  moves: number;
  playedMs: number;
  visibleFrom: number | null;
  initAt: number;
  settings: Settings;
  sawNoon: boolean;
  lastActionAt: number;
  idle: 'none' | 'start' | 'tip';
  justPlaced: number;
  parkedTown: {
    placements: Placements;
    playedMs: number;
    firstTile: number | null;
  } | null;
  sunAngle: number;
  /** Where the first house of today's town landed: feeds "where everyone started". */
  firstTile: number | null;
  /** True while a Reddit action (post, join, report) is in flight, so double taps do nothing. */
  busy: boolean;
};

const state: State = {
  init: null,
  mode: { kind: 'loading' },
  town: null,
  lesson: null,
  tiles: [],
  placements: [],
  time: 'am',
  selected: null,
  drag: null,
  solving: false,
  solved: false,
  moves: 0,
  playedMs: 0,
  visibleFrom: null,
  initAt: 0,
  settings: { tutorialDone: false, muted: false },
  sawNoon: false,
  lastActionAt: Date.now(),
  idle: 'none',
  justPlaced: -1,
  parkedTown: null,
  sunAngle: 0,
  firstTile: null,
  busy: false,
};

function byId<T extends Element>(
  id: string,
  kind: { new (): T; prototype: T }
): T {
  const node = document.getElementById(id);
  if (!(node instanceof kind)) throw new Error(`Missing #${id}`);
  return node;
}

const app = byId('app', HTMLDivElement);
const svg = byId('board', SVGSVGElement);
const layers: Record<
  'shadow' | 'preview' | 'items' | 'houses' | 'sun',
  SVGGElement | null
> = {
  shadow: null,
  preview: null,
  items: null,
  houses: null,
  sun: null,
};
let catEls = new Map<number, SVGGElement>();
let flowerEls = new Map<number, SVGGElement>();

function puzzle(): Puzzle {
  if (!state.town) throw new Error('No town loaded');
  return state.town.puzzle;
}
function noonRule() {
  return state.town?.noonRule ?? 'one';
}
function layer(name: keyof typeof layers): SVGGElement {
  const g = layers[name];
  if (!g) throw new Error(`Board layer ${name} missing`);
  return g;
}
function inLesson(): boolean {
  return state.mode.kind === 'lesson';
}

// ---------- local storage (logged-out play only; it is wiped on app updates) ----------
const local = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`siesta:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(`siesta:${key}`, value);
    } catch {
      // private mode or blocked storage: play on without saving
    }
  },
};

function saveSettings(change: Partial<Settings>): void {
  state.settings = { ...state.settings, ...change };
  if (change.tutorialDone !== undefined)
    local.set('tutorialDone', change.tutorialDone ? '1' : '0');
  if (change.muted !== undefined) local.set('muted', change.muted ? '1' : '0');
  if (state.init?.user.loggedIn) void sendSettings(change);
}

// ---------- timing ----------
function playMs(): number {
  return (
    state.playedMs +
    (state.visibleFrom !== null ? performance.now() - state.visibleFrom : 0)
  );
}
function pauseClock(): void {
  if (state.visibleFrom !== null)
    state.playedMs += performance.now() - state.visibleFrom;
  state.visibleFrom = null;
}
function resumeClock(): void {
  if (
    state.mode.kind === 'town' &&
    !state.solving &&
    !state.solved &&
    state.visibleFrom === null
  ) {
    state.visibleFrom = performance.now();
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseClock();
    void saveProgressNow();
  } else {
    resumeClock();
  }
});

// ---------- board ----------
function buildBoard(): void {
  const p = puzzle();
  const span = p.size * CELL;
  svg.replaceChildren();
  svg.setAttribute(
    'viewBox',
    `${-MARGIN} ${-MARGIN} ${span + MARGIN * 2} ${span + MARGIN * 2}`
  );
  const defs = svgEl('defs', {}, svg);
  for (const [id, base, line] of [
    ['hatch', 0.28, 0.95],
    ['hatch-preview', 0.14, 0.45],
  ] as const) {
    const pattern = svgEl(
      'pattern',
      {
        id,
        width: 16,
        height: 16,
        patternUnits: 'userSpaceOnUse',
        patternTransform: 'rotate(45)',
      },
      defs
    );
    svgEl(
      'rect',
      { width: 16, height: 16, fill: 'var(--shade)', 'fill-opacity': base },
      pattern
    );
    svgEl(
      'rect',
      { width: 6, height: 16, fill: 'var(--shade)', 'fill-opacity': line },
      pattern
    );
  }
  // The sun's path through the day: east (right) in the morning, south (below) at noon, west (left) in the evening.
  const radius = span / 2 + MARGIN / 2;
  svgEl(
    'path',
    {
      class: 'sun-path',
      d: `M ${span / 2 + radius} ${span / 2} A ${radius} ${radius} 0 0 1 ${span / 2 - radius} ${span / 2}`,
    },
    svg
  );
  drawGround(svg, p.size);
  const wells = svgEl('g', {}, svg);
  layers.shadow = svgEl('g', {}, svg);
  layers.preview = svgEl('g', {}, svg);
  layers.items = svgEl('g', {}, svg);
  layers.houses = svgEl('g', {}, svg);
  svgEl(
    'rect',
    { class: 'frame', x: 0, y: 0, width: span, height: span, rx: 4 },
    svg
  );
  layers.sun = svgEl('g', { class: 'sun-marker' }, svg);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    svgEl(
      'line',
      {
        x1: Math.cos(a) * 19,
        y1: Math.sin(a) * 19,
        x2: Math.cos(a) * 27,
        y2: Math.sin(a) * 27,
        stroke: 'var(--ink)',
        'stroke-width': 4,
        'stroke-linecap': 'round',
      },
      layers.sun
    );
  }
  svgEl(
    'circle',
    { r: 14, fill: 'var(--sun-deep)', stroke: 'var(--ink)', 'stroke-width': 4 },
    layers.sun
  );

  catEls = new Map();
  flowerEls = new Map();
  for (const cell of p.wells) drawWell(wells, p.size, cell);
  for (const cell of p.flowers)
    flowerEls.set(cell, drawFlower(layer('items'), p.size, cell));
  for (const cat of p.cats)
    catEls.set(cat.cell, drawCat(layer('items'), p.size, cat.cell, cat.nap));
  state.sunAngle = SUN_ANGLE[state.time];
}

function renderShadows({ sweep = false, skip = -1 } = {}): void {
  const p = puzzle();
  const target = layer('shadow');
  target.replaceChildren();
  const delays = new Map<number, number>();
  state.placements.forEach((cell, i) => {
    const height = p.heights[i];
    if (cell === IN_TRAY || i === skip || height === undefined) return;
    castShadow(p.size, cell, height, state.time, noonRule()).forEach((s, k) => {
      delays.set(s, Math.min(delays.get(s) ?? Infinity, k * 55));
    });
  });
  const rects: SVGRectElement[] = [];
  for (const [s, delay] of delays) {
    const { x, y } = cellOrigin(p.size, s);
    const r = svgEl(
      'rect',
      { class: 'shadow', x, y, width: CELL, height: CELL },
      target
    );
    if (sweep && !reducedMotion) r.style.transitionDelay = `${delay}ms`;
    else r.style.transition = 'none';
    rects.push(r);
  }
  const show = (): void => rects.forEach((r) => r.classList.add('on'));
  if (sweep && !reducedMotion)
    requestAnimationFrame(() => requestAnimationFrame(show));
  else show();
}

function renderHouses(skip = -1): void {
  const p = puzzle();
  const target = layer('houses');
  target.replaceChildren();
  state.placements.forEach((cell, i) => {
    const height = p.heights[i];
    if (cell === IN_TRAY || i === skip || height === undefined) return;
    const { x, y } = cellOrigin(p.size, cell);
    const g = svgEl('g', { transform: `translate(${x} ${y})` }, target);
    const house = drawHouse(g, height);
    if (state.selected?.from === 'board' && state.selected.i === i)
      house.classList.add('selected');
    if (state.justPlaced === i && !reducedMotion)
      house.classList.add('just-placed');
  });
  state.justPlaced = -1;
}

function renderPreview(cell: number | null, i: number): void {
  const target = layer('preview');
  target.replaceChildren();
  const p = puzzle();
  const height = p.heights[i];
  if (cell === null || height === undefined) return;
  for (const s of castShadow(p.size, cell, height, state.time, noonRule())) {
    const { x, y } = cellOrigin(p.size, s);
    svgEl(
      'rect',
      { class: 'preview-shadow', x, y, width: CELL, height: CELL },
      target
    );
  }
  const { x, y } = cellOrigin(p.size, cell);
  drawHouse(
    svgEl('g', { transform: `translate(${x} ${y})`, opacity: 0.9 }, target),
    height
  );
}

function placeSun(angle: number): void {
  const span = puzzle().size * CELL;
  const radius = span / 2 + MARGIN / 2;
  const x = span / 2 + Math.cos(angle) * radius;
  const y = span / 2 + Math.sin(angle) * radius;
  layer('sun').setAttribute('transform', `translate(${x} ${y}) scale(0.7)`);
}

let sunAnimation = 0;
function renderSun(animate = false): void {
  const target = SUN_ANGLE[state.time];
  cancelAnimationFrame(sunAnimation);
  if (!animate || reducedMotion) {
    state.sunAngle = target;
    placeSun(target);
    return;
  }
  const from = state.sunAngle;
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / 420);
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    state.sunAngle = from + (target - from) * eased;
    placeSun(state.sunAngle);
    if (t < 1) sunAnimation = requestAnimationFrame(step);
  };
  sunAnimation = requestAnimationFrame(step);
}

/** Cats that don't nap at the selected time fade back, so switching the time shows whose turn it is. */
function renderDuty(): void {
  for (const cat of puzzle().cats)
    catEls.get(cat.cell)?.classList.toggle('off-duty', cat.nap !== state.time);
}

function renderToggle(): void {
  const box = byId('toggle', HTMLDivElement);
  box.replaceChildren();
  const lock = state.lesson?.lockTime ?? null;
  for (const t of TIMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${sunIconSvg(t)}<span>${copy.timeLabel[t]}</span>`;
    b.setAttribute('aria-pressed', String(state.time === t));
    b.disabled = state.solving || (lock !== null && lock !== t);
    if (state.lesson?.id === 'lesson-2' && t === 'noon' && !state.sawNoon)
      b.classList.add('beckon');
    b.addEventListener('click', () => setTime(t));
    box.appendChild(b);
  }
}

function renderTray(): void {
  const tray = byId('tray', HTMLDivElement);
  tray.replaceChildren();
  byId('reset-btn', HTMLButtonElement).hidden = state.solved;
  // A solved town has nothing left to place: the tray becomes the way back to the result card.
  if (state.solved && state.mode.kind === 'town' && !state.solving) {
    const record = state.init?.result;
    if (record)
      tray.append(
        button(copy.seeYourResult, 'secondary see-result', () =>
          showResult(record, null)
        )
      );
    return;
  }
  puzzle().heights.forEach((h, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot';
    b.dataset.i = String(i);
    if (state.placements[i] !== IN_TRAY) {
      b.classList.add('empty');
      b.setAttribute('aria-label', copy.houseOnBoard(h));
    } else {
      b.innerHTML = houseSvg(h);
      b.setAttribute('aria-label', copy.houseInTray(h));
    }
    if (state.selected?.from === 'tray' && state.selected.i === i)
      b.classList.add('selected');
    tray.appendChild(b);
  });
}

function renderStatus(result: Evaluation): void {
  const suns = byId('suns', HTMLDivElement);
  suns.replaceChildren();
  for (const t of TIMES) {
    const ok = result.allPlaced && result.timeOk[t];
    const span = document.createElement('span');
    span.className = `sun-check${ok ? ' ok' : ''}`;
    span.innerHTML = `${sunIconSvg(t, 22)}<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${
      ok
        ? '<path d="M3 8.5l3 3 7-7" fill="none" stroke="#1f7a4d" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<circle cx="8" cy="8" r="3" fill="rgba(27,39,102,.25)"/>'
    }</svg>`;
    span.setAttribute('aria-label', copy.timeDone(copy.timeLabel[t], ok));
    suns.appendChild(span);
  }
  const parts = [
    `<span class="count" aria-label="${copy.catsAsleep}">${catIconSvg}${result.asleepCount}/${result.cats.length}</span>`,
  ];
  if (result.flowers.length) {
    parts.push(
      `<span class="count" aria-label="${copy.flowersInSun}">${flowerIconSvg}${result.litCount}/${result.flowers.length}</span>`
    );
  }
  byId('counts', HTMLDivElement).innerHTML = parts.join('');
}

/** Once every house stands, ring what's wrong at the selected time (switching times reveals the rest). */
function renderCreatures(result: Evaluation): void {
  const trouble = result.allPlaced && !result.solved && !state.solving;
  const shadeNow = trouble
    ? shadeByTime(puzzle(), state.placements, noonRule())[state.time]
    : null;
  for (const c of result.cats) {
    const el = catEls.get(c.cell);
    el?.classList.toggle('asleep', c.asleep);
    el?.classList.toggle(
      'trouble',
      trouble && !c.asleep && c.nap === state.time
    );
  }
  for (const f of result.flowers) {
    const el = flowerEls.get(f.cell);
    el?.classList.toggle('wilted', !f.lit);
    el?.classList.toggle('trouble', Boolean(shadeNow?.has(f.cell)));
  }
}

/** One sentence that always says what to do next. */
function coachText(result: Evaluation): string {
  const p = puzzle();
  if (state.solved || result.solved) {
    return copy.coachSolved;
  }
  if (state.lesson && !result.allPlaced)
    return copy.lessonStep(state.lesson.id, state.sawNoon, noonRule());
  const placed = state.placements.filter((c) => c !== IN_TRAY).length;
  if (state.idle === 'start' && placed === 0) return copy.coachIdleStart;
  if (state.idle === 'tip') return copy.coachIdleTip;
  if (placed === 0) return copy.coachGoal(p.cats.length, p.flowers.length);
  if (!result.allPlaced)
    return copy.coachProgress(
      result.asleepCount,
      result.cats.length,
      p.heights.length - placed
    );
  const shade = shadeByTime(p, state.placements, noonRule());
  const flowerShadedAt = (t: TimeOfDay): boolean =>
    p.flowers.some((f) => shade[t].has(f));
  const catAwakeAt = (t: TimeOfDay): boolean =>
    result.cats.some((c) => c.nap === t && !c.asleep);
  if (flowerShadedAt(state.time)) return copy.coachFlowerShadedHere(state.time);
  if (catAwakeAt(state.time)) return copy.coachCatAwakeHere(state.time);
  for (const t of TIMES) {
    if (flowerShadedAt(t)) return copy.coachFlowerShaded(t);
    if (catAwakeAt(t)) return copy.coachCatAwake(t);
  }
  return copy.coachGoal(p.cats.length, p.flowers.length);
}

let lastResult: Evaluation | null = null;
function renderCoach(): void {
  if (!lastResult) return;
  const coach = byId('coach', HTMLParagraphElement);
  const text = coachText(lastResult);
  if (coach.textContent !== text) coach.textContent = text;
}

function evaluateAndRender(): Evaluation {
  const result = evaluate(puzzle(), state.placements, noonRule());
  lastResult = result;
  renderCreatures(result);
  renderStatus(result);
  renderCoach();
  return result;
}

function fitBoard(): void {
  const cs = getComputedStyle(app);
  const innerH =
    app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const innerW =
    app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  let size: number;
  if (landscapeQuery.matches) {
    size = Math.min(innerH, innerW - 300);
  } else {
    const kids = [...app.children].filter(
      (c) =>
        c instanceof HTMLElement &&
        !c.hidden &&
        getComputedStyle(c).display !== 'none'
    );
    const others = kids
      .filter(
        (c) =>
          !c.classList.contains('board-wrap') && !c.classList.contains('spacer')
      )
      .reduce((sum, c) => sum + c.getBoundingClientRect().height, 0);
    const gaps = (parseFloat(cs.rowGap) || 8) * (kids.length - 1);
    size = Math.min(innerW, innerH - others - gaps);
  }
  document.documentElement.style.setProperty(
    '--board',
    `${Math.floor(Math.max(170, size))}px`
  );
}

function renderAll(): void {
  renderToggle();
  renderTray();
  renderHouses();
  renderShadows();
  renderSun();
  renderDuty();
  evaluateAndRender();
  fitBoard();
}

// ---------- hand hint: shows the drag gesture ----------
const hand = byId('hand', HTMLDivElement);
let handAnimation: Animation | null = null;

function cellCenterOnScreen(cell: number): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const size = puzzle().size;
  const pt = new DOMPoint(
    (cell % size) * CELL + CELL / 2,
    Math.floor(cell / size) * CELL + CELL / 2
  ).matrixTransform(ctm);
  return { x: pt.x, y: pt.y };
}

function showHand(slotIndex: number, cell: number): void {
  stopHand();
  if (reducedMotion) return;
  const slot = document.querySelector(`.slot[data-i="${slotIndex}"]`);
  const to = cellCenterOnScreen(cell);
  if (!slot || !to) return;
  const r = slot.getBoundingClientRect();
  const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  hand.innerHTML = `${houseSvg(puzzle().heights[slotIndex] ?? 1)}<svg class="touch" viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="rgba(255,255,255,0.5)" stroke="#1b2766" stroke-width="3"/><circle cx="24" cy="24" r="7" fill="#1b2766"/></svg>`;
  hand.hidden = false;
  handAnimation = hand.animate(
    [
      {
        transform: `translate(${from.x}px, ${from.y}px) scale(1)`,
        opacity: 0,
        offset: 0,
      },
      {
        transform: `translate(${from.x}px, ${from.y}px) scale(0.9)`,
        opacity: 1,
        offset: 0.15,
      },
      {
        transform: `translate(${to.x}px, ${to.y}px) scale(0.9)`,
        opacity: 1,
        offset: 0.65,
      },
      {
        transform: `translate(${to.x}px, ${to.y}px) scale(1)`,
        opacity: 1,
        offset: 0.78,
      },
      {
        transform: `translate(${to.x}px, ${to.y}px) scale(1)`,
        opacity: 0,
        offset: 1,
      },
    ],
    { duration: 2200, iterations: Infinity, easing: 'ease-in-out' }
  );
}

function stopHand(): void {
  handAnimation?.cancel();
  handAnimation = null;
  hand.hidden = true;
}

function centerGround(): number {
  const p = puzzle();
  const mid = (p.size - 1) / 2;
  let best = 0;
  let bestDist = Infinity;
  state.tiles.forEach((tile, cell) => {
    if (tile !== 'ground') return;
    const d =
      Math.abs((cell % p.size) - mid) +
      Math.abs(Math.floor(cell / p.size) - mid);
    if (d < bestDist) {
      bestDist = d;
      best = cell;
    }
  });
  return best;
}

// ---------- idle help ----------
function noteAction(): void {
  state.lastActionAt = Date.now();
  if (state.idle !== 'none') {
    state.idle = 'none';
    renderCoach();
  }
  if (!(state.lesson?.id === 'lesson-1')) stopHand();
}

window.setInterval(() => {
  if (
    state.mode.kind !== 'town' ||
    state.solving ||
    state.solved ||
    state.idle !== 'none'
  )
    return;
  if (document.hidden || document.querySelector('.sheet.open')) return;
  if (Date.now() - state.lastActionAt < IDLE_MS) return;
  const nothingPlaced = state.placements.every((c) => c === IN_TRAY);
  state.idle = nothingPlaced ? 'start' : 'tip';
  renderCoach();
  if (nothingPlaced) showHand(0, centerGround());
}, 1000);

// ---------- moves ----------
function setTime(t: TimeOfDay): void {
  if (state.solving || state.time === t) return;
  noteAction();
  journey.startJourney();
  journey.interaction('time_toggle', t);
  state.time = t;
  if (t === 'noon' && !state.sawNoon) state.sawNoon = true;
  renderToggle();
  renderShadows({ sweep: true });
  renderSun(true);
  renderDuty();
  evaluateAndRender();
}

let progressTimer: number | undefined;
function queueProgressSave(): void {
  window.clearTimeout(progressTimer);
  progressTimer = window.setTimeout(() => void saveProgressNow(), 1200);
}

async function saveProgressNow(): Promise<void> {
  const town = state.town;
  if (!town || state.mode.kind !== 'town' || state.solved || state.solving)
    return;
  const record = {
    placements: state.placements,
    timeMs: Math.round(playMs()),
    firstTile: state.firstTile,
  };
  if (!state.init?.user.loggedIn) {
    local.set(`progress:${town.date}`, JSON.stringify(record));
    return;
  }
  try {
    await sendProgress({ date: town.date, ...record });
  } catch {
    // progress is a convenience; the next save will try again
  }
}

function placeHouse(i: number, cell: number): void {
  const from = state.placements[i];
  state.placements[i] = cell;
  state.moves++;
  journey.startJourney();
  if (cell === IN_TRAY && from !== IN_TRAY) journey.interaction('lift');
  if (cell !== IN_TRAY) {
    if (state.mode.kind === 'town' && state.firstTile === null)
      state.firstTile = cell;
    state.justPlaced = i;
    sound.drop();
  } else if (from !== IN_TRAY) {
    sound.lift();
  }
  state.selected = null;
  renderTray();
  renderHouses();
  renderShadows();
  const result = evaluateAndRender();
  if (state.mode.kind === 'town') {
    const goals = puzzle().cats.length + puzzle().flowers.length;
    if (goals > 0)
      journey.progress((result.asleepCount + result.litCount) / goals);
  }
  if (result.solved) void runSiesta(result);
  else queueProgressSave();
}

function isFreeFor(cell: number | null, i: number): cell is number {
  if (cell === null || state.tiles[cell] !== 'ground') return false;
  const other = state.placements.indexOf(cell);
  return other < 0 || other === i;
}

let toastTimer: number | undefined;
function toast(message: string): void {
  const t = byId('toast', HTMLDivElement);
  t.textContent = message;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 1800);
}

function whyNot(cell: number): string {
  const tile = state.tiles[cell];
  if (tile === 'cat') return copy.spotTakenByCat;
  if (tile === 'flower') return copy.spotIsFlower;
  if (tile === 'well') return copy.spotIsWell;
  return copy.spotHasHouse;
}

function describe(cell: number): string | null {
  const tile = state.tiles[cell];
  if (tile === 'cat') {
    const cat = puzzle().cats.find((c) => c.cell === cell);
    return cat ? copy.catNaps[cat.nap] : null;
  }
  if (tile === 'flower') return copy.flowerNeedsSun;
  if (tile === 'well') return copy.wellIsFlat;
  return null;
}

// ---------- input: drag a house, or tap a house then a tile ----------
function cellAt(clientX: number, clientY: number): number | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  const size = puzzle().size;
  const c = Math.floor(p.x / CELL);
  const r = Math.floor(p.y / CELL);
  if (r < 0 || c < 0 || r >= size || c >= size) return null;
  return r * size + c;
}

function cellPixels(): number {
  const rect = svg.getBoundingClientRect();
  const span = puzzle().size * CELL + MARGIN * 2;
  return (Math.min(rect.width, rect.height) / span) * CELL;
}

const ghost = byId('ghost', HTMLDivElement);
function showGhost(i: number, x: number, y: number): void {
  const height = puzzle().heights[i] ?? 1;
  if (ghost.dataset.i !== String(i)) {
    ghost.innerHTML = houseSvg(height);
    ghost.dataset.i = String(i);
  }
  const s = Math.max(48, Math.min(84, cellPixels()));
  ghost.style.width = ghost.style.height = `${s}px`;
  ghost.style.transform = `translate(${x - s / 2}px, ${y - s / 2}px)`;
  ghost.style.display = 'block';
}
function hideGhost(): void {
  ghost.style.display = 'none';
}

const liftFor = (d: Drag): number => (d.touch ? cellPixels() * 0.85 : 0);

document.addEventListener('pointerdown', (e) => {
  if (
    !state.town ||
    state.mode.kind === 'loading' ||
    state.solving ||
    state.solved
  )
    return;
  if (document.querySelector('.sheet.open')) return;
  if (!(e.target instanceof Element)) return;
  unlockAudio();
  const slot = e.target.closest<HTMLElement>('.slot');
  const onBoard = e.target.closest('#board');
  let source: Selection | null = null;
  let downCell: number | null = null;
  if (slot) {
    if (!slot.classList.contains('empty'))
      source = { from: 'tray', i: Number(slot.dataset.i) };
  } else if (onBoard) {
    downCell = cellAt(e.clientX, e.clientY);
    const i = downCell === null ? -1 : state.placements.indexOf(downCell);
    if (i >= 0) source = { from: 'board', i };
  } else {
    return;
  }
  noteAction();
  if (source) {
    e.preventDefault();
    stopHand();
  }
  state.drag = {
    source,
    downCell,
    onTray: Boolean(slot),
    pointerId: e.pointerId,
    x0: e.clientX,
    y0: e.clientY,
    moved: false,
    touch: e.pointerType !== 'mouse',
    target: null,
  };
});

document.addEventListener(
  'pointermove',
  (e) => {
    const d = state.drag;
    if (!d || e.pointerId !== d.pointerId || !d.source) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
    e.preventDefault();
    const i = d.source.i;
    if (!d.moved) {
      d.moved = true;
      state.selected = null;
      if (d.source.from === 'board') {
        renderHouses(i);
        renderShadows({ skip: i });
      }
      renderTray();
      if (d.source.from === 'tray')
        document.querySelector(`.slot[data-i="${i}"]`)?.classList.add('lifted');
    }
    const lift = liftFor(d);
    const target = cellAt(e.clientX, e.clientY - lift);
    if (isFreeFor(target, i)) {
      if (target !== d.target) renderPreview(target, i);
      d.target = target;
      hideGhost();
    } else {
      if (d.target !== null) renderPreview(null, i);
      d.target = null;
      showGhost(i, e.clientX, e.clientY - lift);
    }
  },
  { passive: false }
);

function endDrag(e: PointerEvent, cancelled: boolean): void {
  const d = state.drag;
  if (!d || e.pointerId !== d.pointerId) return;
  state.drag = null;
  hideGhost();
  if (d.source) renderPreview(null, d.source.i);
  if (cancelled) {
    renderAll();
    return;
  }

  if (d.moved && d.source) {
    const i = d.source.i;
    const dropCell = cellAt(e.clientX, e.clientY - liftFor(d));
    if (isFreeFor(dropCell, i)) {
      if (dropCell !== state.placements[i]) placeHouse(i, dropCell);
      else renderAll();
      return;
    }
    if (dropCell === null) {
      if (d.source.from === 'board') placeHouse(i, IN_TRAY);
      else renderAll();
      return;
    }
    toast(whyNot(dropCell));
    renderAll();
    return;
  }

  if (d.source) {
    const same =
      state.selected?.from === d.source.from && state.selected.i === d.source.i;
    state.selected = same ? null : d.source;
    renderTray();
    renderHouses();
    return;
  }
  if (d.onTray && state.selected?.from === 'board') {
    placeHouse(state.selected.i, IN_TRAY);
    return;
  }
  if (d.downCell !== null && state.selected) {
    const i = state.selected.i;
    if (isFreeFor(d.downCell, i)) placeHouse(i, d.downCell);
    else toast(whyNot(d.downCell));
    return;
  }
  if (d.downCell !== null) {
    const text = describe(d.downCell);
    if (text) toast(text);
  }
}
document.addEventListener('pointerup', (e) => endDrag(e, false));
document.addEventListener('pointercancel', (e) => endDrag(e, true));

byId('reset-btn', HTMLButtonElement).addEventListener('click', () => {
  if (
    state.solving ||
    state.solved ||
    state.placements.every((c) => c === IN_TRAY)
  )
    return;
  noteAction();
  state.placements = state.placements.map(() => IN_TRAY);
  state.moves++;
  state.selected = null;
  sound.lift();
  renderAll();
  queueProgressSave();
});

// ---------- the siesta: the day plays back and the cats fall asleep ----------
const wait = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, reducedMotion ? 0 : ms));

async function playSiesta(result: Evaluation): Promise<void> {
  const times = state.lesson?.lockTime ? [state.lesson.lockTime] : TIMES;
  state.selected = null;
  renderTray();
  for (const el of catEls.values()) el.classList.remove('asleep', 'trouble');
  await wait(150);
  for (const t of times) {
    state.time = t;
    renderToggle();
    renderSun(true);
    renderDuty();
    renderShadows({ sweep: true });
    await wait(320);
    for (const c of result.cats.filter((x) => x.nap === t)) {
      catEls.get(c.cell)?.classList.add('asleep');
      sound.purr();
      await wait(160);
    }
    await wait(120);
  }
  for (const el of catEls.values()) el.classList.remove('off-duty');
  for (const el of flowerEls.values()) {
    el.classList.remove('bloom');
    void el.getBBox();
    el.classList.add('bloom');
  }
  sound.chime();
  await wait(450);
}

async function runSiesta(result: Evaluation): Promise<void> {
  const town = state.town;
  if (!town) return;
  state.solving = true;
  stopHand();

  if (state.mode.kind === 'lesson') {
    await playSiesta(result);
    state.solving = false;
    state.solved = true;
    renderToggle();
    renderTray();
    evaluateAndRender();
    showLessonDone(state.mode.index);
    return;
  }

  pauseClock();
  const timeMs = Math.round(playMs());
  window.clearTimeout(progressTimer);
  const submission = submitSolve({
    date: town.date,
    placements: [...state.placements],
    timeMs,
    hints: 0,
    moves: state.moves,
    firstTile: state.firstTile,
  }, journey.journeyHeaders());
  await playSiesta(result);

  let record: SolveRecord = {
    placements: [...state.placements],
    timeMs,
    hints: 0,
    adjustedMs: timeMs,
    moves: state.moves,
    solvedAt: Date.now(),
    firstTile: state.firstTile,
  };
  let note: string | null = state.init?.user.loggedIn
    ? null
    : copy.notSavedLoggedOut;
  try {
    const response = await submission;
    record = response.result;
    if (state.init) {
      state.init.community = response.community;
      if (response.saved) state.init.streak = response.streak;
    }
  } catch (error) {
    if (error instanceof RejectedError) {
      // The server replays every solve and disagreed. Let the player keep going.
      state.solving = false;
      resumeClock();
      renderToggle();
      evaluateAndRender();
      toast(error.message);
      return;
    }
    note = copy.notSavedYet;
  }
  state.solving = false;
  state.solved = true;
  if (state.init) state.init.result = record;
  local.set(`progress:${town.date}`, '');
  renderToggle();
  renderTray();
  evaluateAndRender();
  showResult(record, note);
}

function nextTownText(): string {
  const left = Math.max(
    0,
    (state.init?.msUntilNext ?? 0) - (Date.now() - state.initAt)
  );
  const minutes = Math.ceil(left / 60_000);
  return copy.nextTown(Math.floor(minutes / 60), minutes % 60);
}

function button(
  text: string,
  className: string,
  onClick: (event: MouseEvent) => void
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function isPostId(value: string | null | undefined): value is T3 {
  return typeof value === 'string' && value.startsWith('t3_');
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = ''
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A quiet close button for the top corner of a sheet. */
function closeButton(label: string): HTMLButtonElement {
  const b = button('', 'icon-btn sheet-close', closeSheets);
  b.setAttribute('aria-label', label);
  b.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  return b;
}

function stat(value: string, label: string): HTMLDivElement {
  const div = el('div', '');
  div.append(el('strong', '', value), document.createTextNode(label));
  return div;
}

/** What a shared comment says, computed exactly as the server will (the preview must match word for word). */
function shareFacts(record: SolveRecord): ShareFacts | null {
  const init = state.init;
  if (!init) return null;
  return {
    number: init.town.number,
    title: init.town.title,
    cats: init.town.puzzle.cats.length,
    timeMs: record.timeMs,
    hints: record.hints,
    streak: init.isToday ? init.streak : 0,
  };
}

function showResult(record: SolveRecord, note: string | null): void {
  const town = state.town;
  const init = state.init;
  if (!town || !init) return;
  const sheet = byId('result-sheet', HTMLDivElement);
  sheet.replaceChildren();

  const stats = el('div', 'stats');
  stats.append(stat(formatClock(record.timeMs), copy.statTime));
  if (init.streak > 0)
    stats.append(stat(String(init.streak), copy.statStreak));
  if (record.hints === 0) stats.append(el('div', 'badge', copy.cleanNap));
  sheet.append(
    closeButton(copy.lookAtTown),
    el('h2', '', copy.asleep(town.title)),
    el('p', 'next', nextTownText()),
    stats
  );

  const community = init.community;
  if (community) {
    const crowd = el('div', 'crowd');
    crowd.append(el('p', '', copy.crowd(community.line, town.title)));
    if (community.solvers >= MIN_CROWD_FOR_MAP)
      crowd.append(
        button(copy.seeWhereStarted, 'link-btn', () =>
          showStartMap(record)
        )
      );
    sheet.append(crowd);
  }
  if (note) sheet.append(el('p', 'note', note));

  const actions = el('div', 'actions');
  if (!init.user.loggedIn) {
    actions.append(button(copy.logInToKeep, 'primary', () => showLoginPrompt()));
  } else if (init.sharedPermalink) {
    const permalink = init.sharedPermalink;
    actions.append(
      button(copy.seeYourComment, 'primary', () => navigateTo(permalink))
    );
  } else {
    actions.append(
      button(copy.postResult, 'primary', () => {
        journey.interaction('share_clicked');
        showSharePreview(record);
      })
    );
  }
  actions.append(
    button(copy.challenge, 'secondary', () => void challengeFriend(record))
  );
  sheet.append(actions);

  const links = el('div', 'footer-links');
  const other = init.isToday ? init.posts.yesterday : (init.posts.today ?? init.posts.hub);
  if (isPostId(other))
    links.append(
      button(init.isToday ? copy.yesterdaysTown : copy.todaysTown, 'link-btn', () =>
        navigateToPost(other)
      )
    );
  if (init.user.loggedIn && !init.joined)
    links.append(
      button(copy.join(init.subredditName), 'link-btn', (e) => void join(e))
    );
  if (links.childElementCount > 0) sheet.append(links);
  openSheet(sheet);
}

/** The exact comment, then one clear button. Nothing is posted without this press. */
function showSharePreview(record: SolveRecord): void {
  const init = state.init;
  const facts = shareFacts(record);
  const name = init?.user.username;
  if (!init || !facts || !name) return;
  const sheet = byId('result-sheet', HTMLDivElement);
  sheet.replaceChildren();
  const quote = el('blockquote', 'share-preview', shareText(facts));
  const post = button(copy.postAs(name), 'primary', (e) => void postResult(e, record, post));
  sheet.append(
    el('h2', '', copy.sharePreviewTitle),
    el('p', '', copy.sharePreviewBody(name, init.isToday)),
    quote,
    post,
    button(copy.notNow, 'secondary', () => showResult(record, null))
  );
  openSheet(sheet);
}

async function postResult(
  event: MouseEvent,
  record: SolveRecord,
  trigger: HTMLButtonElement
): Promise<void> {
  const init = state.init;
  if (!init || state.busy) return;
  state.busy = true;
  try {
    // Reddit may ask the player to allow posting on their behalf; this must come from the tap itself.
    const allowed = await canRunAsUser(event).catch(() => true);
    if (!allowed) {
      toast(copy.needsPermission);
      return;
    }
    trigger.disabled = true;
    trigger.textContent = copy.posting;
    const response = await shareResult({ date: init.town.date });
    init.sharedPermalink = response.permalink;
    showResult(record, response.postedByApp ? copy.postedByApp : copy.posted);
  } catch (error) {
    trigger.disabled = false;
    trigger.textContent = copy.postAs(init.user.username ?? '');
    toast(error instanceof Error ? error.message : copy.loadFailed);
  } finally {
    state.busy = false;
  }
}

async function challengeFriend(record: SolveRecord): Promise<void> {
  const init = state.init;
  if (!init) return;
  // Share data is untrusted on the other end: only the date and time travel, never a name.
  journey.interaction('challenge_clicked');
  const data = JSON.stringify({ d: init.town.date, t: Math.round(record.timeMs) });
  const post = init.posts.thisTown;
  try {
    await showShareSheet({
      title: copy.gameName,
      text: copy.challengeText(init.town.title, formatClock(record.timeMs)),
      data,
      post: isPostId(post) ? post : undefined,
    });
  } catch (error) {
    console.warn('Share sheet failed', error);
  }
}

async function join(event: MouseEvent): Promise<void> {
  const init = state.init;
  if (!init || state.busy) return;
  state.busy = true;
  try {
    const allowed = await canRunAsUser(event).catch(() => true);
    if (!allowed) {
      toast(copy.needsPermission);
      return;
    }
    journey.interaction('subscribe_clicked');
    await joinSubreddit();
    init.joined = true;
    if (init.result) showResult(init.result, copy.joined(init.subredditName));
  } catch (error) {
    toast(error instanceof Error ? error.message : copy.loadFailed);
  } finally {
    state.busy = false;
  }
}

/** A small copy of the town with every first drop shaded in: shown only after solving, so no spoilers. */
function showStartMap(record: SolveRecord): void {
  const town = state.town;
  const community = state.init?.community;
  if (!town || !community) return;
  const sheet = byId('result-sheet', HTMLDivElement);
  sheet.replaceChildren();
  const pic = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  pic.classList.add('start-map');
  pic.setAttribute('role', 'img');
  pic.setAttribute('aria-label', copy.mapTitle);
  drawTownPreview(pic, town.puzzle);
  const size = town.puzzle.size;
  const most = Math.max(1, ...community.firsts);
  const frame = pic.querySelector('.frame');
  community.firsts.forEach((count, cell) => {
    if (count <= 0) return;
    const { x, y } = cellOrigin(size, cell);
    const heat = svgEl('rect', {
      class: 'heat',
      x: x + 4,
      y: y + 4,
      width: CELL - 8,
      height: CELL - 8,
      rx: 10,
      'fill-opacity': (0.18 + 0.62 * (count / most)).toFixed(2),
    });
    pic.insertBefore(heat, frame);
  });
  const mine = record.firstTile;
  if (mine !== null) {
    const { x, y } = cellOrigin(size, mine);
    svgEl(
      'circle',
      { class: 'mine', cx: x + CELL / 2, cy: y + CELL / 2, r: CELL * 0.4 },
      pic
    );
  }
  sheet.append(
    el('h2', '', copy.mapTitle),
    pic,
    el('p', 'note', mine === null ? copy.mapCaptionNoMine : copy.mapCaption),
    button(copy.back, 'primary', () => showResult(record, null))
  );
  openSheet(sheet);
}

/** Opens Reddit's own form with fixed choices; the report goes to the subreddit's modmail. */
async function reportProblem(): Promise<void> {
  const init = state.init;
  if (!init || state.busy) return;
  state.busy = true;
  try {
    const answer = await showForm({
      title: copy.reportTitle,
      acceptLabel: copy.reportSend,
      fields: [
        {
          type: 'select',
          name: 'category',
          label: copy.reportQuestion,
          required: true,
          options: REPORT_CATEGORIES.map((c) => ({ label: c.label, value: c.value })),
        },
      ],
    });
    if (answer.action !== 'SUBMITTED') return;
    const category = answer.values.category?.[0];
    if (!isReportCategory(category)) return;
    await sendReport({ category, date: init.town.date });
    closeSheets();
    toast(copy.reportSent);
  } catch (error) {
    toast(error instanceof Error ? error.message : copy.loadFailed);
  } finally {
    state.busy = false;
  }
}

function showLessonDone(index: number): void {
  const lesson = LESSONS[index];
  if (!lesson) return;
  const [head, body] = copy.lessonDone(lesson.id, noonRule());
  const sheet = byId('result-sheet', HTMLDivElement);
  sheet.replaceChildren();
  const h2 = document.createElement('h2');
  h2.textContent = head;
  const p = document.createElement('p');
  p.textContent = body;
  const last = index >= LESSONS.length - 1;
  sheet.append(
    h2,
    p,
    button(last ? copy.toTodaysTown : copy.next, 'primary', () => {
      closeSheets();
      if (last) finishLessons();
      else startLesson(index + 1);
    })
  );
  openSheet(sheet);
}

// ---------- sheets ----------
/**
 * The result card turns the screen into a postcard: the play controls step aside and the sleeping town
 * shrinks into the space above the card (or beside it, in landscape), so the reward stays in view.
 */
function setPostcard(on: boolean): void {
  const sheet = byId('result-sheet', HTMLDivElement);
  const was = app.dataset.sheet === 'result';
  if (on) {
    app.dataset.sheet = 'result';
    document.documentElement.style.setProperty(
      '--sheet-h',
      `${Math.ceil(sheet.getBoundingClientRect().height)}px`
    );
  } else {
    delete app.dataset.sheet;
  }
  if (was !== on) {
    app.classList.add('reflow');
    window.setTimeout(() => app.classList.remove('reflow'), 400);
  }
  if (state.town) fitBoard();
}

function openSheet(sheet: HTMLElement): void {
  const isResult = sheet.id === 'result-sheet';
  if (!isResult) byId('scrim', HTMLDivElement).classList.add('open');
  sheet.classList.add('open');
  if (isResult) {
    setPostcard(state.mode.kind === 'town');
    // Screen readers land on the card itself; no focus ring jumps onto a button by surprise.
    sheet.tabIndex = -1;
    sheet.focus({ preventScroll: true });
    return;
  }
  const first =
    sheet.querySelector('button.primary') ?? sheet.querySelector('button');
  if (first instanceof HTMLButtonElement) first.focus({ preventScroll: true });
}
function closeSheets(): void {
  document
    .querySelectorAll('.sheet.open')
    .forEach((s) => s.classList.remove('open'));
  byId('scrim', HTMLDivElement).classList.remove('open');
  if (app.dataset.sheet) setPostcard(false);
  state.lastActionAt = Date.now();
}
byId('help-btn', HTMLButtonElement).addEventListener('click', () => {
  noteAction();
  byId('help-replay', HTMLButtonElement).hidden = inLesson();
  openSheet(byId('help-sheet', HTMLDivElement));
});
byId('help-close', HTMLButtonElement).addEventListener('click', closeSheets);
byId('help-replay', HTMLButtonElement).addEventListener('click', () => {
  closeSheets();
  startLessons();
});
byId('help-report', HTMLButtonElement).addEventListener(
  'click',
  () => void reportProblem()
);
byId('scrim', HTMLDivElement).addEventListener('click', closeSheets);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheets();
});

function buildHelp(): void {
  byId('help-title', HTMLHeadingElement).textContent = copy.helpTitle;
  const diagrams = byId('help-diagrams', HTMLDivElement);
  diagrams.replaceChildren();
  for (const t of TIMES) {
    const figure = document.createElement('figure');
    const pic = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pic.setAttribute('role', 'img');
    pic.setAttribute('aria-label', copy.helpDiagram[t]);
    drawShadowDiagram(pic, t, castShadow(3, 4, 2, t, noonRule()));
    const caption = document.createElement('figcaption');
    caption.innerHTML = `<strong>${copy.timeLabel[t]}</strong><span>${copy.helpDiagram[t]}</span>`;
    figure.append(pic, caption);
    diagrams.append(figure);
  }
  document
    .querySelector('.rule-icon.cat-icon')
    ?.insertAdjacentHTML('afterbegin', catIconSvg);
  document
    .querySelector('.rule-icon.flower-icon')
    ?.insertAdjacentHTML('afterbegin', flowerIconSvg);
  document
    .querySelector('.rule-icon.house-icon')
    ?.insertAdjacentHTML('afterbegin', houseSvg(2));
  byId('help-cats', HTMLSpanElement).textContent = copy.helpCats;
  byId('help-flowers', HTMLSpanElement).textContent = copy.helpFlowers;
  byId('help-houses', HTMLSpanElement).textContent =
    copy.helpHouses(noonRule());
  byId('help-close', HTMLButtonElement).textContent = copy.helpBack;
  byId('help-replay', HTMLButtonElement).textContent = copy.helpReplay;
  byId('help-report', HTMLButtonElement).textContent = copy.reportProblem;
}

function renderMute(): void {
  byId('mute-waves', SVGPathElement).style.display = isMuted() ? 'none' : '';
  byId('mute-cross', SVGPathElement).style.display = isMuted() ? '' : 'none';
  byId('mute-btn', HTMLButtonElement).setAttribute(
    'aria-pressed',
    String(isMuted())
  );
}
byId('mute-btn', HTMLButtonElement).addEventListener('click', () => {
  setMuted(!isMuted());
  saveSettings({ muted: isMuted() });
  renderMute();
});

window.addEventListener('resize', () => {
  hideGhost();
  if (!state.town) return;
  fitBoard();
  if (handAnimation && state.lesson?.id === 'lesson-1') {
    requestAnimationFrame(() => showHand(0, state.lesson?.solution[0] ?? 0));
  }
});
landscapeQuery.addEventListener('change', () => {
  if (state.town) fitBoard();
});

// ---------- putting a town (or a lesson) on the board ----------
function showBoard(
  town: PublicTown,
  placements: Placements,
  lockTime: TimeOfDay | null
): void {
  state.town = town;
  state.tiles = tileMap(town.puzzle);
  state.placements = [...placements];
  state.time = lockTime ?? 'am';
  state.selected = null;
  state.solving = false;
  state.solved = false;
  state.idle = 'none';
  state.lastActionAt = Date.now();
  stopHand();
  closeSheets();
  buildBoard();
  renderAll();
}

function setHeader(title: string, subtitle: string, lesson: boolean): void {
  byId('title', HTMLHeadingElement).textContent = title;
  byId('subtitle', HTMLParagraphElement).textContent = subtitle;
  byId('skip-btn', HTMLButtonElement).hidden = !lesson;
  app.dataset.mode = lesson ? 'lesson' : 'town';
}

function startLessons(): void {
  if (state.mode.kind === 'town' && !state.solved && state.town) {
    pauseClock();
    state.parkedTown = {
      placements: [...state.placements],
      playedMs: state.playedMs,
      firstTile: state.firstTile,
    };
    void saveProgressNow();
  }
  startLesson(0);
}

function startLesson(index: number): void {
  const lesson = LESSONS[index];
  const init = state.init;
  if (!lesson || !init) return;
  state.mode = { kind: 'lesson', index };
  state.lesson = lesson;
  state.sawNoon = false;
  pauseClock();
  const standIn: PublicTown = {
    date: init.town.date,
    number: 0,
    title: copy.lessonTitle(index + 1),
    level: 0,
    band: 'Lesson',
    puzzle: lesson.puzzle,
    noonRule: init.town.noonRule,
  };
  setHeader(copy.lessonTitle(index + 1), copy.lessonSubtitle, true);
  showBoard(
    standIn,
    lesson.puzzle.heights.map(() => IN_TRAY),
    lesson.lockTime
  );
  if (lesson.id === 'lesson-1') {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => showHand(0, lesson.solution[0] ?? 0))
    );
  }
}

function finishLessons(): void {
  journey.interaction('tutorial_done');
  saveSettings({ tutorialDone: true });
  enterTown();
}

function enterTown(): void {
  const init = state.init;
  if (!init) return;
  state.mode = { kind: 'town' };
  state.lesson = null;
  const town = init.town;
  let placements = town.puzzle.heights.map(() => IN_TRAY);
  let playedMs = 0;
  let firstTile: number | null = null;
  if (init.result) {
    placements = [...init.result.placements];
    firstTile = init.result.firstTile;
  } else if (state.parkedTown) {
    placements = state.parkedTown.placements;
    playedMs = state.parkedTown.playedMs;
    firstTile = state.parkedTown.firstTile;
  } else if (init.progress) {
    placements = [...init.progress.placements];
    playedMs = init.progress.timeMs;
    firstTile = init.progress.firstTile;
  } else if (!init.user.loggedIn) {
    const saved = local.get(`progress:${town.date}`);
    if (saved) {
      try {
        const parsed: {
          placements: Placements;
          timeMs: number;
          firstTile?: number | null;
        } = JSON.parse(saved);
        if (parsed.placements.length === placements.length) {
          placements = parsed.placements;
          playedMs = parsed.timeMs;
          firstTile = parsed.firstTile ?? null;
        }
      } catch {
        // ignore a corrupt local save
      }
    }
  }
  state.parkedTown = null;
  state.firstTile = firstTile;
  state.playedMs = playedMs;
  state.visibleFrom = null;
  setHeader(
    town.title,
    init.isToday
      ? copy.townNumber(town.number, longDate(town.date))
      : copy.oldTown(town.number),
    false
  );
  showBoard(town, placements, null);
  if (init.result) {
    state.solved = true;
    renderTray();
    evaluateAndRender();
    showResult(init.result, null);
  } else {
    resumeClock();
  }
}

byId('skip-btn', HTMLButtonElement).addEventListener('click', () => {
  stopHand();
  finishLessons();
});

// ---------- start ----------
function showLoadError(): void {
  app.dataset.state = 'error';
  const status = byId('load-status', HTMLDivElement);
  status.replaceChildren();
  const p = document.createElement('p');
  p.textContent = copy.loadFailed;
  status.append(
    p,
    button(copy.tryAgain, 'secondary', () => void start())
  );
}

async function start(): Promise<void> {
  app.dataset.state = 'loading';
  const status = byId('load-status', HTMLDivElement);
  status.textContent = copy.loading;
  let init: InitResponse;
  try {
    init = await fetchInit();
  } catch {
    showLoadError();
    return;
  }
  app.dataset.state = 'ready';
  state.init = init;
  state.initAt = Date.now();
  state.settings = init.user.loggedIn
    ? init.settings
    : {
        tutorialDone: local.get('tutorialDone') === '1',
        muted: local.get('muted') === '1',
      };
  setMuted(state.settings.muted);
  renderMute();
  state.town = init.town;
  buildHelp();
  const firstTime =
    !state.settings.tutorialDone && !init.result && !init.progress;
  if (firstTime) startLesson(0);
  else enterTown();
  journey.appReady();
}

void start();
