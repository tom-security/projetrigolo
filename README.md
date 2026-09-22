# DODGE TRAINER

Un entraîneur d'esquive. **Le joueur n'a aucune attaque et aucun sort** : tout
son vocabulaire est défensif. On ne gagne pas, on tient.

Ouvrir `index.html` dans un navigateur. Aucune dépendance, aucun build.

---

## Le contrat

**Une touche = la mort.** Pas de barre de vie, pas de régénération. Le hitbox
fait 4,6 px et reste affiché en permanence : aucune mort ne doit être
inexplicable.

En face, une boucle punition / récompense serrée :

| | |
|---|---|
| **Punition** | Un objectif raté déclenche une vague de punition immédiate, vide la jauge d'adrénaline et pousse l'intensité d'un cran. |
| **Récompense** | Chaque objectif validé débloque un outil définitif pour la run : dash, focus, adrénaline, phase… |

Rien n'est donné au départ. Au lancement, on ne sait que **bouger**.

---

## Contrôles

| Touche | Action | Disponibilité |
|---|---|---|
| `ZQSD` / `WASD` / flèches | Déplacement | dès le départ |
| `Espace` | Dash (invincible pendant l'élan) | à débloquer |
| `Maj` | Focus — lent et précis, affiche le rayon de frôlement | à débloquer |
| `E` | Adrénaline — ralentit le monde, pas toi | à débloquer |
| `Échap` / `P` | Pause · `R` relancer | — |

Tactile : glisser n'importe où fait office de stick virtuel.

---

## Les cinq difficultés

Le choix se fait **avant** le lancement, et il change le moteur, pas seulement
les chiffres.

| | Profil | Télégraphe | Persistance de l'explosion | Boules / salve |
|---|---|---|---|---|
| **EASY** | skill pur, zéro spam | 1,60 s | 0,35 s | 1–2 |
| **MEDIUM** | skill superposé, zéro spam | 1,15 s | 0,60 s | 2–3 |
| **HARD** | skill + spam | 0,80 s | 0,95 s | 3–5 |
| **ULTRA HARD** | spam permanent + patterns experts | 0,55 s | 1,40 s | 5–8 |
| **INFERNAL** | inhumain par conception | 0,28 s | 2,20 s | 8–14 |

### Les « grosses boules » (zones d'effet)

C'est le curseur central. Une explosion se joue en trois temps —
**télégraphe → détonation → persistance** — et c'est la *persistance* qui fait
la difficulté : en easy la flaque létale disparaît presque aussitôt, en
infernal elle reste 2,2 s et se superpose aux suivantes jusqu'à fermer l'arène.

Trois choses s'ajoutent à cela avec la difficulté :

- **le nombre** par salve (1–2 → 8–14) ;
- **les répliques** : à partir de HARD, une explosion en déclenche d'autres
  autour d'elle — une erreur ne se paie plus une fois mais en chaîne ;
- **la persistance progressive** : elle s'allonge encore avec l'intensité, donc
  avec le temps passé en vie (`linger + lingerGrowth × intensité`).

La première boule d'une salve tombe toujours sur ta **position anticipée** :
rester immobile ne marche jamais.

### INFERNAL

Ce mode n'est pas équilibré, et c'est volontaire. Visée prédictive sans aucune
erreur, fenêtres de réaction sous 120 ms, dash **sans invincibilité**, faisceau
traqueur qui impose de changer de direction en continu, et une « singularité »
qui fait exploser presque toute l'arène en ne laissant que quelques îlots. Il
sert à mesurer un plafond ou à tester un bot (`window.DODGE` est exposé), pas à
être terminé à la main.

---

## Difficulté progressive

Une **intensité** monte en continu pendant toute la run (`1 + temps × taux`).
Elle pilote en même temps :

- la fréquence des patterns (jusqu'à un plancher),
- la vitesse et le nombre des projectiles,
- le raccourcissement des télégraphes,
- la **superposition** : passé la moitié de la jauge, un pattern peut en
  déclencher un second avant d'avoir fini,
- le **palier** de patterns débloqués — la bibliothèque s'ouvre par tiers, donc
  la montée en difficulté se *voit* au lieu de seulement s'accélérer.

L'arène rétrécit elle aussi par paliers.

### Skill contre spam

Chaque pattern porte trois poids — `skill`, `spam`, `brutal` — et chaque
difficulté un profil qui sert de tirage pondéré.

- EASY / MEDIUM : `spam` à 0 ou presque. Anneaux à brèche, murs, balayages
  laser, salves visées. Tout est lisible, on meurt d'avoir mal lu.
- HARD / ULTRA : `spam` monte à parité. Pluie, grilles mouvantes, tapis
  d'explosions viennent se superposer aux patterns lisibles.
- INFERNAL : `brutal` domine. Prédicteur, floraison contrarotative, traqueur,
  singularité.

---

## Objectifs, buffs et frôlement

Les objectifs sont de deux natures :

- **Tenir** un temps donné → buff offert (EASY : 30 s → **Dash**).
- **Défi** sur une fenêtre : frôler N fois, survivre sans dasher, rester dans le
  cercle intérieur. Réussite → buff. Échec → **vague de punition**.

Le **frôlement** est la seule source d'adrénaline : passer près d'une balle
remplit la jauge, fuir ne rapporte rien. C'est ce qui empêche le jeu de
récompenser la fuite — y compris sur la carte infinie.

---

## Carte infinie

Activable dans le menu, à côté de l'arène fermée.

Des secteurs sont générés à l'infini par hachage déterministe : **piliers** qui
bloquent réellement les projectiles, **flaques** qui ralentissent, **plaques**
qui rechargent le dash. Le champ d'effondrement poursuit le joueur à 52 % de sa
vitesse : fuir fonctionne, mais le champ finit toujours par refermer, et chaque
seconde passée à courir est une seconde sans frôlement, donc sans adrénaline.

**L'arène fermée reste le mode de référence** — c'est là que les records ont un
sens, parce que la surface est identique d'une run à l'autre. La carte infinie
est un mode de variété, pas un mode de mesure. Les records sont d'ailleurs
stockés séparément pour les deux.

---

## Architecture

Scripts classiques chargés dans l'ordre, un espace de noms global par module,
zéro build.

| Fichier | Rôle |
|---|---|
| `js/config.js` | difficultés, buffs, objectifs — **tout l'équilibrage est ici** |
| `js/patterns.js` | bibliothèque d'attaques, avec poids skill/spam/brutal |
| `js/director.js` | intensité, tirage des patterns, vagues de punition |
| `js/objectives.js` | boucle punition / récompense |
| `js/entities.js` | projectiles, explosions, lasers, murs, traqueuses |
| `js/arena.js` | arène fermée, carte procédurale, champ d'effondrement, caméra |
| `js/player.js` | déplacement, dash, focus, frôlement — aucune attaque |
| `js/game.js` | boucle, collisions, audio, persistance |
| `js/hud.js` · `js/main.js` | interface en jeu · menus |

Pas fixe de 1/120 s pour les collisions : aucune balle ne traverse le joueur
entre deux frames.

Pour régler l'équilibrage, il suffit de toucher `js/config.js`. Pour ajouter une
attaque : une fonction dans `js/patterns.js` et une ligne dans le registre.
