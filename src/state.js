// État de la page : lecture et écriture du lien, mémorisation locale.
// Fonctions pures autant que possible, testées dans tests/state.test.js.

export const ROLES = ['j1', 'j2', 'j3', 'j4', 'j5'];
export const TEAM = 'equipe';
export const VIEWS = [TEAM, ...ROLES];
export const STEP_MIN = 1;
// Une stratégie compte de 3 à 5 étapes : le lien accepte jusqu'à 5, l'interface borne ensuite
// au nombre réel d'étapes de la stratégie.
export const STEP_MAX = 5;
export const NICK_MAX = 16;
// Étape récap : résumé de toute la stratégie, après la dernière étape (`step=recap` dans le lien).
export const RECAP = 'recap';

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

// Le pseudo s'il existe (« Greg »), sinon le numéro de rôle (« J2 »).
export function displayName(role, nicknames) {
  const nick = nicknames?.[ROLES.indexOf(role)];
  return nick || `J${roleNumber(role)}`;
}

/** Lit les paramètres du lien. Ignore tout ce qui est invalide. */
export function parseParams(search) {
  const p = new URLSearchParams(search);
  const out = {};
  const rawStep = p.get('step');
  const step = Number(rawStep);
  if (rawStep === RECAP) out.step = RECAP;
  else if (Number.isInteger(step) && step >= STEP_MIN && step <= STEP_MAX) out.step = step;
  const role = p.get('role');
  if (VIEWS.includes(role)) out.view = role;
  const nicks = ROLES.map((_, i) => cleanNickname(p.get(`n${i + 1}`)));
  if (hasNicknames(nicks)) out.nicknames = nicks;
  const strategyId = p.get('s');
  if (strategyId && /^[a-z0-9][a-z0-9-]{0,63}$/.test(strategyId)) out.strategyId = strategyId;
  const side = p.get('side');
  if (side === 't' || side === 'ct') out.side = side;
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

/**
 * Construit le lien partageable de la vue courante.
 * Sans stratégie (side sans stratégie), le lien garde le side choisi.
 * Lien toujours court : la stratégie est dans le dépôt GitHub, seul son id voyage.
 */
export function buildShareUrl(baseUrl, strategyId, { step, view, nicknames, side }) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  if (!strategyId) {
    if (side) url.searchParams.set('side', side);
    return url.toString();
  }
  url.searchParams.set('s', strategyId);
  url.searchParams.set('step', String(step));
  url.searchParams.set('role', view);
  (nicknames ?? []).forEach((n, i) => {
    if (n) url.searchParams.set(`n${i + 1}`, n);
  });
  return url.toString();
}

export const clampStep = (n, max = STEP_MAX) => Math.min(max, Math.max(STEP_MIN, n));

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
