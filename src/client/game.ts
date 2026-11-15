import './theme.css';
import './game.css';
import {
  IN_TRAY,
  TIMES,
  castShadow,
  evaluate,
  tileMap,
} from '../shared/engine/index.ts';
import type {
  Evaluation,
  Placements,
  Puzzle,
  Tile,
  TimeOfDay,
} from '../shared/engine/index.ts';
import type { InitResponse, PublicTown, SolveRecord } from '../shared/api.ts';
import { longDate } from '../shared/dates.ts';
import {
  CELL,
  catIconSvg,
  cellOrigin,
  drawCat,
  drawFlower,
  drawGround,
  drawHouse,
  drawWell,
  flowerIconSvg,
  houseSvg,
  sunIconSvg,
  svgEl,
} from './art.ts';
import { copy } from './copy.ts';
import { RejectedError, fetchInit, sendProgress, submitSolve } from './net.ts';
import { isMuted, setMuted, sound, unlockAudio } from './sound.ts';

const MARGIN = 40;
const reducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

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

type State = {
  init: InitResponse | null;
  town: PublicTown | null;
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
};

const state: State = {
  init: null,
  town: null,
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
};

function byId<T extends Element>(
  id: string,
  kind: { new (): T; prototype: T }
): T {
  const node = document.getElementById(id);
  if (!(node instanceof kind)) throw new Error(`Missing #${id}`);
  return node;
}

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

function layer(name: keyof typeof layers): SVGGElement {
  const g = layers[name];
  if (!g) throw new Error(`Board layer ${name} missing`);
  return g;
}

// ---------- local storage (logged-out play and settings) ----------
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
  if (!state.solving && !state.solved && state.visibleFrom === null)
    state.visibleFrom = performance.now();
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
  const sunBody = svgEl('g', {}, layers.sun);
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
      sunBody
    );
  }
  svgEl(
    'circle',
    { r: 14, fill: 'var(--sun-deep)', stroke: 'var(--ink)', 'stroke-width': 4 },
    sunBody
  );

  catEls = new Map();
  flowerEls = new Map();
  for (const cell of p.wells) drawWell(wells, p.size, cell);
  for (const cell of p.flowers)
    flowerEls.set(cell, drawFlower(layer('items'), p.size, cell));
  for (const cat of p.cats)
    catEls.set(cat.cell, drawCat(layer('items'), p.size, cat.cell, cat.nap));
}

function renderShadows({ sweep = false, skip = -1 } = {}): void {
  const p = puzzle();
  const target = layer('shadow');
  target.replaceChildren();
  const delays = new Map<number, number>();
  state.placements.forEach((cell, i) => {
    const height = p.heights[i];
    if (cell === IN_TRAY || i === skip || height === undefined) return;
    castShadow(
      p.size,
      cell,
      height,
      state.time,
      state.town?.noonRule ?? 'one'
    ).forEach((s, k) => {
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
  });
}

function renderPreview(cell: number | null, i: number): void {
  const target = layer('preview');
  target.replaceChildren();
  const p = puzzle();
  const height = p.heights[i];
  if (cell === null || height === undefined) return;
  for (const s of castShadow(
    p.size,
    cell,
    height,
    state.time,
    state.town?.noonRule ?? 'one'
  )) {
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

function renderSun(): void {
  const span = puzzle().size * CELL;
  const edge = MARGIN / 2 + 2;
  const pos = {
    am: [span + edge, span / 2],
    noon: [span / 2, span + edge],
    pm: [-edge, span / 2],
  }[state.time];
  layer('sun').setAttribute(
    'transform',
    `translate(${pos[0] ?? 0} ${pos[1] ?? 0}) scale(0.62)`
  );
}

/** Cats that don't nap at the selected time fade back, so switching the time shows whose turn it is. */
function renderDuty(): void {
  for (const cat of puzzle().cats)
    catEls.get(cat.cell)?.classList.toggle('off-duty', cat.nap !== state.time);
}

function renderToggle(): void {
  const box = byId('toggle', HTMLDivElement);
  box.replaceChildren();
  for (const t of TIMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${sunIconSvg(t)}<span>${copy.timeLabel[t]}</span>`;
    b.setAttribute('aria-pressed', String(state.time === t));
    b.disabled = state.solving;
    b.addEventListener('click', () => setTime(t));
    box.appendChild(b);
  }
}

function renderTray(): void {
  const tray = byId('tray', HTMLDivElement);
  tray.replaceChildren();
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
  byId('reset-btn', HTMLButtonElement).hidden = state.solved;
}

function renderStatus(result: Evaluation): void {
  const suns = byId('suns', HTMLDivElement);
  suns.replaceChildren();
  for (const t of TIMES) {
    const ok = result.allPlaced && result.timeOk[t];
    const span = document.createElement('span');
    span.className = 'sun-check';
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

function renderCreatures(result: Evaluation): void {
  for (const c of result.cats)
    catEls.get(c.cell)?.classList.toggle('asleep', c.asleep);
  for (const f of result.flowers)
    flowerEls.get(f.cell)?.classList.toggle('wilted', !f.lit);
}

function evaluateAndRender(): Evaluation {
  const result = evaluate(
    puzzle(),
    state.placements,
    state.town?.noonRule ?? 'one'
  );
  renderCreatures(result);
  renderStatus(result);
  return result;
}

function fitBoard(): void {
  const app = byId('app', HTMLDivElement);
  const cs = getComputedStyle(app);
  const innerH =
    app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const innerW =
    app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const kids = [...app.children].filter(
    (c) => !(c instanceof HTMLElement && c.hidden)
  );
  const others = kids
    .filter(
      (c) =>
        !c.classList.contains('board-wrap') && !c.classList.contains('spacer')
    )
    .reduce((sum, c) => sum + c.getBoundingClientRect().height, 0);
  const gaps = (parseFloat(cs.rowGap) || 8) * (kids.length - 1);
  const size = Math.max(180, Math.min(innerW, innerH - others - gaps));
  document.documentElement.style.setProperty(
    '--board',
    `${Math.floor(size)}px`
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

// ---------- moves ----------
function setTime(t: TimeOfDay): void {
  if (state.solving || state.time === t) return;
  state.time = t;
  renderToggle();
  renderShadows({ sweep: true });
  renderSun();
  renderDuty();
}

let progressTimer: number | undefined;
function queueProgressSave(): void {
  window.clearTimeout(progressTimer);
  progressTimer = window.setTimeout(() => void saveProgressNow(), 1200);
}

async function saveProgressNow(): Promise<void> {
  const town = state.town;
  if (!town || state.solved || state.solving) return;
  const record = { placements: state.placements, timeMs: Math.round(playMs()) };
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
  if (cell !== IN_TRAY) sound.drop();
  else if (from !== IN_TRAY) sound.lift();
  state.selected = null;
  renderTray();
  renderHouses();
  renderShadows();
  const result = evaluateAndRender();
  if (result.solved) void runSiesta(result);
  else queueProgressSave();
}

function isFreeFor(cell: number | null, i: number): cell is number {
  if (cell === null || state.tiles[cell] !== 'ground') return false;
  const other = state.placements.indexOf(cell);
  return other < 0 || other === i;
}

function toast(message: string): void {
  const t = byId('toast', HTMLDivElement);
  t.textContent = message;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 1700);
}
let toastTimer: number | undefined;

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
    state.solving ||
    state.solved ||
    document.querySelector('.sheet.open')
  )
    return;
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
  if (source) e.preventDefault();
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
      if (d.source.from === 'tray') {
        document.querySelector(`.slot[data-i="${i}"]`)?.classList.add('lifted');
      }
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

async function runSiesta(result: Evaluation): Promise<void> {
  const town = state.town;
  if (!town) return;
  state.solving = true;
  pauseClock();
  const timeMs = Math.round(playMs());
  window.clearTimeout(progressTimer);
  const submission = submitSolve({
    date: town.date,
    placements: [...state.placements],
    timeMs,
    hints: 0,
    moves: state.moves,
  });

  state.selected = null;
  renderTray();
  for (const el of catEls.values()) el.classList.remove('asleep');
  await wait(150);
  for (const t of TIMES) {
    state.time = t;
    renderToggle();
    renderSun();
    renderDuty();
    renderShadows({ sweep: true });
    await wait(300);
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

  let record: SolveRecord = {
    placements: [...state.placements],
    timeMs,
    hints: 0,
    adjustedMs: timeMs,
    moves: state.moves,
    solvedAt: Date.now(),
  };
  let note: string | null = state.init?.user.loggedIn
    ? null
    : copy.notSavedLoggedOut;
  try {
    const response = await submission;
    record = response.result;
  } catch (error) {
    if (error instanceof RejectedError) {
      // The server disagreed (it replays every solve). Let the player keep going.
      state.solving = false;
      resumeClock();
      renderToggle();
      toast(error.message);
      return;
    }
    note = copy.notSavedYet;
  }
  state.solving = false;
  state.solved = true;
  local.set(`progress:${town.date}`, '');
  renderToggle();
  renderTray();
  showResult(record, note);
}

function formatTime(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function nextTownText(): string {
  const init = state.init;
  const left = Math.max(
    0,
    (init?.msUntilNext ?? 0) - (Date.now() - state.initAt)
  );
  const minutes = Math.ceil(left / 60_000);
  return copy.nextTown(Math.floor(minutes / 60), minutes % 60);
}

function showResult(record: SolveRecord, note: string | null): void {
  const town = state.town;
  if (!town) return;
  const sheet = byId('result-sheet', HTMLDivElement);
  sheet.replaceChildren();
  const h2 = document.createElement('h2');
  h2.textContent = copy.asleep(town.title);
  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.innerHTML = `<div><strong>${formatTime(record.timeMs)}</strong>${copy.statTime}</div>${
    record.hints === 0 ? `<div class="badge">${copy.cleanNap}</div>` : ''
  }`;
  const next = document.createElement('p');
  next.className = 'next';
  next.textContent = nextTownText();
  sheet.append(h2, stats, next);
  if (note) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = note;
    sheet.append(p);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'primary';
  close.textContent = copy.lookAtTown;
  close.addEventListener('click', closeSheets);
  sheet.append(close);
  openSheet(sheet);
}

// ---------- sheets ----------
function openSheet(sheet: HTMLElement): void {
  if (sheet.id !== 'result-sheet')
    byId('scrim', HTMLDivElement).classList.add('open');
  sheet.classList.add('open');
}
function closeSheets(): void {
  document
    .querySelectorAll('.sheet.open')
    .forEach((s) => s.classList.remove('open'));
  byId('scrim', HTMLDivElement).classList.remove('open');
}
byId('help-btn', HTMLButtonElement).addEventListener('click', () =>
  openSheet(byId('help-sheet', HTMLDivElement))
);
byId('help-close', HTMLButtonElement).addEventListener('click', closeSheets);
byId('scrim', HTMLDivElement).addEventListener('click', closeSheets);

function renderMute(): void {
  byId('mute-waves', SVGPathElement).style.display = isMuted() ? 'none' : '';
  byId('mute-cross', SVGPathElement).style.display = isMuted() ? '' : 'none';
}
byId('mute-btn', HTMLButtonElement).addEventListener('click', () => {
  setMuted(!isMuted());
  local.set('muted', isMuted() ? '1' : '0');
  renderMute();
});

window.addEventListener('resize', () => {
  hideGhost();
  if (state.town) fitBoard();
});

// ---------- start ----------
function showLoadError(): void {
  const status = byId('load-status', HTMLDivElement);
  status.hidden = false;
  status.replaceChildren();
  const p = document.createElement('p');
  p.textContent = copy.loadFailed;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'secondary';
  retry.textContent = copy.tryAgain;
  retry.addEventListener('click', () => void start());
  status.append(p, retry);
}

async function start(): Promise<void> {
  const status = byId('load-status', HTMLDivElement);
  status.hidden = false;
  status.textContent = copy.loading;
  let init: InitResponse;
  try {
    init = await fetchInit();
  } catch {
    showLoadError();
    return;
  }
  status.hidden = true;
  state.init = init;
  state.initAt = Date.now();
  state.town = init.town;
  state.tiles = tileMap(init.town.puzzle);
  state.placements = init.town.puzzle.heights.map(() => IN_TRAY);
  state.time = 'am';

  let resumedMs = 0;
  if (init.result) {
    state.placements = [...init.result.placements];
    state.solved = true;
  } else if (init.progress) {
    state.placements = [...init.progress.placements];
    resumedMs = init.progress.timeMs;
  } else if (!init.user.loggedIn) {
    const saved = local.get(`progress:${init.town.date}`);
    if (saved) {
      try {
        const parsed: { placements: Placements; timeMs: number } =
          JSON.parse(saved);
        if (parsed.placements.length === state.placements.length) {
          state.placements = parsed.placements;
          resumedMs = parsed.timeMs;
        }
      } catch {
        // ignore a corrupt local save
      }
    }
  }
  state.playedMs = resumedMs;

  byId('title', HTMLHeadingElement).textContent = init.town.title;
  byId('subtitle', HTMLParagraphElement).textContent = init.isToday
    ? copy.townNumber(init.town.number, longDate(init.town.date))
    : copy.oldTown(init.town.number);
  byId('help-shadows', HTMLParagraphElement).textContent = copy.helpShadows(
    init.town.noonRule
  );
  setMuted(local.get('muted') === '1');
  renderMute();
  buildBoard();
  renderAll();
  if (init.result) showResult(init.result, null);
  else resumeClock();
}

void start();
