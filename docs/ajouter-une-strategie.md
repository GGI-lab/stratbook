# Ajouter une stratégie

Une stratégie, c'est un fichier JSON dans `strategies/`. Il est détecté automatiquement par le site, et vérifié par les tests avant toute publication.

## Étapes

1. Copier `strategies/d2-split-a.json` sous un nouveau nom, par exemple `strategies/d2-rush-b.json`.
2. Mettre le même nom dans `"id"` (`"d2-rush-b"`). C'est l'identifiant du lien : `?s=d2-rush-b`.
3. Choisir la carte dans `"map"` (`"dust2"`). Pour une nouvelle map, voir plus bas.
4. Remplir les textes. Chaque texte porte une source : `"pdf"` s'il vient du document de la strat, `"ajout"` sinon.
5. Décrire **3 à 5 étapes**. Pour chacune :
   - `team` : le plan collectif, par groupe (`long`, `short`, `mid`, `b` ou `all`) ;
   - `calls` : les appels vocaux ;
   - `roles` : la consigne de chaque joueur (une liste vide affiche « Pas de nouvelle consigne ») ;
   - `map.positions` : où est chaque joueur **à la fin** de l'étape (pixels de l'image de la carte) ;
   - `map.look` : le point que chaque joueur regarde (oriente son cône de vision) ;
   - `map.moves` : les tracés. Un tracé part de la position de l'étape précédente et finit près de la nouvelle ;
   - `map.utilities` : smokes, flashs, molotovs et bombe, posés sur une zone de la carte.
6. Lancer `npm test`. Les tests signalent ce qui manque : étapes, rôles, zones inconnues, trajets discontinus, textes sans source.

## Pourquoi les trajets doivent être continus

L'animation fait glisser chaque joueur de sa position à l'étape N vers sa position à l'étape N+1, en suivant le tracé. Elle enchaîne les étapes pour les sauts (1 vers 4) et les rejoue à l'envers pour revenir en arrière. Si un tracé ne part pas de la position précédente, le joueur « sauterait » : le test `trajets continus` l'empêche.

## Ajouter une carte

1. Déposer l'image dans `public/maps/` (vue de dessus, fond transparent, en niveaux de gris).
2. Créer `src/map/<map>.js` sur le modèle de `dust2.js` : image, cadrage (`VIEWBOX`), zones nommées avec un point d'ancrage.
3. L'ajouter dans `src/map/maps.js`.
