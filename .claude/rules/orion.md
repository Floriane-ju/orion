# Orion — règles permanentes

Valables à chaque session, sans exception. Le détail est dans `CLAUDE.md` ; ici, les
non-négociables.

## Interdits

- Écrire un nombre en dur dans un moteur (`src/core/`) ou dans l'UI. Toute constante, plage,
  seuil ou tolérance vient de `src/registry/`.
- Écrire une éphéméride, une coordonnée ou une magnitude en dur, y compris dans un test.
  Les tests d'acceptation vérifient une formule, pas une valeur recopiée.
- Installer une dépendance sans accord. `pnpm` uniquement (`pnpm add`, `pnpm dlx`).
- Modifier `prd.md` ou éditer `public/data/*.bin` à la main.
- Ajouter de la télémétrie ou un ajustement automatique du registre.
- Hors demande explicite : Créer une branche ou un worktree, même si un skill le propose (`using-git-worktrees`, `finishing-a-development-branch`…). Développeuse seule sur le projet : tout se fait et se commite directement sur `main`, sans PR.

## Avant de coder

1. Lire la section du PRD citée par le fichier concerné (`§x.y` en en-tête).
2. Vérifier si la valeur existe déjà dans `src/registry/` (`constants.ts`, `domains.ts`,
   `formulas.ts`, `verdicts.ts`).
3. Pour toute règle astro — visibilité, nuit, lune, pose, cadrage, filé, échantillonnage —
   invoquer le skill `astro-feature-review` avant de trancher.

## Organisation

- Calcul pur dans `src/core/`, données et persistance dans `src/data/`, React dans `src/ui/`.
  Un composant ne calcule pas : il appelle un moteur.
- Fichiers courts. Un composant qui mêle état, calcul et JSX se découpe (`*-calcul.ts`,
  `*-saisie.ts`, sous-composants).
- Un test par comportement dans `tests/`, nommé d'après le module (`visibles.test.ts`).

## Icônes

> Le catalogue complet — jetons, composants, exemples — est dans
> `docs/design-system/README.md`. Ce qui suit en est le non-négociable.

- Toute icône passe par `<Icone nom="..." />` (`src/ui/Icone.tsx`) et la police Material
  Symbols Sharp livrée dans `src/fonts/`. Pas de SVG inline, pas de caractère Unicode
  décoratif (`✕`, `●`, `★`) posé à la place d'un glyphe. Les signes qui se lisent dans une
  phrase (`→`, `×`, `°`, `·`) restent permis — voir le README du design system.
- `nom` est la ligature Material Symbols, en anglais — c'est l'identifiant de la police, pas
  un libellé.
- Le style commun vit dans `.icone` (`styles.css`) : c'est le seul endroit à modifier pour
  changer l'épaisseur, la taille ou la famille de toutes les icônes.
- Dans un contrôle qui porte déjà un `aria-label`, ne pas passer `libelle` : la ligature est
  du texte, elle serait annoncée deux fois.

## Style

- Métier en français (`creneaux`, `cadre`, `pose`), technique en anglais (`mat3`, `projection`).
- `readonly` + `Object.freeze` sur toute structure partagée. Pas de mutation en place.
- Commentaire = pourquoi la décision, jamais quoi fait le code.

## Vérification

Avant d'annoncer qu'un travail est terminé : `pnpm typecheck && pnpm test`, et rapporter la
sortie réelle. Pas de « ça devrait marcher ».

Firefox est un navigateur cible : une propriété CSS/JS réservée à Chrome n'entre qu'avec un
repli qui marche dans Firefox, et un rendu ou une animation se vérifie aussi dans Firefox.
