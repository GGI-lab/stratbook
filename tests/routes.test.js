import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  positionAt,
  segmentRoute,
  transitionPlan,
  lerpAngle,
  segmentDuration,
  easeInOut,
} from '../src/map/routes.js';

const data = JSON.parse(readFileSync(new URL('./fixtures/strategies/d2-split-a.json', import.meta.url), 'utf8'));
const ROLES = ['j1', 'j2', 'j3', 'j4', 'j5'];

test('plan de transition : sauts avant et arrière, étapes intermédiaires comprises', () => {
  assert.deepEqual(transitionPlan(1, 2), [{ n: 2, reverse: false }]);
  assert.deepEqual(transitionPlan(1, 4).map((x) => x.n), [2, 3, 4]);
  assert.deepEqual(transitionPlan(4, 1), [
    { n: 4, reverse: true },
    { n: 3, reverse: true },
    { n: 2, reverse: true },
  ]);
  assert.deepEqual(transitionPlan(0, 4).map((x) => x.n), [1, 2, 3, 4]);
  assert.deepEqual(transitionPlan(3, 3), []);
});

test('chaque trajet relie exactement la position précédente à la nouvelle', () => {
  for (let n = 1; n <= data.steps.length; n++)
    for (const r of ROLES) {
      const route = segmentRoute(data, n, r);
      assert.deepEqual(route[0], positionAt(data, n - 1, r), `étape ${n}, ${r} : départ`);
      assert.deepEqual(route.at(-1), positionAt(data, n, r), `étape ${n}, ${r} : arrivée`);
    }
});

test('les segments enchaînés forment un trajet continu de 1 à 4 et de 4 à 1', () => {
  for (const [from, to] of [[1, 4], [4, 1], [0, 4]])
    for (const r of ROLES) {
      let pos = positionAt(data, from, r);
      for (const { n, reverse } of transitionPlan(from, to)) {
        const route = segmentRoute(data, n, r);
        const seg = reverse ? [...route].reverse() : route;
        assert.deepEqual(seg[0], pos, `${from}→${to}, ${r}, segment ${n}`);
        pos = seg.at(-1);
      }
      assert.deepEqual(pos, positionAt(data, to, r));
    }
});

test('départ (étape 0) : début du tracé de l\'étape 1', () => {
  for (const r of ROLES) {
    const move = data.steps[0].map.moves.find((m) => m.role === r);
    assert.deepEqual(positionAt(data, 0, r), move.path[0]);
  }
});

test('rotation par le plus court chemin', () => {
  assert.equal(lerpAngle(170, -170, 0.5), 180);
  assert.equal(lerpAngle(-170, 170, 0.5), -180);
  assert.equal(lerpAngle(0, 90, 0.5), 45);
});

test('durées : un saut de plusieurs étapes reste court', () => {
  assert.equal(segmentDuration(1), 700);
  assert.ok(segmentDuration(3) * 3 <= 1500);
  assert.ok(segmentDuration(10) >= 380);
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
});
