// Rendu SVG d'une étape. Fonction pure (renvoie une chaîne), utilisable
// dans le navigateur comme dans les tests et l'aperçu Node.
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
  chip: 'rgba(15,23,32,0.82)',
  label: '#E8EEF4',
  onColor: '#0B1118',
  surface: '#17212B',
};

// Tailles en pixels de l'image (cadrage 600 de large, affiché ~360 px sur téléphone).
const R_PLAYER = 21;
const R_UTIL = 18;
const STROKE = 6;
const LABEL_SIZE = 19;

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const zoneById = Object.fromEntries(ZONES.map((z) => [z.id, z]));
const pts = (path) => path.map(([x, y]) => `${x},${y}`).join(' ');

function background(href) {
  const { width, height } = BACKGROUND;
  // Voile sombre léger pour faire ressortir tracés et étiquettes.
  return `<rect x="0" y="0" width="${width}" height="${height}" fill="${C.bg}"/><image href="${esc(href)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/><rect x="0" y="0" width="${width}" height="${height}" fill="${C.bg}" opacity="0.28"/>`;
}

function labels() {
  return ZONES.map(({ name, labelAt: [x, y] }) => {
    const w = name.length * LABEL_SIZE * 0.56 + 14;
    const h = LABEL_SIZE + 10;
    return `<g><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${C.chip}"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${LABEL_SIZE}" font-weight="600" fill="${C.label}">${esc(name)}</text></g>`;
  }).join('');
}

function defs() {
  const markers = Object.entries(PLAYER_COLORS)
    .map(
      ([id, color]) =>
        `<marker id="arrow-${id}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`,
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
  const dim = (role) => (focus && role !== focus ? ' opacity="0.3"' : '');

  const moves = m.moves
    .map(
      ({ role, path }) =>
        `<g${dim(role)}><polyline points="${pts(path)}" fill="none" stroke="${C.bg}" stroke-width="${STROKE + 4}" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/><polyline points="${pts(path)}" fill="none" stroke="${PLAYER_COLORS[role]}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${PLAYER_DASH[role]}" marker-end="url(#arrow-${role})"/></g>`,
    )
    .join('');

  const utils = m.utilities
    .map(({ type, by, zone, dx = 0, dy = 0 }) => {
      const z = zoneById[zone];
      if (!z) throw new Error(`Zone inconnue : ${zone}`);
      const [x, y] = [z.anchor[0] + dx, z.anchor[1] + dy];
      const letter = UTILITY_LETTER[type];
      const r = letter.length > 1 ? R_UTIL + 3 : R_UTIL;
      return `<g${dim(by)}><title>${esc(`${UTILITY_NAME[type]} (${by.toUpperCase()}) : ${z.name}`)}</title><circle cx="${x}" cy="${y}" r="${r}" fill="${C.surface}" stroke="${PLAYER_COLORS[by]}" stroke-width="5"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${letter.length > 1 ? 15 : 19}" font-weight="800" fill="#E8EEF4">${letter}</text></g>`;
    })
    .join('');

  // Joueur sélectionné dessiné en dernier pour rester au-dessus.
  const order = Object.keys(m.positions).sort((a, b) => (a === focus) - (b === focus));
  const players = order
    .map((role) => {
      const [x, y] = m.positions[role];
      const ring =
        role === focus
          ? `<circle cx="${x}" cy="${y}" r="${R_PLAYER + 7}" fill="none" stroke="#E8EEF4" stroke-width="4"/>`
          : '';
      return `<g class="player" data-role="${role}"${dim(role)}>${ring}<circle cx="${x}" cy="${y}" r="${R_PLAYER}" fill="${PLAYER_COLORS[role]}" stroke="${C.bg}" stroke-width="4"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="24" font-weight="800" fill="${C.onColor}">${role.slice(1)}</text></g>`;
    })
    .join('');

  const vb = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb}" role="img" aria-label="Plan de Dust 2, étape ${stepN}" font-family="Inter, system-ui, sans-serif">${defs()}<g aria-hidden="true">${background(href)}${labels()}</g><g class="moves">${moves}</g><g class="utilities">${utils}</g><g class="players">${players}</g></svg>`;
}
