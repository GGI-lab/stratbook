// Validation générique : s'applique à TOUTE stratégie déposée dans strategies/.
// Une nouvelle stratégie incomplète fait échouer les tests, donc la publication.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { MAPS } from '../src/map/maps.js';

const DIR = new URL('../strategies/', import.meta.url);
const ROLES = ['j1', 'j2', 'j3', 'j4', 'j5'];
const UTILITY_TYPES = new Set(['smoke', 'flash', 'molotov', 'bomb']);
const GROUPS = new Set(['long', 'short', 'mid', 'a', 'b', 'all']);
const NEAR = 60; // px : un tracé doit partir de la position précédente et finir près de la nouvelle

const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const dist = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
const isText = (t) => t && typeof t.text === 'string' && t.text.trim() && ['pdf', 'ajout'].includes(t.source);

test('au moins une stratégie, ids uniques et égaux au nom du fichier', () => {
  assert.ok(files.length > 0);
  for (const f of files) {
    const s = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
    assert.equal(`${s.id}.json`, f);
  }
});

for (const f of files) {
  const s = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
  const map = MAPS[s.map];
  const zones = new Set(map?.zones.map((z) => z.id) ?? []);
  const vb = map?.viewBox;
  const inFrame = ([x, y]) => x >= vb.x && x <= vb.x + vb.width && y >= vb.y && y <= vb.y + vb.height;

  test(`${s.id} : carte connue, titre et textes d'interface`, () => {
    assert.ok(map, `carte inconnue : ${s.map}`);
    for (const k of ['side', 'title']) assert.ok(isText(s[k]), k);
    assert.ok(isText(s.labels?.noNewInstruction) && isText(s.labels?.utilitiesHeading));
  });

  test(`${s.id} : 3 à 5 étapes numérotées dans l'ordre`, () => {
    assert.ok(s.steps.length >= 3 && s.steps.length <= 5, `${s.steps.length} étapes`);
    assert.deepEqual(s.steps.map((x) => x.n), s.steps.map((_, i) => i + 1));
  });

  test(`${s.id} : 5 rôles complets`, () => {
    assert.deepEqual(Object.keys(s.roles).sort(), ROLES);
    for (const r of ROLES) {
      const role = s.roles[r];
      assert.ok(isText(role.title) && isText(role.summary), r);
      assert.ok(Array.isArray(role.utilities) && role.utilities.every(isText), r);
      assert.ok(s.groups.some((g) => g.id === role.group && g.players.includes(r)), `${r} sans groupe`);
    }
  });

  test(`${s.id} : chaque étape a un plan, des consignes par rôle et des textes sourcés`, () => {
    for (const st of s.steps) {
      assert.ok(isText(st.title), `étape ${st.n} : titre`);
      assert.ok(st.team.length > 0 && st.team.every((t) => isText(t) && GROUPS.has(t.group)), `étape ${st.n} : plan`);
      assert.ok(st.calls.every((c) => isText(c) && GROUPS.has(c.group)), `étape ${st.n} : appels`);
      for (const r of ROLES) assert.ok(Array.isArray(st.roles[r]) && st.roles[r].every(isText), `étape ${st.n}, ${r}`);
    }
  });

  test(`${s.id} : carte de chaque étape (positions, regards, tracés, utilitaires)`, () => {
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

  test(`${s.id} : trajets continus (base de l'animation)`, () => {
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
