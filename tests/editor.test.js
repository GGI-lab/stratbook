import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStrategy, sanitizeStrategy } from '../src/model.js';
import { DUST2 } from '../src/map/dust2.js';
import { positionAt, segmentRoute, transitionPlan } from '../src/map/routes.js';
import {
  prepareDraft,
  setPosition,
  setPace,
  addStep,
  removeStep,
  addUtility,
  removeUtility,
  validateDraft,
  finalizeDraft,
  movesDuring,
  setVia,
  clearVia,
  routeMidpoint,
} from '../src/editor/ops.js';
import { createHistory } from '../src/editor/history.js';

const splitA = JSON.parse(readFileSync(new URL('../strategies/d2-split-a.json', import.meta.url), 'utf8'));
const ROLES = ['j1', 'j2', 'j3', 'j4', 'j5'];
const dist = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);

/** Les trajets enchaînés relient bien chaque position à la suivante (base de l'animation). */
function assertContinuous(s) {
  for (const r of ROLES) {
    let pos = positionAt(s, 0, r);
    for (const { n } of transitionPlan(0, s.steps.length)) {
      const route = segmentRoute(s, n, r);
      assert.deepEqual(route[0], pos, `étape ${n}, ${r} : départ`);
      pos = route.at(-1);
      assert.deepEqual(pos, positionAt(s, n, r), `étape ${n}, ${r} : arrivée`);
    }
  }
}

test('déplacer un joueur crée un trajet calculé, qui suit les couloirs', () => {
  const d = createStrategy({ side: 't' });
  setPosition(d, DUST2, 1, 'j1', [895, 300]);
  const move = d.steps[0].map.moves.find((m) => m.role === 'j1');
  assert.ok(move, 'trajet créé');
  assert.ok(move.path.length > 2, 'avec des points de passage');
  assert.deepEqual(move.path[0], d.start.j1);
  assert.deepEqual(move.path.at(-1), d.steps[0].map.positions.j1);
  assert.ok(movesDuring(d, 1, 'j1'));
  assert.ok(!movesDuring(d, 1, 'j2'));
  assertContinuous(d);
});

test('le regard suit la fin du trajet', () => {
  const d = createStrategy({ side: 't' });
  setPosition(d, DUST2, 1, 'j1', [895, 300]); // fin du trajet : remonte Long vers le nord
  const [px, py] = d.steps[0].map.positions.j1;
  const [lx, ly] = d.steps[0].map.look.j1;
  assert.ok(ly < py - 50 && Math.abs(lx - px) < 120, `regard ${lx},${ly} depuis ${px},${py}`);
});

test("un joueur qui restait sur place aux étapes suivantes suit sa nouvelle position", () => {
  const d = createStrategy({ side: 'ct' });
  addStep(d);
  addStep(d);
  setPosition(d, DUST2, 1, 'j3', [460, 480]);
  assert.deepEqual(d.steps[1].map.positions.j3, d.steps[0].map.positions.j3);
  assert.deepEqual(d.steps[2].map.positions.j3, d.steps[0].map.positions.j3);
  assert.ok(!movesDuring(d, 2, 'j3') && !movesDuring(d, 3, 'j3'));
  // Déplacer le départ entraîne l'étape 1 si le joueur n'y bougeait pas.
  setPosition(d, DUST2, 0, 'j5', [520, 240]);
  assert.deepEqual(d.steps[0].map.positions.j5, d.start.j5);
  assertContinuous(d);
});

test('modifier une étape du milieu recalcule le trajet suivant', () => {
  const d = prepareDraft(splitA);
  setPosition(d, DUST2, 2, 'j4', [600, 380]);
  assertContinuous(d);
  // Les autres joueurs gardent leurs tracés faits à la main.
  assert.deepEqual(d.steps[0].map.moves.find((m) => m.role === 'j1'), splitA.steps[0].map.moves.find((m) => m.role === 'j1'));
});

test('un point lâché hors carte est ramené dans un couloir', () => {
  const d = createStrategy({ side: 't' });
  const p = setPosition(d, DUST2, 1, 'j2', [20, 20]);
  assert.notDeepEqual(p, [20, 20]);
});

test('allure shift, utilitaires, ajout et suppression d\'étape', () => {
  const d = createStrategy({ side: 't' });
  setPosition(d, DUST2, 1, 'j1', [632, 330]);
  setPace(d, 1, 'j1', 'walk');
  assert.equal(d.steps[0].map.moves[0].pace, 'walk');
  setPace(d, 1, 'j1', 'run');
  assert.equal(d.steps[0].map.moves[0].pace, undefined);
  const i = addUtility(d, 1, { type: 'smoke', by: 'j2', at: [640.4, 215.6] });
  assert.deepEqual(d.steps[0].map.utilities[i], { type: 'smoke', by: 'j2', at: [640, 216] });
  removeUtility(d, 1, i);
  assert.equal(d.steps[0].map.utilities.length, 0);

  for (let k = 0; k < 10; k++) addStep(d);
  assert.equal(d.steps.length, 5, '5 étapes au plus');
  setPosition(d, DUST2, 3, 'j2', [800, 160]);
  removeStep(d, DUST2, 2);
  assert.deepEqual(d.steps.map((s) => s.n), [1, 2, 3, 4]);
  assertContinuous(d);
});

test('enregistrement : titre obligatoire, lignes vides retirées, titres d\'étape par défaut', () => {
  const d = createStrategy({ side: 'ct' });
  assert.equal(validateDraft(d)[0].field, 'title');
  d.title.text = '  Retake   B ';
  d.steps[0].team.push({ group: 'b', text: '', source: 'ajout' }, { group: 'b', text: 'Tenir B', source: 'ajout' });
  d.steps[0].roles.j1 = [{ text: 'Fenêtre', source: 'ajout' }, { text: '', source: 'ajout' }];
  assert.deepEqual(validateDraft(d), []);
  const s = finalizeDraft(d, DUST2);
  assert.equal(s.title.text, 'Retake B');
  assert.equal(s.steps[0].title.text, 'Étape 1');
  assert.deepEqual(s.steps[0].team.map((t) => t.text), ['Tenir B']);
  assert.deepEqual(s.steps[0].roles.j1.map((t) => t.text), ['Fenêtre']);
  assert.ok(sanitizeStrategy(s));
});

test('cadrage partiel abandonné si un joueur sort du cadre', () => {
  const d = prepareDraft(splitA);
  assert.ok(finalizeDraft(d, DUST2).frame, 'cadrage gardé si tout est dedans');
  setPosition(d, DUST2, 4, 'j5', [150, 200]); // site B, hors de la moitié droite
  assert.equal(finalizeDraft(d, DUST2).frame, undefined);
});

test('la stratégie du dépôt reste identique si on ne touche à rien', () => {
  const s = finalizeDraft(prepareDraft(splitA), DUST2);
  for (const st of splitA.steps) assert.deepEqual(s.steps[st.n - 1].map, st.map);
  for (const r of ROLES) assert.ok(dist(s.start[r], positionAt(splitA, 0, r)) === 0);
});

// ---------- Points de passage ----------

const near = (path, [x, y], d = 1) => path.some(([px, py]) => Math.hypot(px - x, py - y) <= d);

test('point de passage : le trajet passe par lui, le regard suit la fin du trajet', () => {
  const d = createStrategy({ side: 't' });
  setPosition(d, DUST2, 1, 'j1', [895, 300]);
  const direct = structuredClone(d.steps[0].map.moves.find((m) => m.role === 'j1').path);
  assert.ok(setVia(d, DUST2, 1, 'j1', [462, 520]));
  const move = d.steps[0].map.moves.find((m) => m.role === 'j1');
  assert.equal(move.via.length, 1);
  assert.ok(near(move.path, move.via[0], 0), 'le point de passage est sur le trajet');
  assert.ok(Math.hypot(move.via[0][0] - 462, move.via[0][1] - 520) < 30, 'ramené dans un couloir, près du point voulu');
  assert.notDeepEqual(move.path, direct);
  assert.deepEqual(move.path[0], d.start.j1);
  assert.deepEqual(move.path.at(-1), d.steps[0].map.positions.j1);
  assertContinuous(d);
});

test("point de passage : gardé quand on déplace l'arrivée, retiré à la demande", () => {
  const d = createStrategy({ side: 't' });
  setPosition(d, DUST2, 1, 'j1', [895, 300]);
  const direct = structuredClone(d.steps[0].map.moves.find((m) => m.role === 'j1').path);
  setVia(d, DUST2, 1, 'j1', [462, 520]);
  const via = structuredClone(d.steps[0].map.moves.find((m) => m.role === 'j1').via);
  setPosition(d, DUST2, 1, 'j1', [880, 280]);
  const moved = d.steps[0].map.moves.find((m) => m.role === 'j1');
  assert.deepEqual(moved.via, via);
  assert.ok(near(moved.path, via[0], 0));
  setPosition(d, DUST2, 1, 'j1', [895, 300]);
  assert.ok(clearVia(d, DUST2, 1, 'j1'));
  const back = d.steps[0].map.moves.find((m) => m.role === 'j1');
  assert.equal('via' in back, false);
  assert.deepEqual(back.path, direct, 'retour au plus court chemin');
  assert.equal(clearVia(d, DUST2, 1, 'j1'), false, 'plus rien à retirer');
});

test("point de passage : impossible si le joueur ne bouge pas ; nettoyé et gardé à l'enregistrement", () => {
  const d = createStrategy({ side: 't' });
  assert.equal(setVia(d, DUST2, 1, 'j2', [462, 520]), false);
  setPosition(d, DUST2, 1, 'j1', [895, 300]);
  setVia(d, DUST2, 1, 'j1', [462, 520]);
  d.title.text = 'Via';
  const saved = sanitizeStrategy(finalizeDraft(d, DUST2));
  assert.deepEqual(saved.steps[0].map.moves.find((m) => m.role === 'j1').via, d.steps[0].map.moves.find((m) => m.role === 'j1').via);
});

test('mi-parcours : point au milieu de la longueur du trajet', () => {
  assert.deepEqual(routeMidpoint([[0, 0], [100, 0]]), [50, 0]);
  assert.deepEqual(routeMidpoint([[0, 0], [10, 0], [10, 90]]), [10, 40]);
  assert.deepEqual(routeMidpoint([[5, 5], [5, 5]]), [5, 5]);
});

// ---------- Défaire / Refaire ----------
test('historique : défaire, refaire, une nouvelle action efface ce qui pouvait être refait', () => {
  const h = createHistory(3);
  assert.equal(h.canUndo, false);
  assert.equal(h.undo('a'), null);
  h.record('a');
  h.record('a'); // même état : une seule entrée
  h.record('b');
  assert.equal(h.undo('c'), 'b');
  assert.equal(h.canRedo, true);
  assert.equal(h.redo('b'), 'c');
  assert.equal(h.undo('c'), 'b');
  h.record('x');
  assert.equal(h.canRedo, false);
  // Limite : les plus anciennes entrées tombent.
  h.record('y');
  h.record('z');
  const seen = [];
  for (let s = h.undo('now'); s; s = h.undo(s)) seen.push(s);
  assert.deepEqual(seen, ['z', 'y', 'x']);
});
