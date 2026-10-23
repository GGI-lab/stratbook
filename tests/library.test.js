import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStrategy } from '../src/model.js';
import { createLibrary } from '../src/library.js';

const splitA = JSON.parse(readFileSync(new URL('../strategies/d2-split-a.json', import.meta.url), 'utf8'));
const builtIns = { [splitA.id]: splitA };
const shas = { [splitA.id]: 'sha-site' };

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}
const titled = (s, title) => ({ ...structuredClone(s), title: { text: title, source: 'ajout' } });
/** Faux dépôt : fichiers { id: { sha, strategy } } ; readFile compte les lectures. */
function repo(files) {
  const reads = [];
  return {
    listing: Object.entries(files).map(([id, f]) => ({ id, sha: f.sha })),
    readFile: async (id) => {
      reads.push(id);
      if (files[id].fail) throw new Error('réseau');
      return { text: files[id].text ?? JSON.stringify(files[id].strategy), sha: files[id].sha };
    },
    reads,
  };
}

test('stratégies du site : visibles, filtrées par side, empreinte connue', () => {
  const lib = createLibrary(builtIns, memoryStorage(), shas);
  assert.equal(lib.get(splitA.id).title.text, 'Split A, 3 Long + 2 Short');
  assert.equal(lib.origin(splitA.id), 'repo');
  assert.equal(lib.shaOf(splitA.id), 'sha-site');
  assert.deepEqual(lib.list({ side: 'ct' }), []);
  assert.deepEqual(lib.list({ side: 't' }).map((s) => s.id), [splitA.id]);
});

test('GitHub : seuls les fichiers nouveaux ou modifiés sont lus ; les supprimés disparaissent', async () => {
  const storage = memoryStorage();
  const lib = createLibrary(builtIns, storage, shas);
  const ct = createStrategy({ side: 'ct', id: 'd2-ct-abc123' });
  ct.title.text = 'Retake B';
  // Split A inchangé (même empreinte), Retake B nouveau.
  let r = repo({ [splitA.id]: { sha: 'sha-site', strategy: splitA }, [ct.id]: { sha: 's1', strategy: ct } });
  let changed = await lib.sync(r.listing, r.readFile);
  assert.deepEqual(r.reads, [ct.id]);
  assert.deepEqual([...changed], [ct.id]);
  assert.equal(lib.get(ct.id).title.text, 'Retake B');
  assert.equal(lib.shaOf(ct.id), 's1');

  // Split A modifié sur GitHub, Retake B supprimé.
  r = repo({ [splitA.id]: { sha: 'sha-2', strategy: titled(splitA, 'Split A v2') } });
  changed = await lib.sync(r.listing, r.readFile);
  assert.deepEqual([...changed].sort(), [ct.id, splitA.id].sort());
  assert.equal(lib.get(splitA.id).title.text, 'Split A v2');
  assert.equal(lib.get(ct.id), null);
  assert.deepEqual(lib.list({ side: 'ct' }), []);

  // Rechargement : le cache garde la version GitHub (ouverture rapide, hors ligne).
  const again = createLibrary(builtIns, storage, shas);
  assert.equal(again.get(splitA.id).title.text, 'Split A v2');
  assert.equal(again.get(ct.id), null);
  // Rien n'a changé : aucune lecture.
  r = repo({ [splitA.id]: { sha: 'sha-2', strategy: titled(splitA, 'Split A v2') } });
  assert.equal((await again.sync(r.listing, r.readFile)).size, 0);
  assert.deepEqual(r.reads, []);
});

test('GitHub : fichier illisible ou lecture impossible, la version connue reste', async () => {
  const lib = createLibrary(builtIns, memoryStorage(), shas);
  let r = repo({ [splitA.id]: { sha: 'sha-x', text: '{ pas du json' } });
  await lib.sync(r.listing, r.readFile);
  assert.equal(lib.get(splitA.id).title.text, 'Split A, 3 Long + 2 Short');
  r = repo({ [splitA.id]: { sha: 'sha-y', fail: true } });
  await lib.sync(r.listing, r.readFile);
  assert.equal(lib.get(splitA.id).title.text, 'Split A, 3 Long + 2 Short');
});

test('publication et suppression : visibles tout de suite, gardées au rechargement', () => {
  const storage = memoryStorage();
  const lib = createLibrary(builtIns, storage, shas);
  const ct = createStrategy({ side: 'ct', id: 'd2-ct-new001' });
  ct.title.text = 'Retake A';
  lib.published(ct, 'sha-ct');
  assert.equal(lib.origin(ct.id), 'repo');
  assert.equal(lib.shaOf(ct.id), 'sha-ct');
  lib.removed(splitA.id);
  assert.equal(lib.get(splitA.id), null);
  assert.equal(lib.shaOf(splitA.id), null);
  const again = createLibrary(builtIns, storage, shas);
  assert.equal(again.get(ct.id).title.text, 'Retake A');
  assert.equal(again.get(splitA.id), null, 'supprimée même si livrée avec le site');
  // Republiée ensuite : de nouveau visible.
  again.published(splitA, 'sha-back');
  assert.equal(again.get(splitA.id).title.text, 'Split A, 3 Long + 2 Short');
});

test('anciennes stratégies du téléphone : visibles, à publier, la version du dépôt prime', () => {
  const storage = memoryStorage();
  const perso = createStrategy({ side: 't', id: 'd2-t-perso1' });
  perso.title.text = 'Rush B perso';
  const oldModified = titled(splitA, 'Split A modifiée sur le téléphone');
  storage.setItem('stratbook:strategies', JSON.stringify({ [perso.id]: perso, [splitA.id]: oldModified }));
  const lib = createLibrary(builtIns, storage, shas);
  assert.equal(lib.origin(perso.id), 'local');
  assert.equal(lib.get(perso.id).title.text, 'Rush B perso');
  assert.equal(lib.get(splitA.id).title.text, 'Split A, 3 Long + 2 Short', 'le dépôt prime');
  assert.deepEqual(lib.pendingLocal().map((s) => s.title.text).sort(), ['Rush B perso', 'Split A modifiée sur le téléphone']);
  // Publiée : elle passe dans le dépôt et quitte la liste « à publier ».
  lib.published(lib.pendingLocal().find((s) => s.id === perso.id), 'sha-p');
  assert.equal(lib.origin(perso.id), 'repo');
  assert.deepEqual(createLibrary(builtIns, storage, shas).pendingLocal().map((s) => s.id), [splitA.id]);
  // Effacée du téléphone.
  lib.removed(splitA.id);
  assert.deepEqual(lib.pendingLocal(), []);
});

test('stockage indisponible : tout marche en mémoire', async () => {
  const broken = {
    getItem() {
      throw new Error('bloqué');
    },
    setItem() {
      throw new Error('bloqué');
    },
    removeItem() {
      throw new Error('bloqué');
    },
  };
  const lib = createLibrary(builtIns, broken, shas);
  const s = createStrategy({ side: 't', id: 'd2-t-mem001' });
  assert.equal(lib.published(s, 'x'), false);
  assert.ok(lib.get(s.id));
});
