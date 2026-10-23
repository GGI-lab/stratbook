# Données de test figées

`strategies/d2-split-a.json` : Split A telle que transcrite du PDF (version du 22 octobre 2026).

Les tests qui vérifient un contenu précis (fidélité au PDF, positions des joueurs, textes affichés) lisent
cette copie, jamais le dossier `strategies/` du dépôt : Greg modifie ses stratégies depuis l'application,
et ces modifications ne doivent pas faire échouer les tests ni bloquer la mise en ligne.
Le dossier `strategies/` reste validé sur la forme (`tests/strategies.test.js`).

Les tests de parcours construisent le site avec ces données (`vite build --mode e2e`, voir `vite.config.js`).
