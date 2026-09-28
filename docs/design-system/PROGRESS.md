# Suivi de migration — design system Orion

> **Instantané historique du 15 septembre 2026.** Les chiffres, fichiers et jetons cités ici
> sont ceux de cette date (`BarreBas.tsx` a disparu depuis, la suite compte plus de tests). Ce
> qui fait foi aujourd'hui est `README.md`, tenu par les tests.

> **Terminé.** Périmètre initial (lots A → D + F), puis extension « résous toute la dette » :
> D4, lot E, lot G, et le test flaky.

## État

```
$ pnpm typecheck    → aucune sortie
$ pnpm test         → Test Files 81 passed (81) · Tests 1318 passed (1318)
```

Départ : 1306 tests. Arrivée : 1318. Pas de commande `lint` dans ce dépôt — la vérification
est `pnpm typecheck && pnpm test`.

## Tableau de bord

| # | Chantier | État | Commit |
|---|---|---|---|
| A1 | `Interrupteur` — 7 sites | ✅ | `ac9fa23` |
| A2 | `ChampChoix` — 5 sites sur 7 | ✅ | `dcbe45a` |
| A3 | `Tiroir` — 4 sites | ✅ | `b0528c1` |
| B1-B4 | 4 jetons manquants + l'échelle de suivi | ✅ | `09cff5f` |
| C1 | micro-libellé : test de garantie | ✅ | `2a05ab7` |
| D1-D3 | `✛` `●` `★` → `my_location` `circle` `star` | ✅ | `d9996d4` |
| F1-F2 | règle morte + bloc dupliqué | ✅ | `6f20804` |
| — | test flaky `precharge-vignettes` | ✅ | `157bcdd` |
| D4 | `content: '⚠ '` → `Mention` + `Icone` — 46 sites | ✅ | `8ff1253` |
| E1 | la cascade de `label` → `.libelle` — 10 sites | ✅ | `1d4d26a` |
| G1-G2 | README + renvois `CLAUDE.md` et règles | ✅ | ce commit |

---

## ⚠ À VÉRIFIER VISUELLEMENT

Trois commits changent le dessin. Les autres sont iso-pixel par construction.

### 1. `d9996d4` — le schéma de pointage · **un seul écran**

Carte **« Plan de séance »**, section **schéma de pointage** (§8.4). Ouvrir une cible qui porte
au moins un ancrage.

Les trois repères sont passés de caractères de texte à des glyphes Material. Le schéma les
positionne au pourcentage avec `translate(-50%, -50%)`, et la boîte d'un glyphe Material n'a
pas la chasse d'un caractère : **le centrage optique bouge.**

- la mire centrale (`my_location`) tombe-t-elle bien au centre du cadre ?
- les disques d'ancrage (`circle`) débordent-ils du schéma près des bords ?
- l'étoile (`star`) chevauche-t-elle son disque sur l'ancrage principal ?

Taille retenue : `var(--texte-legende)` (0,78 rem) via `.schema-astre .icone`, contre 0,65 rem
pour les anciens caractères.

### 2. `8ff1253` — le signe d'alerte · **presque tout le produit**

Toute cause et toute erreur portent désormais un glyphe Material `warning` au lieu du caractère
« ⚠ ». **46 phrases, 13 fichiers.** Le glyphe est calé par `.mention-signe` :
`font-size: var(--texte-legende)`, `margin-inline-end: var(--pas-1)`, `translate: 0 0.12em`.

Le `translate` est le réglage à surveiller : la boîte d'un glyphe Material est carrée et
déborde de la ligne par le bas, là où le « ⚠ » tenait sur la hauteur de capitale.

Écrans porteurs, par densité :

| Écran | Phrases |
|---|---|
| Fiche cible — **Verdicts** (cadrage, détectabilité, pose, intégration, calibration) | 13 |
| Carte **Plan de séance** | 8 |
| Panneau **Filé** | 7 |
| Panneau **Matériel** | 4 |
| Onglet **Nuit** | 3 |
| Panneau **Boîtier**, **Masque d'horizon**, **Vérification** | 2 chacun |
| **Champs de saisie** (refus), **Site**, **Fiche cible**, **écran d'erreur**, **App** | 1 chacun |

À regarder en priorité : une phrase d'alerte **longue qui passe à la ligne** — le glyphe ne
doit pas décoller la première ligne du reste du paragraphe.

### 3. `1d4d26a` — les messages de refus · **tous les champs de saisie**

Un refus de saisie se rendait **en capitales espacées** ; il se rend maintenant en casse
normale. C'est une correction, pas une régression — mais c'est un changement visible.

Pour le voir : taper une valeur hors domaine dans n'importe quel champ numérique
(par ex. focale = 99999 dans **Matériel**).

Et vérifier au passage que les libellés, eux, **restent** en capitales espacées :

- **Matériel** — focale, ouverture, recadrage capteur, mise en station, type de monture
- **Boîtier** — mon boîtier, format capteur, résolution, grandeurs avancées
- **Site** — les six champs du lieu (tiroir de la barre basse)
- **Cibles** — « Type », « Jusqu'à la magnitude »
- **Filé** — pose unitaire, durée, intervalle
- **Mode nuit** — luminance
- **Réglages** — les poids de scoring
- **Fiche cible** — RSB visée

---

## Décisions prises

- **Q1 — pas de couche de primitives.** Le mode nuit surcharge chaque jeton sémantique
  individuellement, avec une valeur calculée : une primitive n'aurait aucun consommateur.
- **Q2 — `--texte` (couleur) n'est pas renommé.** Cité en dur par dix tests et par tout le
  produit ; le renommer ne change aucun pixel.
- **Q3 — lot E finalement ouvert, et pour une raison qui n'était pas à l'audit.** Voir
  ci-dessous : ce n'était pas une verrue cosmétique mais un défaut visible.
- **Q4 — `✛` → `my_location`** (déjà le glyphe « viser » du produit), `★` → `star`,
  `●` → `circle`, `⚠` → `warning` (déjà la ligature de `ChampDomaine`).
- **Q5 — les trois `letter-spacing` hors échelle sont nommés, pas fusionnés.** Les ramener sur
  `--suivi-micro` aurait changé la chasse des saisies, des titres d'étape et des horaires.
- **Q6 — le micro-libellé reçoit son test, pas son regroupement.** Regrouper les neuf
  sélecteurs les aurait déplacés dans la cascade ; les quatre valeurs sont déjà des jetons,
  donc rien ne peut dériver sauf la dixième règle. C'est elle que le test attrape.

## Écarts avec le plan d'audit

- **A2 — sept `<select>` réels, pas huit**, et cinq migrés. Le filtre « Type » de
  `PanneauCibles` (libellé brut + sentinelle `null`) et le choix de RSB de `Verdicts` (valeur
  numérique) auraient coûté trois props pour deux appelants.
- **C1 — neuf règles, pas sept.** L'extraction de l'audit regroupait les jeux de propriétés
  identiques et masquait celles portant des propriétés supplémentaires.
- **D — une quatrième icône Unicode, non relevée à l'audit** : `content: '⚠ '` dans la feuille.
- **E — l'audit désignait `label` seul ; il y avait trois ancêtres.** Les onze annulations de
  casse viennent de `label`, des `summary` (`.tracee`, `.terme-detail`) et de `button`.
  **Seul `label` a été corrigé, et c'est délibéré** : `button` et `summary` ne contiennent que
  leur propre libellé, donc leurs capitales sont justes et les annulations qui subsistent chez
  eux protègent des contenus riches délibérément imbriqués (`.cible-ligne`, `.tracee-detail`).
  Le défaut n'était pas que les capitales héritent — c'était que `label` **enveloppe son
  contrôle**, donc restyle ce qu'il ne possède pas.
- **E — le vrai motif d'ouverture.** L'audit annonçait « sept blocs d'annulation supprimés »
  comme un gain cosmétique. Le gain réel est ailleurs : `<p class="erreur">` vit **dans** le
  `<label>` de `ChampDomaine` et `ChampsSite`, sans annulation, donc les messages de refus se
  rendaient en capitales espacées — contre l'intention écrite vingt lignes plus haut dans la
  même feuille (« appliquées à une explication, elles la rendent illisible »).
- **Deux tests ont dû être réécrits, et tous deux étaient fragiles :**
  - `echap-fermeture.test.tsx` citait les chaînes littérales `className="tiroir tiroir-nuit"` :
    il garantissait la propriété en ÉNUMÉRANT les tiroirs, donc ratait déjà le quatrième.
  - `mode-nuit.test.tsx` faisait `CSS.indexOf('input,')` sur la feuille **commentaires
    compris** : une note de prose citant ce sélecteur lui faisait lire le mauvais bloc.

## Garde-fous ajoutés

Sept tests neufs, tous du même genre : ils tiennent une discipline que rien ne tenait.

| Garantie | Fichier |
|---|---|
| Aucun suivi écrit en dur | `echelles.test.ts` |
| Le micro-libellé ne perd ni son suivi ni sa couleur | `echelles.test.ts` |
| `label` ne déclare que de la disposition | `echelles.test.ts` |
| Tout `<label>` porte son `.libelle` | `echelles.test.ts` |
| Aucun caractère Unicode-dessin dans `src/ui/` | `icone.test.tsx` |
| Aucun glyphe en `content:` dans la feuille | `icone.test.tsx` |
| La police d'icônes n'est nommée que dans `.icone` | `icone.test.tsx` |
| Aucune phrase d'alerte hors de `Mention` | `icone.test.tsx` |
| Aucun tiroir bâti hors de `Tiroir` | `echap-fermeture.test.tsx` |

## Réserve sur le test flaky

`tests/precharge-vignettes.test.ts` échouait environ une fois sur trois en suite complète, et
l'échec a été observé **sur l'arbre sans ces commits** : il est antérieur et il est réel.

La cause est établie par lecture du code et concorde avec l'assertion qui tombait : `attend()`
déclarait la file achevée quand le RÉSEAU se taisait, alors que le bouchon décrémente `enVol`
au moment où il résout la promesse — avant que le consommateur ait lu le blob et écrit dans
IndexedDB. Les deux tours accordés ensuite étaient une durée déguisée.

**Mais il ne s'est pas reproduit depuis, et une sonde instrumentée n'a jamais vu la chaîne
dépasser deux tours sur une douzaine de passes.** Le mécanisme n'est pas prouvé par
reproduction. Ce qui est certain, c'est qu'une condition exacte remplace un forfait.

## Reste

- **Aucun lint dans le dépôt** : pas d'ESLint, pas de Prettier, pas de Stylelint. Hors
  périmètre design system, et pas d'installation de dépendance sans accord.
