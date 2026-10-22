# Ajouter une stratégie

Deux façons de faire : directement dans l'application (le plus simple), ou en ajoutant un fichier JSON au dépôt.

## Dans l'application

1. Choisir le side avec le bouton **T / CT** (jaune pour les terros, bleu pour les CT).
2. Ouvrir le menu **Stratégies** (icône liste), puis **Nouvelle stratégie**. Pour changer une stratégie existante : **Modifier cette stratégie**.
3. Donner un titre. Le side peut encore être changé tant qu'aucun joueur n'a été déplacé (les joueurs repartent alors du spawn de ce side).
4. **Départ** : glisser les 5 joueurs à leur position de début de round.
5. Pour chaque étape (1 à 5, bouton **+** pour en ajouter une) :
   - glisser chaque joueur là où il **finit** l'étape. Le trajet est calculé tout seul en suivant les couloirs de la carte. Un joueur qu'on ne déplace pas reste sur place ;
   - toucher un joueur pour le sélectionner : glisser le **point blanc** oriente son regard (cône), **Course / Shift** règle le tracé (trait plein ou pointillés) ;
   - **Poser un utilitaire** : choisir le lanceur, toucher S, F, M ou C4, puis toucher la carte. Un utilitaire se déplace en le glissant et se supprime après l'avoir touché ;
   - remplir le volet : titre de l'étape, plan de l'équipe par groupe, appels, mission de chaque joueur (une consigne par ligne).
6. **Rôles des joueurs** : groupe, rôle, résumé et utilitaires de chacun (affichés dans sa vue, à toutes les étapes).
7. **Enregistrer**. La stratégie est gardée sur ce téléphone (badge « Perso » dans le menu, « Modifiée » pour une stratégie du dépôt changée ici).

Un brouillon est gardé pendant la saisie : si la page se ferme par erreur, il est proposé à la réouverture de l'éditeur.

### Partager

**Partager** joint la stratégie complète au lien (environ 1 à 3 Ko). L'ami qui l'ouvre la retrouve dans son menu, même après fermeture. Il n'y a pas de serveur : une stratégie créée ici n'existe que sur les téléphones qui ont ouvert le lien. Pour la rendre visible par tous sans lien, l'ajouter au dépôt (ci-dessous).

**Revenir à la version d'origine** efface les modifications locales d'une stratégie du dépôt. **Supprimer la stratégie** efface une stratégie perso de ce téléphone.

## Dans le dépôt

1. Dans l'éditeur, **Télécharger le fichier (.json)**, ou copier `strategies/d2-split-a.json` sous un nouveau nom.
2. Déposer le fichier dans `strategies/`. Le nom du fichier doit être l'id (`"id": "d2-ct-retake-b"` → `d2-ct-retake-b.json`). C'est l'identifiant du lien : `?s=d2-ct-retake-b`.
3. Lancer `npm test`. Les tests signalent ce qui manque. Une stratégie du dépôt doit avoir 3 à 5 étapes et un plan d'équipe à chaque étape ; chaque texte porte une source : `"pdf"` s'il vient du document de la strat, `"ajout"` sinon.

### Format (rappel)

- `side` : `"Terro"` ou `"CT"`.
- `frame` (facultatif) : cadrage affiché, en pixels de l'image ; sans lui, toute la carte.
- `start` (facultatif) : position de chaque joueur au départ ; sans lui, début du tracé de l'étape 1.
- `steps[].map.positions` : position de chaque joueur **à la fin** de l'étape ; `look` : point regardé ; `moves` : tracés (`"pace": "walk"` = pointillés) ; `utilities` : `{ type, by, at: [x, y] }` ou `{ type, by, zone }` (zone nommée de la carte).
- Groupes : `long`, `short`, `mid`, `a`, `b`, et `all` pour les plans et appels de toute l'équipe.

## Pourquoi les trajets doivent être continus

L'animation fait glisser chaque joueur de sa position à l'étape N vers sa position à l'étape N+1, en suivant le tracé. Elle enchaîne les étapes pour les sauts (1 vers 4) et les rejoue à l'envers pour revenir en arrière. Si un tracé ne part pas de la position précédente, le joueur « sauterait » : le test `trajets continus` l'empêche. L'éditeur garantit cette continuité tout seul.

## Ajouter une carte

1. Déposer l'image dans `public/maps/` (vue de dessus, zones jouables opaques, reste transparent, en niveaux de gris).
2. Générer sa grille de navigation (calcul des trajets) : `pip install pillow`, puis `python3 scripts/nav-grid.py public/maps/<map>.webp src/map/<map>-nav.js`.
3. Créer `src/map/<map>.js` sur le modèle de `dust2.js` : image, cadrage (`VIEWBOX`), zones nommées, positions de départ (`SPAWNS`), grille (`nav`).
4. L'ajouter dans `src/map/maps.js`.
