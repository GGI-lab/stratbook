# Stratbook

Playbook CS2 interactif, en français, pensé pour le téléphone. Dust 2, côté terro et CT : stratégie d'origine Split A (3 Long + 2 Short), et stratégies créées ou modifiées dans l'application (éditeur intégré, trajets calculés automatiquement avec points de passage, défaire / refaire, partage par lien ou par fichier), avec une étape récap qui résume toute la stratégie. Installable sur l'écran d'accueil.

Site : https://ggi-lab.github.io/stratbook/

## Développer

```bash
npm install
npm run dev      # serveur local
npm test         # tests
npm run build    # fichiers statiques dans dist/
```

Chaque envoi sur `main` publie le site via GitHub Actions.

## Organisation

- `strategies/` : stratégies du dépôt (JSON), détectées automatiquement. Voir `docs/ajouter-une-strategie.md`.
- `src/library.js`, `src/model.js`, `src/codec.js` : bibliothèque (dépôt + stratégies du téléphone), modèle et nettoyage des données, stratégie jointe au lien de partage.
- `src/sync.js`, `src/patch.js` : échanges entre téléphones (versions qui se croisent, liens courts par différences, sauvegarde et import de fichiers).
- `src/install.js`, `public/manifest.webmanifest`, `public/icons/` : installation sur l'écran d'accueil et stockage persistant. Icônes générées par `node scripts/icons.mjs`.
- `src/layers.js` : bouton retour du téléphone (ferme le menu ou l'éditeur au lieu de quitter le site).
- `src/editor/` : éditeur (écran dans `editor.js`, opérations testées dans `ops.js`, historique Défaire / Refaire dans `history.js`).
- `src/map/` : cartes (image, cadrage, zones, grille de navigation), calcul des trajets (`nav.js`), rendu SVG et animation entre étapes.
- `src/` : interface (JavaScript sans framework).
- `tests/` : tests automatiques.

Le contenu tactique vient uniquement du PDF de Greg. Chaque texte des données porte un tag `source` (`pdf` ou `ajout`).
