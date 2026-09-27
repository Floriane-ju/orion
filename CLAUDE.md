# Orion

Application web (PWA) de planétarium orientée **observation et capture**. Elle prend un lieu, une
date et un matériel, et produit un plan de session exécutable : quelles cibles, à quelle heure,
avec quelle pose, combien d'images, et comment les trouver sans pointage automatique.

Le cahier des charges est `prd.md` — il fait autorité. Chaque module cite la section qu'il
implémente (`§2.1`, `§12.2`…) en tête de fichier. **Avant de coder une règle métier, lire la
section du PRD correspondante.**

## Architecture

```
prd.md ──── autorité : formules, plages, critères d'acceptation
  │
src/registry/   constantes §2.1, domaines de saisie, formules, verdicts, glossaire
  │             (valeurs sourcées, gelées, en lecture seule)
src/core/       moteurs de calcul purs — éphémérides, nuit, visibilité, pose,
  │             cadrage, projection, filé, plan de séance
src/data/       catalogues binaires, IndexedDB, bootstrap, matrice de dégradation
  │
src/ui/         React 19 — Planétarium (canvas), panneaux, fiche cible, mode nuit
```

**Stack :** Vite 8 · React 19 · TypeScript 7 (strict + `noUncheckedIndexedAccess` +
`exactOptionalPropertyTypes`) · `astronomy-engine` · `idb` (IndexedDB) · `vite-plugin-pwa` ·
Vitest (environnement `node`) · pnpm.

**Hors-ligne d'abord.** Les paquets binaires de `public/data/` sont versionnés : un clone doit
démarrer sans réseau (§12.2). Le noyau — planétarium, cadrage, pose, planification, filé — est
intégralement hors-ligne (`src/data/degradation.ts`, §12.5).

**Design system — lire `docs/design-system/README.md` AVANT d'écrire de l'interface.** Les
jetons, les composants partagés, le rythme vertical et la règle des icônes y sont décrits,
avec la liste des douze disciplines qui les tiennent. Écrire une couleur, un écart, un corps
de texte ou un suivi en dur fait échouer `pnpm test` : le raccourci n'existe pas, autant prendre le bon chemin d'emblée.

## Commandes

```bash
pnpm dev              # serveur Vite sur :5173
pnpm test             # toute la suite (vitest run)
pnpm test <motif>     # un sous-ensemble, ex. pnpm test visibles
pnpm typecheck        # tsc --noEmit
pnpm build            # typecheck + build production
pnpm data:build       # régénère public/data/*.bin depuis les catalogues sources
pnpm bench:file       # banc de mesure du filé incrusté
```

## Conventions

- **Aucun nombre en dur.** Toute valeur non issue d'une formule vient de `src/registry/` avec sa
  source, son unité et sa tolérance. Un seuil écrit dans un moteur est un bug.
- **Aucune éphéméride écrite en dur.** Les positions se calculent à l'exécution via
  `astronomy-engine`. Une valeur inventée produit un test d'acceptation faux.
- **Bornes de saisie** : citer `DOMAINES` (`src/registry/domains.ts`), jamais réécrire un min/max.
- **En-tête de fichier** : commentaire qui nomme la section du PRD implémentée et la raison de la
  décision, pas la paraphrase du code.
- **Nommage** : vocabulaire métier en français (`creneaux`, `cadre`, `visibles`, `pose`), termes
  techniques et mathématiques en anglais (`ephem`, `mat3`, `projection`, `optics`).
- **Immutabilité** : `Object.freeze` + `readonly` sur les tables du registre et les structures
  partagées.
- **Commits** : Conventional Commits en français (`feat:`, `fix:`, `chore:`…).

## Suivi de projet — `ovrsee/`

Tickets, plans et carte des pages vivent dans `ovrsee/` (skills `ovrsee` et `ovrsee-tickets`).
`ovrsee/.active*` et `ovrsee/pages/shots/` sont locaux, jamais versionnés. Pour savoir où en est
le projet, lire `ovrsee/tickets/` et `ovrsee/plans/` avant d'ouvrir le code.

## Contraintes

- Ne pas installer de dépendance sans accord explicite. `pnpm` uniquement — jamais `npm`/`npx`.
- Ne pas modifier `prd.md` sans demande explicite : c'est la référence, pas un brouillon.
- Ne pas éditer `public/data/*.bin` à la main — les régénérer avec `pnpm data:build`.
- Ne pas ajouter de télémétrie, d'apprentissage ni d'ajustement automatique du registre : une
  prédiction reproductible est vérifiable, une prédiction qui dérive ne l'est pas.
- **Firefox est un navigateur cible** (navigateur par défaut du poste de développement) :
  toute fonctionnalité CSS/JS doit y marcher. Une propriété réservée à Chrome
  (`interpolate-size`, `calc-size()`…) ne s'utilise qu'avec un repli qui fonctionne dans
  Firefox, et un rendu ou une animation se vérifie dans Firefox, pas seulement dans Chrome.
- Ne pas casser le démarrage hors réseau : tout ajout de donnée obligatoire passe par le
  précache et la matrice de dégradation §12.5.
