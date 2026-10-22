// Animation des joueurs entre deux étapes, dans le navigateur.
// La carte de l'étape d'arrivée est déjà affichée ; on replace les joueurs au point de départ,
// puis on les fait glisser le long de leurs trajets, étape intermédiaire par étape intermédiaire.
import { smoothPath, placePlayer, placeCone } from './render.js';
import {
  positionAt,
  lookAt,
  segmentRoute,
  transitionPlan,
  facing,
  lerpAngle,
  easeInOut,
  segmentDuration,
} from './routes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function setPose(svg, role, pos, deg) {
  const k = Number(svg.dataset.k) || 1; // échelle des jetons (cadrage large = jetons plus grands)
  svg.querySelector(`.player[data-role="${role}"]`)?.setAttribute('transform', placePlayer(pos, k));
  svg.querySelector(`.cone[data-role="${role}"]`)?.setAttribute('transform', placeCone(pos, deg, k));
}

/**
 * Anime la carte `svg` de l'étape `from` vers l'étape `to`.
 * Renvoie une fonction d'annulation. `onDone` est appelée à la fin (ou à l'annulation).
 */
export function animateTransition(svg, strategy, from, to, { onDone = () => {} } = {}) {
  const plan = transitionPlan(from, to);
  const roles = Object.keys(strategy.roles);
  if (!plan.length) {
    onDone();
    return () => {};
  }
  const duration = segmentDuration(plan.length);

  // Une courbe invisible par joueur et par segment, pour mesurer la position le long du trajet.
  const scratch = document.createElementNS(SVG_NS, 'g');
  scratch.setAttribute('visibility', 'hidden');
  svg.append(scratch);
  const segments = plan.map(({ n, reverse }) =>
    Object.fromEntries(
      roles.map((role) => {
        const route = segmentRoute(strategy, n, role);
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', smoothPath(reverse ? [...route].reverse() : route));
        scratch.append(path);
        const [a, b] = reverse ? [n, n - 1] : [n - 1, n];
        const startDeg = facing(positionAt(strategy, a, role), lookAt(strategy, a, role));
        const endDeg = facing(positionAt(strategy, b, role), lookAt(strategy, b, role));
        return [role, { path, length: path.getTotalLength(), startDeg, endDeg }];
      }),
    ),
  );

  svg.classList.add('is-moving');
  let index = 0;
  let t0 = null;
  let raf = 0;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    // Pose finale exacte, puis on réaffiche tracés et utilitaires.
    for (const role of roles)
      setPose(svg, role, positionAt(strategy, to, role), facing(positionAt(strategy, to, role), lookAt(strategy, to, role)));
    scratch.remove();
    svg.classList.remove('is-moving');
    onDone();
  };

  const frame = (now) => {
    t0 ??= now;
    const t = Math.min(1, (now - t0) / duration);
    const k = easeInOut(t);
    for (const [role, seg] of Object.entries(segments[index])) {
      const p = seg.path.getPointAtLength(seg.length * k);
      setPose(svg, role, [p.x, p.y], lerpAngle(seg.startDeg, seg.endDeg, k));
    }
    if (t < 1) raf = requestAnimationFrame(frame);
    else if (++index < segments.length) {
      t0 = null;
      raf = requestAnimationFrame(frame);
    } else finish();
  };

  // Départ : chaque joueur à sa position de l'étape `from`, avant la première image.
  for (const role of roles)
    setPose(svg, role, positionAt(strategy, from, role), facing(positionAt(strategy, from, role), lookAt(strategy, from, role)));
  raf = requestAnimationFrame(frame);
  return finish;
}
