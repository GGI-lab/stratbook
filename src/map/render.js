// Rendu SVG d'une étape. Fonction pure (renvoie une chaîne), utilisable
// dans le navigateur comme dans les tests et l'aperçu Node.
import { VIEWBOX, CORRIDORS, ZONES } from './dust2.js';

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
  j2: '9 5',
  j3: '2 5',
  j4: '12 4 2 4',
  j5: '5 4',
};

const UTILITY_LETTER = { smoke: 'S', flash: 'F', molotov: 'M', bomb: 'C4' };
const UTILITY_NAME = { smoke: 'Smoke', flash: 'Flash', molotov: 'Molotov', bomb: 'Bombe' };

const C = {
  bg: '#0F1720',
  corridor: '#22303D',
  zone: '#1C2834',
  zoneStroke: '#33465A',
  label: '#9FB0C0',
  onColor: '#0B1118',
  surface: '#17212B',
};

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const zoneById = Object.fromEntries(ZONES.map((z) => [z.id, z]));
const pts = (path) => path.map(([x, y]) => `${x},${y}`).join(' ');

function baseLayer() {
  const corridors = CORRIDORS.map(
    (p) =>
      `<polyline points="${pts(p)}" fill="none" stroke="${C.corridor}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>`,
  ).join('');
  const zones = ZONES.map(
    (z) =>
      `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="8" fill="${C.zone}" stroke="${C.zoneStroke}" stroke-width="1.5"/>`,
  ).join('');
  const labels = ZONES.map((z) => {
    const { x, y, anchor = 'middle', rotate = false } = z.labelAt;
    const tr = rotate ? ` transform="rotate(-90 ${x} ${y})"` : '';
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" font-size="11" font-weight="600" fill="${C.label}"${tr}>${esc(z.name)}</text>`;
  }).join('');
  return `<g class="map-base" aria-hidden="true">${corridors}${zones}${labels}</g>`;
}

function defs() {
  const markers = Object.entries(PLAYER_COLORS)
    .map(
      ([id, color]) =>
        `<marker id="arrow-${id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`,
    )
    .join('');
  return `<defs>${markers}</defs>`;
}

/**
 * @param {object} strategy  données de la stratégie (JSON)
 * @param {number} stepN     numéro d'étape (1 à 4)
 * @param {object} [opts]
 * @param {string|null} [opts.focus]  rôle mis en avant (j1..j5), null = vue équipe
 */
export function renderStepSvg(strategy, stepN, opts = {}) {
  const focus = opts.focus ?? null;
  const step = strategy.steps.find((s) => s.n === stepN);
  if (!step) throw new Error(`Étape ${stepN} introuvable`);
  const m = step.map;
  const dim = (role) => (focus && role !== focus ? ' opacity="0.3"' : '');

  const moves = m.moves
    .map(
      ({ role, path }) =>
        `<polyline points="${pts(path)}" fill="none" stroke="${PLAYER_COLORS[role]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${PLAYER_DASH[role]}" marker-end="url(#arrow-${role})"${dim(role)}/>`,
    )
    .join('');

  const utils = m.utilities
    .map(({ type, by, zone, dx = 0, dy = 0 }) => {
      const z = zoneById[zone];
      if (!z) throw new Error(`Zone inconnue : ${zone}`);
      const [x, y] = [z.anchor[0] + dx, z.anchor[1] + dy];
      const letter = UTILITY_LETTER[type];
      const r = letter.length > 1 ? 12 : 10;
      return `<g${dim(by)}><title>${esc(`${UTILITY_NAME[type]} (${by.toUpperCase()}) : ${z.name}`)}</title><circle cx="${x}" cy="${y}" r="${r}" fill="${C.surface}" stroke="${PLAYER_COLORS[by]}" stroke-width="2.5"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${letter.length > 1 ? 9 : 11}" font-weight="700" fill="#E8EEF4">${letter}</text></g>`;
    })
    .join('');

  // Joueur sélectionné dessiné en dernier pour rester au-dessus.
  const order = Object.keys(m.positions).sort((a, b) => (a === focus) - (b === focus));
  const players = order
    .map((role) => {
      const [x, y] = m.positions[role];
      const n = role.slice(1);
      const ring = role === focus ? `<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="#E8EEF4" stroke-width="2"/>` : '';
      return `<g class="player" data-role="${role}"${dim(role)}>${ring}<circle cx="${x}" cy="${y}" r="11" fill="${PLAYER_COLORS[role]}" stroke="${C.bg}" stroke-width="2"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="800" fill="${C.onColor}">${n}</text></g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}" role="img" aria-label="Plan schématique de Dust 2, étape ${stepN}" font-family="Inter, system-ui, sans-serif"><rect width="100%" height="100%" fill="${C.bg}"/>${defs()}${baseLayer()}<g class="moves">${moves}</g><g class="utilities">${utils}</g><g class="players">${players}</g></svg>`;
}
