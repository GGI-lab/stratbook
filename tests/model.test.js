import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sideOf, createStrategy, sanitizeStrategy, groupLabel, buildGroups, ROLES } from '../src/model.js';
import { createLibrary } from '../src/library.js';
import { encodeStrategy, decodeStrategy } from '../src/codec.js';

const splitA = JSON.parse(readFileSync(new URL('../strategies/d2-split-a.json', import.meta.url), 'utf8'));

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

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

test("bibliothèque : dépôt + stratégies locales, filtre par side, modification et retour à l'original", () => {
  const storage = memoryStorage();
  const lib = createLibrary({ [splitA.id]: splitA }, storage);
  assert.deepEqual(lib.list({ side: 'ct' }), []);
  const ct = createStrategy({ side: 'ct' });
  ct.title.text = 'Retake B';
  assert.equal(lib.save(ct), true);
  assert.deepEqual(lib.list({ side: 'ct' }).map((s) => s.title.text), ['Retake B']);
  assert.equal(lib.origin(ct.id), 'local');

  const modified = structuredClone(splitA);
  modified.title.text = 'Split A modifié';
  lib.save(modified);
  assert.equal(lib.origin(splitA.id), 'modified');
  // Relu depuis le stockage par une nouvelle instance (rechargement de la page).
  const again = createLibrary({ [splitA.id]: splitA }, storage);
  assert.equal(again.get(splitA.id).title.text, 'Split A modifié');
  assert.equal(again.get(ct.id).title.text, 'Retake B');
  again.remove(splitA.id);
  assert.equal(again.origin(splitA.id), 'builtin');
  assert.equal(again.get(splitA.id).title.text, 'Split A, 3 Long + 2 Short');
});

test('bibliothèque : stockage indisponible, tout reste en mémoire', () => {
  const broken = {
    getItem() {
      throw new Error('bloqué');
    },
    setItem() {
      throw new Error('bloqué');
    },
  };
  const lib = createLibrary({ [splitA.id]: splitA }, broken);
  const s = createStrategy({ side: 't' });
  assert.equal(lib.save(s), false);
  assert.ok(lib.get(s.id));
});

test('lien : la stratégie encodée revient identique (hors sources) et reste courte', async () => {
  const code = await encodeStrategy(splitA);
  assert.match(code, /^[zj][A-Za-z0-9_-]+$/);
  assert.ok(code.length < 4000, `${code.length} caractères`);
  const back = sanitizeStrategy(await decodeStrategy(code));
  const strip = (s) => JSON.stringify(s, (k, v) => (k === 'source' ? undefined : v));
  assert.deepEqual(JSON.parse(strip(back)), JSON.parse(strip(splitA)));
  assert.equal(await decodeStrategy('zpas-du-deflate'), null);
  assert.equal(await decodeStrategy('xabc'), null);
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
