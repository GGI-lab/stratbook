import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealToken, openToken, createVault } from '../src/vault.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data };
}
const FAST = { iterations: 1000 }; // tests rapides ; l'application utilise 310 000 tours

test('jeton chiffré : rouvert avec le bon mot de passe, refusé sinon', async () => {
  const box = await sealToken('github_pat_ABC', 'mot de passe solide', FAST);
  assert.equal(JSON.stringify(box).includes('github_pat_ABC'), false, 'le jeton n’apparaît pas en clair');
  assert.equal(await openToken(box, 'mot de passe solide'), 'github_pat_ABC');
  assert.equal(await openToken(box, 'mauvais'), null);
  assert.equal(await openToken({ ...box, data: box.data.slice(0, -4) + 'AAAA' }, 'mot de passe solide'), null, 'données abîmées');
  // Deux chiffrements du même jeton diffèrent (sel et vecteur aléatoires).
  const again = await sealToken('github_pat_ABC', 'mot de passe solide', FAST);
  assert.notEqual(again.data, box.data);
});

test('coffre : configuration, verrouillage, déverrouillage, oubli', async () => {
  const storage = memoryStorage();
  const session = memoryStorage();
  const vault = createVault(storage, session);
  assert.equal(vault.isSetUp(), false);
  assert.equal(vault.isUnlocked(), false);
  assert.equal(await vault.unlock('x'), false, 'rien à déverrouiller');

  await vault.setUp('github_pat_XYZ', 'secret123');
  assert.equal(vault.isSetUp(), true);
  assert.equal(vault.token(), 'github_pat_XYZ');
  assert.equal([...storage.data.values()].some((v) => v.includes('github_pat_XYZ')), false, 'stockage local chiffré');

  // Rechargement de la page dans le même onglet : toujours déverrouillé (session).
  assert.equal(createVault(storage, session).token(), 'github_pat_XYZ');
  // Nouvel onglet (session vide) : verrouillé, mot de passe demandé.
  const other = createVault(storage, memoryStorage());
  assert.equal(other.isUnlocked(), false);
  assert.equal(await other.unlock('faux'), false);
  assert.equal(await other.unlock('secret123'), true);
  assert.equal(other.token(), 'github_pat_XYZ');

  vault.lock();
  assert.equal(vault.isUnlocked(), false);
  assert.equal(createVault(storage, session).isUnlocked(), false, 'verrouillage gardé au rechargement');
  vault.forget();
  assert.equal(createVault(storage, memoryStorage()).isSetUp(), false);
});

test('coffre : stockage bloqué (navigation privée), la session marche en mémoire', async () => {
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
  const vault = createVault(broken, broken);
  assert.equal(await vault.setUp('t', 'secret123'), false, 'non gardé');
  assert.equal(vault.token(), 't');
});
