import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { renderStepSvg } from '../src/map/render.js';
import { ZONES, VIEWBOX } from '../src/map/dust2.js';

const data = JSON.parse(readFileSync(new URL('../strategies/d2-split-a.json', import.meta.url), 'utf8'));
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
  assert.equal(count(svg, /class="move"/g), moves);
  assert.equal(count(svg, /class="utility"/g), utils);
  assert.equal(count(svg, /class="player"/g), 5);
  assert.match(svg, /récap de la stratégie/);
  // Sans l'option, seule l'étape demandée est tracée.
  assert.equal(count(renderStepSvg(data, last), /class="move"/g), data.steps.at(-1).map.moves.length);
});
