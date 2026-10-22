// Registre des stratégies : tout fichier JSON déposé dans strategies/ est pris en compte.
// L'id de la stratégie (champ "id") est celui du lien de partage (?s=...).
const files = import.meta.glob('../strategies/*.json', { eager: true, import: 'default' });

export const STRATEGIES = Object.fromEntries(Object.values(files).map((s) => [s.id, s]));
export const DEFAULT_STRATEGY_ID = 'd2-split-a';

/** Stratégie demandée par le lien, ou celle par défaut si l'id est absent ou inconnu. */
export function pickStrategy(id) {
  return STRATEGIES[id] ?? STRATEGIES[DEFAULT_STRATEGY_ID];
}
