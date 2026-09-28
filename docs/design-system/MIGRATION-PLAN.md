# Plan de migration — design system Orion

> **Instantané historique du 15 septembre 2026.** Les chiffres, fichiers et jetons cités ici
> sont ceux de cette date (`BarreBas.tsx` a disparu depuis, la suite compte plus de tests). Ce
> qui fait foi aujourd'hui est `README.md`, tenu par les tests.

> Phase 0, livrable 2. Ordre de traitement trié par (fréquence d'usage × faible risque)
> décroissant. Établi sur `AUDIT.md` du 15 septembre 2026.

## Principe de tri

Le plus répété et le plus isolé d'abord ; le plus intriqué avec la cascade ou avec le rendu
en dernier. Ici l'intrication n'est pas métier (les moteurs de `src/core/` ne connaissent pas
le style) : elle est dans la **cascade CSS** et dans la **géométrie du dessin**.

---

## Ce que le plan standard en 5 phases devient ici

| Phase de la méthode | Ce qu'elle devient sur ce dépôt | Pourquoi |
|---|---|---|
| **1 — Tokens** | **Réduite à 4 ajouts de jetons.** Pas de restructuration, pas de couche de primitives, pas d'alias. | Les jetons existent, sont exhaustifs et testés. Créer des primitives doublerait la surface de surcharge du mode nuit sans rien donner (AUDIT §2.1). Aucun alias à créer : rien n'est renommé. |
| **2 — Typographie et styles globaux** | **Réduite à 1 classe nommée** (le micro-libellé) + décision sur `label`. Le composant `Icone` existe déjà : le chantier icônes se limite à 3 substitutions. | L'échelle existe et est testée ; le reset, le focus ring, les états disabled et la transition d'état sont déjà déclarés une fois pour tous les contrôles (styles.css:2350-2378). |
| **3 — Composants** | **3 extractions** : `Interrupteur`, `ChampChoix`, `Tiroir`. | Les neuf autres composants partagés existent et sont réutilisés. |
| **4 — Nettoyage** | 2 suppressions. Aucun alias à retirer. | |
| **5 — Documentation** | README + renvoi depuis `CLAUDE.md`. | Inchangée. |

---

## Ordre de traitement

Chaque ligne = un commit, annulable seul. Vérification après chacune :
`pnpm typecheck && pnpm test`. Pas de `lint` : le dépôt n'en a pas (AUDIT §1).

### Lot A — extractions pures (JSX seul, zéro ligne de CSS touchée)

Aucun risque de régression visuelle : le balisage produit est identique caractère pour
caractère, seuls les appelants changent.

| # | Chantier | Sites | Fichiers touchés | Risque |
|---|---|---|---|---|
| **A1** | `Interrupteur` | 7 | `Interrupteur.tsx` (nouveau) + `PanneauFile-sections`, `PanneauMateriel`, `ModeNuit`, `Verdicts` | très faible |
| **A2** | `ChampChoix` | 8 | `ChampChoix.tsx` (nouveau) + `PanneauMateriel`, `PanneauBoitier`, `PanneauCibles`, `Verdicts` | très faible |
| **A3** | `Tiroir` | 4 | `Tiroir.tsx` (nouveau) + `BarreBas`, `BarreHaut`, `LegendeCouleurs` | faible |

**API visée — `Interrupteur`**

```ts
interface InterrupteurProps {
  readonly actif: boolean
  readonly surChangement: (actif: boolean) => void
  readonly children: ReactNode
  readonly desactive?: boolean | undefined   // défaut absent = rendu actuel
}
```

**API visée — `ChampChoix`** (générique, pour ne rien perdre du typage strict)

```ts
interface ChampChoixProps<T extends string> {
  readonly cle: CleGlossaire                 // rendue par <Etiquette>
  readonly valeur: T
  readonly surChangement: (valeur: T) => void
  readonly options: readonly { readonly valeur: T; readonly libelle: ReactNode }[]
}
```

**API visée — `Tiroir`**

```ts
interface TiroirProps {
  readonly modificateur: string              // 'site' | 'nuit' | 'outils' | 'legende'
  readonly icone: ReactNode                  // <Icone …/> déjà construite par l'appelant
  readonly titre: ReactNode
  readonly children: ReactNode
  readonly alerte?: boolean | undefined      // défaut absent = pas d'attribut data-alerte
}
```

Trois axes, sous la limite d'explosion. `icone` prend un `ReactNode` plutôt qu'un `nom`
parce que deux des quatre sites passent une ligature conditionnelle **et** un `libelle` :
une prop `nom` obligerait à en ajouter deux autres pour rien.

**À vérifier visuellement après A1-A3 :** aucun écran. Le HTML est inchangé — si les tests
passent, le rendu l'est aussi. Contrôle de sûreté possible : `git diff` sur le HTML de
`coque.test.tsx` ne doit produire aucune différence.

---

### Lot B — jetons manquants (CSS, couvert par les tests de garantie)

| # | Chantier | Déclarations | Risque |
|---|---|---|---|
| **B1** | `--gouttiere-ecran: 1.5rem` → remplace `calc(100vw - 1.5rem)` ×4 (lignes 544, 552, 688, 1269) | 4 | faible |
| **B2** | `--filet-accent: 3px` → remplace `border-left-width: 3px` ×2 et `border-left: 3px` ×1 (874, 1495, 1689) | 3 | faible |
| **B3** | `--decalage-pointille: 3px` → remplace `text-underline-offset: 3px` ×2 (1667, 2489) | 2 | faible |
| **B4** | `--suivi-saisie: 0.05em`, `--suivi-etape: 0.12em`, `--suivi-horaire: 0.08em`, **ou** rattachement à l'échelle existante | 3 | faible |

B1-B3 sont des substitutions à valeur identique : zéro pixel change, par construction.

**B4 pose une vraie question.** Trois valeurs hors échelle. Deux options :

- **Option A — nommer les trois.** Trois jetons de plus, zéro pixel change, l'échelle de
  suivi passe de 3 à 6 valeurs et perd son caractère d'échelle.
- **Option B — les ramener sur `--suivi-micro` (0.14em).** L'échelle reste à trois pas, mais
  **la chasse de trois blocs de texte change** : les saisies, les titres d'étape et les
  horaires du plan s'espacent davantage.

→ **Question ouverte n°5.** Par défaut je prends l'**option A** : ne rien changer à l'écran
sans validation est la contrainte fondamentale.

**À vérifier visuellement après B1-B4 :** rien, en option A.

---

### Lot C — la classe de texte manquante

| # | Chantier | Règles | Risque |
|---|---|---|---|
| **C1** | Nommer le micro-libellé (7 occurrences identiques, AUDIT §3.1) | 7 | moyen |

Le motif est écrit sept fois. Deux façons de le nommer, et elles n'ont pas le même coût :

- **Option A — une classe utilitaire** `.micro-libelle`, posée dans le JSX aux sept endroits.
  Explicite, mais sept fichiers TSX à toucher, et certaines des sept règles portent sur des
  sélecteurs d'élément (`th`) où il n'y a pas de JSX à modifier.
- **Option B — un sélecteur groupé** dans la feuille : les sept sélecteurs existants
  rassemblés en une seule règle. Zéro fichier TSX touché, zéro pixel change, la duplication
  disparaît. En revanche rien n'empêche la huitième occurrence d'être écrite à la main.
- **Option C — B, plus un test** dans `echelles.test.ts` qui interdit d'écrire ce quadruplet
  ailleurs que dans le groupe. C'est exactement la mécanique par laquelle la feuille tient
  déjà ses couleurs et ses écarts.

→ **Question ouverte n°6.** Recommandation : **option C**. Elle est la seule qui aligne le
traitement du texte sur celui — déjà en place et éprouvé — des couleurs et des espacements.

**À vérifier visuellement après C1 :** rien (aucune valeur ne change).

---

### Lot D — les icônes en dette

| # | Chantier | Sites | Risque |
|---|---|---|---|
| **D1** | `●` → `<Icone nom="circle" />` — `PlanSession.tsx:303` | 1 | faible |
| **D2** | `✛` → glyphe à choisir — `PlanSession.tsx:292` | 1 | **change le dessin** |
| **D3** | `★` → `star` (ou autre) — `PlanSession.tsx:303, 320` | 2 | **change le dessin** |

Placé après les lots A-C parce que c'est le **premier chantier du plan qui modifie ce qu'on
voit**. Le schéma §8.4 positionne ses repères en pourcentage avec `translate(-50%, -50%)` :
la boîte d'un glyphe Material n'a pas la chasse d'un caractère de texte, et le centrage
optique bougera.

→ **Question ouverte n°4** (choix des glyphes) à trancher avant d'ouvrir ce lot.

**À vérifier visuellement après D1-D3 :** la carte « Plan de séance », section schéma de
pointage (§8.4) — ouvrir une cible avec au moins un ancrage. C'est le seul écran touché.

---

### Lot E — la cascade de `label` (AUDIT §3.3, D8)

| # | Chantier | Règles supprimées | Risque |
|---|---|---|---|
| **E1** | Faire porter le style d'étiquette par un enfant nommé plutôt que par `label`, et supprimer les sept annulations | ~7 blocs allégés | **élevé** |

Placé en dernier parce que c'est le seul chantier qui touche la cascade de **tous les champs
de saisie du produit**. Le gain est réel — sept blocs d'annulation disparaissent, et la classe
de C1 devient utilisable sans contorsion — mais le risque l'est aussi : chaque `<label>` du
produit change de contrat.

→ **Question ouverte n°3.** Ce lot peut légitimement être **abandonné** : la verrue est
documentée, elle ne grandit pas, et le coût de la corriger dépasse peut-être ce qu'elle
coûte. Je ne l'ouvre pas sans un « oui » explicite.

**À vérifier visuellement si ouvert :** tous les panneaux porteurs de champs — Matériel,
Boîtier, Cibles, Filé, Mode nuit, Réglages, Masque d'horizon, Site. C'est-à-dire presque
tout le produit.

---

### Lot F — nettoyage (phase 4)

| # | Chantier | Risque |
|---|---|---|
| **F1** | Supprimer `.facilite-ligne` (styles.css:2150-2154), morte | nul |
| **F2** | Fusionner les deux blocs `.coque .tiroir[open] > .tiroir-contenu` du média 1100px (lignes 1122 et 1142) | nul |

Aucun alias à retirer : la phase 1 n'en crée pas.

---

### Lot G — documentation (phase 5)

| # | Chantier |
|---|---|
| **G1** | `docs/design-system/README.md` : les jetons, le catalogue des composants avec variantes et exemple d'usage, les règles pour un nouvel écran |
| **G2** | Renvoi vers ce README depuis `CLAUDE.md` (section Architecture) et depuis `.claude/rules/orion.md` |

---

## Résumé de l'ordre

```
A1 Interrupteur      ·  7 sites  ·  JSX pur       ·  aucun écran à revoir
A2 ChampChoix        ·  8 sites  ·  JSX pur       ·  aucun écran à revoir
A3 Tiroir            ·  4 sites  ·  JSX pur       ·  aucun écran à revoir
B1 --gouttiere-ecran ·  4 décl.  ·  CSS iso-pixel ·  aucun écran à revoir
B2 --filet-accent    ·  3 décl.  ·  CSS iso-pixel ·  aucun écran à revoir
B3 --decalage-…      ·  2 décl.  ·  CSS iso-pixel ·  aucun écran à revoir
B4 suivis hors éch.  ·  3 décl.  ·  QUESTION 5    ·  aucun écran (option A)
C1 micro-libellé     ·  7 règles ·  QUESTION 6    ·  aucun écran
D1 ● → circle        ·  1 site   ·  DESSIN        ·  Plan de séance §8.4
D2 ✛ → ?             ·  1 site   ·  QUESTION 4    ·  Plan de séance §8.4
D3 ★ → ?             ·  2 sites  ·  QUESTION 4    ·  Plan de séance §8.4
E1 cascade label     ·  7 règles ·  QUESTION 3    ·  presque tout le produit
F1 CSS morte         ·  1 bloc
F2 bloc dupliqué     ·  2 blocs
G1 README   G2 renvoi CLAUDE.md
```

---

## Questions ouvertes — à trancher avant d'ouvrir les lots concernés

### Q1 — Faut-il introduire une couche de primitives sous les couleurs ? (bloque : rien)

La méthode demande `primitives → tokens sémantiques`. Ce dépôt n'a que le second niveau :
treize jetons directement sémantiques (`--fond`, `--texte`, `--accent`…).

- **Ne rien faire (recommandé).** Le mode nuit surcharge **chaque** jeton sémantique
  individuellement, avec une valeur calculée (`rgb(calc(--luminance-nuit * N) 0 0)`). Une
  couche de primitives ferait une seconde table à tenir, sans consommateur : aucun jeton
  sémantique ne partage sa valeur avec un autre.
- **Introduire des primitives.** Coût : +13 déclarations, un test de couverture à réécrire
  (`mode-nuit.test.tsx` « couvre toutes les variables de couleur »), et une indirection que
  personne n'utilise.

### Q2 — Renommer `--texte` (couleur) pour lever la collision avec `--texte-*` (tailles) ? (bloque : rien)

`--texte` est une couleur, `--texte-corps` une taille. Deux familles, un préfixe.

- **Ne rien faire (recommandé).** Le nom est cité en dur par dix tests et par tout le produit.
- **Renommer** `--texte` → `--couleur-texte`. Diff large, zéro pixel change, tests à mettre
  à jour. À faire seulement si la collision vous gêne à la lecture.

### Q3 — Ouvre-t-on le lot E (cascade de `label`) ? (bloque : E1)

Voir AUDIT §3.3. Sept annulations existent parce que `label` impose sa casse à tout son
sous-arbre. Corriger = toucher tous les champs du produit. Ne pas corriger = garder sept
blocs d'annulation documentés, qui ne grandissent pas.

**Recommandation : ne pas ouvrir**, sauf si vous prévoyez d'ajouter beaucoup de champs.

### Q4 — Quels glyphes Material pour `✛` et `★` ? (bloque : D2, D3)

| Actuel | Rôle | Candidats |
|---|---|---|
| `✛` | cible au centre du cadre | `my_location` (déjà le glyphe « viser » du produit, PanneauCibles:303) · `add` · `center_focus_weak` · `filter_center_focus` |
| `★` | ancrage principal | `star` · `star_rate` |

Aucun glyphe Material ne reprend exactement le dessin de `✛` (croix à empattements). Le plus
proche **sémantiquement** dans ce produit est `my_location`, déjà employé pour « viser ».
`●` → `circle` est tranché sans question : c'est déjà la ligature de `Pastilles.tsx`.

### Q5 — Les trois `letter-spacing` hors échelle : nommer ou fusionner ? (bloque : B4)

Option A (nommer, recommandée) : zéro pixel change, l'échelle passe à 6 valeurs.
Option B (ramener sur `--suivi-micro`) : l'échelle reste à 3 pas, **la chasse de trois blocs
de texte change** — saisies, titres d'étape, horaires du plan.

### Q6 — Comment nommer le micro-libellé ? (bloque : C1)

Option A (classe utilitaire dans le JSX) · Option B (sélecteur groupé en CSS) ·
**Option C (B + un test qui interdit d'écrire le quadruplet ailleurs — recommandée)**.

---

## Ce que ce plan ne fait pas, et pourquoi

| Non fait | Raison |
|---|---|
| Découper `styles.css` | T-0193 : c'est une table, et dix tests lisent son texte. La découper déplace la charge de preuve des garanties. |
| Créer des jetons de z-index | Sept valeurs, un seul bloc, un ordre d'empilement déjà énoncé en commentaire. |
| Créer un jeton de breakpoint | Une seule valeur (1100px). Abstraction « au cas où ». |
| Créer `Modale`, `Badge`, `Toast`, `EtatVide`, `Skeleton`, `Pagination` | Aucun de ces éléments n'existe dans le produit. |
| Unifier les deux familles d'`onglet` | Sémantiques différentes — commutateur d'état vs filtre de portée. Règle de décision n°5. |
| Créer `Bouton` | Le style est déjà porté par le sélecteur d'élément `button`, appliqué à 23 boutons sans classe. Un composant n'ajouterait qu'une indirection. |
| Ajouter ESLint / Stylelint | Hors périmètre design system, et pas d'installation de dépendance sans accord (`CLAUDE.md`). À proposer séparément si souhaité. |
| Toucher `src/core/`, `src/data/`, `src/registry/` | Aucun style n'y vit. |

---

## État

**Phase 0 terminée. En attente de validation avant d'ouvrir le lot A1.**
