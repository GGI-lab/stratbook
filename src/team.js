// Pseudos de l'équipe (J1 à J5), enregistrés dans le dépôt GitHub (data/equipe.json) : les mêmes
// pour tout le monde, modifiables seulement avec l'accès éditeur (jeton GitHub de Greg).
// Tant que le fichier n'a aucun pseudo, chacun garde ceux de son appareil ou du lien (ancien fonctionnement).
// Fonctions testées dans tests/team.test.js.
import { ROLES, cleanNickname, hasNicknames } from './state.js';

const KEY = 'stratbook:equipe'; // cache de la version GitHub : { sha, team }

/** Contenu propre du fichier, ou null s'il est illisible. */
export function sanitizeTeam(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.pseudos)) return null;
  const team = { pseudos: ROLES.map((_, i) => cleanNickname(raw.pseudos[i])) };
  if (Number.isInteger(raw.updatedAt) && raw.updatedAt > 0 && raw.updatedAt < 1e14) team.updatedAt = raw.updatedAt;
  return team;
}

/** Lit le texte d'un fichier d'équipe (null s'il est illisible). */
export function parseTeam(text) {
  try {
    return sanitizeTeam(JSON.parse(text));
  } catch {
    return null;
  }
}

/** L'équipe a-t-elle des pseudos enregistrés dans GitHub ? */
export const teamHasNames = (team) => hasNicknames(team?.pseudos);

/**
 * Équipe connue sur l'appareil : version livrée avec le site, puis version GitHub plus récente (cache).
 * @param {{text: string, sha: string}|null} builtIn  fichier livré avec le site (empreinte calculée après coup)
 */
export function createTeamStore(storage, builtIn = null) {
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const cached = safe(() => JSON.parse(storage?.getItem(KEY) ?? 'null'), null);
  let current = cached && sanitizeTeam(cached.team) && typeof cached.sha === 'string' ? { sha: cached.sha, team: sanitizeTeam(cached.team) } : null;
  let base = builtIn ? { sha: builtIn.sha ?? null, team: parseTeam(builtIn.text) } : null;
  return {
    team: () => (current ?? base)?.team ?? null,
    sha: () => (current ?? base)?.sha ?? null,
    /** Empreinte du fichier livré, calculée après le chargement. */
    setBuiltInSha(sha) {
      if (base) base = { ...base, sha };
    },
    /** Version lue sur GitHub ou tout juste publiée. Renvoie true si les pseudos ont changé. */
    update(team, sha) {
      const clean = sanitizeTeam(team);
      if (!clean) return false;
      const before = JSON.stringify(this.team()?.pseudos ?? null);
      current = { sha, team: clean };
      safe(() => storage.setItem(KEY, JSON.stringify(current)));
      return JSON.stringify(clean.pseudos) !== before;
    },
  };
}
