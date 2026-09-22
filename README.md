# LoL Mechanics Trainer

Entraîneur de mécaniques type League of Legends, 100 % HTML5 Canvas + JavaScript ES6+.
Aucune dépendance, aucun build : ouvre simplement `index.html` dans un navigateur.

## Contrôles

| Entrée | Effet |
| --- | --- |
| **Clic droit** | Déplacement (indicateur vert à 4 chevrons). Sur un sbire : attaque la cible. |
| **A** | Skillshot offensif vers le curseur (50 dégâts, 3 s de recharge, 30 mana) |
| **Z** | Bouclier de 1,5 s absorbant 90 dégâts (8 s, 35 mana) |
| **E** | Dash de 260 px vers le curseur (6 s, 25 mana) |
| **F** | Flash : téléportation instantanée de 150 px vers le curseur (20 s) |
| **Q** puis **clic gauche** | Attack Move (orbwalking / hit & run) |
| **Espace** | Pause |

## Modes d'entraînement

- **Esquive** : skillshots linéaires (type flèche d'Ashe) tirés depuis les bords et zones
  circulaires (type cage de Morgana), toujours précédés d'une indication de ciblage
  rouge de 0,6 s. La difficulté monte d'un palier toutes les 15 secondes.
- **Kiting / CS** : des sbires apparaissent en continu ; alterner clic droit (déplacement)
  et attaque pour farmer sans perdre de mouvement.

## Architecture

- `index.html` — structure, HUD DOM (sorts, cooldowns, barres PV/Mana), overlay de menu
- `style.css` — thème LoL (bleus profonds, accents dorés)
- `game.js` — moteur POO : `Vec2`, `InputHandler`, `Entity`, `Champion`, `Skillshot`,
  `AutoAttack`, `DangerZone`, `Detonation`, `Minion`, `ParticleEffect`, `FloatingText`,
  `MoveIndicator`, `HUD`, `Game`
- Boucle `requestAnimationFrame` avec `deltaTime` borné à 50 ms : vitesse identique
  quelle que soit la machine, 60 FPS constants.
