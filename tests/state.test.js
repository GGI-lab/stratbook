import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseParams,
  resolveInitial,
  buildShareUrl,
  displayName,
  cleanNickname,
  createStore,
  clampStep,
  emptyNicknames,
} from '../src/state.js';

const BASE = 'https://ggi-lab.github.io/stratbook/';
const NICKS = ['Greg', 'Alex', '', 'Sam & Co', 'Zoé, la sniper'];

test('aller-retour du lien : même vue, rôle, étape et pseudos', () => {
  for (const view of ['equipe', 'j1', 'j2', 'j3', 'j4', 'j5'])
    for (const step of [1, 2, 3, 4]) {
      const url = buildShareUrl(BASE, 'd2-split-a', { step, view, nicknames: NICKS });
      const params = parseParams(new URL(url).search);
      const state = resolveInitial(params, { role: null, nicknames: null });
      assert.equal(state.step, step);
      assert.equal(state.view, view);
      assert.deepEqual(state.nicknames, NICKS);
    }
});

test("le lien contient l'id de stratégie", () => {
  const url = new URL(buildShareUrl(BASE + '?x=1#a', 'd2-split-a', { step: 2, view: 'j2', nicknames: emptyNicknames() }));
  assert.equal(url.searchParams.get('s'), 'd2-split-a');
  assert.equal(url.searchParams.get('x'), null);
  assert.equal(url.hash, '');
});

test("ouverture : lien, puis rôle mémorisé, puis vue équipe", () => {
  assert.equal(resolveInitial(parseParams('?role=j4'), { role: 'j2' }).view, 'j4');
  assert.equal(resolveInitial(parseParams(''), { role: 'j2' }).view, 'j2');
  assert.equal(resolveInitial(parseParams(''), { role: null }).view, 'equipe');
  assert.equal(resolveInitial(parseParams(''), { role: 'n-importe' }).view, 'equipe');
  assert.equal(resolveInitial(parseParams(''), {}).step, 1);
});

test('paramètres invalides ignorés', () => {
  assert.deepEqual(parseParams('?step=0&role=j9'), {});
  assert.deepEqual(parseParams('?step=6'), {});
  assert.equal(parseParams('?step=5').step, 5);
  assert.deepEqual(parseParams('?step=2.5'), {});
  assert.deepEqual(parseParams('?step=abc&role=EQUIPE'), {});
});

test("pseudos : ceux de l'appareil priment, sinon ceux du lien sont adoptés", () => {
  const params = parseParams('?n1=Greg');
  const mine = ['Moi', '', '', '', ''];
  const a = resolveInitial(params, { nicknames: mine });
  assert.deepEqual(a.nicknames, mine);
  assert.equal(a.adoptLinkNicknames, false);
  const b = resolveInitial(params, { nicknames: emptyNicknames() });
  assert.equal(b.nicknames[0], 'Greg');
  assert.equal(b.adoptLinkNicknames, true);
});

test('nom affiché : numéro de rôle toujours visible', () => {
  assert.equal(displayName('j2', NICKS), 'Alex · J2');
  assert.equal(displayName('j3', NICKS), 'J3');
  assert.equal(displayName('j1', null), 'J1');
});

test('nettoyage des pseudos', () => {
  assert.equal(cleanNickname('  Greg  '), 'Greg');
  assert.equal(cleanNickname('a\u0000b\nc'), 'abc');
  assert.equal(cleanNickname('Zoé   la  sniper'), 'Zoé la sniper');
  assert.equal(cleanNickname('x'.repeat(40)).length, 16);
  assert.equal(cleanNickname(null), '');
});

test('bornes des étapes', () => {
  assert.equal(clampStep(0, 4), 1);
  assert.equal(clampStep(5, 4), 4);
  assert.equal(clampStep(3, 4), 3);
  assert.equal(clampStep(9), 5);
});

test('stockage : lecture et écriture, et stockage indisponible sans plantage', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  const store = createStore(storage);
  assert.equal(store.saveRole('j2'), true);
  assert.equal(store.saveNicknames(NICKS), true);
  assert.deepEqual(store.read(), { role: 'j2', nicknames: NICKS });

  const broken = createStore({
    getItem() { throw new Error('bloqué'); },
    setItem() { throw new Error('bloqué'); },
  });
  assert.deepEqual(broken.read(), { role: null, nicknames: null });
  assert.equal(broken.saveRole('j1'), false);
});
