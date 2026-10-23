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

// Nettoie un pseudo : espaces superflus, caractères de contrôle, virgules (séparateur des pseudos
// dans le lien), longueur maximale.
export function cleanNickname(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/,/g, ' ')
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

/** Lit les paramètres d'un ancien lien (?s=…&step=…&role=…&n1=…). Ignore tout ce qui est invalide. */
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

// ---------- Liens lisibles ----------
// /stratbook/d2-split-a/etape-2/j2?pseudos=Greg,Alex,,Sam,Zoé
//   stratégie (id) / étape (etape-1 à etape-5, ou recap) / vue (equipe, j1 à j5) ; pseudos facultatifs.
// /stratbook/ct : side CT sans stratégie. Les anciens liens (?s=…&step=…&role=…) restent valables.
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const stepSegment = (step) => (step === RECAP ? RECAP : `etape-${step}`);

/**
 * Lit un lien (adresse complète). `basePath` : chemin du site (« /stratbook/ »).
 * Renvoie { strategyId, step, view, nicknames, side } (champs absents si invalides).
 */
export function parseLink(href, basePath = '/') {
  const url = new URL(href);
  const out = parseParams(url.search); // ancien format
  const path = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) : url.pathname.replace(/^\/+/, '');
  const parts = path
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p).toLowerCase();
      } catch {
        return '';
      }
    });
  const [first, second, third] = parts;
  if ((first === 't' || first === 'ct') && parts.length === 1) out.side = first;
  else if (first && ID_RE.test(first) && first !== 'index.html') {
    out.strategyId = first;
    const m = second?.match(/^etape-(\d)$/);
    if (second === RECAP) out.step = RECAP;
    else if (m && Number(m[1]) >= STEP_MIN && Number(m[1]) <= STEP_MAX) out.step = Number(m[1]);
    if (VIEWS.includes(third)) out.view = third;
  }
  const pseudos = url.searchParams.get('pseudos');
  if (pseudos !== null) {
    const nicks = ROLES.map((_, i) => cleanNickname(pseudos.split(',')[i]));
    if (hasNicknames(nicks)) out.nicknames = nicks;
  }
  return out;
}

// Pseudo lisible dans le lien : accents et lettres gardés tels quels, espaces en « + »,
// seuls les caractères qui gêneraient l'adresse (& # % ? + …) sont codés.
const readable = (text) =>
  encodeURIComponent(text)
    .replace(/(?:%[0-9A-F]{2})+/g, (m) =>
      [...decodeURIComponent(m)].map((ch) => (/[\p{L}\p{N}]/u.test(ch) ? ch : encodeURIComponent(ch))).join(''),
    )
    .replace(/%20/g, '+');

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
 * Construit le lien lisible de la vue courante.
 * `rootUrl` : adresse du site (« https://ggi-lab.github.io/stratbook/ »).
 * Sans stratégie (side sans stratégie), le lien garde le side choisi.
 */
export function buildShareUrl(rootUrl, strategyId, { step, view, nicknames, side }) {
  const root = rootUrl.endsWith('/') ? rootUrl : `${rootUrl}/`;
  if (!strategyId) return side ? `${root}${side}` : root;
  let url = `${root}${strategyId}/${stepSegment(step)}/${view}`;
  // Pseudos dans l'ordre J1 à J5 ; les derniers vides sont omis (Greg,Alex au lieu de Greg,Alex,,,).
  const nicks = (nicknames ?? []).map((n) => cleanNickname(n));
  while (nicks.length && !nicks.at(-1)) nicks.pop();
  if (nicks.length) url += `?pseudos=${nicks.map(readable).join(',')}`;
  return url;
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
