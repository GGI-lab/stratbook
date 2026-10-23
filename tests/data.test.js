import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(
  readFileSync(new URL('./fixtures/strategies/d2-split-a.json', import.meta.url), 'utf8'),
);
const ROLES = ['j1', 'j2', 'j3', 'j4', 'j5'];
const SOURCES = new Set(['pdf', 'ajout']);

// Parcourt tout le fichier et renvoie chaque objet texte { text, source }.
function textNodes(node, path = '$', out = []) {
  if (Array.isArray(node)) node.forEach((v, i) => textNodes(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') {
    if ('text' in node) out.push({ path, node });
    for (const [k, v] of Object.entries(node)) textNodes(v, `${path}.${k}`, out);
  }
  return out;
}

test('chaque texte a une source pdf ou ajout', () => {
  for (const { path, node } of textNodes(data)) {
    assert.ok(typeof node.text === 'string' && node.text.trim(), `${path} : texte vide`);
    assert.ok(SOURCES.has(node.source), `${path} : source "${node.source}" invalide`);
  }
});

test('4 étapes numérotées de 1 à 4', () => {
  assert.deepEqual(data.steps.map((s) => s.n), [1, 2, 3, 4]);
});

test('les 40 états ont un contenu ou la mention « Pas de nouvelle consigne »', () => {
  assert.ok(data.labels.noNewInstruction.text);
  let states = 0;
  for (const step of data.steps) {
    for (const role of ROLES) {
      // Vue équipe avec ce rôle mis en avant : le plan collectif de l'étape doit exister.
      assert.ok(step.team.length > 0, `étape ${step.n} : plan collectif vide`);
      states++;
      // Vue rôle : la clé doit exister (liste vide = « Pas de nouvelle consigne »).
      assert.ok(Array.isArray(step.roles[role]), `étape ${step.n}, ${role} : entrée manquante`);
      states++;
    }
  }
  assert.equal(states, 40);
});

test('cases sans consigne attendues : J1 étape 3, J4 étape 4, et seulement elles', () => {
  const empty = [];
  for (const step of data.steps)
    for (const role of ROLES) if (step.roles[role].length === 0) empty.push(`${role}@${step.n}`);
  assert.deepEqual(empty.sort(), ['j1@3', 'j4@4']);
});

test('groupes 3 Long + 2 Short', () => {
  const g = Object.fromEntries(data.groups.map((x) => [x.id, x.players]));
  assert.deepEqual(g.long, ['j1', 'j2', 'j3']);
  assert.deepEqual(g.short, ['j4', 'j5']);
});

test('appels vocaux du PDF présents', () => {
  const calls = data.steps.flatMap((s) => s.calls.map((c) => c.text));
  assert.deepEqual(calls, ['Long go', 'Mid clear', 'CT smoké', 'Short prise', 'Go site']);
});

test('aucun texte ne dit que J2 porte la bombe', () => {
  for (const { node } of textNodes(data)) assert.doesNotMatch(node.text, /\bporte\b.*bombe/i);
});
