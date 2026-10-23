# Ajouter une stratégie

Toutes les stratégies sont dans le dépôt GitHub, dossier `strategies/` (un fichier JSON par stratégie). Deux façons de les créer ou de les modifier : dans l'application (le plus simple, chaque enregistrement fait un commit), ou en déposant un fichier à la main.

## Accès éditeur (Greg seulement)

Créer, modifier et supprimer des stratégies est réservé à Greg. Les amis voient les stratégies mais pas les actions d'édition.

1. Créer un jeton GitHub : photo de profil, **Settings**, **Developer settings**, **Personal access tokens**, **Fine-grained tokens**, **Generate new token**. **Repository access** : seulement `GGI-lab/stratbook`. **Permissions** : **Contents**, **Read and write**, rien d'autre. Choisir une durée de validité.
2. Dans l'application : menu **Stratégies**, **Modifier les stratégies**. La première fois sur un appareil : coller le jeton et **inventer** un mot de passe (8 caractères au moins, il n'y en a pas de fixé à l'avance). Ensuite : ce mot de passe seul. Mot de passe oublié : **Oublier l'accès de cet appareil**, puis recommencer avec le jeton.
3. **Verrouiller l'édition** (menu) referme l'accès ; il se referme aussi en fermant l'onglet.

Le jeton est gardé chiffré par le mot de passe sur l'appareil (AES-GCM, clé dérivée par PBKDF2) ; il n'est jamais écrit dans le dépôt, qui est public. La vraie protection est le jeton : sans lui, personne ne peut écrire dans le dépôt, même en contournant l'écran du mot de passe. Jeton perdu ou volé : le révoquer sur GitHub, en créer un autre, puis **Oublier l'accès de cet appareil** et le reconfigurer.

## Dans l'application

1. Choisir le side avec le bouton **T / CT** (jaune pour les terros, bleu pour les CT).
2. Ouvrir le menu **Stratégies** (icône liste), puis **Nouvelle stratégie**. Pour changer une stratégie existante : **Modifier cette stratégie**.
3. Donner un titre. Le side peut encore être changé tant qu'aucun joueur n'a été déplacé (les joueurs repartent alors du spawn de ce side).
4. **Départ** : glisser les 5 joueurs à leur position de début de round.
5. Pour chaque étape (1 à 5, bouton **+** pour en ajouter une) :
   - glisser chaque joueur là où il **finit** l'étape. Le trajet est calculé tout seul en suivant les couloirs de la carte (le plus court chemin). Un joueur qu'on ne déplace pas reste sur place ;
   - toucher un joueur pour le sélectionner : glisser le **point blanc** oriente son regard (cône), **Course / Shift** règle le tracé (trait plein ou pointillés) ;
   - pour choisir par où il passe (Mid plutôt que Long, par exemple), glisser le **losange** posé au milieu de son trajet : il devient un point de passage, gardé même si on déplace l'arrivée. **Retirer le point de passage** revient au plus court chemin ;
   - **Poser un utilitaire** : choisir le lanceur, toucher S, F, M ou C4, puis toucher la carte. Un utilitaire se déplace en le glissant et se supprime après l'avoir touché ;
   - remplir le volet : titre de l'étape, plan de l'équipe par groupe, appels, mission de chaque joueur (une consigne par ligne).
   - **Défaire / Refaire** (flèches sous la carte, ou Ctrl+Z / Ctrl+Maj+Z sur ordinateur) annule ou rétablit la dernière action : jeton, regard, point de passage, utilitaire, étape, texte.
   - Sur téléphone, la carte reste en haut de l'écran pendant qu'on écrit les consignes de l'étape ; elle se réduit quand le clavier est ouvert.
6. **Rôles des joueurs** : groupe, rôle, résumé et utilitaires de chacun (affichés dans sa vue, à toutes les étapes).
7. **Enregistrer** publie la stratégie dans le dépôt GitHub (un commit, fichier `strategies/<id>.json`). Elle est visible tout de suite par tes amis avec le lien (l'application lit GitHub au démarrage) ; le site lui-même est mis à jour en une minute environ. Si la publication échoue (réseau, jeton), l'éditeur reste ouvert pour réessayer. Si la stratégie a été changée ailleurs entre-temps (autre appareil), l'application demande avant de remplacer.

Un brouillon est gardé pendant la saisie : si la page se ferme par erreur, il est proposé à la réouverture de l'éditeur. Le bouton retour du téléphone fait comme **Annuler** (confirmation s'il y a des changements).

### Partager

**Partager** envoie un lien lisible avant même de cliquer : stratégie, étape, vue, puis les pseudos (J1 à J5, séparés par des virgules) :

`https://ggi-lab.github.io/stratbook/d2-split-a/etape-2/j2?pseudos=Greg,Alex,,Sam,Zoé`

- étape : `etape-1` à `etape-5`, ou `recap` ; vue : `equipe` ou `j1` à `j5` ;
- une nouvelle stratégie reçoit un id tiré de son titre (« Retake B » côté CT donne `d2-ct-retake-b`), qui ne change plus ensuite pour que les liens envoyés restent valables ;
- les anciens liens (`?s=d2-split-a&step=2&role=j2&n1=Greg`) marchent toujours.

La stratégie elle-même est lue dans GitHub. Ces adresses n'existent pas en fichiers : GitHub Pages répond avec `404.html`, une copie de l'application générée à la construction (`vite.config.js`).

### Supprimer

**Supprimer la stratégie** (en bas de l'éditeur) retire le fichier du dépôt, pour tout le monde (un commit). Les liens déjà envoyés ne l'ouvrent plus.

### Anciennes stratégies du téléphone

Les stratégies créées avant l'enregistrement dans GitHub sont restées sur le téléphone qui les a créées (badge « Sur ce téléphone »). Greg les publie avec **Publier les stratégies de ce téléphone** (menu Stratégies, accès déverrouillé).

## Dans le dépôt

1. Copier `strategies/d2-split-a.json` sous un nouveau nom.
2. Déposer le fichier dans `strategies/`. Le nom du fichier doit être l'id (`"id": "d2-ct-retake-b"` → `d2-ct-retake-b.json`). C'est l'identifiant du lien : `?s=d2-ct-retake-b`.
3. Lancer `npm test`. Les tests vérifient que le fichier est bien formé (le même contrôle que pour une stratégie publiée depuis l'application) : 1 à 5 étapes, 5 rôles, positions dans la carte, trajets continus, chaque texte avec une source (`"pdf"` s'il vient du document de la strat, `"ajout"` sinon). Un fichier mal formé bloque la mise en ligne.

### Format (rappel)

- `side` : `"Terro"` ou `"CT"`.
- `frame` (facultatif) : cadrage affiché, en pixels de l'image ; sans lui, toute la carte.
- `start` (facultatif) : position de chaque joueur au départ ; sans lui, début du tracé de l'étape 1.
- `steps[].map.positions` : position de chaque joueur **à la fin** de l'étape ; `look` : point regardé ; `moves` : tracés (`"pace": "walk"` = pointillés, `"via": [[x, y]]` = point de passage imposé) ; `utilities` : `{ type, by, at: [x, y] }` ou `{ type, by, zone }` (zone nommée de la carte).
- Groupes : `long`, `short`, `mid`, `a`, `b`, et `all` pour les plans et appels de toute l'équipe.
- `updatedAt` (facultatif) : date de la version en millisecondes, ajoutée par l'application à chaque enregistrement.

## Pourquoi les trajets doivent être continus

L'animation fait glisser chaque joueur de sa position à l'étape N vers sa position à l'étape N+1, en suivant le tracé. Elle enchaîne les étapes pour les sauts (1 vers 4) et les rejoue à l'envers pour revenir en arrière. Si un tracé ne part pas de la position précédente, le joueur « sauterait » : le test `trajets continus` l'empêche. L'éditeur garantit cette continuité tout seul.

## Ajouter une carte

1. Déposer l'image dans `public/maps/` (vue de dessus, zones jouables opaques, reste transparent, en niveaux de gris).
2. Générer sa grille de navigation (calcul des trajets) : `pip install pillow`, puis `python3 scripts/nav-grid.py public/maps/<map>.webp src/map/<map>-nav.js`.
3. Créer `src/map/<map>.js` sur le modèle de `dust2.js` : image, cadrage (`VIEWBOX`), zones nommées, positions de départ (`SPAWNS`), grille (`nav`).
4. L'ajouter dans `src/map/maps.js`.
