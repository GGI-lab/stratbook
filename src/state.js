// État de la page : lecture et écriture du lien, mémorisation locale.
// Fonctions pures autant que possible, testées dans tests/state.test.js.

export const ROLES = ['j1', 'j2', 'j3', 'j4', 'j5'];
export const TEAM = 'equipe';
export const VIEWS = [TEAM, ...ROLES];
export const STEP_MIN = 1;
export const STEP_MAX = 4;
export const NICK_MAX = 16;

const KEY_ROLE = 'stratbook:role';
const KEY_NICKS = 'stratbook:pseudos';

export const emptyNicknames = () => ROLES.map(() => '');
export const hasNicknames = (nicks) => Array.isArray(nicks) && nicks.some((n) => n);

// Nettoie un pseudo : espaces superflus, caractères de contrôle, longueur maximale.
export function cleanNickname(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICK_MAX);
}

export const roleNumber = (role) => role.slice(1);

// « Greg · J2 » si un pseudo existe, sinon « J2 ».
export function displayName(role, nicknames) {
  const nick = nicknames?.[ROLES.indexOf(role)];
  const tag = `J${roleNumber(role)}`;
  return nick ? `${nick} · ${tag}` : tag;
}

/** Lit les paramètres du lien. Ignore tout ce qui est invalide. */
export function parseParams(search) {
  const p = new URLSearchParams(search);
  const out = {};
  const step = Number(p.get('step'));
  if (Number.isInteger(step) && step >= STEP_MIN && step <= STEP_MAX) out.step = step;
  const role = p.get('role');
  if (VIEWS.includes(role)) out.view = role;
  const nicks = ROLES.map((_, i) => cleanNickname(p.get(`n${i + 1}`)));
  if (hasNicknames(nicks)) out.nicknames = nicks;
  return out;
}

/**
 * État d'ouverture. Priorité : paramètres du lien, puis rôle mémorisé, puis vue équipe.
 * Pseudos : ceux de l'appareil s'il en a, sinon ceux du lien (qui sont alors adoptés).
 */
export function resolveInitial(params, stored) {
  const storedNicks = hasNicknames(stored.nicknames) ? stored.nicknames : null;
  const nicknames = storedNicks ?? params.nicknames ?? emptyNicknames();
  return {
    step: params.step ?? STEP_MIN,
    view: params.view ?? (ROLES.includes(stored.role) ? stored.role : TEAM),
    nicknames,
    adoptLinkNicknames: !storedNicks && Boolean(params.nicknames),
  };
}

/** Construit le lien partageable de la vue courante. */
export function buildShareUrl(baseUrl, strategyId, { step, view, nicknames }) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('s', strategyId);
  url.searchParams.set('step', String(step));
  url.searchParams.set('role', view);
  (nicknames ?? []).forEach((n, i) => {
    if (n) url.searchParams.set(`n${i + 1}`, n);
  });
  return url.toString();
}

export const clampStep = (n) => Math.min(STEP_MAX, Math.max(STEP_MIN, n));

// Stockage local : peut être indisponible (navigation privée, stockage bloqué).
export function createStore(storage) {
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return {
    read() {
      const role = safe(() => storage?.getItem(KEY_ROLE), null);
      const raw = safe(() => JSON.parse(storage?.getItem(KEY_NICKS) ?? 'null'), null);
      const nicknames = Array.isArray(raw) ? ROLES.map((_, i) => cleanNickname(raw[i])) : null;
      return { role, nicknames };
    },
    saveRole(role) {
      return safe(() => (storage.setItem(KEY_ROLE, role), true), false);
    },
    saveNicknames(nicks) {
      return safe(() => (storage.setItem(KEY_NICKS, JSON.stringify(nicks.map(cleanNickname))), true), false);
    },
  };
}
