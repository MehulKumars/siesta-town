// Siesta prototype engine. Plain JS, no imports, no DOM.
// Used by generate.mjs (Node) and inlined into siesta.html by build.mjs.
// Throwaway: the real engine is rewritten in TypeScript in src/shared/engine (Phase 1).

export const TIMES = ['am', 'noon', 'pm'];
export const GROUND = 0;
export const CAT = 1;
export const FLOWER = 2;
export const WELL = 3;

// Cells a building of height h at (r, c) shades at one time of day.
// Morning sun in the east: h tiles west. Evening sun in the west: h tiles east.
// Noon sun high in the south: 1 tile north ('one') or ceil(h/2) tiles north ('half').
export function castShadow(size, cell, h, time, noonRule) {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out = [];
  if (time === 'am') {
    for (let k = 1; k <= h && c - k >= 0; k++) out.push(r * size + c - k);
  } else if (time === 'pm') {
    for (let k = 1; k <= h && c + k < size; k++) out.push(r * size + c + k);
  } else {
    const reach = noonRule === 'half' ? Math.ceil(h / 2) : 1;
    for (let k = 1; k <= reach && r - k >= 0; k++) out.push((r - k) * size + c);
  }
  return out;
}

// placements[i] = cell index of building i (heights[i]) or -1 if it's still in the tray.
export function shadeByTime(puzzle, placements, noonRule) {
  const shade = { am: new Set(), noon: new Set(), pm: new Set() };
  placements.forEach((cell, i) => {
    if (cell < 0) return;
    for (const t of TIMES) {
      for (const s of castShadow(puzzle.size, cell, puzzle.heights[i], t, noonRule)) shade[t].add(s);
    }
  });
  return shade;
}

export function evaluate(puzzle, placements, noonRule) {
  const shade = shadeByTime(puzzle, placements, noonRule);
  const cats = [];
  const flowers = [];
  const timeOk = { am: true, noon: true, pm: true };
  puzzle.cells.forEach((kind, cell) => {
    if (kind === CAT) {
      const nap = puzzle.naps[cell];
      const asleep = shade[nap].has(cell);
      cats.push({ cell, nap, asleep });
      if (!asleep) timeOk[nap] = false;
    } else if (kind === FLOWER) {
      const shadedAt = TIMES.filter((t) => shade[t].has(cell));
      flowers.push({ cell, lit: shadedAt.length === 0, shadedAt });
      for (const t of shadedAt) timeOk[t] = false;
    }
  });
  const allPlaced = placements.every((p) => p >= 0);
  const asleepCount = cats.filter((c) => c.asleep).length;
  const litCount = flowers.filter((f) => f.lit).length;
  const solved = allPlaced && asleepCount === cats.length && litCount === flowers.length;
  return { shade, cats, flowers, timeOk, allPlaced, asleepCount, litCount, solved };
}

export function canBuildOn(puzzle, cell) {
  return puzzle.cells[cell] === GROUND;
}

// Backtracking solver. Buildings in the order given (tallest first works best).
// Returns up to `keep` solutions and stops counting at limit + 1.
export function solve(puzzle, noonRule, limit = 1, keep = 8) {
  const { size, cells, heights, naps } = puzzle;
  const n = size * size;
  const ground = [];
  for (let i = 0; i < n; i++) if (cells[i] === GROUND) ground.push(i);
  // Precompute shade lists and whether a placement shades a flower.
  const shadeOf = heights.map((h) => {
    const byCell = new Map();
    for (const cell of ground) {
      const all = TIMES.map((t) => castShadow(size, cell, h, t, noonRule));
      const killsFlower = all.some((list) => list.some((s) => cells[s] === FLOWER));
      byCell.set(cell, { all, killsFlower });
    }
    return byCell;
  });
  const catCells = [];
  for (let i = 0; i < n; i++) if (cells[i] === CAT) catCells.push(i);

  const solutions = [];
  let count = 0;
  let nodes = 0;
  const used = new Set();
  const current = [];

  function catsOk() {
    const shade = { am: new Set(), noon: new Set(), pm: new Set() };
    current.forEach((cell, i) => {
      const { all } = shadeOf[i].get(cell);
      TIMES.forEach((t, ti) => all[ti].forEach((s) => shade[t].add(s)));
    });
    return catCells.every((c) => shade[naps[c]].has(c));
  }

  function place(i) {
    if (count > limit) return;
    if (i === heights.length) {
      if (catsOk()) {
        count++;
        if (solutions.length < keep) solutions.push([...current]);
      }
      return;
    }
    for (const cell of ground) {
      if (used.has(cell)) continue;
      nodes++;
      if (shadeOf[i].get(cell).killsFlower) continue;
      used.add(cell);
      current.push(cell);
      place(i + 1);
      current.pop();
      used.delete(cell);
      if (count > limit) return;
    }
  }
  place(0);
  return { count, solutions, nodes };
}

// Seeded PRNG (mulberry32) from a string.
export function seededRandom(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
