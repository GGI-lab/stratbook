// Trajets continus entre étapes, pour l'animation. Fonctions pures, testées dans tests/routes.test.js.
//
// Principe : chaque joueur a une position à la fin de chaque étape. L'étape 0 est le départ
// (début du tracé de l'étape 1). Le trajet de l'étape n part de la position n-1 et finit
// à la position n, en passant par les points intermédiaires du tracé dessiné s'il existe.

const NEAR = 40; // px : un point de tracé aussi proche d'une extrémité est remplacé par celle-ci

const dist = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
const stepOf = (strategy, n) => strategy.steps.find((s) => s.n === n);

export const firstStep = (strategy) => strategy.steps[0].n;
export const lastStep = (strategy) => strategy.steps.at(-1).n;

/**
 * Position de chaque joueur à la fin de l'étape n (n = 0 : départ).
 * Départ : champ `start` s'il existe (stratégies de l'éditeur), sinon début du tracé de l'étape 1.
 */
export function positionAt(strategy, n, role) {
  if (n === 0) {
    if (strategy.start?.[role]) return strategy.start[role];
    const s1 = strategy.steps[0].map;
    const move = s1.moves.find((m) => m.role === role);
    return move ? move.path[0] : s1.positions[role];
  }
  return stepOf(strategy, n).map.positions[role];
}

/** Point regardé à la fin de l'étape n (au départ, on regarde comme à l'étape 1). */
export function lookAt(strategy, n, role) {
  return stepOf(strategy, n === 0 ? firstStep(strategy) : n).map.look[role];
}

/** Trajet de l'étape n-1 vers l'étape n pour un joueur : liste de points [x, y]. */
export function segmentRoute(strategy, n, role) {
  const start = positionAt(strategy, n - 1, role);
  const end = positionAt(strategy, n, role);
  const move = stepOf(strategy, n).map.moves.find((m) => m.role === role);
  const middle = (move?.path ?? []).filter((p) => dist(p, start) > NEAR && dist(p, end) > NEAR);
  return [start, ...middle, end];
}

/**
 * Suite de segments pour passer de l'étape `from` à l'étape `to`, dans les deux sens.
 * Exemple : 1 → 4 donne [2, 3, 4] en avant ; 4 → 1 donne [4, 3, 2] en arrière.
 * Chaque segment { n, reverse } : rejouer le trajet de l'étape n, à l'envers si reverse.
 */
export function transitionPlan(from, to) {
  const plan = [];
  if (to > from) for (let n = from + 1; n <= to; n++) plan.push({ n, reverse: false });
  if (to < from) for (let n = from; n > to; n--) plan.push({ n, reverse: true });
  return plan;
}

/** Angle (degrés) d'un joueur placé en `pos` qui regarde `look`. */
export const facing = (pos, look) => (Math.atan2(look[1] - pos[1], look[0] - pos[0]) * 180) / Math.PI;

/** Interpolation d'angle par le plus court chemin (degrés). */
export function lerpAngle(a, b, t) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Durée d'un segment : un saut de plusieurs étapes reste court au total. */
export function segmentDuration(segments, { single = 700, total = 1500, min = 380 } = {}) {
  if (segments <= 1) return single;
  return Math.max(min, Math.round(total / segments));
}
