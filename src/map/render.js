// Rendu SVG d'une étape. Fonction pure (renvoie une chaîne), utilisable
// dans le navigateur comme dans les tests et l'aperçu Node.
// Inspiration visuelle : cs2.cam (carte en gris, seuls les joueurs en couleur, cône de vision)
// et stratbook.pro (tracés courbes, utilitaires discrets).
import { getMap } from './maps.js';
import { facing, segmentRoute } from './routes.js';

// Largeur de cadrage de référence : au-delà (map entière), jetons et traits grossissent
// pour garder la même taille à l'écran.
const REF_WIDTH = 590;
export const scaleFor = (frame) => Math.max(1, frame.width / REF_WIDTH);

export const PLAYER_COLORS = {
  j1: '#4ADE80',
  j2: '#FB923C',
  j3: '#FACC15',
  j4: '#F472B6',
  j5: '#60A5FA',
};

// Allure du déplacement : trait plein = avance normale, pointillés = shift (marche lente).
export const PACE_DASH = { run: '', walk: '0.1 11' };

export const UTILITY_LETTER = { smoke: 'S', flash: 'F', molotov: 'M', bomb: 'C4' };
export const UTILITY_NAME = { smoke: 'Smoke', flash: 'Flash', molotov: 'Molotov', bomb: 'Bombe' };

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

// Cône de vision dessiné à l'origine, pointé vers la droite ; placé et orienté par transform.
const H = (CONE_HALF_ANGLE * Math.PI) / 180;
const CONE_D = `M0,0 L${r1(CONE_RADIUS * Math.cos(H))},${r1(-CONE_RADIUS * Math.sin(H))} A${CONE_RADIUS},${CONE_RADIUS} 0 0 1 ${r1(CONE_RADIUS * Math.cos(H))},${r1(CONE_RADIUS * Math.sin(H))} Z`;

/** Transformations qui placent un joueur et son cône (utilisées aussi par l'animation). */
const sc = (k) => (k && k !== 1 ? ` scale(${r1(k * 100) / 100})` : '');
export const placePlayer = ([x, y], k = 1) => `translate(${r1(x)} ${r1(y)})${sc(k)}`;
export const placeCone = ([x, y], deg, k = 1) => `translate(${r1(x)} ${r1(y)}) rotate(${r1(deg)})${sc(k)}`;

/** Position d'un utilitaire : point libre (`at`) ou zone nommée décalée de dx, dy. */
export function utilityPoint(u, zoneById) {
  if (u.at) return u.at;
  const z = zoneById[u.zone];
  if (!z) throw new Error(`Zone inconnue : ${u.zone}`);
  return [z.anchor[0] + (u.dx ?? 0), z.anchor[1] + (u.dy ?? 0)];
}

/**
 * @param {object} strategy  données de la stratégie (JSON)
 * @param {number} stepN     numéro d'étape (1 à 4)
 * @param {object} [opts]
 * @param {string|null} [opts.focus]  rôle mis en avant (j1..j5), null = vue équipe
 * @param {string} [opts.imageHref]   URL de l'image de fond
 * @param {object} [opts.map]         carte (par défaut celle de la stratégie)
 * @param {object} [opts.frame]       cadrage (par défaut celui de la stratégie, sinon la carte entière)
 * @param {string|null} [opts.highlight] rôle entouré sans atténuer les autres (éditeur)
 * @param {string} [opts.uid]         préfixe des identifiants internes (plusieurs cartes dans la page)
 */
export function renderStepSvg(strategy, stepN, opts = {}) {
  const focus = opts.focus ?? null;
  const map = opts.map ?? getMap(strategy.map);
  const BACKGROUND = map.background;
  const VIEWBOX = opts.frame ?? strategy.frame ?? map.viewBox;
  const k = scaleFor(VIEWBOX);
  const zoneById = Object.fromEntries(map.zones.map((z) => [z.id, z]));
  const href = opts.imageHref ?? BACKGROUND.href;
  const step = strategy.steps.find((s) => s.n === stepN);
  if (!step) throw new Error(`Étape ${stepN} introuvable`);
  const m = step.map;
  // Identifiant unique pour que plusieurs cartes puissent cohabiter dans une même page.
  const uid = `${opts.uid ?? 's'}${stepN}-${focus ?? 'equipe'}`;
  const ringRole = opts.highlight ?? focus;
  const dim = (role) => (focus && role !== focus ? ' opacity="0.28"' : '');
  // Joueur sélectionné dessiné en dernier pour rester au-dessus.
  const order = Object.keys(m.positions).sort((a, b) => (a === ringRole) - (b === ringRole));

  // Dégradé centré sur l'origine du cône (coordonnées locales, suit donc le joueur).
  const coneDefs = order
    .map(
      (role) =>
        `<radialGradient id="cone-${uid}-${role}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${CONE_RADIUS}"><stop offset="0" stop-color="${PLAYER_COLORS[role]}" stop-opacity="0.5"/><stop offset="1" stop-color="${PLAYER_COLORS[role]}" stop-opacity="0"/></radialGradient>`,
    )
    .join('');

  const deg = (role) => facing(m.positions[role], m.look[role]);
  const dash = (pace) => (pace === 'walk' ? `0.1 ${r1(11 * k)}` : '');
  const cones = order
    .map(
      (role) =>
        `<g class="cone" data-role="${role}" transform="${placeCone(m.positions[role], deg(role), k)}"${dim(role)}><path d="${CONE_D}" fill="url(#cone-${uid}-${role})"/></g>`,
    )
    .join('');

  // Le trait relie la position de l'étape précédente au joueur, sans flèche : il touche la pastille.
  const moves = m.moves
    .map(({ role, pace = 'run' }) => {
      const d = smoothPath(segmentRoute(strategy, stepN, role));
      return `<g class="move" data-role="${role}" data-pace="${pace}"${dim(role)}><path d="${d}" fill="none" stroke="${C.bg}" stroke-width="${r1((STROKE + 4) * k)}" stroke-linecap="round" stroke-dasharray="${dash(pace)}" opacity="0.7"/><path d="${d}" fill="none" stroke="${PLAYER_COLORS[role]}" stroke-width="${r1(STROKE * k)}" stroke-linecap="round" stroke-dasharray="${dash(pace)}"/></g>`;
    })
    .join('');

  const utils = m.utilities
    .map((u, i) => {
      const { type, by } = u;
      const [x, y] = utilityPoint(u, zoneById);
      const where = u.zone ? ` : ${zoneById[u.zone].name}` : '';
      const letter = UTILITY_LETTER[type];
      const r = r1((letter.length > 1 ? R_UTIL + 3 : R_UTIL) * k);
      return `<g class="utility" data-index="${i}"${dim(by)}><title>${esc(`${UTILITY_NAME[type]} (${by.toUpperCase()})${where}`)}</title><circle cx="${x}" cy="${y}" r="${r}" fill="${C.surface}" stroke="${PLAYER_COLORS[by]}" stroke-width="${r1(4 * k)}"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${r1((letter.length > 1 ? 14 : 18) * k)}" font-weight="800" fill="${C.text}">${letter}</text></g>`;
    })
    .join('');

  const players = order
    .map((role) => {
      const color = PLAYER_COLORS[role];
      const ring =
        role === ringRole ? `<circle r="${R_PLAYER + 8}" fill="none" stroke="${C.text}" stroke-width="4"/>` : '';
      return `<g class="player" data-role="${role}" transform="${placePlayer(m.positions[role], k)}"${dim(role)}>${ring}<circle r="${R_PLAYER}" fill="${color}" stroke="${C.bg}" stroke-width="4"/><text text-anchor="middle" dominant-baseline="central" font-size="22" font-weight="800" fill="${C.onColor}">${role.slice(1)}</text></g>`;
    })
    .join('');

  const vb = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`;
  const { width, height } = BACKGROUND;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" data-k="${k}" role="img" aria-label="Plan de ${esc(map.name)}, étape ${stepN}" font-family="Inter, system-ui, sans-serif"><defs>${coneDefs}</defs><g aria-hidden="true"><rect x="0" y="0" width="${width}" height="${height}" fill="${C.bg}"/><image href="${esc(href)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" opacity="0.75"/></g><g class="cones">${cones}</g><g class="moves">${moves}</g><g class="utilities">${utils}</g><g class="players">${players}</g></svg>`;
}
