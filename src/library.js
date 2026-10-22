// Bibliothèque des stratégies : celles du dépôt (strategies/*.json) et celles créées ou
// modifiées dans l'application, enregistrées sur le téléphone (stockage local).
// Une stratégie du dépôt modifiée dans l'application garde son id : la version locale la remplace
// sur ce téléphone, et « Revenir à l'original » supprime la version locale.
import { sanitizeStrategy, sideOf } from './model.js';

const KEY = 'stratbook:strategies';
const KEY_LAST = 'stratbook:strat';

/**
 * @param {Record<string, object>} builtIns  stratégies du dépôt, par id
 * @param {Storage|undefined} storage        localStorage (peut être absent ou bloqué)
 */
export function createLibrary(builtIns, storage) {
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  // Copie en mémoire : l'application fonctionne même si le stockage est indisponible.
  const local = {};
  const raw = safe(() => JSON.parse(storage?.getItem(KEY) ?? '{}'), {});
  for (const value of Object.values(raw && typeof raw === 'object' ? raw : {})) {
    const s = sanitizeStrategy(value);
    if (s) local[s.id] = s;
  }
  const persist = () => safe(() => (storage.setItem(KEY, JSON.stringify(local)), true), false);

  const get = (id) => local[id] ?? builtIns[id] ?? null;

  return {
    get,
    has: (id) => Boolean(get(id)),
    /** 'builtin' (dépôt), 'modified' (dépôt modifié ici) ou 'local' (créée ici). */
    origin(id) {
      if (builtIns[id]) return local[id] ? 'modified' : 'builtin';
      return local[id] ? 'local' : null;
    },
    /** Stratégies d'une carte et d'un side : celles du dépôt d'abord, puis par titre. */
    list({ map, side } = {}) {
      const ids = new Set([...Object.keys(builtIns), ...Object.keys(local)]);
      return [...ids]
        .map(get)
        .filter((s) => (!map || s.map === map) && (!side || sideOf(s) === side))
        .sort((a, b) => (builtIns[b.id] ? 1 : 0) - (builtIns[a.id] ? 1 : 0) || a.title.text.localeCompare(b.title.text, 'fr'));
    },
    /** Enregistre (ou remplace) une stratégie. Renvoie true si elle est gardée après fermeture. */
    save(strategy) {
      const s = sanitizeStrategy(strategy);
      if (!s) throw new Error('Stratégie invalide');
      local[s.id] = s;
      return persist();
    },
    /** Supprime la version locale (pour une stratégie du dépôt : retour à l'original). */
    remove(id) {
      delete local[id];
      return persist();
    },
    isLocalCopy: (id) => Boolean(local[id]),
    lastId: () => safe(() => storage?.getItem(KEY_LAST), null),
    setLast: (id) => safe(() => storage?.setItem(KEY_LAST, id), null),
  };
}
