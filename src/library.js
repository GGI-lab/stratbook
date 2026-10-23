// Bibliothèque des stratégies. Le dépôt GitHub (dossier strategies/) est la seule référence :
// - stratégies livrées avec le site (copie du dépôt au moment de la publication) ;
// - version à jour lue sur GitHub au démarrage (nouvelles, modifiées ou supprimées depuis),
//   gardée en cache sur l'appareil pour s'ouvrir vite et hors ligne ;
// - anciennes stratégies gardées seulement sur ce téléphone (avant l'enregistrement dans GitHub) :
//   visibles, et publiables par Greg depuis le menu.
import { sanitizeStrategy, sideOf } from './model.js';

const KEY_LOCAL = 'stratbook:strategies'; // anciennes stratégies du téléphone (lecture seule désormais)
const KEY_META = 'stratbook:meta';
const KEY_DEPOT = 'stratbook:depot'; // cache de la version GitHub
const KEY_LAST = 'stratbook:strat';

/**
 * @param {Record<string, object>} builtIns   stratégies livrées avec le site, par id
 * @param {Storage|undefined} storage         localStorage (peut être absent ou bloqué)
 * @param {Record<string, string>} [builtInShas] empreinte Git du fichier de chaque stratégie livrée
 */
export function createLibrary(builtIns, storage, builtInShas = {}) {
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const read = (key, fallback) => safe(() => JSON.parse(storage?.getItem(key) ?? 'null') ?? fallback, fallback);

  // Anciennes stratégies du téléphone.
  const local = {};
  const rawLocal = read(KEY_LOCAL, {});
  for (const value of Object.values(rawLocal && typeof rawLocal === 'object' ? rawLocal : {})) {
    const s = sanitizeStrategy(value);
    if (s) local[s.id] = s;
  }

  // Cache de la version GitHub : { files: { id: { sha, strategy } }, deleted: [ids] }.
  const depot = {};
  const cache = read(KEY_DEPOT, {});
  for (const [id, f] of Object.entries(cache?.files ?? {})) {
    const s = sanitizeStrategy(f?.strategy);
    if (s && s.id === id && typeof f.sha === 'string') depot[id] = { sha: f.sha, strategy: s };
  }
  const deleted = new Set(Array.isArray(cache?.deleted) ? cache.deleted.filter((id) => typeof id === 'string') : []);
  let shas = { ...builtInShas };

  const persistDepot = () => safe(() => (storage.setItem(KEY_DEPOT, JSON.stringify({ files: depot, deleted: [...deleted] })), true), false);
  const persistLocal = () => safe(() => (storage.setItem(KEY_LOCAL, JSON.stringify(local)), storage.removeItem(KEY_META), true), false);

  const inRepo = (id) => !deleted.has(id) && Boolean(depot[id] || builtIns[id]);
  const repoVersion = (id) => (deleted.has(id) ? null : (depot[id]?.strategy ?? builtIns[id] ?? null));
  // La version du dépôt prime ; une ancienne copie du téléphone ne s'affiche que si le dépôt n'a pas cet id.
  const get = (id) => repoVersion(id) ?? local[id] ?? null;

  return {
    get,
    has: (id) => Boolean(get(id)),
    /** 'repo' (dans GitHub) ou 'local' (seulement sur ce téléphone). */
    origin: (id) => (inRepo(id) ? 'repo' : local[id] ? 'local' : null),
    /** Empreinte Git du fichier dans le dépôt (pour remplacer ou supprimer sans écraser une autre version). */
    shaOf: (id) => (deleted.has(id) ? null : (depot[id]?.sha ?? shas[id] ?? null)),
    /** Empreintes des stratégies livrées, calculées après le chargement. */
    setBuiltInShas(next) {
      shas = { ...shas, ...next };
    },
    /** Stratégies d'une carte et d'un side : par titre. */
    list({ map, side } = {}) {
      const ids = new Set([...Object.keys(builtIns), ...Object.keys(depot), ...Object.keys(local)]);
      return [...ids]
        .map(get)
        .filter((s) => s && (!map || s.map === map) && (!side || sideOf(s) === side))
        .sort((a, b) => a.title.text.localeCompare(b.title.text, 'fr'));
    },
    /** Anciennes stratégies gardées sur ce téléphone, à publier dans GitHub. */
    pendingLocal: () => Object.values(local),

    /**
     * Met à jour depuis la liste des fichiers du dépôt ([{ id, sha }]).
     * readFile(id) → { text, sha } pour les fichiers nouveaux ou modifiés.
     * Renvoie les ids dont la version a changé (ajoutés, modifiés, supprimés).
     */
    async sync(listing, readFile) {
      const changed = new Set();
      const present = new Set(listing.map((f) => f.id));
      for (const { id, sha } of listing) {
        const known = depot[id]?.sha ?? shas[id];
        if (known === sha && !deleted.has(id)) continue;
        if (known === sha && deleted.has(id)) {
          deleted.delete(id);
          changed.add(id);
          continue;
        }
        let file;
        try {
          file = await readFile(id);
        } catch {
          continue; // on garde la version connue
        }
        let s = null;
        try {
          s = sanitizeStrategy(JSON.parse(file.text));
        } catch {
          s = null;
        }
        if (!s || s.id !== id) continue;
        depot[id] = { sha: file.sha ?? sha, strategy: s };
        deleted.delete(id);
        changed.add(id);
      }
      // Supprimés du dépôt depuis la publication du site (ou depuis le dernier passage).
      for (const id of new Set([...Object.keys(builtIns), ...Object.keys(depot)])) {
        if (present.has(id) || deleted.has(id)) continue;
        deleted.add(id);
        delete depot[id];
        changed.add(id);
      }
      persistDepot();
      return changed;
    },

    /** Stratégie publiée dans GitHub (commit fait) : visible tout de suite, sans attendre la mise en ligne. */
    published(strategy, sha) {
      const s = sanitizeStrategy(strategy);
      if (!s) throw new Error('Stratégie invalide');
      depot[s.id] = { sha, strategy: s };
      deleted.delete(s.id);
      if (local[s.id]) {
        delete local[s.id];
        persistLocal();
      }
      return persistDepot();
    },

    /** Stratégie supprimée du dépôt (ou ancienne copie du téléphone effacée). */
    removed(id) {
      if (builtIns[id] || depot[id]) deleted.add(id);
      delete depot[id];
      if (local[id]) {
        delete local[id];
        persistLocal();
      }
      return persistDepot();
    },

    lastId: () => safe(() => storage?.getItem(KEY_LAST), null),
    setLast: (id) => safe(() => storage?.setItem(KEY_LAST, id), null),
  };
}
