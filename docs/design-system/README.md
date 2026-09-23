# Design system — Orion

> Ce que l'interface a le droit d'utiliser, et ce qu'il faut faire pour ajouter un écran
> sans le contourner.
>
> **Le PRD fait autorité sur le fond** (`prd.md`, §11.1 mode nuit, §11.2 ergonomie
> nocturne, §11.3 disposition). Ce document décrit la forme, et rien d'autre.

## Le principe qui explique tout le reste

§11.1 **confisque la luminance** comme moyen de hiérarchie. En mode nuit, la palette entière
est du rouge pur sur noir, et le plafond de contraste du rouge sur noir est de 5,25:1 — il n'y
a pas la place d'étager le texte principal et le texte secondaire par la clarté.

Il reste deux étages, et deux seulement :

| Étage | Jetons | Ce qu'il distingue |
|---|---|---|
| **La taille** | `--texte-*`, six rangs | un titre d'une valeur, une valeur d'une note |
| **La casse et le suivi** | `--suivi-*`, six pas | ce qui **nomme** de ce qui **vaut** |

D'où la grammaire du produit : **une étiquette est en capitales espacées, une phrase est en
casse normale.** Tout le reste en découle, y compris les erreurs que ce système a déjà eues.

## Ce qui est garanti par un test, pas par une habitude

Douze disciplines lisent le TEXTE de `src/ui/styles.css` et des composants de `src/ui/`.
Une règle de style ne casse aucun rendu quand elle dérive — elle désaligne l'interface d'un
pixel à la fois, et personne ne le voit.
C'est pourquoi chaque discipline ci-dessous a son test :

| Discipline | Tenue par |
|---|---|
| Aucune couleur écrite en dur hors des deux blocs de palette | `mode-nuit.test.tsx` |
| La palette de nuit n'écrit que du rouge pur, et couvre chaque jeton du jour | `mode-nuit.test.tsx` |
| Ratios WCAG AA calculés sur toute la palette, dans les deux modes | `mode-nuit.test.tsx` |
| Aucun écart écrit en dur dans une propriété d'espacement | `echelles.test.ts` |
| Aucun corps de texte écrit en dur | `echelles.test.ts` |
| Aucun suivi écrit en dur | `echelles.test.ts` |
| Le micro-libellé ne perd ni son suivi ni sa couleur | `echelles.test.ts` |
| `label` ne déclare que de la disposition, et tout `<label>` a son `.libelle` | `echelles.test.ts` |
| Une grille `.champs` ne contient que des champs nommés, et jamais rien de vide | `echelles.test.ts` |
| Aucun caractère Unicode-dessin dans `src/ui/`, ni en `content` dans la feuille | `icone.test.tsx` |
| La police d'icônes n'est nommée que dans `.icone` | `icone.test.tsx` |
| Aucune phrase d'alerte posée sans passer par `Mention` | `icone.test.tsx` |
| Aucun tiroir bâti hors de `Tiroir` | `echap-fermeture.test.tsx` |

**Ajouter une règle qui viole l'une d'elles fait échouer `pnpm test`.** C'est voulu.

---

## Jetons

Tout vit dans les deux blocs `:root` de `src/ui/styles.css`. **Il n'y a pas de couche de
primitives** : les jetons sont directement sémantiques. Le mode nuit surcharge chacun d'eux
individuellement, avec une valeur calculée — une primitive n'aurait aucun consommateur.

### Couleurs — 13 jetons, tous repeints en mode nuit

| Jeton | Jour | Rôle |
|---|---|---|
| `--fond` | `#050807` | fond de page et de scène |
| `--surface` | `#0a0f0e` | barres, cartes |
| `--surface-haute` | `#101817` | un contrôle sous le doigt |
| `--texte` | `#eafff5` | texte principal |
| `--attenue` | `#9db3a9` | texte secondaire, étiquettes |
| `--accent` | `#a9ecc9` | commandes, valeurs actives |
| `--avertissement` | `#f4c76a` | un rail sous la main |
| `--bordure` | `#2b3a34` | filet de conteneur |
| `--bordure-controle` | `#5a6964` | filet de contrôle — tenu à ≥ 3:1 (WCAG 1.4.11) |
| `--bordure-faible` | `#18211d` | séparateur de ligne |
| `--alerte` | `#ff6f5e` | erreur, focus, « ceci se règle » |
| `--fond-alerte` | `#1a0f0d` | aplat d'alerte |
| `--fond-accent` | `#0f1a16` | aplat de survol, fond de saisie |

> En mode nuit, chacun devient `rgb(calc(var(--luminance-nuit) * N) 0 0)`. Canaux vert et bleu
> strictement nuls : c'est le critère d'acceptation de §11.1, et il est calculé par un test.

### Espacement — sept pas, en multiples de 4 px

`--pas-0` 0,125rem · `--pas-1` 0,25rem · `--pas-2` 0,5rem · `--pas-3` 0,75rem ·
`--pas-4` 1rem · `--pas-5` 1,5rem · `--pas-6` 2rem

**Un écart écrit en dur dans une propriété d'espacement est un bug.** Une seule dérogation
existe et elle est commentée (`-1px` sur `.scene-description`).

Trois écarts nommés s'appuient dessus : `--jour-carte`, `--jour-barre`, `--jour-ecran`.

### Une section ordinaire est une carte

`<section>` sans classe porte un **cadre d'instrument** : filet complet en `--bordure`,
équerres aux quatre angles en `--accent`, jour de `--jour-carte`. Le style est porté par le
sélecteur d'élément, comme celui de `button` — il n'y a **pas de composant `Carte` à appeler**,
et `Carte.tsx` reste la carte repliable de la scène. Poser une rubrique, c'est écrire
`<section><h2>…</h2>…</section>`.

La carte repliable de la scène (`.carte` — Boîtier, Optique, Plan de nuit), dépliée, porte **le même
cadre** : filet et équerres. Son corps (`.carte-corps`) suit le même rythme vertical qu'une
section ordinaire, sans `h2` — l'en-tête de la carte la nomme déjà.

Le panneau latéral (`.coque-lateral`) se pose sur la scène **comme une carte dépliée** —
décollé des bords d'un `--jour-carte`, filet, en-tête teinté, équerres — mais ne se replie
jamais. Il reste hors de `Carte` : son en-tête porte les onglets de mode (`.onglets`), et sur
la fiche un retour et des commandes — ce qu'un en-tête-bouton ne peut contenir.

Le panneau du temps (`.panneau-temps`) porte le même cadre et coiffe le panneau latéral : les
deux partagent la colonne de droite (`.coque-droite`), **qui porte la largeur pour eux deux**.
Il ne se replie pas non plus et n'a pas d'en-tête — la date qu'il affiche le nomme déjà — et il
n'affiche rien d'intermittent : une lecture qui apparaît puis disparaît changerait sa taille, et
deux cadres empilés qui ne s'alignent pas se lisent comme un défaut de montage.

Un aplat de surface ou une ombre n'auraient pas tenu : §11.1 confisque la luminance, et un
trait se lit à n'importe laquelle. Les quatre sections **nommées** — `.scene`, `.cibles`,
`.carte`, `.menu-reglages` — posent leur propre disposition et n'ont pas de cadre.

### Le rythme vertical est celui de la section

Dans le corps d'une section ordinaire — `<section>` sans classe —, **deux blocs qui se suivent
sont séparés de `--pas-2`**, et cet écart est posé une seule fois :

```css
section:not([class]) > * + *,
.masque-horizon > * + *,
.carte-corps > * + * {
  margin-block-start: var(--pas-2);
}
```

`* + *` et non un `gap` de flex, pour deux raisons. Les marges **fusionnent** en disposition de
bloc : un `.etat` ou un `.cause` garde sa marge propre sans l'ajouter à celle-ci, et le
`margin-top` d'un `h2` continue de séparer deux sections. Et un `gap` s'applique à tous les
frères sans exception, là où la liste des lectures tracées en réclame une — `.tracee` et
`.tracee-vide` qui se suivent restent collées, leurs filets forment un tableau.

Les quatre sections **nommées** posent leur propre disposition et sont hors de cette règle :
`.scene`, `.cibles`, `.carte`, `.menu-reglages`.

#### Ce qu'une grille `.champs` contient

`<div className="champs">` est une **grille de champs nommés** : `ChampDomaine`, `ChampChoix`,
ou un `<label>` portant son `.libelle`. Rien d'autre.

Un interrupteur, un message (`Mention`, `.etat`), un bouton sont des **frères directs de la
section**, où la règle ci-dessus leur donne exactement l'écart d'un champ. Posés dans la
grille, ils dérivent : les marges ne fusionnent pas en disposition de grille, donc un message
additionne la sienne au `gap` et devient la seule chose du panneau à un écart double ; un
bouton devient une cellule à côté d'un champ.

`echelles.test.ts` échoue si une grille contient l'un d'eux, ou si elle est vide.

Deux règles de disposition s'y ajoutent, et elles disent la même chose : **une lecture ne se
tronque pas** (T-0264).

- **Un `<select>` prend la rangée entière** (`.champs > label:has(select)`). Fermé, il
  n'affiche que l'option choisie, sans un signe pour dire qu'elle est coupée — une colonne
  suffit à un nombre et à son unité, une phrase a besoin de la rangée. Corollaire : **un
  intitulé d'option se mesure**. À 22 rem de carte, le navigateur réserve 40 px pour la
  flèche ; il reste 276 px, soit ~33 signes en `--police-mono`. Ce qui n'y tient pas va dans
  la glose du champ, pas dans l'intitulé.
- **Les champs d'une rangée commencent à la même hauteur** (`.champs > label` en
  `justify-content: end`). Le contrôle se pose en bas de sa cellule : une étiquette qui passe
  sur deux lignes prend l'air au-dessus d'elle, au lieu de pousser son champ sous ses voisins.

### Typographie — six rangs

| Jeton | Valeur | Rôle |
|---|---|---|
| `--texte-titre` | 1rem | la marque |
| `--texte-corps` | 0,95rem | le texte courant |
| `--texte-appui` | 0,85rem | un titre de section, une saisie |
| `--texte-legende` | 0,78rem | une phrase d'état, une cellule |
| `--texte-micro` | 0,7rem | un micro-libellé |
| `--texte-mini` | 0,65rem | une légende de rail |

Deux dérogations, toutes deux commentées : `.icone` (1,25rem — c'est la taille d'un GLYPHE, pas
d'un texte) et `.tracee-plage` (en `em`, elle se règle sur ce qui la contient).

### Suivi — six pas, nommés par leur rôle

`--suivi-micro` 0,14em · `--suivi-titre` 0,24em · `--suivi-marque` 0,4em ·
`--suivi-saisie` 0,05em · `--suivi-horaire` 0,08em · `--suivi-etape` 0,12em

`normal` et `0` ne sont pas des pas de l'échelle : ce sont les deux façons de l'**annuler**, là
où un texte hérite du suivi d'un conteneur qui n'est pas le sien.

### Formes, durées, polices

`--trait` 1px · `--trait-marque` 3px (le filet épais d'une alerte) ·
`--decalage-souligne` 3px (le pointillé d'aide) · `--fondu-etat` 150ms (80ms sous
`prefers-reduced-motion`) · `--jour-trait` 0,2em

`--police-mono` (IBM Plex Mono) · `--police-titre` (Barlow Condensed) ·
`--police-icone` (Material Symbols Sharp). **Les trois sont livrées dans `src/fonts/`** :
§12.2 et la CSP §13.1 interdisent d'aller les chercher sur le réseau, et `polices.test.ts`
vérifie qu'aucune famille nommée n'est sans fichier.

### Gabarits — hors échelle, délibérément

`--barre-haut` 2,75rem · `--lateral` 22rem ·
`--rail` · `--carte-large` 19rem · `--carte-plan` 29rem · `--bulle-large` 18rem ·
`--cible-clic` 44px (usage ganté sur écran tactile, §11.2)

Ils mesurent des **objets**, pas l'air entre eux. Un pas d'espacement qui dimensionnerait une
barre ferait dépendre la hauteur de la coque du grain des marges — deux réglages sans rapport.
`echelles.test.ts` les tient hors de l'échelle.

**Il n'y a pas de jetons de z-index ni de points de rupture.** L'empilement est déclaré une
fois, avec son ordre en commentaire, dans le bloc de la coque. Il n'existe qu'un seul point de
rupture (1100px) : un jeton pour une valeur unique serait une abstraction « au cas où ».

---

## Composants

### Contrôles de saisie

| Composant | Consommateurs | À utiliser pour |
|---|---|---|
| `ChampDomaine` | 4 | un champ **numérique** — sa borne vient de `DOMAINES`, jamais du composant |
| `ChampChoix` | 2 | un choix fermé, options en `children` |
| `Interrupteur` | 4 | une case à cocher et la phrase qui dit ce qu'elle fait |
| `Curseur` | 4 | un réglage continu, avec repère à une valeur arbitraire |
| `Compteur` | 2 | un nombre réglable **au milieu d'une phrase** |

```tsx
<ChampDomaine domaine="focale_mm" cle="focale" valeur={focale} surValeur={surFocale} requis />

<ChampChoix cle="type_monture" valeur={choixMonture(props)} surChangement={surMonture}>
  <option value="AUCUN">Pas de suivi</option>
  <option value="TRACKER_SOIGNE">Tracker — viseur polaire</option>
  <option value="GEM_SOIGNE">Équatoriale — viseur polaire</option>
</ChampChoix>

<Interrupteur actif={typeObjectif === 'FISHEYE'} surChangement={surFisheye}>
  Objectif fisheye
</Interrupteur>
```

> **Un champ du produit n'utilise pas `ChampChoix`, et c'est écrit dans son en-tête :** le
> choix de RSB de `Verdicts` (valeur numérique).
>
> Le filtre « Type » de `PanneauCibles` est un **choix multiple** : un `<details>` dont le
> résumé garde l'allure d'un `<select>`, et une `Interrupteur` par type présent. Pas de
> `<select multiple>` — il faut Ctrl ou Cmd pour y cocher, ce qui ne se fait pas au gant (§11.2).

### Texte et explication

| Composant | Consommateurs | À utiliser pour |
|---|---|---|
| `Etiquette` | 12 | **tout libellé** — rend une clé du glossaire, jamais un littéral |
| `Terme` | 4 | un terme affiché seul, définition complète au clic |
| `TracedValue` | 6 | **tout nombre calculé** — dépliable jusqu'à sa formule (§1.5.2) |
| `Mention` | 13 | une phrase qui commente : état, cause, erreur |
| `Bulle` | 9 | une infobulle — une phrase, pas un paragraphe |
| `Inconnu` | 1 | une grandeur absente, marquée plutôt qu'effacée |

```tsx
<Mention ton="cause">{plan.contrainteDominante}</Mention>
<Mention ton={budget.tient ? 'etat' : 'cause'}>{message}</Mention>
```

`ton` vaut `'etat' | 'cause' | 'erreur' | 'tracee-source'`. Les deux qui **alertent** —
`cause` et `erreur` — portent le signe ⚠ de §11.1, rendu par `Icone`. `Mention` accepte par
ailleurs les attributs d'un `<p>` (`role`, `id`, `aria-live`…) : le contrat d'accessibilité
appartient à la phrase, pas au composant.

### Coque et structure

| Composant | Consommateurs | À utiliser pour |
|---|---|---|
| `Icone` | 12 | **toute icône**, sans exception |
| `Tiroir` | 3 | un tiroir de barre — `<details>` sans JavaScript |
| `Carte` | 3 | une carte repliable posée sur la scène, à place fixe |
| `Pastilles` | 2 | une note sur une échelle, comptée d'un coup d'œil |

```tsx
<Tiroir modificateur="info" resume={<><Icone nom="info" />info</>}>
  <Sources />
</Tiroir>
```

---

## Les icônes — la règle la plus stricte du projet

**Une seule façon d'afficher une icône : `<Icone nom="…" />`.** Le `nom` est une ligature
Material Symbols, en anglais — c'est l'identifiant de la police, pas un libellé.

Sont des dettes à migrer, jamais des exceptions à garder :

- un SVG inline ou un fichier `.svg` importé ;
- une bibliothèque tierce d'icônes ;
- une image bitmap ;
- **un caractère Unicode ou un emoji** rendu dans la police de texte (`✕`, `●`, `★`, `⚠`) ;
- **un glyphe posé en `content:` par la feuille de style.**

Les deux derniers ne sont pas théoriques : le produit en a porté quatre, et ils ont été
migrés. `icone.test.tsx` les interdit maintenant par un test sur les blocs Unicode des formes
géométriques, des dingbats, des symboles divers et des emoji.

**Restent permis** les caractères qui **se lisent dans une phrase** et ne dessinent pas :
`→`, `×`, `−`, `°`, `Δ`, `·`. Les proscrire obligerait à poser un glyphe au milieu d'un mot.

Le style commun vit dans `.icone` — **le seul endroit à modifier** pour changer l'épaisseur, la
taille ou la famille de toutes les icônes. Un composant qui a besoin d'une autre taille passe
`classe` et règle `.son-bloc .icone` (voir `.facilite .icone`, `.schema-astre .icone`,
`.mention-signe`).

Accessibilité : `aria-hidden` **par défaut**. Une ligature est du texte — sans cela, un lecteur
d'écran annonce « close » au milieu d'un libellé français. Le sens d'une icône appartient au
contrôle qui la porte. `libelle` ne se passe que si l'icône porte **seule** l'information.

Aucun glyphe Material ne correspond ? **Ne pas bricoler un approchant** : le signaler, proposer
les plus proches, et demander.

---

## Ajouter un écran — la marche à suivre

1. **Lire la section du PRD** que le fichier cite en en-tête. Une règle métier ne s'invente pas.
2. **Chercher le jeton avant d'écrire la valeur.** Une couleur, un écart, un corps de texte ou
   un suivi écrits en dur font échouer les tests — et c'est le but.
3. **Chercher le composant avant d'écrire le balisage.** Un champ numérique est un
   `ChampDomaine`, pas un `<input>`. Une phrase d'alerte est une `Mention`, pas un
   `<p className="cause">`.
4. **Nommer chaque libellé par une clé du glossaire** (`<Etiquette cle="…" />`). Un libellé
   sans entrée ne compile pas, et le compilateur nomme la clé manquante.
5. **Déplier chaque nombre jusqu'à sa formule** (`TracedValue`). Un chiffre nu n'est pas
   vérifiable.
6. **Un `<label>` porte son libellé dans un `<span className="libelle">`.** Le `label` lui-même
   n'ordonne que la disposition : il enveloppe son contrôle, et restyler ce qu'on enveloppe
   fait rendre les messages d'erreur en capitales.
7. **Vérifier :** `pnpm typecheck && pnpm test`, et rapporter la sortie réelle.

### L'arbre de décision, quand on hésite

1. Un composant existant couvre le cas → l'utiliser **tel quel**, sans ajouter de prop.
2. Il le couvre à ~80 % → ajouter une variante **à ce composant**, avec une valeur par défaut
   qui reproduit exactement le rendu existant. Ne jamais dupliquer un composant.
3. Le motif se répète **au moins deux fois** et rien ne le couvre → créer un composant.
4. L'élément est **unique** → le laisser en place. Pas d'abstraction « au cas où ».
5. Deux éléments se **ressemblent** mais n'ont pas la même sémantique → les garder séparés.
   Se ressembler n'est pas être le même composant : ils divergeront à la première évolution.
   *(C'est pourquoi les onglets de mode du panneau latéral et le filtre de portée de la liste
   partagent une apparence mais pas une règle.)*

**Au-delà de ~5 props booléennes ou 3 axes de variantes : s'arrêter et proposer un découpage.**

---

## Ce que ce système ne fait pas, et pourquoi

| Absent | Raison |
|---|---|
| Une couche de primitives sous les couleurs | Le mode nuit surcharge chaque jeton sémantique individuellement. Une primitive n'aurait aucun consommateur. |
| Des jetons de z-index | Sept valeurs, un seul bloc, un ordre d'empilement énoncé en commentaire. |
| Un jeton de point de rupture | Une seule valeur (1100px). |
| Un composant `Bouton` | Le style est porté par le sélecteur d'élément `button`, appliqué à 23 boutons sans classe. Un composant n'ajouterait qu'une indirection. |
| `Modale`, `Badge`, `Toast`, `Skeleton`, `Pagination` | Aucun n'existe dans le produit. |
| Une feuille de style découpée | `styles.css` est une TABLE, comme `registry/constants.ts` : une région par bloc, aucune logique à suivre. Douze disciplines lisent son texte ; la découper ferait dépendre leurs garanties d'une liste de fichiers à tenir à jour. |
| ESLint, Prettier, Stylelint | Le dépôt n'en a pas. La vérification est `pnpm typecheck && pnpm test`. |

---

## Voir aussi

- `docs/design-system/AUDIT.md` — l'état des lieux qui a lancé la migration.
- `docs/design-system/MIGRATION-PLAN.md` — l'ordre de traitement et les arbitrages.
- `docs/design-system/PROGRESS.md` — ce qui a été fait, et ce qui reste à vérifier à l'œil.
