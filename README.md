# Stratbook

Playbook CS2 interactif, en français, pensé pour le téléphone. V1 : une seule stratégie, Dust 2 Terro, Split A (3 Long + 2 Short).

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

- `strategies/` : données des stratégies (JSON), séparées de l'interface.
- `src/` : interface (JavaScript sans framework).
- `tests/` : tests automatiques.

Le contenu tactique vient uniquement du PDF de Greg. Chaque texte des données porte un tag `source` (`pdf` ou `ajout`).
