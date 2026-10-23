import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTeam, parseTeam, teamHasNames, createTeamStore } from '../src/team.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

test('fichier des pseudos : 5 pseudos nettoyés, champs inconnus ignorés', () => {
  assert.deepEqual(sanitizeTeam({ pseudos: ['  Greg ', 'Alex, le boss', null, 'x'.repeat(40)], autre: 1 }), {
    pseudos: ['Greg', 'Alex le boss', '', 'x'.repeat(16), ''],
  });
  assert.deepEqual(sanitizeTeam({ pseudos: [], updatedAt: 1761200000000 }), { pseudos: ['', '', '', '', ''], updatedAt: 1761200000000 });
  assert.equal(sanitizeTeam({ pseudos: 'Greg' }), null);
  assert.equal(sanitizeTeam(null), null);
  assert.equal(parseTeam('{ pas du json'), null);
  assert.equal(teamHasNames(parseTeam('{"pseudos":["","","","",""]}')), false);
  assert.equal(teamHasNames(parseTeam('{"pseudos":["","Alex"]}')), true);
});

test('équipe sur l’appareil : version du site, puis version GitHub gardée en cache', () => {
  const storage = memoryStorage();
  const store = createTeamStore(storage, { text: '{"pseudos":["Greg","","","",""]}', sha: null });
  assert.deepEqual(store.team().pseudos, ['Greg', '', '', '', '']);
  store.setBuiltInSha('sha-site');
  assert.equal(store.sha(), 'sha-site');
  assert.equal(store.update({ pseudos: ['Greg', 'Alex'] }, 'sha-2'), true, 'pseudos changés');
  assert.equal(store.update({ pseudos: ['Greg', 'Alex'] }, 'sha-3'), false, 'mêmes pseudos');
  assert.equal(store.update({ rien: true }, 'sha-4'), false, 'fichier illisible ignoré');
  // Rechargement : le cache prime sur la version du site.
  const again = createTeamStore(storage, { text: '{"pseudos":["Greg","","","",""]}', sha: 'sha-site' });
  assert.deepEqual(again.team().pseudos, ['Greg', 'Alex', '', '', '']);
  assert.equal(again.sha(), 'sha-3');
  // Sans fichier livré ni cache.
  assert.equal(createTeamStore(memoryStorage()).team(), null);
});
