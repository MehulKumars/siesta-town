// Builds prototype/siesta.html: generates solver-verified puzzles for both noon rules
// and inlines them, plus the engine, into app.html. Run: node prototype/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAT, FLOWER, GROUND, TIMES, WELL, castShadow, seededRandom, solve } from './engine.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const ADJECTIVES = ['Sleepy', 'Little', 'Upper', 'Lower', 'Old', 'Quiet', 'Lazy', 'Hilltop', 'Seaside', 'Dusty'];
const PLACES = ['Harbour', 'Market', 'Steps', 'Lanes', 'Square', 'Orchard', 'Terrace', 'Cove', 'Quarter', 'Gardens'];

// Targets from docs/04-GAME-SPEC.md A4.
const BANDS = [
  { day: 'Monday', size: 5, heights: [2, 1], cats: 2, flowers: [2, 4], wells: 0, limit: 3 },
  { day: 'Tuesday', size: 5, heights: [3, 2, 1], cats: 3, flowers: [2, 5], wells: 1, limit: 2 },
  { day: 'Wednesday', size: 6, heights: [3, 2, 1], cats: 3, flowers: [3, 6], wells: 1, limit: 1 },
  { day: 'Thursday', size: 6, heights: [3, 2, 1], cats: 4, flowers: [4, 7], wells: 1, limit: 1 },
  { day: 'Friday', size: 6, heights: [4, 3, 2, 1], cats: 4, flowers: [4, 7], wells: 2, limit: 1 },
  { day: 'Saturday', size: 7, heights: [4, 3, 2, 1], cats: 5, flowers: [4, 8], wells: 2, limit: 1 },
];
const SCHEDULE = ['Monday', 'Monday', 'Tuesday', 'Tuesday', 'Wednesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function lesson(id, title, size, items, heights, extra) {
  const cells = new Array(size * size).fill(GROUND);
  const naps = {};
  for (const [r, c, kind, nap] of items) {
    cells[r * size + c] = kind;
    if (nap) naps[r * size + c] = nap;
  }
  return { id, kind: 'lesson', title, size, cells, naps, heights, ...extra };
}

const LESSONS = [
  lesson('lesson-1', 'Lesson 1 of 3', 4, [[1, 0, CAT, 'am']], [1], {
    lockTime: 'am',
    note: 'The sun rises on the right. Drag the house so the cat naps in its shadow.',
  }),
  lesson('lesson-2', 'Lesson 2 of 3', 4, [[0, 1, CAT, 'noon']], [1], {
    note: 'This cat naps at noon. Tap Noon to see where shadows fall.',
  }),
  lesson('lesson-3', 'Lesson 3 of 3', 4, [[1, 3, CAT, 'pm'], [0, 1, FLOWER]], [2], {
    note: 'Flowers need sun all day. Keep this one out of every shadow.',
  }),
];

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function shuffle(rand, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function neighbours(size, cell) {
  const r = Math.floor(cell / size);
  const c = cell % size;
  return [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ]
    .filter(([y, x]) => y >= 0 && x >= 0 && y < size && x < size)
    .map(([y, x]) => y * size + x);
}

function generateTown(band, seed, noonRule) {
  const rand = seededRandom(seed);
  const { size, heights } = band;
  const n = size * size;
  for (let attempt = 0; attempt < 600; attempt++) {
    const cells = new Array(n).fill(GROUND);
    const naps = {};
    const order = shuffle(rand, [...Array(n).keys()]);
    let k = 0;
    for (let w = 0; w < band.wells; w++) cells[order[k++]] = WELL;
    const solution = heights.map(() => order[k++]);
    const shadeAt = { am: new Set(), noon: new Set(), pm: new Set() };
    solution.forEach((cell, i) => {
      for (const t of TIMES) castShadow(size, cell, heights[i], t, noonRule).forEach((s) => shadeAt[t].add(s));
    });
    const occupied = new Set(solution);
    const isFree = (cell) => cells[cell] === GROUND && !occupied.has(cell);

    // Cats: on shaded tiles, preferring tiles shaded at exactly one time (more interesting).
    const catCandidates = [...Array(n).keys()]
      .filter(isFree)
      .map((cell) => ({ cell, times: TIMES.filter((t) => shadeAt[t].has(cell)) }))
      .filter((x) => x.times.length > 0);
    const single = shuffle(rand, catCandidates.filter((x) => x.times.length === 1));
    const multi = shuffle(rand, catCandidates.filter((x) => x.times.length > 1));
    const chosenCats = [...single, ...multi].slice(0, band.cats);
    if (chosenCats.length < band.cats) continue;
    for (const { cell, times } of chosenCats) {
      cells[cell] = CAT;
      naps[cell] = pick(rand, times);
    }

    // Flowers: always-lit tiles, preferring tiles next to a shadow (decoys).
    const litAll = [...Array(n).keys()].filter((cell) => isFree(cell) && TIMES.every((t) => !shadeAt[t].has(cell)));
    if (litAll.length < band.flowers[0]) continue;
    const nearShade = (cell) => neighbours(size, cell).some((x) => TIMES.some((t) => shadeAt[t].has(x)));
    const flowerPool = [...shuffle(rand, litAll.filter(nearShade)), ...shuffle(rand, litAll.filter((c) => !nearShade(c)))];
    let flowers = 0;
    for (const cell of flowerPool.slice(0, band.flowers[0])) {
      cells[cell] = FLOWER;
      flowers++;
    }

    // Remove alternative solutions by adding flowers that only the alternatives would shade or build on.
    const puzzle = { size, cells, naps, heights };
    for (;;) {
      const result = solve(puzzle, noonRule, band.limit, 12);
      if (result.count >= 1 && result.count <= band.limit) {
        return { ...puzzle, solution, solutions: result.count, nodes: result.nodes, attempts: attempt + 1 };
      }
      if (result.count === 0 || flowers >= band.flowers[1]) break;
      const killers = new Set();
      for (const alt of result.solutions) {
        if (alt.every((cell, i) => cell === solution[i])) continue;
        alt.forEach((cell, i) => {
          killers.add(cell);
          for (const t of TIMES) castShadow(size, cell, heights[i], t, noonRule).forEach((s) => killers.add(s));
        });
      }
      const options = litAll.filter((cell) => cells[cell] === GROUND && killers.has(cell));
      if (options.length === 0) break;
      cells[pick(rand, options)] = FLOWER;
      flowers++;
    }
  }
  throw new Error(`Could not generate ${band.day} (${seed}, ${noonRule})`);
}

function buildSet(noonRule) {
  const lessons = LESSONS.map((l) => {
    const check = solve(l, noonRule, 3, 3);
    if (check.count !== 1) throw new Error(`${l.id} has ${check.count} solutions under ${noonRule}`);
    return { ...l, solution: check.solutions[0], solutions: 1 };
  });
  // Names: two shuffled lists zipped together, so no town repeats a word.
  const nameRand = seededRandom('siesta-town-names');
  const adjectives = shuffle(nameRand, ADJECTIVES);
  const places = shuffle(nameRand, PLACES);
  const towns = SCHEDULE.map((day, i) => {
    const band = BANDS.find((b) => b.day === day);
    const town = generateTown(band, `siesta-proto-${i}`, noonRule);
    return { id: `town-${i + 1}`, kind: 'town', title: `${adjectives[i]} ${places[i]}`, day, ...town };
  });
  return [...lessons, ...towns];
}

const started = Date.now();
const puzzles = { one: buildSet('one'), half: buildSet('half') };
for (const rule of ['one', 'half']) {
  console.log(`noon rule "${rule}":`);
  for (const p of puzzles[rule]) {
    if (p.kind === 'town') {
      console.log(`  ${p.id} ${p.day.padEnd(9)} ${p.size}x${p.size} solutions=${p.solutions} nodes=${p.nodes} attempts=${p.attempts} "${p.title}"`);
    }
  }
}

const engineSource = fs
  .readFileSync(path.join(here, 'engine.js'), 'utf8')
  .replace(/^export /gm, '');
const template = fs.readFileSync(path.join(here, 'app.html'), 'utf8');
const html = template
  .replace('/*__ENGINE__*/', () => engineSource)
  .replace('/*__PUZZLES__*/', () => `const PUZZLES = ${JSON.stringify(puzzles)};`);
fs.writeFileSync(path.join(here, 'siesta.html'), html);
console.log(`wrote prototype/siesta.html (${(html.length / 1024).toFixed(1)} KB) in ${Date.now() - started} ms`);
