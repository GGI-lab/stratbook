import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { strokesOf, renderStepSvg } from '../src/map/render.js';
import { ZONES, VIEWBOX } from '../src/map/dust2.js';
import { positionAt } from '../src/map/routes.js';

const data = JSON.parse(readFileSync(new URL('./fixtures/strategies/d2-split-a.json', import.meta.url), 'utf8'));
const ROLES = ['j1', 'j2', 'j3', 'j4', 'j5'];

test('les 13 zones demandées existent sur le plan', () => {
  const names = ZONES.map((z) => z.name);
  for (const n of ['Long', 'Portes Long', 'Pit', 'Car', 'Rampe', 'Site A', 'CT', 'Mid', 'Suicide', 'Top Mid', 'Xbox', 'Lower', 'Short'])
    assert.ok(names.includes(n), `zone manquante : ${n}`);
});

test('chaque étape place les 5 joueurs dans le cadre', () => {
  for (const s of data.steps)
    for (const r of ROLES) {
      const [x, y] = s.map.positions[r] ?? [];
      const inX = x >= VIEWBOX.x && x <= VIEWBOX.x + VIEWBOX.width;
      const inY = y >= VIEWBOX.y && y <= VIEWBOX.y + VIEWBOX.height;
      assert.ok(inX && inY, `étape ${s.n}, ${r} hors cadre`);
    }
});

test("l'image de fond est présente", () => {
  assert.ok(existsSync(new URL('../public/maps/dust2.webp', import.meta.url)));
});

test('chaque joueur a un point regardé à chaque étape (cône de vision)', () => {
  for (const s of data.steps)
    for (const r of ROLES) assert.equal(s.map.look[r]?.length, 2, `étape ${s.n}, ${r}`);
});

test('la carte n\'affiche aucun nom de zone', () => {
  const svg = renderStepSvg(data, 1);
  for (const z of ZONES) assert.ok(!svg.includes(`>${z.name}<`), z.name);
});

test('chaque étape se dessine, en vue équipe et pour chaque rôle', () => {
  for (const s of data.steps)
    for (const focus of [null, ...ROLES]) {
      const svg = renderStepSvg(data, s.n, { focus });
      assert.match(svg, /^<svg /);
      assert.equal((svg.match(/class="player"/g) || []).length, 5);
    }
});

test('récap : positions de la dernière étape, trajets et utilitaires de toutes les étapes', () => {
  const last = data.steps.at(-1).n;
  const svg = renderStepSvg(data, last, { recap: true });
  const count = (s, re) => (s.match(re) ?? []).length;
  const moves = data.steps.reduce((n, s) => n + s.map.moves.length, 0);
  const utils = data.steps.reduce((n, s) => n + s.map.utilities.length, 0);
  // Un tracé continu par joueur qui bouge (toutes les allures de Split A sont « course »).
  assert.ok(moves > 5, 'plusieurs morceaux par joueur dans les données');
  assert.equal(count(svg, /class="move"/g), 5);
  assert.equal(count(svg, /class="utility"/g), utils);
  assert.equal(count(svg, /class="player"/g), 5);
  assert.match(svg, /récap de la stratégie/);
  // Sans l'option, seule l'étape demandée est tracée (J3 y change aussi de place sans tracé dessiné).
  assert.equal(count(renderStepSvg(data, last), /class="move"/g), data.steps.at(-1).map.moves.length);
});

test('récap : chaque joueur a un tracé d’un seul tenant, du départ à sa dernière position', () => {
  const strokes = strokesOf(data, data.steps, true);
  for (const r of ['j1', 'j2', 'j3', 'j4', 'j5']) {
    const mine = strokes.filter((st) => st.role === r);
    if (!mine.length) continue;
    // Morceaux bout à bout : chacun repart exactement du point où le précédent s'arrête.
    mine.slice(1).forEach((st, i) => assert.deepEqual(st.points[0], mine[i].points.at(-1), `${r} : jonction ${i + 1}`));
    assert.deepEqual(mine.at(-1).points.at(-1), positionAt(data, data.steps.at(-1).n, r), `${r} : arrivée`);
  }
  // Contours sombres dessinés avant les traits de couleur : aucun contour par-dessus un trait.
  const svg = renderStepSvg(data, data.steps.at(-1).n, { recap: true });
  assert.ok(svg.indexOf('class="move-casings"') < svg.indexOf('class="moves"'));
  assert.equal((svg.match(/class="move"[^>]*>(<path[^>]*>){2}/g) ?? []).length, 0, 'un seul trait par tracé dans .move');
});

test('récap : un joueur qui reste sur place une étape garde un tracé continu', () => {
  const s = structuredClone(data);
  // J1 ne bouge pas à l'étape 2 : ses positions de l'étape 2 sont celles de l'étape 1.
  s.steps[1].map.positions.j1 = [...s.steps[0].map.positions.j1];
  s.steps[1].map.moves = s.steps[1].map.moves.filter((m) => m.role !== 'j1');
  for (const st of s.steps.slice(2)) {
    const mv = st.map.moves.find((m) => m.role === 'j1');
    if (mv) mv.pace = undefined;
  }
  const mine = strokesOf(s, s.steps, true).filter((st) => st.role === 'j1');
  assert.equal(mine.length, 1);
});

test('récap : changement d’allure (course puis shift) : deux tracés qui se touchent', () => {
  const s = structuredClone(data);
  s.steps[2].map.moves.find((m) => m.role === 'j1').pace = 'walk';
  const mine = strokesOf(s, s.steps, true).filter((st) => st.role === 'j1');
  assert.deepEqual(mine.map((m) => m.pace), ['run', 'walk', 'run']);
  mine.slice(1).forEach((st, i) => assert.deepEqual(st.points[0], mine[i].points.at(-1)));
});
