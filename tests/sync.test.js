import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeStrategy, createStrategy } from '../src/model.js';
import { createLibrary } from '../src/library.js';
import { encodeStrategy, decodeStrategy } from '../src/codec.js';
import { incomingAction, copyOf, linkPayload, expandPayload, sameContent, normalize, backupData, readImport, BACKUP_KIND } from '../src/sync.js';

const splitA = JSON.parse(readFileSync(new URL('../strategies/d2-split-a.json', import.meta.url), 'utf8'));
const builtIns = { [splitA.id]: splitA };

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}
/** Version de Split A retitrée, datée. */
const version = (title, updatedAt) => sanitizeStrategy({ ...structuredClone(splitA), title: { text: title, source: 'ajout' }, updatedAt });

test('reçue et inconnue ici : ajoutée', () => {
  const lib = createLibrary({}, memoryStorage());
  assert.equal(incomingAction(lib, version('Split A v1', 1000)).action, 'add');
});

test('reçue avec le même contenu : rien à faire (la date seule ne compte pas)', () => {
  const lib = createLibrary(builtIns, memoryStorage());
  lib.save(version('Split A v1', 1000));
  assert.equal(incomingAction(lib, version('Split A v1', 5000)).action, 'same');
});

test("stratégie du dépôt jamais modifiée ici : la version reçue la remplace sans question", () => {
  const lib = createLibrary(builtIns, memoryStorage());
  assert.equal(incomingAction(lib, version('Split A v1', 1000)).action, 'update');
});

test('version reçue jamais retouchée : une version plus récente la remplace, une plus ancienne demande', () => {
  const lib = createLibrary(builtIns, memoryStorage());
  lib.save(version('Split A v1', 1000), { received: true });
  assert.equal(incomingAction(lib, version('Split A v2', 2000)).action, 'update');
  const older = incomingAction(lib, version('Split A v0', 500));
  assert.equal(older.action, 'conflict');
  assert.equal(older.newer, 'mine');
});

test("version modifiée ici : jamais remplacée en silence, même par une version plus récente", () => {
  const lib = createLibrary(builtIns, memoryStorage());
  lib.save(version('Split A, la mienne', 1500)); // enregistrée depuis l'éditeur
  const newer = incomingAction(lib, version('Split A v2', 2000));
  assert.equal(newer.action, 'conflict');
  assert.equal(newer.newer, 'received');
  const older = incomingAction(lib, version('Split A v1', 1000));
  assert.equal(older.action, 'conflict');
  assert.equal(older.newer, 'mine');
  // Dates inconnues : on ne dit pas laquelle est la plus récente.
  lib.save(version('Sans date'));
  assert.equal(incomingAction(lib, version('Autre sans date')).newer, null);
});

test('reçue puis retouchée ici : la marque « reçue » disparaît (et survit à la fermeture sinon)', () => {
  const storage = memoryStorage();
  const lib = createLibrary(builtIns, storage);
  lib.save(version('Split A v1', 1000), { received: true });
  assert.equal(createLibrary(builtIns, storage).isReceivedUntouched(splitA.id), true, 'gardée après rechargement');
  lib.save(version('Split A v1 retouchée', 1200));
  assert.equal(lib.isReceivedUntouched(splitA.id), false);
  lib.save(version('Split A v1', 1000), { received: true });
  lib.remove(splitA.id);
  assert.equal(createLibrary(builtIns, storage).isReceivedUntouched(splitA.id), false);
});

test('garder les deux : copie sous un nouvel id, titre « (reçue) », contenu identique', () => {
  const v = version('Split A v1', 1000);
  const c = copyOf(v, () => 0.5);
  assert.notEqual(c.id, v.id);
  assert.match(c.id, /^d2-t-[a-z0-9]{6}$/);
  assert.equal(c.title.text, 'Split A v1 (reçue)');
  assert.deepEqual(c.steps, v.steps);
  assert.ok(sanitizeStrategy(c));
});

test('lien court : stratégie du dépôt modifiée envoyée sous forme de différences, puis reconstruite', async () => {
  const mine = version('Split A v2', 1234);
  mine.steps[1].roles.j2 = [{ text: 'Smoke CT puis attends le go', source: 'ajout' }];
  const full = await encodeStrategy(linkPayload(mine));
  const payload = linkPayload(mine, splitA);
  assert.equal(payload.$b, splitA.id);
  const short = await encodeStrategy(payload);
  assert.ok(short.length < full.length / 4, `${short.length} contre ${full.length}`);
  assert.ok(short.length < 600);
  const back = expandPayload(await decodeStrategy(short), (id) => builtIns[id] ?? null);
  assert.equal(back.baseChanged, false);
  assert.ok(sameContent(back.strategy, mine));
  assert.equal(back.strategy.updatedAt, 1234);
});

test("lien court : l'original a changé depuis l'envoi, ou est inconnu", () => {
  const mine = version('Split A v2', 1234);
  const payload = linkPayload(mine, splitA);
  const changedBase = structuredClone(splitA);
  changedBase.steps[0].title.text = 'Autre titre';
  const back = expandPayload(payload, () => changedBase);
  assert.equal(back.baseChanged, true);
  assert.equal(back.strategy.title.text, 'Split A v2');
  assert.equal(expandPayload(payload, () => null), null);
  // Différences qui changeraient l'id : refusées.
  assert.equal(expandPayload({ ...payload, $p: { o: { id: { v: 'autre-id' } } } }, () => splitA), null);
});

test('stratégie perso : envoyée entière ; données illisibles refusées', () => {
  const perso = createStrategy({ side: 'ct' });
  assert.deepEqual(linkPayload(perso), normalize(perso));
  assert.equal(expandPayload(linkPayload(perso), () => null).strategy.id, perso.id);
  assert.equal(expandPayload({ id: '<bad>' }, () => null), null);
  assert.equal(expandPayload(null, () => null), null);
});

test('sauvegarde : toutes les stratégies perso dans un fichier, relues à l’import', () => {
  const a = createStrategy({ side: 't' });
  const b = createStrategy({ side: 'ct' });
  const file = JSON.parse(JSON.stringify(backupData([a, b], 42)));
  assert.equal(file.kind, BACKUP_KIND);
  assert.equal(file.savedAt, 42);
  assert.deepEqual(readImport(file).map((s) => s.id), [a.id, b.id]);
  // Fichier d'une seule stratégie (bouton « Envoyer le fichier », dépôt).
  assert.deepEqual(readImport(splitA).map((s) => s.id), [splitA.id]);
  // Doublons et entrées illisibles ignorés.
  assert.deepEqual(readImport({ kind: BACKUP_KIND, strategies: [a, a, { id: 'x' }] }).map((s) => s.id), [a.id]);
  assert.deepEqual(readImport({ rien: true }), []);
  assert.deepEqual(readImport(null), []);
});
