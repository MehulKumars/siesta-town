import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, solve, townProblems } from './engine/index.ts';
import { PRACTICE, PRACTICE_NOON_RULE } from './practice.ts';

test('there are fifteen practice towns, five in each tier, gentlest first', () => {
  assert.equal(PRACTICE.length, 15);
  assert.deepEqual(
    PRACTICE.map((town) => town.tier),
    [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3]
  );
  assert.equal(new Set(PRACTICE.map((town) => town.id)).size, 15);
  assert.equal(new Set(PRACTICE.map((town) => town.title)).size, 15);
});

test('every practice town is well formed and can be solved', () => {
  for (const town of PRACTICE) {
    assert.deepEqual(townProblems(town.puzzle), [], `${town.id} is malformed`);
    const found = solve(town.puzzle, PRACTICE_NOON_RULE, 3);
    assert.ok(found.count >= 1, `${town.id} has no solution`);
    const answer = found.solutions[0];
    assert.ok(answer);
    assert.equal(evaluate(town.puzzle, answer, PRACTICE_NOON_RULE).solved, true);
    // Steady and tricky towns have exactly one answer; gentle ones may have a few.
    if (town.tier > 1) assert.equal(found.count, 1, `${town.id} has more than one answer`);
  }
});

test('practice towns grow with their tier', () => {
  const size = (tier: number) =>
    Math.max(...PRACTICE.filter((town) => town.tier === tier).map((town) => town.puzzle.size));
  assert.ok(size(1) <= size(2));
  assert.ok(size(2) <= size(3));
});
