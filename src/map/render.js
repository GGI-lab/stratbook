// Rendu SVG d'une étape. Fonction pure (renvoie une chaîne), utilisable
// dans le navigateur comme dans les tests et l'aperçu Node.
// Inspiration visuelle : cs2.cam (carte en gris, seuls les joueurs en couleur, pastille
// orientée) et stratbook.pro (tracés courbes, utilitaires discrets).
import { BACKGROUND, VIEWBOX, ZONES } from './dust2.js';

export const PLAYER_COLORS = {
  j1: '#4ADE80',
  j2: '#FB923C',
  j3: '#FACC15',
  j4: '#F472B6',
  j5: '#60A5FA',
};

// Trait distinct par joueur, pour ne pas dépendre de la couleur.
export const PLAYER_DASH = {
  j1: '',
  j2: '16 9',
  j3: '3 9',
  j4: '20 7 4 7',
  j5: '9 7',
};

const UTILITY_LETTER = { smoke: 'S', flash: 'F', molotov: 'M', bomb: 'C4' };
const UTILITY_NAME = { smoke: 'Smoke', flash: 'Flash', molotov: 'Molotov', bomb: 'Bombe' };

const C = {
  bg: '#0F1720',
  onColor: '#0B1118',
  surface: '#17212B',
  text: '#E8EEF4',
};

// Tailles en pixels de l'image (cadrage 600 de large, affiché ~360 px sur téléphone).
const R_PLAYER = 19;
const R_UTIL = 17;
const STROKE = 5;
const CONE_RADIUS = 150;
const CONE_HALF_ANGLE = 32; // degrés, cône de 64°

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const zoneById = Object.fromEntries(ZONES.map((z) => [z.id, z]));
const r1 = (n) => Math.round(n * 10) / 10;

// Courbe lisse passant par tous les points (Catmull-Rom convertie en Bézier).
export function smoothPath(points) {
  if (points.length < 3) return `M${points.map(([x, y]) => `${x},${y}`).join(' L')}`;
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${r1(c1[0])},${r1(c1[1])} ${r1(c2[0])},${r1(c2[1])} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// Angle (radians) du joueur vers le point regardé.
const angleTo = ([x, y], [tx, ty]) => Math.atan2(ty - y, tx - x);

function cone(uid, role, [x, y], look) {
  const a = angleTo([x, y], look);
  const h = (CONE_HALF_ANGLE * Math.PI) / 180;
  const p1 = [x + CONE_RADIUS * Math.cos(a - h), y + CONE_RADIUS * Math.sin(a - h)];
  const p2 = [x + CONE_RADIUS * Math.cos(a + h), y + CONE_RADIUS * Math.sin(a + h)];
  return `<path d="M${x},${y} L${r1(p1[0])},${r1(p1[1])} A${CONE_RADIUS},${CONE_RADIUS} 0 0 1 ${r1(p2[0])},${r1(p2[1])} Z" fill="url(#cone-${uid}-${role})"/>`;
}

function defs() {
  const markers = Object.entries(PLAYER_COLORS)
    .map(
      ([id, color]) =>
        `<marker id="arrow-${id}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.4" markerHeight="3.4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`,
    )
    .join('');
  return `<defs>${markers}</defs>`;
}

/**
 * @param {object} strategy  données de la stratégie (JSON)
 * @param {number} stepN     numéro d'étape (1 à 4)
 * @param {object} [opts]
 * @param {string|null} [opts.focus]  rôle mis en avant (j1..j5), null = vue équipe
 * @param {string} [opts.imageHref]   URL de l'image de fond
 */
export function renderStepSvg(strategy, stepN, opts = {}) {
  const focus = opts.focus ?? null;
  const href = opts.imageHref ?? BACKGROUND.href;
  const step = strategy.steps.find((s) => s.n === stepN);
  if (!step) throw new Error(`Étape ${stepN} introuvable`);
  const m = step.map;
  // Identifiant unique pour que plusieurs cartes puissent cohabiter dans une même page.
  const uid = `s${stepN}-${focus ?? 'equipe'}`;
  const dim = (role) => (focus && role !== focus ? ' opacity="0.28"' : '');
  // Joueur sélectionné dessiné en dernier pour rester au-dessus.
  const order = Object.keys(m.positions).sort((a, b) => (a === focus) - (b === focus));

  // Les dégradés radiaux sont centrés sur chaque joueur : un dégradé par joueur et par étape.
  const coneDefs = order
    .map((role) => {
      const [x, y] = m.positions[role];
      return `<radialGradient id="cone-${uid}-${role}" gradientUnits="userSpaceOnUse" cx="${x}" cy="${y}" r="${CONE_RADIUS}"><stop offset="0" stop-color="${PLAYER_COLORS[role]}" stop-opacity="0.5"/><stop offset="1" stop-color="${PLAYER_COLORS[role]}" stop-opacity="0"/></radialGradient>`;
    })
    .join('');

  const cones = order
    .map((role) => `<g${dim(role)}>${cone(uid, role, m.positions[role], m.look[role])}</g>`)
    .join('');

  const moves = m.moves
    .map(({ role, path }) => {
      const d = smoothPath(path);
      return `<g${dim(role)}><path d="${d}" fill="none" stroke="${C.bg}" stroke-width="${STROKE + 4}" stroke-linecap="round" opacity="0.7"/><path d="${d}" fill="none" stroke="${PLAYER_COLORS[role]}" stroke-width="${STROKE}" stroke-linecap="round" stroke-dasharray="${PLAYER_DASH[role]}" marker-end="url(#arrow-${role})"/></g>`;
    })
    .join('');

  const utils = m.utilities
    .map(({ type, by, zone, dx = 0, dy = 0 }) => {
      const z = zoneById[zone];
      if (!z) throw new Error(`Zone inconnue : ${zone}`);
      const [x, y] = [z.anchor[0] + dx, z.anchor[1] + dy];
      const letter = UTILITY_LETTER[type];
      const r = letter.length > 1 ? R_UTIL + 3 : R_UTIL;
      return `<g${dim(by)}><title>${esc(`${UTILITY_NAME[type]} (${by.toUpperCase()}) : ${z.name}`)}</title><circle cx="${x}" cy="${y}" r="${r}" fill="${C.surface}" stroke="${PLAYER_COLORS[by]}" stroke-width="4"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${letter.length > 1 ? 14 : 18}" font-weight="800" fill="${C.text}">${letter}</text></g>`;
    })
    .join('');

  const players = order
    .map((role) => {
      const [x, y] = m.positions[role];
      const deg = (angleTo([x, y], m.look[role]) * 180) / Math.PI;
      const color = PLAYER_COLORS[role];
      // Pastille orientée : un petit bec du côté où le joueur regarde.
      const beak = `<path d="M${x + R_PLAYER + 9},${y} L${x + R_PLAYER - 4},${y - 10} L${x + R_PLAYER - 4},${y + 10} Z" fill="${color}" stroke="${C.bg}" stroke-width="3" stroke-linejoin="round" transform="rotate(${r1(deg)} ${x} ${y})"/>`;
      const ring =
        role === focus
          ? `<circle cx="${x}" cy="${y}" r="${R_PLAYER + 8}" fill="none" stroke="${C.text}" stroke-width="4"/>`
          : '';
      return `<g class="player" data-role="${role}"${dim(role)}>${ring}${beak}<circle cx="${x}" cy="${y}" r="${R_PLAYER}" fill="${color}" stroke="${C.bg}" stroke-width="4"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="22" font-weight="800" fill="${C.onColor}">${role.slice(1)}</text></g>`;
    })
    .join('');

  const vb = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`;
  const { width, height } = BACKGROUND;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="Plan de Dust 2, étape ${stepN}" font-family="Inter, system-ui, sans-serif">${defs()}<defs>${coneDefs}</defs><g aria-hidden="true"><rect x="0" y="0" width="${width}" height="${height}" fill="${C.bg}"/><image href="${esc(href)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" opacity="0.75"/></g><g class="cones">${cones}</g><g class="moves">${moves}</g><g class="utilities">${utils}</g><g class="players">${players}</g></svg>`;
}
