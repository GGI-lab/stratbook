// Modèle d'une stratégie : sides, groupes, cadrage, et nettoyage des données reçues
// (stockage local ou lien partagé). Fonctions pures, testées dans tests/model.test.js.
import { MAPS } from './map/maps.js';

export const ROLES = ['j1', 'j2', 'j3', 'j4', 'j5'];
export const MAX_STEPS = 5;
export const UTILITY_TYPES = ['smoke', 'flash', 'molotov', 'bomb'];
export const PACES = ['run', 'walk'];

export const SIDES = {
  t: { id: 't', label: 'Terro', short: 'T' },
  ct: { id: 'ct', label: 'CT', short: 'CT' },
};

/** Side d'une stratégie : « CT » ou « Anti-terro » donnent ct, tout le reste t. */
export function sideOf(strategy) {
  const text = String(strategy?.side?.text ?? '').trim();
  return /^(ct\b|anti)/i.test(text) ? 'ct' : 't';
}

// Groupes proposés dans l'éditeur. « all » ne sert qu'aux plans et aux appels.
export const GROUP_PRESETS = [
  { id: 'long', label: 'Long' },
  { id: 'short', label: 'Short' },
  { id: 'mid', label: 'Mid' },
  { id: 'a', label: 'Site A' },
  { id: 'b', label: 'Site B' },
  { id: 'all', label: 'Toute l’équipe' },
];
export const ROLE_GROUPS = GROUP_PRESETS.filter((g) => g.id !== 'all');
const DEFAULT_ROLE_GROUPS = { t: ['long', 'long', 'long', 'short', 'short'], ct: ['a', 'a', 'mid', 'b', 'b'] };

export function groupLabel(strategy, id) {
  const own = strategy?.groups?.find((g) => g.id === id)?.label?.text;
  return own ?? GROUP_PRESETS.find((g) => g.id === id)?.label ?? id;
}

/** Cadrage d'affichage : celui de la stratégie, sinon toute la carte. */
export const frameOf = (strategy, map) => strategy?.frame ?? map.viewBox;

export const txt = (text = '') => ({ text, source: 'ajout' });
export const DEFAULT_LABELS = {
  noNewInstruction: { text: 'Pas de nouvelle consigne', source: 'ajout' },
  utilitiesHeading: { text: 'Utilitaires (timing libre)', source: 'ajout' },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const LOOK_DISTANCE = 150;

export function newStrategyId(mapId, side, rand = Math.random) {
  const prefix = mapId === 'dust2' ? 'd2' : mapId;
  return `${prefix}-${side}-${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')}`;
}

/** Stratégie vierge : 1 étape, joueurs au spawn du side choisi. */
export function createStrategy({ mapId = 'dust2', side = 't', id } = {}) {
  const map = MAPS[mapId];
  const spawns = map.spawns[side];
  const start = Object.fromEntries(ROLES.map((r, i) => [r, [...spawns[i]]]));
  // Regard par défaut : vers le centre de la carte.
  const vb = map.viewBox;
  const mid = [vb.x + vb.width / 2, vb.y + vb.height / 2];
  const look = Object.fromEntries(
    ROLES.map((r) => {
      const [x, y] = start[r];
      const d = Math.hypot(mid[0] - x, mid[1] - y) || 1;
      return [r, [Math.round(x + ((mid[0] - x) / d) * LOOK_DISTANCE), Math.round(y + ((mid[1] - y) / d) * LOOK_DISTANCE)]];
    }),
  );
  const s = {
    id: id ?? newStrategyId(mapId, side),
    map: mapId,
    side: txt(SIDES[side].label),
    title: txt(''),
    groups: [],
    roles: Object.fromEntries(
      ROLES.map((r, i) => [
        r,
        { number: i + 1, group: DEFAULT_ROLE_GROUPS[side][i], title: txt(''), summary: txt(''), utilities: [] },
      ]),
    ),
    start,
    steps: [blankStep(1, start, look)],
    labels: clone(DEFAULT_LABELS),
  };
  s.groups = buildGroups(s);
  return s;
}

export function blankStep(n, positions, look) {
  return {
    n,
    title: txt(''),
    team: [],
    calls: [],
    roles: Object.fromEntries(ROLES.map((r) => [r, []])),
    map: { positions: clone(positions), look: clone(look), moves: [], utilities: [] },
  };
}

/** Liste des groupes déduite du groupe de chaque rôle (format attendu par le volet). */
export function buildGroups(strategy) {
  const out = [];
  for (const r of ROLES) {
    const id = strategy.roles[r].group;
    let g = out.find((x) => x.id === id);
    if (!g) {
      const old = strategy.groups?.find((x) => x.id === id);
      g = { id, label: old?.label ?? txt(groupLabel(null, id)), players: [] };
      out.push(g);
    }
    g.players.push(r);
  }
  return out;
}

// ---------- Nettoyage des données reçues ----------
// Une stratégie peut venir d'un lien ou du stockage local : on reconstruit un objet propre,
// champ par champ, pour qu'aucune donnée inattendue n'arrive dans le rendu.

const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e5;
const point = (v) => (Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) ? [Math.round(v[0] * 10) / 10, Math.round(v[1] * 10) / 10] : null);
const cleanText = (v, max = 400) =>
  v && typeof v.text === 'string' ? { text: v.text.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max), source: v.source === 'pdf' ? 'pdf' : 'ajout' } : null;
const groupId = (v) => (typeof v === 'string' && /^[a-z0-9]{1,16}$/i.test(v) ? v : null);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const list = (v, fn, max = 40) => (Array.isArray(v) ? v.slice(0, max).map(fn).filter(Boolean) : []);

function cleanRoles(map, fn) {
  if (!map || typeof map !== 'object') return null;
  const out = {};
  for (const r of ROLES) {
    const v = fn(map[r]);
    if (v === null) return null;
    out[r] = v;
  }
  return out;
}

function cleanStepMap(m) {
  if (!m || typeof m !== 'object') return null;
  const positions = cleanRoles(m.positions, point);
  const look = cleanRoles(m.look, point);
  if (!positions || !look) return null;
  const moves = list(m.moves, (mv) => {
    if (!ROLES.includes(mv?.role)) return null;
    const path = list(mv.path, point, 200);
    if (path.length < 2) return null;
    return { role: mv.role, path, ...(PACES.includes(mv.pace) ? { pace: mv.pace } : {}) };
  });
  const utilities = list(m.utilities, (u) => {
    if (!UTILITY_TYPES.includes(u?.type) || !ROLES.includes(u.by)) return null;
    const at = point(u.at);
    if (at) return { type: u.type, by: u.by, at };
    if (typeof u.zone !== 'string' || !/^[a-zA-Z0-9]{1,32}$/.test(u.zone)) return null;
    return { type: u.type, by: u.by, zone: u.zone, ...(isNum(u.dx) ? { dx: u.dx } : {}), ...(isNum(u.dy) ? { dy: u.dy } : {}) };
  });
  return { positions, look, moves, utilities };
}

/** Renvoie une copie propre de la stratégie, ou null si elle est inutilisable. */
export function sanitizeStrategy(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
  const map = MAPS[raw.map];
  if (!map) return null;
  const side = cleanText(raw.side, 30);
  const title = cleanText(raw.title, 120);
  if (!side || !title) return null;
  const roles = cleanRoles(raw.roles, (r) => {
    if (!r || typeof r !== 'object') return null;
    const group = groupId(r.group);
    if (!group) return null;
    return {
      number: isNum(r.number) ? r.number : undefined,
      group,
      title: cleanText(r.title, 120) ?? txt(''),
      summary: cleanText(r.summary) ?? txt(''),
      utilities: list(r.utilities, (u) => cleanText(u, 160)),
    };
  });
  if (!roles) return null;
  ROLES.forEach((r, i) => (roles[r].number = i + 1));
  if (!Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > MAX_STEPS) return null;
  const steps = [];
  for (const [i, st] of raw.steps.entries()) {
    const m = cleanStepMap(st?.map);
    if (!m) return null;
    const stepRoles = cleanRoles(st.roles ?? {}, (v) => list(v, (t) => cleanText(t)));
    steps.push({
      n: i + 1,
      title: cleanText(st.title, 120) ?? txt(''),
      team: list(st.team, (t) => {
        const c = cleanText(t);
        const g = groupId(t?.group);
        return c && g ? { group: g, ...c } : null;
      }),
      calls: list(st.calls, (t) => {
        const c = cleanText(t, 80);
        const g = groupId(t?.group);
        return c && g ? { group: g, ...c } : null;
      }),
      roles: stepRoles ?? Object.fromEntries(ROLES.map((r) => [r, []])),
      map: m,
    });
  }
  const out = {
    id: raw.id,
    map: raw.map,
    side,
    title,
    groups: [],
    roles,
    steps,
    labels: {
      noNewInstruction: cleanText(raw.labels?.noNewInstruction, 80) ?? clone(DEFAULT_LABELS.noNewInstruction),
      utilitiesHeading: cleanText(raw.labels?.utilitiesHeading, 80) ?? clone(DEFAULT_LABELS.utilitiesHeading),
    },
  };
  const frame = raw.frame;
  if (frame && ['x', 'y', 'width', 'height'].every((k) => isNum(frame[k])) && frame.width > 50 && frame.height > 50)
    out.frame = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  const start = cleanRoles(raw.start, point);
  if (start) out.start = start;
  if (typeof raw.sourceDocument === 'string') out.sourceDocument = raw.sourceDocument.slice(0, 200);
  // Libellés de groupes : ceux fournis s'ils sont propres, sinon ceux par défaut.
  out.groups = buildGroups({ ...out, groups: list(raw.groups, (g) => (groupId(g?.id) ? { id: g.id, label: cleanText(g.label, 40) } : null)).filter((g) => g.label) });
  return out;
}
