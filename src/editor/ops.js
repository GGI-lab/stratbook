// Opérations de l'éditeur sur un brouillon de stratégie. Fonctions pures (le brouillon est modifié
// en place, aucune dépendance au navigateur), testées dans tests/editor.test.js.
//
// Règles :
// - chaque joueur a une position au départ (étape 0, champ `start`) et à la fin de chaque étape ;
// - le trajet d'une étape est recalculé automatiquement (couloirs de la carte) dès qu'une des deux
//   positions qu'il relie change ;
// - un joueur qui ne bougeait pas aux étapes suivantes suit la nouvelle position (il « reste sur place »).
import { positionAt } from '../map/routes.js';
import { computeRoute, getGrid, snapToWalkable } from '../map/nav.js';
import { ROLES, MAX_STEPS, blankStep, buildGroups, txt, DEFAULT_LABELS, frameOf } from '../model.js';
import { utilityPoint } from '../map/render.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const dist = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
const round = ([x, y]) => [Math.round(x), Math.round(y)];
const STILL = 8; // px : en dessous, le joueur ne bouge pas pendant l'étape (pas de tracé)
const LOOK_DISTANCE = 150;

/** Copie de travail : départ explicite, libellés par défaut, textes vides tolérés. */
export function prepareDraft(strategy) {
  const d = clone(strategy);
  d.start ??= Object.fromEntries(ROLES.map((r) => [r, [...positionAt(strategy, 0, r)]]));
  d.labels ??= clone(DEFAULT_LABELS);
  d.steps.forEach((s, i) => (s.n = i + 1));
  return d;
}

const stepAt = (d, n) => d.steps[n - 1];
const posRef = (d, n) => (n === 0 ? d.start : stepAt(d, n).map.positions);

/** Recalcule le trajet de `role` pendant l'étape n (de la position n-1 à la position n). */
export function recomputeMove(d, map, n, role) {
  if (n < 1 || n > d.steps.length) return;
  const m = stepAt(d, n).map;
  const from = positionAt(d, n - 1, role);
  const to = m.positions[role];
  const i = m.moves.findIndex((mv) => mv.role === role);
  if (dist(from, to) < STILL) {
    if (i >= 0) m.moves.splice(i, 1);
    return;
  }
  const path = map.nav ? computeRoute(map.nav, from, to).map(round) : [from, to];
  path[0] = [...from];
  path[path.length - 1] = [...to];
  const move = { role, path, ...(m.moves[i]?.pace === 'walk' ? { pace: 'walk' } : {}) };
  if (i >= 0) m.moves[i] = move;
  else m.moves.push(move);
  m.moves.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
}

/** Point regardé dans le prolongement de la fin du trajet. */
function lookAlong(path) {
  const end = path.at(-1);
  // Dernier point assez éloigné de l'arrivée pour donner une direction stable.
  const ref = [...path].reverse().find((p) => dist(p, end) > 20) ?? path[0];
  const d = dist(ref, end) || 1;
  return round([end[0] + ((end[0] - ref[0]) / d) * LOOK_DISTANCE, end[1] + ((end[1] - ref[1]) / d) * LOOK_DISTANCE]);
}

/**
 * Place `role` en `point` à l'étape n (0 = départ). Le point est ramené dans un couloir si besoin.
 * Les étapes suivantes où le joueur restait sur place suivent, puis les trajets touchés sont recalculés.
 */
export function setPosition(d, map, n, role, point) {
  const p = round(map.nav ? snapToWalkable(getGrid(map.nav), point) : point);
  const old = [...posRef(d, n)[role]];
  const delta = [p[0] - old[0], p[1] - old[1]];
  posRef(d, n)[role] = p;
  // Le joueur garde la même orientation s'il ne bouge pas pendant l'étape.
  const shiftLook = (k) => {
    const look = stepAt(d, k).map.look;
    look[role] = round([look[role][0] + delta[0], look[role][1] + delta[1]]);
  };
  let last = n;
  for (let k = n + 1; k <= d.steps.length; k++) {
    if (dist(stepAt(d, k).map.positions[role], old) >= 1) break;
    stepAt(d, k).map.positions[role] = [...p];
    shiftLook(k);
    last = k;
  }
  for (let k = Math.max(1, n); k <= Math.min(d.steps.length, last + 1); k++) recomputeMove(d, map, k, role);
  if (n >= 1) {
    const move = stepAt(d, n).map.moves.find((mv) => mv.role === role);
    if (move) stepAt(d, n).map.look[role] = lookAlong(move.path);
    else shiftLook(n);
  }
  return p;
}

export function setLook(d, n, role, point) {
  stepAt(d, n).map.look[role] = round(point);
}

export function setPace(d, n, role, pace) {
  const move = stepAt(d, n).map.moves.find((mv) => mv.role === role);
  if (!move) return;
  if (pace === 'walk') move.pace = 'walk';
  else delete move.pace;
}

export const movesDuring = (d, n, role) => Boolean(n >= 1 && stepAt(d, n).map.moves.some((mv) => mv.role === role));

/** Ajoute une étape à la fin : les joueurs y restent sur place, textes vides. */
export function addStep(d) {
  if (d.steps.length >= MAX_STEPS) return false;
  const last = d.steps.at(-1).map;
  d.steps.push(blankStep(d.steps.length + 1, last.positions, last.look));
  return true;
}

/** Supprime l'étape n ; les trajets de l'étape suivante repartent de la position précédente. */
export function removeStep(d, map, n) {
  if (d.steps.length <= 1 || n < 1 || n > d.steps.length) return false;
  d.steps.splice(n - 1, 1);
  d.steps.forEach((s, i) => (s.n = i + 1));
  if (n <= d.steps.length) for (const r of ROLES) recomputeMove(d, map, n, r);
  return true;
}

export function addUtility(d, n, { type, by, at }) {
  stepAt(d, n).map.utilities.push({ type, by, at: round(at) });
  return stepAt(d, n).map.utilities.length - 1;
}

export function moveUtility(d, map, n, index, point) {
  const u = stepAt(d, n).map.utilities[index];
  if (!u) return;
  const zoneById = Object.fromEntries(map.zones.map((z) => [z.id, z]));
  stepAt(d, n).map.utilities[index] = { type: u.type, by: u.by, at: round(point ?? utilityPoint(u, zoneById)) };
}

export function removeUtility(d, n, index) {
  stepAt(d, n).map.utilities.splice(index, 1);
}

/** Erreurs bloquantes avant l'enregistrement (liste vide = tout va bien). */
export function validateDraft(d) {
  const errors = [];
  if (!d.title.text.trim()) errors.push({ field: 'title', message: 'Donne un titre à la stratégie.' });
  if (d.steps.length < 1 || d.steps.length > MAX_STEPS) errors.push({ field: 'steps', message: `De 1 à ${MAX_STEPS} étapes.` });
  return errors;
}

/** Version propre à enregistrer : textes nettoyés, lignes vides retirées, groupes et cadrage à jour. */
export function finalizeDraft(d, map) {
  const s = clone(d);
  const clean = (t) => ({ ...t, text: t.text.replace(/\s+/g, ' ').trim() });
  const keep = (list) => list.map(clean).filter((t) => t.text);
  s.title = clean(s.title);
  for (const r of ROLES) {
    const role = s.roles[r];
    role.title = clean(role.title);
    role.summary = clean(role.summary);
    role.utilities = keep(role.utilities);
  }
  s.steps.forEach((st, i) => {
    st.n = i + 1;
    st.title = clean(st.title);
    if (!st.title.text) st.title = txt(`Étape ${i + 1}`);
    st.team = keep(st.team);
    st.calls = keep(st.calls);
    for (const r of ROLES) st.roles[r] = keep(st.roles[r] ?? []);
  });
  s.groups = buildGroups(s);
  // Un cadrage partiel (ex. moitié droite) ne doit rien couper : sinon, map entière.
  if (s.frame) {
    const f = frameOf(s, map);
    const zoneById = Object.fromEntries(map.zones.map((z) => [z.id, z]));
    const inside = ([x, y]) => x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height;
    const points = [
      ...Object.values(s.start),
      ...s.steps.flatMap((st) => [
        ...Object.values(st.map.positions),
        ...st.map.moves.flatMap((mv) => mv.path),
        ...st.map.utilities.map((u) => utilityPoint(u, zoneById)),
      ]),
    ];
    if (!points.every(inside)) delete s.frame;
  }
  return s;
}
