# Audit du design system — Orion

> **Instantané historique du 15 septembre 2026.** Les chiffres, fichiers et jetons cités ici
> sont ceux de cette date (`BarreBas.tsx` a disparu depuis, la suite compte plus de tests). Ce
> qui fait foi aujourd'hui est `README.md`, tenu par les tests.

> Phase 0. Lecture seule, aucun code modifié. Relevé du 15 septembre 2026, sur `main` à
> `0a31935`.

## 0. Résultat en une phrase

Le design system **existe déjà** et il est **tenu par des tests**. Ce dépôt n'est pas un
projet construit écran par écran : il a une feuille unique, une palette entièrement
variabilisée, deux échelles (espacement, typographie), un composant d'icône unique, et dix
tests qui lisent le TEXTE de la feuille pour empêcher la dérive. La migration à conduire
n'est donc pas une extraction : c'est un **rattrapage sur quatre points précis**.

Baseline vérifiée avant toute chose :

```
$ pnpm typecheck    → tsc --noEmit, aucune sortie
$ pnpm test         → Test Files 81 passed (81) · Tests 1306 passed (1306) · 8.21s
```

---

## 1. Stack et conventions de style

| Élément | Constat |
|---|---|
| Framework | React 19.2 · Vite 8 · TypeScript 7 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Approche CSS | **CSS global, une seule feuille.** Pas de CSS Modules, pas de Tailwind, pas de styled-components, pas de SCSS |
| Feuille | `src/ui/styles.css` — 2503 lignes, 240 blocs de règles, 121 classes |
| Import | une fois, dans `src/main.tsx` |
| Thème | jeté par variables CSS sur `:root`, basculé par `:root[data-mode-nuit='true']` |
| Tests | Vitest, environnement `node`, 81 fichiers dans `tests/` |
| Build | `pnpm build` = `tsc --noEmit && vite build` |
| **Lint** | **aucun.** Pas d'ESLint, pas de Prettier, pas de Stylelint dans `package.json` |
| Gestionnaire | pnpm 11.8 (obligatoire) |

### Le fichier de 2503 lignes est un choix documenté, pas une dette

L'en-tête de `styles.css` (T-0193) explique pourquoi la feuille reste d'un seul tenant malgré
le plafond de 800 lignes du projet : c'est une **table**, comme `registry/constants.ts`, et
`mode-nuit.test.tsx` / `coque.test.tsx` / `echelles.test.ts` lisent son texte. La découper
ferait dépendre la garantie « aucune couleur en dur » d'une liste de fichiers à tenir à jour.

**Conséquence pour la migration : on ne découpe pas la feuille.** Toute proposition qui la
fragmente déplace la charge de preuve sur les tests de garantie.

---

## 2. Variables CSS — inventaire par famille

### 2.1 Couleurs (bloc `:root` n°1, lignes 35-53)

Treize jetons, **tous repris un à un** par le bloc mode nuit (lignes 90-104), lui-même
vérifié par `mode-nuit.test.tsx` (« couvre toutes les variables de couleur du thème par
défaut »).

| Jeton | Jour | Nuit | Rôle |
|---|---|---|---|
| `--fond` | `#050807` | `#000000` | fond de page et de scène |
| `--surface` | `#0a0f0e` | `rgb(calc(L*8) 0 0)` | barres, cartes |
| `--surface-haute` | `#101817` | `rgb(calc(L*18) 0 0)` | état actif d'un contrôle |
| `--texte` | `#eafff5` | `rgb(calc(L*250) 0 0)` | texte principal |
| `--attenue` | `#9db3a9` | `rgb(calc(L*242) 0 0)` | texte secondaire, étiquettes |
| `--accent` | `#a9ecc9` | `rgb(calc(L*246) 0 0)` | commandes, valeurs actives |
| `--avertissement` | `#f4c76a` | `rgb(calc(L*250) 0 0)` | rail sous la main |
| `--bordure` | `#2b3a34` | `rgb(calc(L*90) 0 0)` | filets de conteneur |
| `--bordure-controle` | `#5a6964` | `rgb(calc(L*188) 0 0)` | filets de contrôle (≥ 3:1) |
| `--bordure-faible` | `#18211d` | `rgb(calc(L*45) 0 0)` | séparateurs de ligne |
| `--alerte` | `#ff6f5e` | `rgb(calc(L*255) 0 0)` | erreur, focus, « ceci se règle » |
| `--fond-alerte` | `#1a0f0d` | `rgb(calc(L*26) 0 0)` | aplat d'erreur |
| `--fond-accent` | `#0f1a16` | `rgb(calc(L*20) 0 0)` | aplat de survol, fond de saisie |

**Doublons : zéro. Valeurs proches mais différentes : zéro. Couleurs en dur hors palette :
zéro** — vérifié par grep (`#hex|rgba?\(` hors des deux blocs `:root` → aucun résultat) et
par `mode-nuit.test.tsx` (« n'écrit aucune couleur en dur hors des blocs de palette »).

> **Il n'y a pas de couche de primitives.** Les treize jetons sont directement sémantiques.
> C'est une divergence assumée d'avec la méthode standard (primitives → sémantiques), et
> elle a une raison : le mode nuit surcharge **chaque jeton sémantique**. Une couche de
> primitives (`--vert-500`) doublerait la surface à surcharger, sans rien donner en retour.
> → **Question ouverte n°1 (voir MIGRATION-PLAN.md §Questions).**

### 2.2 Espacement — échelle à sept pas (lignes 182-189)

`--pas-0` 0.125rem · `--pas-1` 0.25rem · `--pas-2` 0.5rem · `--pas-3` 0.75rem ·
`--pas-4` 1rem · `--pas-5` 1.5rem · `--pas-6` 2rem

Tenue par `echelles.test.ts` : « ne laisse aucun écart écrit en dur dans une propriété
d'espacement » (`padding`, `margin`, `gap`, `row/column-gap`). Une seule exception, commentée :
`-1px` sur `.scene-description`.

**Dette : aucune.**

### 2.3 Typographie — échelle à six rangs (lignes 197-202)

`--texte-titre` 1rem · `--texte-corps` 0.95rem · `--texte-appui` 0.85rem ·
`--texte-legende` 0.78rem · `--texte-micro` 0.7rem · `--texte-mini` 0.65rem

Tenue par `echelles.test.ts` (« six rangs, strictement décroissants »).

**Dette de nommage :** `--texte` est une **couleur**, `--texte-corps` est une **taille**. Deux
familles sous le même préfixe. Renommer casse dix tests qui citent les noms en dur.
→ **Question ouverte n°2.**

### 2.4 Suivi (letter-spacing) — échelle à trois pas (lignes 176-178)

`--suivi-micro` 0.14em · `--suivi-titre` 0.24em · `--suivi-marque` 0.4em

**Dette : trois valeurs hors échelle**, non couvertes par `echelles.test.ts` qui ne surveille
pas `letter-spacing` :

| Valeur | Lignes | Où |
|---|---|---|
| `0.05em` | 1343 | `input, select` |
| `0.12em` | 1867 | `.etape-titre` |
| `0.08em` | 1875 | `.etape-horaire` |

### 2.5 Gabarits — hors échelle par décision (lignes 205-232)

`--barre-haut` 2.75rem · `--barre-bas` 3rem · `--lateral` 22rem · `--materiel` 19rem ·
`--rail` `calc(--cible-clic + --trait)` · `--carte-large` 19rem · `--carte-plan` 29rem ·
`--bulle-large` 18rem · `--cible-clic` 44px

Exclusion assumée et **testée** (`echelles.test.ts` : « garde les gabarits hors de l'échelle :
ils mesurent des objets, pas de l'air »).

### 2.6 Formes et durées

`--trait` 1px · `--fondu-etat` 150ms (80ms sous `prefers-reduced-motion`) ·
`--jour-trait` 0.2em · `--jour-carte` = `--pas-3` · `--jour-barre` = `--pas-2` ·
`--bulle-jour` = `--pas-1`

Polices : `--police-mono`, `--police-titre`, `--police-icone` — tenues par `polices.test.ts`
(aucun nom de famille sans fichier livré dans `src/fonts/`).

### 2.7 Valeurs en dur qui devraient être des jetons

34 longueurs échappent aux échelles. La plupart sont légitimes (voir colonne). **Quatre sont
des dettes réelles**, marquées ⚠ :

| Valeur | Lignes | Verdict |
|---|---|---|
| ⚠ `calc(100vw - 1.5rem)` | 544, 552, 688, 1269 | **4 occurrences, même intention** : la gouttière d'un flottant contre le bord d'écran. Mérite `--gouttiere-ecran`. |
| ⚠ `border-left-width: 3px` | 874, 1495 | **2 occurrences** : le filet épais qui marque une alerte. Mérite `--filet-accent`. |
| ⚠ `border-left: 3px` | 1689 | même filet, écrit en forme longue. |
| ⚠ `text-underline-offset: 3px` | 1667, 2489 | **2 occurrences** : le décalage du pointillé d'aide. |
| `outline: 2px` / `outline-offset: 2px` | 349, 350 | 1 seule règle. Laisser. |
| `min(32rem \| 28rem \| 52rem, …)` | 544, 688, 1269 | gabarits de flottants. Cohérent avec §2.5 — laisser, ou nommer avec les autres gabarits. |
| `1px` × 2 | 723, 724 | motif « visuellement masqué ». Laisser. |
| `1em` × 2 | 581, 582 | dimensionnement relatif au texte. Laisser. |
| `1.1rem`, `0.5rem`, `1.4rem` | 1354-1410 | pièces du curseur et de la case à cocher : ce sont des objets. Laisser. |
| `1.25rem` | 322 | corps du glyphe `.icone` — exception commentée. Laisser. |
| `0.85em` | 1710 | relatif au conteneur, commenté. Laisser. |
| `20rem`, `22rem`, `42rem` | 1893, 1907, 2500 | gabarits. Laisser. |
| `2px` (bordure d'onglet) | 1167 | le filet d'onglet actif. 1 occurrence. Laisser. |
| `1100px` | 1039 | unique point de rupture. Laisser. |

### 2.8 z-index

Pas de jetons. Sept valeurs littérales, toutes dans le bloc « coque », commentées par un
ordre d'empilement explicite (scène → cartes → panneau → barres). Une seule région les
déclare. **Pas une dette** : un jeu de jetons ne rendrait pas l'ordre plus lisible que le
commentaire qui l'énonce.

### 2.9 Breakpoints

**Un seul** : `@media (max-width: 1100px)`. Les quatre autres `@media` sont des préférences
utilisateur (`prefers-reduced-motion` ×3, `print`). Un jeton pour une valeur unique serait
une abstraction « au cas où » — règle de décision n°4. Laisser.

---

## 3. Styles de texte réellement utilisés

Relevé par extraction des blocs portant `font-size` / `font` / `font-weight` /
`letter-spacing` / `text-transform`.

### 3.1 Le seul motif vraiment répété

| Occurrences | Combinaison | Rôle |
|---|---|---|
| **7** | `color:--attenue` + `font-size:--texte-micro` + `letter-spacing:--suivi-micro` + `text-transform:uppercase` | **Le micro-libellé** : étiquette de champ, en-tête de colonne, légende de rail, détail de score |

Ces sept règles sont écrites sept fois, à l'identique, sans nom commun. C'est **la seule
duplication typographique du projet**, et c'est le style le plus fréquent de l'interface.

Deux variantes voisines à 1 occurrence chacune (`+ font-weight:500` sur `th`,
`+ font-family:--police-mono` sur `.poids-scoring`) — à traiter comme des ajustements locaux,
pas comme des rangs distincts.

### 3.2 Les rangs identifiables, chacun à 1-2 occurrences

| Nom proposé | Combinaison | Où |
|---|---|---|
| `marque` | `--police-titre` 700 / `--texte-titre` / `--suivi-marque` / caps / `--accent` | `h1` |
| `titre-section` | `--police-titre` 600 / `--texte-appui` / `--suivi-titre` / caps / `--accent` | `h2`, `.lateral-entete h2` (×2) |
| `titre-carte` | `--police-titre` 600 / `--texte-legende` / `--suivi-micro` / caps / `--texte` | `.carte-titre` |
| `titre-etape` | `--police-titre` 600 / `--texte-corps` / `0.12em` / caps / `--texte` | `.etape-titre` |
| `corps` | `--police-mono` / `--texte-corps` / 1.6 / `--texte` | `body` |
| `etat` | `--texte-legende` / `--attenue` | `.etat` (+3 variantes de ligne) |
| `micro-libellé` | voir §3.1 | ×7 |
| `legende-rail` | `--texte-mini` / `--suivi-micro` / caps / `--accent` | `.curseur-legende` |

### 3.3 La verrue structurelle : sept remises à zéro

Sept blocs contiennent `letter-spacing: 0|normal` **et** `text-transform: none`. Ce ne sont
pas des styles : ce sont des **annulations**. Cause unique — le sélecteur d'élément `label`
(ligne 1322) impose `text-transform: uppercase` + `--suivi-micro` à **tout son sous-arbre**,
donc chaque contenu de `<label>` qui n'est pas une étiquette doit se dé-styler.

Règles concernées : `input, select` (1334), `.cibles-mag-valeur`, `.poids-effectif`,
`.tracee-*`, `.glossaire p`, `.terme abbr`, `.champ-titre`.

**C'est le seul défaut de conception structurel de la feuille.** Le corriger — faire porter
le style d'étiquette par un enfant nommé plutôt que par `label` — supprimerait sept blocs et
rendrait la classe « micro-libellé » de §3.1 utilisable partout. C'est aussi le changement
le plus risqué du lot : il touche la cascade de tous les champs de saisie du produit.
→ **Question ouverte n°3.**

---

## 4. Éléments d'interface récurrents

### 4.1 Déjà partagés — ne rien faire

| Composant | Fichiers consommateurs | Verdict |
|---|---|---|
| `Etiquette` (dans `Terme.tsx`) | **12** | Rien à faire |
| `Icone` | **10** | Rien à faire |
| `Bulle` | **9** | Rien à faire |
| `TracedValue` | 6 | Rien à faire |
| `Curseur` | 4 | Rien à faire |
| `ChampDomaine` | 4 | Rien à faire (T-0209) |
| `Terme` | 4 | Rien à faire |
| `Compteur` | 2 | Rien à faire |
| `Pastilles` | 2 | Rien à faire |

### 4.2 À extraire — motif répété, aucun composant

#### `Interrupteur` — 7 occurrences, forme strictement identique

```
<label className="interrupteur">
  <input type="checkbox" checked={…} onChange={(e) => …(e.target.checked)} />
  <libellé>
</label>
```

| Fichier | Ligne | Libellé |
|---|---|---|
| `PanneauFile-sections.tsx` | 109 | texte brut |
| `PanneauMateriel.tsx` | 139 | texte brut |
| `PanneauMateriel.tsx` | 147 | texte brut |
| `PanneauMateriel.tsx` | 176 | texte brut |
| `ModeNuit.tsx` | 107 | texte brut |
| `Verdicts.tsx` | 196 | `<Etiquette>` + phrase |
| `Verdicts.tsx` | 369 | texte brut |

Différences entre occurrences : **aucune** hors le libellé (`ReactNode`) et le couple
`checked`/`onChange`. Zéro variante, zéro changement CSS. **Extraction la plus sûre du lot.**

#### `ChampChoix` — 8 occurrences, forme strictement identique

```
<label>
  <Etiquette cle="…" />
  <select value={…} onChange={(e) => …(e.target.value as T)}>
    <option value="…">…</option>
  </select>
</label>
```

| Fichier | Occurrences | Clés d'étiquette |
|---|---|---|
| `PanneauMateriel.tsx` | 3 | `recadrage_capteur`, `mise_en_station`, `type_monture` |
| `PanneauBoitier.tsx` | 2 | — (à relever à la migration) |
| `PanneauCibles.tsx` | 2 | — |
| `Verdicts.tsx` | 1 | — |

Différence entre occurrences : la **liste d'options** et le type de la valeur. Une prop
`options: readonly { valeur: T; libelle: ReactNode }[]` + générique `<T extends string>`
couvre les huit. Zéro changement CSS.

#### `Tiroir` — 4 occurrences, forme identique

```
<details className="tiroir tiroir-<nom>" [data-alerte]>
  <summary><Icone nom="…" [libelle] /> <titre></summary>
  <div className="tiroir-contenu">…</div>
</details>
```

| Fichier | Ligne | Modificateur | Particularité |
|---|---|---|---|
| `BarreBas.tsx` | 134 | `tiroir-site` | — |
| `BarreHaut.tsx` | 110 | `tiroir-nuit` | icône conditionnelle `dark_mode`/`light_mode`, `libelle` porté |
| `BarreHaut.tsx` | 144 | `tiroir-outils` | `data-alerte={…}` |
| `LegendeCouleurs.tsx` | 83 | `tiroir-legende` | — |

Trois axes (modificateur, icône, `data-alerte`) → sous la limite d'explosion.

### 4.3 À NE PAS unifier — se ressembler n'est pas être le même (règle n°5)

| Couple | Pourquoi les garder séparés |
|---|---|
| `.barrehaut-mode > .onglet` (BarreHaut.tsx:131) **vs** `.onglet` du panneau (PanneauCibles.tsx:164) | Sémantiques opposées. Le premier est un **commutateur d'état** à deux positions (`aria-pressed`, « l'un des deux est toujours vrai », commentaire T-0113) ; le second est un **filtre de portée** dans une liste. Ils partagent une apparence, pas un rôle. Le CSS les distingue déjà (`.coque-topbar .onglet` a son propre bloc). |
| `.bascule` du rail (RailVue) **vs** `button` | La bascule porte `aria-pressed` et un état `.eteinte` ; le bouton exécute. Déjà séparés en CSS. |
| `.cause` **vs** `.erreur` | Même style, même bloc CSS — mais `cause` explique un verdict métier et `erreur` signale une saisie invalide. Fusionner les noms perdrait la distinction au premier changement. |

### 4.4 Uniques — laisser en place (règle n°4)

`Carte` (1 consommateur : `RegionSeance`), `ImageCible` (1 : `FicheCible`), `Inconnu` (1),
`GardeErreur` (racine), `MasqueHorizon` (racine), `MenuReglages`, `PanneauLateral`,
`LegendeCouleurs`, `PlanSession`, `Verification`, `RailVue`.

### 4.5 Éléments absents du produit

Pas de modale, pas de badge, pas de toast, pas d'avatar, pas de pagination, pas de skeleton,
pas d'état vide générique. **Ne rien créer.**

---

## 5. Icônes

### 5.1 Le système exigé existe déjà, à la lettre

`src/ui/Icone.tsx` (37 lignes) rend une ligature Material Symbols Sharp, `aria-hidden` par
défaut, `role="img" + aria-label` quand `libelle` est fourni. Le style commun vit dans
`.icone` (styles.css:319-333) : famille, `wght 300`, et les trois remises à zéro sans
lesquelles une ligature ne se forme pas dans un libellé en capitales.

Police livrée dans le dépôt (`src/fonts/MaterialSymbolsSharp-VariableFont_FILL,GRAD,opsz,wght.ttf`),
`font-display: block`, jamais réseau (§12.2 / CSP §13.1).

| Source d'icône | Occurrences |
|---|---|
| Police Material via `<Icone>` | **17 sites, 21 ligatures distinctes** |
| SVG inline | **0** |
| Fichier `.svg` importé | **0** |
| Bibliothèque tierce | **0** |
| Image bitmap | **0** |
| ⚠ Caractère Unicode rendu en police de texte | **3** |

### 5.2 Les 21 ligatures en place

| Ligature | Fichier:ligne |
|---|---|
| `settings` | BarreHaut.tsx:148 |
| `dark_mode` / `light_mode` | BarreHaut.tsx:112 (conditionnel) |
| `warning` | ChampDomaine.tsx:35 |
| `close` | LegendeCouleurs.tsx:94, :116 |
| `expand_more` | PanneauBoitier.tsx:345 |
| `arrow_back` | PanneauLateral.tsx:49 |
| `image` | ImageCible.tsx:138 |
| `my_location` | PanneauCibles.tsx:303 |
| `public`, `photo_camera`, `tonality`, `keyboard` | RailVue.tsx:194, 201, 211, 250 |
| `circle` | Pastilles.tsx:48 |
| `keyboard_double_arrow_left`, `chevron_left`, `chevron_right`, `keyboard_double_arrow_right` | BarreTemps.tsx:59-62 |
| `play_arrow` / `pause` | BarreTemps.tsx:119 (conditionnel) |

### 5.3 ⚠ Les trois dettes — `PlanSession.tsx`, schéma de pointage §8.4

Elles violent la règle déjà écrite dans `.claude/rules/orion.md` (« pas de caractère
Unicode décoratif posé à la place d'un glyphe »).

| Ligne | Caractère | Rôle | Équivalents Material proposés |
|---|---|---|---|
| 292 | `✛` U+271B | la cible au centre du cadre | `add` · `close_fullscreen` · `center_focus_weak` · `my_location` (déjà utilisé pour « viser » dans PanneauCibles) |
| 303 | `●` U+25CF | un astre d'ancrage | **`circle`** — déjà la ligature de `Pastilles.tsx`, aucune hésitation |
| 303, 320 | `★` U+2605 | marque l'ancrage principal | `star` · `star_rate` |

`●` est tranché. `✛` et `★` **changent le dessin à l'écran** dans un schéma dont les repères
sont positionnés au pourcentage — la boîte du glyphe n'a pas la même chasse.
→ **Question ouverte n°4.**

Note : `×` (BarreTemps.tsx:107, Verdicts.tsx:437) et `→`, `−`, `°`, `Δ` ailleurs sont de la
**typographie mathématique dans une phrase**, pas des icônes. Ils restent.

---

## 6. CSS morte et doublons

| Constat | Détail |
|---|---|
| Classes déclarées | 121 |
| Classes jamais citées dans le code | **1** — `.facilite-ligne` (styles.css:2150-2154). `.facilite`, `.facilite-pleine`, `.facilite-vide` sont vivantes (`Pastilles.tsx`). |
| Faux positif levé | `.carte-plan` est composée à l'exécution : `` `carte carte-${cle.toLowerCase()}` `` (Carte.tsx:151). Vivante. |
| Blocs en double | **1** — `.coque .tiroir[open] > .tiroir-contenu` déclaré deux fois dans `@media (max-width: 1100px)`, lignes 1122 et 1142, à vingt lignes d'écart, propriétés disjointes (`position`/`width` puis `max-height`). Fusionnables sans effet de cascade. |
| Couleurs en dur | 0 |
| Alias de variables à retirer | 0 (aucun n'a jamais été créé) |

---

## 7. Ce qui protège l'existant — à ne pas casser

Dix tests lisent le texte de `src/ui/styles.css`. **Toute modification de la feuille doit les
garder verts ; ce sont eux, et non la convention, qui tiennent la garantie.**

| Test | Ce qu'il garantit |
|---|---|
| `mode-nuit.test.tsx` | aucune couleur en dur ; palette de nuit complète ; ratios WCAG AA calculés ; anneau de focus ≥ 3:1 ; aucune couleur en ligne dans le balisage |
| `echelles.test.ts` | sept pas d'espacement et rien entre eux ; six rangs de texte décroissants ; gabarits hors échelle ; transition d'état déclarée une fois |
| `coque.test.tsx` | régions de la coque, gabarits, feuille d'impression |
| `polices.test.ts` | aucune famille nommée sans fichier livré |
| `icone.test.tsx` | contrat d'accessibilité du composant `Icone` |
| `bulle.test.tsx`, `compteur.test.tsx`, `image-cible.test.tsx`, `pastilles.test.tsx`, `echap-fermeture.test.tsx` | contrats de rendu par composant |

---

## 8. Synthèse de la dette réelle

| # | Dette | Ampleur | Risque |
|---|---|---|---|
| D1 | `Interrupteur` non extrait | 7 sites | très faible (JSX pur) |
| D2 | `ChampChoix` non extrait | 8 sites | très faible (JSX pur) |
| D3 | `Tiroir` non extrait | 4 sites | faible (JSX pur) |
| D4 | 3 caractères Unicode au lieu de glyphes Material | 3 sites | **moyen — change le dessin** |
| D5 | Micro-libellé écrit 7 fois sans nom | 7 règles CSS | moyen (cascade) |
| D6 | 4 longueurs répétées sans jeton | 9 déclarations | faible |
| D7 | 3 `letter-spacing` hors échelle | 3 déclarations | faible |
| D8 | `label` impose sa casse à son sous-arbre → 7 annulations | 7 règles | **élevé (cascade globale des champs)** |
| D9 | `.facilite-ligne` morte | 1 bloc | nul |
| D10 | 1 bloc dupliqué dans le média 1100px | 2 blocs | nul |
| D11 | Pas de lint / stylelint | outillage | hors périmètre |

**Ce qui n'est PAS une dette, malgré l'apparence :** la feuille unique de 2503 lignes,
l'absence de couche de primitives, l'absence de jetons de z-index et de breakpoint,
l'absence de modale/badge/toast.
