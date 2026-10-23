# Stratbook

Playbook CS2 interactif, en français, pensé pour le téléphone. Dust 2, côté terro et CT : stratégie d'origine Split A (3 Long + 2 Short), et stratégies créées ou modifiées dans l'application (éditeur intégré réservé à Greg par mot de passe, trajets calculés automatiquement avec points de passage, défaire / refaire, enregistrement dans ce dépôt GitHub, partage par lien court), avec une étape récap qui résume toute la stratégie. Installable sur l'écran d'accueil.

Site : https://ggi-lab.github.io/stratbook/

## Développer

```bash
npm install
npm run dev      # serveur local
npm test         # tests
npm run build    # fichiers statiques dans dist/
```

Chaque envoi sur `main` publie le site via GitHub Actions, y compris les commits faits depuis l'application (voir `docs/ajouter-une-strategie.md`, accès éditeur).

## Organisation

- `strategies/` : stratégies du dépôt (JSON), détectées automatiquement. Voir `docs/ajouter-une-strategie.md`.
- `src/library.js`, `src/model.js` : bibliothèque (stratégies du site, version à jour de GitHub, anciennes stratégies du téléphone), modèle et nettoyage des données.
- `src/github.js` : stratégies lues et écrites dans ce dépôt par l'API GitHub (un commit par enregistrement ou suppression).
- `src/vault.js` : accès éditeur, jeton GitHub chiffré par mot de passe sur l'appareil.
- `src/install.js`, `public/manifest.webmanifest`, `public/icons/` : installation sur l'écran d'accueil. Icônes générées depuis `assets-src/icone-source.png` par `python3 scripts/icons.py`.
- `src/layers.js` : bouton retour du téléphone (ferme le menu ou l'éditeur au lieu de quitter le site).
- `src/editor/` : éditeur (écran dans `editor.js`, opérations testées dans `ops.js`, historique Défaire / Refaire dans `history.js`).
- `src/map/` : cartes (image, cadrage, zones, grille de navigation), calcul des trajets (`nav.js`), rendu SVG et animation entre étapes.
- `src/` : interface (JavaScript sans framework).
- `tests/` : tests automatiques.

Le contenu tactique vient uniquement du PDF de Greg. Chaque texte des données porte un tag `source` (`pdf` ou `ajout`).
