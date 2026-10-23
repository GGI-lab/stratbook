// Stratégies livrées avec le site : copie du dossier strategies/ du dépôt au moment de la publication.
// Le texte exact de chaque fichier est gardé pour calculer son empreinte Git et savoir, au démarrage,
// si GitHub a une version plus récente (src/library.js, src/github.js).
// L'id de la stratégie (champ "id") est celui du lien de partage (?s=...).
const files = import.meta.glob('@strategies/*.json', { eager: true, query: '?raw', import: 'default' });

export const STRATEGY_FILES = Object.values(files).map((text) => ({ text, strategy: JSON.parse(text) }));
export const STRATEGIES = Object.fromEntries(STRATEGY_FILES.map((f) => [f.strategy.id, f.strategy]));
export const DEFAULT_STRATEGY_ID = 'd2-split-a';
