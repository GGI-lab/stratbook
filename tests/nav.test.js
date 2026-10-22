import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRoute, getGrid, isWalkable, snapToWalkable } from '../src/map/nav.js';
import { NAV } from '../src/map/dust2-nav.js';

// Petite grille de test (. = praticable) : un couloir en U, cases de 10 px.
function gridFrom(rows) {
  const cols = rows[0].length;
  const bits = new Uint8Array(Math.ceil((cols * rows.length) / 8));
  rows.forEach((r, y) =>
    [...r].forEach((c, x) => {
      const i = y * cols + x;
      if (c === '.') bits[i >> 3] |= 1 << (i & 7);
    }),
  );
  return { cell: 10, cols, rows: rows.length, bits: Buffer.from(bits).toString('base64') };
}

const U = gridFrom([
  '#######',
  '#.###.#',
  '#.###.#',
  '#.###.#',
  '#.....#',
  '#######',
]);

test('le trajet contourne le mur au lieu de le traverser', () => {
  const route = computeRoute(U, [15, 15], [55, 15]);
  const g = getGrid(U);
  assert.deepEqual(route[0], [15, 15]);
  assert.deepEqual(route.at(-1), [55, 15]);
  assert.ok(route.length >= 3, 'au moins un point de passage');
  assert.ok(route.some(([, y]) => y >= 40), 'passe par le bas du U');
  for (const p of route) assert.ok(isWalkable(g, p), `${p} praticable`);
});

test('un point sur un mur est ramené dans le couloir', () => {
  const g = getGrid(U);
  assert.ok(isWalkable(g, snapToWalkable(g, [35, 15])));
});

test('Dust 2 : du spawn T au site A par Long, sans sortir de la carte', () => {
  const g = getGrid(NAV);
  const route = computeRoute(NAV, [450, 900], [895, 300]);
  // Chaque segment de la ligne brisée reste praticable (échantillonné tous les 4 px).
  for (let i = 1; i < route.length; i++) {
    const [a, b] = [route[i - 1], route[i]];
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4);
    for (let k = 0; k <= n; k++) {
      const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      assert.ok(isWalkable(g, p), `segment ${i} : ${p.map(Math.round)} hors carte`);
    }
  }
  assert.ok(route.length <= 12, `${route.length} points : trajet simplifié`);
});

test('Dust 2 : positions de départ des deux sides praticables', async () => {
  const { SPAWNS } = await import('../src/map/dust2.js');
  const g = getGrid(NAV);
  for (const p of [...SPAWNS.t, ...SPAWNS.ct]) assert.ok(isWalkable(g, p), `${p}`);
});
