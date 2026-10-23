// Validation générique : s'applique à TOUTE stratégie du dossier strategies/, y compris celles publiées
// depuis l'application (un commit par enregistrement). Elle vérifie que le fichier est bien formé
// et lisible par l'application, pas qu'il est « complet » : une stratégie en cours (1 étape, textes vides)
// doit pouvoir être publiée sans bloquer la mise en ligne. Split A a ses propres tests (tests/data.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { MAPS } from '../src/map/maps.js';
import { sanitizeStrategy, createStrategy } from '../src/model.js';
import { DUST2 } from '../src/map/dust2.js';
import { finalizeDraft, setPosition, setVia, addStep, addUtility } from '../src/editor/ops.js';
import { fileText } from '../src/github.js';

const DIR = new URL('../strategies/', import.meta.url);
const ROLES = ['j1', 'j2', 'j3', 'j4', 'j5'];
const UTILITY_TYPES = new Set(['smoke', 'flash', 'molotov', 'bomb']);
const GROUPS = new Set(['long', 'short', 'mid', 'a', 'b', 'all']);
const NEAR = 60; // px : un tracé doit partir de la position précédente et finir près de la nouvelle

const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const dist = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
const isSourced = (t) => t && typeof t.text === 'string' && ['pdf', 'ajout'].includes(t.source);
const isText = (t) => isSourced(t) && t.text.trim();

test('au moins une stratégie, ids uniques et égaux au nom du fichier', () => {
  assert.ok(files.length > 0);
  for (const f of files) {
    const s = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
    assert.equal(`${s.id}.json`, f);
  }
});

/** Vérifications d'un fichier de stratégie (dépôt ou publié depuis l'application). */
function checkStrategy(s, label = s.id) {
  const map = MAPS[s.map];
  const zones = new Set(map?.zones.map((z) => z.id) ?? []);
  const vb = map?.viewBox;
  const inFrame = ([x, y]) => x >= vb.x && x <= vb.x + vb.width && y >= vb.y && y <= vb.y + vb.height;

  test(`${label} : fichier bien formé, lu tel quel par l'application`, () => {
    assert.ok(map, `carte inconnue : ${s.map}`);
    assert.deepEqual(sanitizeStrategy(s), s, 'champs inattendus ou invalides');
  });

  test(`${label} : 1 à 5 étapes numérotées dans l'ordre, 5 rôles avec un groupe`, () => {
    assert.ok(s.steps.length >= 1 && s.steps.length <= 5, `${s.steps.length} étapes`);
    assert.deepEqual(s.steps.map((x) => x.n), s.steps.map((_, i) => i + 1));
    assert.deepEqual(Object.keys(s.roles).sort(), ROLES);
    for (const r of ROLES) assert.ok(s.groups.some((g) => g.id === s.roles[r].group && g.players.includes(r)), `${r} sans groupe`);
  });

  test(`${label} : textes sourcés, groupes connus`, () => {
    const all = [s.side, s.title, ...ROLES.flatMap((r) => [s.roles[r].title, s.roles[r].summary, ...s.roles[r].utilities])];
    for (const st of s.steps) {
      all.push(st.title, ...st.team, ...st.calls, ...ROLES.flatMap((r) => st.roles[r] ?? []));
      assert.ok([...st.team, ...st.calls].every((t) => GROUPS.has(t.group)), `étape ${st.n} : groupe inconnu`);
    }
    assert.ok(all.every(isSourced), 'texte sans source pdf ou ajout');
    assert.ok(isText(s.title), 'titre');
  });

  test(`${label} : carte de chaque étape (positions, regards, tracés, utilitaires)`, () => {
    for (const st of s.steps) {
      const m = st.map;
      for (const r of ROLES) {
        assert.ok(m.positions[r] && inFrame(m.positions[r]), `étape ${st.n}, ${r} : position`);
        assert.equal(m.look[r]?.length, 2, `étape ${st.n}, ${r} : regard`);
      }
      for (const u of m.utilities) {
        const placed = Array.isArray(u.at) ? inFrame(u.at) : zones.has(u.zone); // point libre (éditeur) ou zone nommée
        assert.ok(UTILITY_TYPES.has(u.type) && ROLES.includes(u.by) && placed, `étape ${st.n} : ${JSON.stringify(u)}`);
      }
      for (const mv of m.moves) {
        assert.ok(ROLES.includes(mv.role) && mv.path.length >= 2, `étape ${st.n} : tracé ${mv.role}`);
        assert.ok(mv.path.every(inFrame), `étape ${st.n} : tracé ${mv.role} hors cadre`);
        assert.ok([undefined, 'run', 'walk'].includes(mv.pace), `étape ${st.n} : allure ${mv.pace}`);
      }
    }
  });

  test(`${label} : trajets continus (base de l'animation)`, () => {
    s.steps.forEach((st, i) => {
      for (const mv of st.map.moves) {
        const end = mv.path.at(-1);
        assert.ok(dist(end, st.map.positions[mv.role]) <= NEAR, `étape ${st.n}, ${mv.role} : le tracé ne finit pas à la position`);
        if (i > 0) {
          const prev = s.steps[i - 1].map.positions[mv.role];
          assert.ok(dist(mv.path[0], prev) <= NEAR, `étape ${st.n}, ${mv.role} : le tracé ne part pas de la position précédente`);
        }
      }
    });
  });
}

for (const f of files) checkStrategy(JSON.parse(readFileSync(new URL(f, DIR), 'utf8')));

// Ce que l'éditeur publie passe la même validation (sinon la mise en ligne serait bloquée) :
// stratégie neuve à 1 étape et textes vides, puis avec un joueur déplacé, un point de passage et un utilitaire.
{
  const d = createStrategy({ side: 'ct' });
  d.title.text = 'Retake B';
  checkStrategy(JSON.parse(fileText(sanitizeStrategy({ ...finalizeDraft(d, DUST2), updatedAt: 1761200000000 }))), 'publiée vide');
  setPosition(d, DUST2, 1, 'j1', [150, 200]);
  setVia(d, DUST2, 1, 'j1', [300, 230]);
  addStep(d);
  addUtility(d, 2, { type: 'smoke', by: 'j2', at: [260, 200] });
  checkStrategy(JSON.parse(fileText(sanitizeStrategy({ ...finalizeDraft(d, DUST2), updatedAt: 1761200000000 }))), 'publiée remplie');
}
