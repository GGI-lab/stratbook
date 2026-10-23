// Fichier des pseudos du dépôt (data/equipe.json), écrit par l'application : il doit rester lisible,
// sinon la mise en ligne est bloquée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeTeam } from '../src/team.js';

test('data/equipe.json : 5 pseudos propres, rien d’autre', () => {
  const raw = JSON.parse(readFileSync(new URL('../data/equipe.json', import.meta.url), 'utf8'));
  assert.deepEqual(sanitizeTeam(raw), raw);
  assert.equal(raw.pseudos.length, 5);
});
