# DODGE TRAINER

Un entraîneur d'esquive. **Le joueur n'a aucune attaque et aucun sort** : tout
son vocabulaire est défensif. On ne gagne pas, on tient.

Ouvrir `index.html` dans un navigateur. Aucune dépendance, aucun build.

---

## Fichier unique, transportable

`dodge-trainer.html` est le jeu entier — HTML, CSS et les 24 fichiers JS — dans
**un seul fichier de 223 Ko**. Il se double-clique, fonctionne hors ligne, et
passe par clé USB, mail ou messagerie sans rien installer. Windows, macOS,
Linux, Android : tout ce qui a un navigateur.

Il est versionné dans le dépôt, donc téléchargeable directement sans cloner.

Pour le régénérer après avoir modifié les sources :

```bash
node build.js
```

`build.js` n'a aucune dépendance : il lit `index.html` et remplace chaque
`<link>` et chaque `<script src>` par son contenu, **dans l'ordre d'origine**
— cet ordre compte, les modules se déclarent sur `window` et se lisent entre
eux au chargement. Le script échoue si une référence externe subsiste.

> Pourquoi pas un `.exe` ? Il faudrait Electron (~150 Mo, un build par système)
> ou Tauri (chaîne Rust à installer). Pour un jeu canvas sans backend, le
> fichier HTML autonome est plus petit, plus rapide et marche partout.

---

## Deux modes

Le choix se fait en haut du menu. Chaque mode a son propre moteur, ses propres
difficultés et ses propres records.

| | **BULLET-HELL** | **DODGE LoL** |
|---|---|---|
| Contrôle | Clavier, déplacement libre | **Clic droit**, ordre de déplacement |
| Menace | Rideaux de projectiles | Champions ennemis qui **incantent** |
| Compétence | Lire un pattern, se placer | **Juker** : re-cliquer pendant l'incantation |
| Outils | Dash, focus, adrénaline | Flash, ruée, purge, stase |
| Échelle | Pixels | **Unités LoL** (MS 335-400, Flash 400) |

Le mode bullet-hell est décrit ci-dessous ; le mode LoL a sa propre section à
la fin.

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


---

# Mode DODGE LoL

Le deuxième mode reproduit la mécanique d'esquive de League of Legends, qui
n'est pas la même compétence que l'esquive de bullet-hell.

## Ce qui change

**Le déplacement est un ordre, pas une direction.** Clic droit : le champion
part à vitesse pleine vers ce point et y va jusqu'au bout. Aucune inertie,
aucune accélération — comme en jeu. Tout le skill est dans le choix du point
et l'instant du re-clic. `S` arrête le déplacement en cours.

**La menace a un visage.** Des champions ennemis sont à l'écran, avec une
barre d'incantation et un indicateur au sol. On ne réagit pas à un projectile
qui surgit, on réagit à une animation — le *tell* de LoL.

**Et surtout : ils re-visent pendant qu'ils incantent.** Le point visé est
calculé sur **ton ordre de déplacement**, pas sur ta position. Marcher en
ligne droite revient à leur offrir la cible. Re-cliquer pendant l'incantation
déplace la ligne : c'est le juke, et c'est la seule compétence que ce mode
entraîne. Le taux de prédiction ennemie est affiché en permanence en haut à
gauche, et passe de 0 % en EASY à 100 % en INFERNAL.

## Le contrôle de foule ne tue pas

Un grappin ou un enracinement ne fait aucun dégât. Il te met en position de
mourir du sort suivant — ce qui est exactement la façon dont on meurt en LoL.

| Effet | Conséquence |
|---|---|
| **Racine** | Immobilisé. Le **Flash passe encore**. |
| **Grappin** | Tiré vers le lanceur, puis immobilisé. |
| **Projection** | Plus rien ne répond, Flash compris. |
| **Ralentissement** | Vitesse réduite. |

La **Purge** (`A`) annule tout ça. La garder pour le bon moment fait la
différence entre un enracinement gênant et une mort.

## Les sbires bloquent

Les skillshots à collision (grappins, enracinements) s'arrêtent sur le premier
sbire touché. **Se placer derrière un sbire est une esquive à part entière**,
au même titre qu'un pas de côté. Leur nombre baisse avec la difficulté : 5 en
EASY, 2 en ULTRA, **zéro en INFERNAL** où plus rien ne bloque.

## Grandeurs de référence

Tout est calé sur les vraies valeurs du jeu, y compris le cadrage caméra
(~2050 unités de large).

| | Valeur |
|---|---|
| Vitesse de déplacement | 335 → 400 avec les bottes |
| Rayon de hitbox | 55 (champion ~65) |
| Portée du Flash | 400 |
| Grappin | portée 1050, vitesse 1800, incantation 0,25 s |
| Enracinement | portée 1300, vitesse 1200, largeur 100 |
| Trait mystique | portée 1150, vitesse 2000, traverse tout |
| Zones d'effet | rayon 150 → 210 (Ziggs Q ~130, Xerath R ~200) |

La **fenêtre d'esquive réelle** = incantation + temps de vol. C'est ce nombre
que la difficulté fait varier, pas une densité de projectiles :

| | Incantation | Fenêtre totale | Prédiction | Ennemis | Sbires |
|---|---|---|---|---|---|
| EASY | ×2,0 | ~1,3 s | 0 % | 1–2 | 5 |
| MEDIUM | ×1,4 | ~0,95 s | 45 % | 2–3 | 4 |
| HARD | ×0,9 | ~0,70 s | 75 % | 3–4 | 3 |
| ULTRA HARD | ×0,55 | ~0,50 s | 92 % | 5–7 | 2 |
| INFERNAL | ×0,30 | ~0,25 s | **100 %** | 6–9 | **0** |

## Objectifs propres au mode

Les défis portent sur le geste qu'on veut entraîner : **esquiver N skillshots
de justesse** (passage à moins de 150 unités), survivre sans Flash, ne subir
aucun CC. Les récompenses sont des sorts d'invocateur et des objets — Flash,
ruée, purge, bottes, bouclier de sorts, ténacité, stase.

L'écran de mort diagnostique le geste : si tu donnes moins de 0,55 ordre par
seconde, il te le dit — à ce rythme tu ne jukes pas, tu marches en ligne
droite.

## Architecture

Le mode vit entièrement dans `js/lol/`. Aucun fichier de gameplay du mode
bullet-hell n'a été modifié ; seuls `util.js` et `fx.js` sont partagés, tels
quels.

| Fichier | Rôle |
|---|---|
| `js/lol/config.js` | difficultés, sorts, objectifs — **tout l'équilibrage** |
| `js/lol/abilities.js` | kits ennemis, avec leurs vraies grandeurs |
| `js/lol/units.js` | champions ennemis, sbires, **prédiction de visée** |
| `js/lol/entities.js` | skillshots : ligne, zone, cône, sol, rayon |
| `js/lol/player.js` | déplacement au clic, CC, Flash, purge, stase |
| `js/lol/director.js` · `objectives.js` | effectif ennemi et cadence · punition / récompense |
| `js/lol/arena.js` · `hud.js` · `game.js` | terrain et caméra · interface · moteur |
