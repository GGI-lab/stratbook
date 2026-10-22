// Échanges de stratégies entre téléphones (lien de partage, fichier, sauvegarde), sans serveur.
// Fonctions pures, testées dans tests/sync.test.js.
// - Une stratégie reçue ne remplace jamais en silence une version modifiée sur ce téléphone :
//   l'application demande « Garder la mienne », « Remplacer » ou « Garder les deux ».
// - Une stratégie du dépôt modifiée voyage sous forme de différences avec l'original (lien court).
import { sanitizeStrategy, stampOf, newStrategyId, sideOf } from './model.js';
import { diff, applyDiff, fingerprint } from './patch.js';

const without = (keys) => (k, v) => (keys.includes(k) ? undefined : v);

/** Copie nettoyée et comparable : sans les tags « source » (utiles seulement pour relire le dépôt). */
export function normalize(strategy) {
  const s = sanitizeStrategy(strategy);
  return s ? JSON.parse(JSON.stringify(s, without(['source']))) : null;
}

/** Contenu seul (sans source ni date) : deux versions identiques ont la même clé. */
const contentKey = (s) => JSON.stringify(sanitizeStrategy(s), without(['source', 'updatedAt']));
export const sameContent = (a, b) => contentKey(a) === contentKey(b);

/**
 * Que faire d'une stratégie reçue (lien ou fichier) ?
 * - add      : inconnue ici, on l'ajoute ;
 * - same     : déjà là, même contenu ;
 * - update   : on peut la remplacer sans rien perdre (original du dépôt jamais modifié ici,
 *              ou version reçue jamais retouchée et plus ancienne que celle-ci) ;
 * - conflict : une version différente existe ici, l'utilisateur choisit.
 *   newer : 'received', 'mine' ou null (dates inconnues ou égales).
 */
export function incomingAction(library, received) {
  const existing = library.get(received.id);
  if (!existing) return { action: 'add' };
  if (sameContent(existing, received)) return { action: 'same', existing };
  if (!library.isLocalCopy(received.id)) return { action: 'update', existing };
  const mine = stampOf(existing);
  const theirs = stampOf(received);
  if (library.isReceivedUntouched(received.id) && theirs > mine) return { action: 'update', existing };
  return { action: 'conflict', existing, newer: theirs > mine ? 'received' : mine > theirs ? 'mine' : null };
}

/** Copie d'une stratégie reçue, sous un nouvel id (« Garder les deux »). */
export function copyOf(strategy, rand = Math.random) {
  const c = JSON.parse(JSON.stringify(strategy));
  c.id = newStrategyId(c.map, sideOf(c), rand);
  c.title = { ...c.title, text: `${c.title.text || 'Sans titre'} (reçue)`.slice(0, 120) };
  return c;
}

/**
 * Contenu à joindre au lien : la stratégie entière, ou ses différences avec la version du dépôt
 * (`base`) quand c'est plus court. { $b: id de l'original, $h: empreinte de l'original, $p: différences }.
 */
export function linkPayload(strategy, base = null) {
  const full = normalize(strategy);
  if (!base) return full;
  const b = normalize(base);
  if (!b || b.id !== full.id) return full;
  const patch = { $b: b.id, $h: fingerprint(JSON.stringify(b)), $p: diff(b, full) ?? { o: {} } };
  return JSON.stringify(patch).length < JSON.stringify(full).length ? patch : full;
}

/**
 * Reconstruit la stratégie jointe à un lien.
 * @param {*} raw  objet décodé du lien (src/codec.js)
 * @param {(id: string) => object|null} getBuiltIn  version du dépôt d'une stratégie
 * @returns {{strategy: object, baseChanged: boolean}|null}
 *   baseChanged : l'original du dépôt a changé depuis l'envoi du lien (résultat à vérifier).
 */
export function expandPayload(raw, getBuiltIn) {
  try {
    if (raw && typeof raw === 'object' && typeof raw.$b === 'string') {
      const base = normalize(getBuiltIn(raw.$b));
      if (!base) return null;
      const strategy = sanitizeStrategy(applyDiff(base, raw.$p));
      if (!strategy || strategy.id !== base.id) return null;
      return { strategy, baseChanged: raw.$h !== fingerprint(JSON.stringify(base)) };
    }
    const strategy = sanitizeStrategy(raw);
    return strategy ? { strategy, baseChanged: false } : null;
  } catch {
    return null;
  }
}

// ---------- Fichiers : sauvegarde de toutes les stratégies, ou une seule ----------
export const BACKUP_KIND = 'stratbook-sauvegarde';

/** Contenu du fichier de sauvegarde. */
export function backupData(strategies, now = Date.now()) {
  return { kind: BACKUP_KIND, version: 1, savedAt: now, strategies: strategies.map(normalize).filter(Boolean) };
}

/** Stratégies lisibles d'un fichier importé (sauvegarde ou stratégie seule). */
export function readImport(raw) {
  const list = raw?.kind === BACKUP_KIND && Array.isArray(raw.strategies) ? raw.strategies.slice(0, 200) : [raw];
  const seen = new Set();
  return list
    .map((s) => sanitizeStrategy(s))
    .filter((s) => s && !seen.has(s.id) && seen.add(s.id));
}
