import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  REPO,
  blobSha,
  toBase64,
  fromBase64,
  listStrategies,
  readStrategy,
  writeStrategy,
  deleteStrategy,
  checkAccess,
  fileText,
  GitHubError,
} from '../src/github.js';

const splitAText = readFileSync(new URL('./fixtures/strategies/d2-split-a.json', import.meta.url), 'utf8');
const splitA = JSON.parse(splitAText);

/** Faux fetch : enregistre les appels et répond selon `handler`. */
function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    const { status = 200, json = {}, headers = {} } = (await handler(url, init)) ?? {};
    return { ok: status >= 200 && status < 300, status, json: async () => json, headers: { get: (k) => headers[k.toLowerCase()] ?? null } };
  };
  fn.calls = calls;
  return fn;
}

test('empreinte Git : identique à `git hash-object`', async () => {
  const path = new URL('./fixtures/strategies/d2-split-a.json', import.meta.url).pathname;
  const expected = execFileSync('git', ['hash-object', path], { encoding: 'utf8' }).trim();
  assert.equal(await blobSha(splitAText), expected);
  assert.equal(await blobSha(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'); // fichier vide, valeur connue de Git
});

test('base64 : aller-retour avec accents et guillemets français', () => {
  const text = 'Étape « Récap » — ça marche, J’ai 2 €';
  assert.equal(fromBase64(toBase64(text)), text);
  assert.equal(fromBase64(toBase64(splitAText)), splitAText);
});

test('liste du dossier strategies : fichiers .json seulement, avec leur empreinte', async () => {
  const fetch = fakeFetch(() => ({
    json: [
      { type: 'file', name: 'd2-split-a.json', sha: 'aaa' },
      { type: 'file', name: 'README.md', sha: 'bbb' },
      { type: 'dir', name: 'archives', sha: 'ccc' },
      { type: 'file', name: 'd2-ct-x1y2z3.json', sha: 'ddd' },
      { type: 'file', name: '../piege.json', sha: 'eee' },
    ],
  }));
  assert.deepEqual(await listStrategies(fetch), [
    { id: 'd2-split-a', sha: 'aaa' },
    { id: 'd2-ct-x1y2z3', sha: 'ddd' },
  ]);
  assert.equal(fetch.calls[0].url, `https://api.github.com/repos/${REPO.owner}/${REPO.name}/contents/strategies?ref=main`);
  assert.equal(fetch.calls[0].headers.Authorization, undefined, 'lecture sans jeton');
});

test('lecture d’un fichier : texte décodé et empreinte', async () => {
  const fetch = fakeFetch(() => ({ json: { content: toBase64(splitAText), sha: 'abc' } }));
  const file = await readStrategy(fetch, 'd2-split-a', { token: 'jeton' });
  assert.equal(file.text, splitAText);
  assert.equal(file.sha, 'abc');
  assert.equal(fetch.calls[0].headers.Authorization, 'Bearer jeton');
});

test('publication : un commit avec le fichier lisible, l’empreinte remplacée et un message clair', async () => {
  const fetch = fakeFetch(() => ({ json: { content: { sha: 'nouveau' } } }));
  const sha = await writeStrategy(fetch, 'jeton', splitA, { sha: 'ancien' });
  assert.equal(sha, 'nouveau');
  const call = fetch.calls[0];
  assert.equal(call.method, 'PUT');
  assert.match(call.url, /\/contents\/strategies\/d2-split-a\.json$/);
  assert.equal(call.body.sha, 'ancien');
  assert.equal(call.body.branch, 'main');
  assert.equal(fromBase64(call.body.content), fileText(splitA));
  assert.match(call.body.message, /Split A, 3 Long \+ 2 Short » modifiée/);
  // Création : pas d'empreinte.
  await writeStrategy(fetch, 'jeton', { ...splitA, id: 'd2-t-neuve1' });
  assert.equal('sha' in fetch.calls[1].body, false);
  assert.match(fetch.calls[1].body.message, /ajoutée/);
});

test('suppression : un commit avec l’empreinte', async () => {
  const fetch = fakeFetch(() => ({ json: {} }));
  await deleteStrategy(fetch, 'jeton', { id: 'd2-t-abc123', title: { text: 'Rush B' }.text, sha: 'xyz' });
  assert.equal(fetch.calls[0].method, 'DELETE');
  assert.equal(fetch.calls[0].body.sha, 'xyz');
  assert.match(fetch.calls[0].body.message, /« Rush B » supprimée/);
});

test('erreurs traduites : jeton, droits, limite, conflit, absent, réseau', async () => {
  const cases = [
    [{ status: 401 }, 'token'],
    [{ status: 403, headers: { 'x-ratelimit-remaining': '0' } }, 'limit'],
    [{ status: 403 }, 'rights'],
    [{ status: 404 }, 'missing'],
    [{ status: 409 }, 'conflict'],
    [{ status: 422 }, 'conflict'],
    [{ status: 500 }, 'other'],
  ];
  for (const [res, code] of cases) {
    await assert.rejects(writeStrategy(fakeFetch(() => res), 't', splitA), (e) => e instanceof GitHubError && e.code === code && e.message.length > 10);
  }
  const offline = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(listStrategies(offline), (e) => e.code === 'network');
});

test('vérification du jeton : il doit pouvoir écrire dans le dépôt', async () => {
  assert.equal(await checkAccess(fakeFetch(() => ({ json: { permissions: { push: true } } })), 't'), true);
  await assert.rejects(checkAccess(fakeFetch(() => ({ json: { permissions: { push: false, pull: true } } })), 't'), (e) => e.code === 'rights');
  await assert.rejects(checkAccess(fakeFetch(() => ({ status: 401 })), 't'), (e) => e.code === 'token');
});
