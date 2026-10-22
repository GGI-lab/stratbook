import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diff, applyDiff, fingerprint } from '../src/patch.js';

const splitA = JSON.parse(readFileSync(new URL('../strategies/d2-split-a.json', import.meta.url), 'utf8'));

test('différences : aller-retour sur des objets, tableaux et valeurs', () => {
  const cases = [
    [{ a: 1, b: { c: [1, 2, 3] } }, { a: 2, b: { c: [1, 2, 3, 4] } }],
    [{ a: 1, b: 2 }, { a: 1 }], // clé retirée
    [{ list: [1, 2, 3, 4] }, { list: [1, 3] }], // tableau raccourci
    [{ x: [{ t: 'a' }, { t: 'b' }] }, { x: [{ t: 'a' }, { t: 'B' }] }],
    [{ n: null }, { n: { deep: true } }],
    ['texte', 'autre'],
    [[1, 2], { pas: 'un tableau' }],
  ];
  for (const [a, b] of cases) assert.deepEqual(applyDiff(a, diff(a, b)), b, JSON.stringify([a, b]));
});

test('différences : rien à envoyer quand rien ne change', () => {
  assert.equal(diff(splitA, structuredClone(splitA)), undefined);
  assert.deepEqual(applyDiff(splitA, undefined), splitA);
});

test("différences : un petit changement d'une grosse stratégie reste petit", () => {
  const b = structuredClone(splitA);
  b.title.text = 'Split A v2';
  b.steps[1].roles.j2[0].text = 'Smoke CT puis attends';
  const d = diff(splitA, b);
  assert.ok(JSON.stringify(d).length < 250, JSON.stringify(d));
  assert.deepEqual(applyDiff(splitA, d), b);
  assert.deepEqual(splitA.title.text, 'Split A, 3 Long + 2 Short', "l'original n'est pas modifié");
});

test('différences reçues : clés dangereuses ignorées, formes invalides refusées', () => {
  const out = applyDiff({ a: 1 }, JSON.parse('{"o":{"__proto__":{"v":{"pollue":true}},"b":{"v":2}}}'));
  assert.deepEqual(out, { a: 1, b: 2 });
  assert.equal({}.pollue, undefined);
  assert.throws(() => applyDiff({}, 'pas un objet'));
  assert.throws(() => applyDiff([], { a: 1e9, o: {} }));
  assert.throws(() => applyDiff([], { a: -1, o: {} }));
});

test('empreinte : stable, différente si le texte change', () => {
  assert.equal(fingerprint('abc'), fingerprint('abc'));
  assert.notEqual(fingerprint('abc'), fingerprint('abd'));
  assert.match(fingerprint(JSON.stringify(splitA)), /^[0-9a-z]+$/);
});
