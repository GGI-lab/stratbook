import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseParams,
  parseLink,
  resolveInitial,
  buildShareUrl,
  displayName,
  cleanNickname,
  createStore,
  clampStep,
  emptyNicknames,
} from '../src/state.js';

const BASE = 'https://ggi-lab.github.io/stratbook/';
const PATH = '/stratbook/';
const NICKS = ['Greg', 'Alex', '', 'Sam & Co', 'Zoé la sniper'];
const parse = (url) => parseLink(url, PATH);

test('aller-retour du lien : même vue, rôle, étape et pseudos', () => {
  for (const view of ['equipe', 'j1', 'j2', 'j3', 'j4', 'j5'])
    for (const step of [1, 2, 3, 4, 'recap']) {
      const url = buildShareUrl(BASE, 'd2-split-a', { step, view, nicknames: NICKS });
      const state = resolveInitial(parse(url), { role: null, nicknames: null });
      assert.equal(parse(url).strategyId, 'd2-split-a');
      assert.equal(state.step, step);
      assert.equal(state.view, view);
      assert.deepEqual(state.nicknames, NICKS);
    }
});

test('lien lisible : stratégie / étape / vue, pseudos lisibles', () => {
  assert.equal(buildShareUrl(BASE, 'd2-split-a', { step: 2, view: 'j2', nicknames: emptyNicknames() }), `${BASE}d2-split-a/etape-2/j2`);
  assert.equal(buildShareUrl(BASE, 'd2-split-a', { step: 'recap', view: 'equipe' }), `${BASE}d2-split-a/recap/equipe`);
  // Pseudos : accents gardés, espaces en +, & codé ; les derniers vides omis, ceux du milieu gardés.
  assert.equal(
    buildShareUrl(BASE, 'd2-split-a', { step: 1, view: 'j4', nicknames: NICKS }),
    `${BASE}d2-split-a/etape-1/j4?pseudos=Greg,Alex,,Sam+%26+Co,Zoé+la+sniper`,
  );
  assert.equal(buildShareUrl(BASE, 'd2-split-a', { step: 1, view: 'j1', nicknames: ['Greg', '', '', '', ''] }), `${BASE}d2-split-a/etape-1/j1?pseudos=Greg`);
  // Side sans stratégie ; adresse du site sans barre finale.
  assert.equal(buildShareUrl(BASE, null, { side: 'ct' }), `${BASE}ct`);
  assert.equal(buildShareUrl(BASE.slice(0, -1), 'd2-split-a', { step: 3, view: 'j1' }), `${BASE}d2-split-a/etape-3/j1`);
  assert.deepEqual(parse(`${BASE}ct`), { side: 'ct' });
});

test('lien lisible : morceaux invalides ignorés, majuscules acceptées', () => {
  assert.deepEqual(parse(`${BASE}D2-Split-A/Etape-2/J2`), { strategyId: 'd2-split-a', step: 2, view: 'j2' });
  assert.deepEqual(parse(`${BASE}d2-split-a/etape-9/j7`), { strategyId: 'd2-split-a' });
  assert.deepEqual(parse(`${BASE}d2-split-a`), { strategyId: 'd2-split-a' });
  assert.deepEqual(parse(`${BASE}%3Cscript%3E/etape-1`), {});
  assert.deepEqual(parse(BASE), {});
  assert.deepEqual(parse(`${BASE}index.html`), {});
  assert.deepEqual(parse(`${BASE}d2-split-a/etape-1/j1?pseudos=`), { strategyId: 'd2-split-a', step: 1, view: 'j1' });
});

test('anciens liens (?s=…&step=…&role=…&n1=…) toujours valables', () => {
  assert.deepEqual(parse(`${BASE}?s=d2-split-a&step=recap&role=j4&n1=Greg`), {
    strategyId: 'd2-split-a',
    step: 'recap',
    view: 'j4',
    nicknames: ['Greg', '', '', '', ''],
  });
  assert.deepEqual(parse(`${BASE}?side=ct`), { side: 'ct' });
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
  assert.deepEqual(parseParams('?step=Recap'), {});
});

test('étape récap : lue dans le lien et réécrite telle quelle', () => {
  assert.equal(parseParams('?step=recap').step, 'recap');
  const url = buildShareUrl(BASE, 'd2-split-a', { step: 'recap', view: 'j2', nicknames: emptyNicknames() });
  assert.equal(parse(url).step, 'recap');
  assert.equal(resolveInitial(parseParams('?step=recap'), {}).step, 'recap');
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

test('nom affiché : le pseudo seul, sinon le numéro de rôle', () => {
  assert.equal(displayName('j2', NICKS), 'Alex');
  assert.equal(displayName('j3', NICKS), 'J3');
  assert.equal(displayName('j1', null), 'J1');
});

test('nettoyage des pseudos', () => {
  assert.equal(cleanNickname('  Greg  '), 'Greg');
  assert.equal(cleanNickname('a\u0000b\nc'), 'abc');
  assert.equal(cleanNickname('Zoé   la  sniper'), 'Zoé la sniper');
  assert.equal(cleanNickname('Zoé, la sniper'), 'Zoé la sniper', 'virgule : séparateur des pseudos dans le lien');
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
