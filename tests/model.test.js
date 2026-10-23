import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sideOf, createStrategy, sanitizeStrategy, groupLabel, buildGroups, ROLES } from '../src/model.js';

const splitA = JSON.parse(readFileSync(new URL('../strategies/d2-split-a.json', import.meta.url), 'utf8'));


test('side : Terro donne t, CT ou Anti-terro donnent ct', () => {
  assert.equal(sideOf(splitA), 't');
  assert.equal(sideOf({ side: { text: 'CT' } }), 'ct');
  assert.equal(sideOf({ side: { text: 'Anti-terro' } }), 'ct');
  assert.equal(sideOf({}), 't');
});

test('nouvelle stratégie : 1 étape, joueurs au spawn du side, groupes par défaut', () => {
  const ct = createStrategy({ side: 'ct' });
  assert.equal(sideOf(ct), 'ct');
  assert.equal(ct.steps.length, 1);
  assert.deepEqual(ct.steps[0].map.positions, ct.start);
  assert.match(ct.id, /^d2-ct-[a-z0-9]{6}$/);
  assert.deepEqual(ct.groups.map((g) => g.id), ['a', 'mid', 'b']);
  assert.ok(sanitizeStrategy(ct), 'une stratégie neuve est valide');
});

test('nettoyage : la stratégie du dépôt passe sans changement', () => {
  assert.deepEqual(sanitizeStrategy(splitA), splitA);
});

test('nettoyage : données piégées ou incomplètes refusées', () => {
  const bad = (patch) => sanitizeStrategy({ ...structuredClone(splitA), ...patch });
  assert.equal(bad({ id: '"><script>' }), null);
  assert.equal(bad({ map: 'inconnue' }), null);
  assert.equal(bad({ steps: [] }), null);
  const s = structuredClone(splitA);
  s.steps[0].map.positions.j1 = ['x', 1];
  assert.equal(sanitizeStrategy(s), null);
  // Champs inattendus retirés, allure et utilitaires inconnus écartés.
  const t = structuredClone(splitA);
  t.evil = '<img>';
  t.steps[1].map.moves[0].pace = 'teleport';
  t.steps[1].map.utilities.push({ type: 'nuke', by: 'j1', at: [1, 1] });
  const clean = sanitizeStrategy(t);
  assert.equal(clean.evil, undefined);
  assert.equal(clean.steps[1].map.moves[0].pace, undefined);
  assert.equal(clean.steps[1].map.utilities.length, 2);
});

test('libellés de groupe : ceux de la stratégie, sinon ceux par défaut', () => {
  assert.equal(groupLabel(splitA, 'long'), 'Long');
  assert.equal(groupLabel(splitA, 'all'), 'Toute l’équipe');
  assert.equal(groupLabel(null, 'b'), 'Site B');
  const s = createStrategy({ side: 't' });
  s.roles.j5.group = 'mid';
  assert.deepEqual(buildGroups(s).find((g) => g.id === 'mid').players, ['j5']);
});

test('rôles : toujours les 5 joueurs', () => {
  assert.deepEqual(Object.keys(createStrategy().roles), ROLES);
});

test('nettoyage : date de version gardée si elle est valide', () => {
  const s = (updatedAt) => sanitizeStrategy({ ...structuredClone(splitA), updatedAt });
  assert.equal(s(1761148800000).updatedAt, 1761148800000);
  for (const bad of [-5, 0, 1.5, '1761148800000', 1e15, null]) assert.equal('updatedAt' in s(bad), false, String(bad));
});

test('nettoyage : points de passage des trajets gardés (3 au plus)', () => {
  const raw = structuredClone(splitA);
  const move = raw.steps[0].map.moves[0];
  move.via = [[500, 500], 'faux', [510, 510], [520, 520], [530, 530]];
  const clean = sanitizeStrategy(raw).steps[0].map.moves[0];
  assert.deepEqual(clean.via, [[500, 500], [510, 510]]); // les 3 premiers, dont un invalide retiré
  move.via = [];
  assert.equal('via' in sanitizeStrategy(raw).steps[0].map.moves[0], false);
});
