import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
      assert.ok(x >= 0 && x <= VIEWBOX.width && y >= 0 && y <= VIEWBOX.height, `étape ${s.n}, ${r}`);
    }
});

test('chaque étape se dessine, en vue équipe et pour chaque rôle', () => {
  for (const s of data.steps)
    for (const focus of [null, ...ROLES]) {
      const svg = renderStepSvg(data, s.n, { focus });
      assert.match(svg, /^<svg /);
      assert.equal((svg.match(/class="player"/g) || []).length, 5);
    }
});
