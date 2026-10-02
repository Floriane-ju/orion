# Orion : revue de direction artistique, visée Awwwards (SOTD)

> Revue produite le 02/10/2026 (commit `41b8d51`) par l'agent art-director.
>
> **Ce qui a été regardé.** Le code (`styles.css`, `src/ui/**`), le design system, les fontes livrées, le build `dist/` et une partie du PRD (§1, §3.2, §11).
> 6 des 10 captures 1280×800 de `ovrsee/pages/shots/accueil/` (du 19/08 au 02/10/2026). Aucun navigateur lancé.
> **Ce qui n'a pas été vu.** Le mode nuit en vrai, l'onglet Panorama, la fiche cible, la vue mobile et le mouvement. Ce qui en est dit vient du code.
> Chaque point porte une étiquette :
> - **[constaté]** : lu dans le code ou le build, ou mesuré ;
> - **[vu]** : observé sur une capture ;
> - **[estimé]** : jugement sans rendu.

---

## 1. Verdict face au jury

```
Verdict : pas en l'état. Le système de design est l'un des plus rigoureux qui soient, mais
  l'écran d'arrivée ne montre ni idée ni moment : un ciel de jour, « 0 objet », et une
  douzaine de cartouches blancs posés sur le bleu.
Notes : design 5,8 · ergonomie 6,3 · créativité 5,5 · contenu 6,5 → pondéré 6,0 / 10
Étalonnage : Colonia Zacamil, SOTD + Developer Award du 01/10/2026
  https://www.awwwards.com/sites/colonia-zacamil
  Notes : design 7,56 · ergonomie 7,42 · créativité 7,81 · contenu 7,69 → 7,58.
  Elle aussi a une bascule jour/nuit sur une carte : c'est le point de comparaison direct.
  Écart à combler : environ 1,5 point, surtout en créativité et en design.
```

### Notes par critère

| Critère (poids) | Note | Ce qui la fixe |
|---|---|---|
| **Design (40 %)** | **5,8** | **Pour.** Le système est remarquablement tenu : jetons partout, 12 règles vérifiées par des tests, angles vifs, filets d'un pixel. **Contre :** <br>• La marque n'a pas de voix. `h1` est en Barlow Condensed 700, 40 px, suivi 0,4 em, couleur `#8bffef` (`styles.css:1781-1789`) [constaté]. Avec ce suivi, « O R I O N » se lit lettre par lettre, comme un HUD de 2019 [vu, capture 02/10]. <br>• L'accent a changé quatre fois en six semaines : vert (19/08), vert menthe (02/09, 18/09), bleu (27/09), cyan (02/10) [vu]. La marque elle-même a changé de nom (Astrofort → Orion). Le jury lit ce flottement comme une absence de direction. <br>• Sur le ciel de jour, une dizaine d'aplats blancs se font concurrence : 5 boutons du rail enfoncés, 4 barres de titre de carte, le curseur et la frise [vu]. <br>• Les cartes n'ont pas de place fixe. « Boîtier » et « Optique » prennent la largeur de leur texte : leur bord gauche passe de x≈797 à x≈625 entre `6d08b29` et `41b8d51` [vu]. <br>• Les δ, α, Δ et → s'affichent dans une fonte de repli (voir P0-2). |
| **Ergonomie (30 %)** | **6,3** | **Pour.** Accessibilité sérieuse : focus en deux filets, cibles de 44 px, contrastes WCAG calculés par test, `role="application"` avec description textuelle de la scène (`Planetarium.tsx:372`, `.scene-description`), raccourcis clavier annoncés [constaté]. **Contre :** <br>• Premier affichage bloqué par une police d'icônes de 8,8 Mo (P0-1). <br>• La frise de la nuit ne se lit qu'au survol : `CarteNuit.tsx:153`, seulement `onPointerMove`/`onPointerLeave`, aucun clic [constaté]. C'est contraire à §11.2 (« aucune information critique dépendant du survol »). <br>• Sous 1100 px, la scène redevient une image en 16/9 et tout s'empile dessous (`styles.css:1326`) [constaté]. Sur un téléphone en portrait, le ciel fait environ 200 px de haut [estimé]. <br>• Le premier écran du panneau est vide (P0-3). |
| **Créativité (20 %)** | **5,5** | **Pour.** Deux actifs vraiment originaux, mais invisibles au premier coup d'œil : <br>• un ciel peint par la physique : rougissement en bandes de hauteur, halo lunaire KS91, paliers lissés (`dessine-ciel-soleil.ts`, `dessine-fond-ciel.ts`, `lissage.ts`) [constaté] ; <br>• un mode nuit total, obtenu par un masque en `mix-blend-mode: multiply` qui annule mathématiquement le vert et le bleu (`styles.css:159-167`) [constaté]. <br>**Contre :** aucun moment signature n'est mis en scène. Le reste du vocabulaire (rail d'icônes Material, puces AD/δ/AZ en haut, fenêtres à barre de titre pleine) est générique. |
| **Contenu (10 %)** | **6,5** | **Pour.** Les textes sont exacts et propres au métier (« Sans suivi, les poses sont trop courtes pour le ciel profond. Le grand champ reste possible. »), et chaque chiffre se déplie jusqu'à sa formule. **Contre :** <br>• le premier écran affiche « 0 objet. » ; <br>• une phrase reste seule en bas du panneau : « Temps de pose total pour un signal/bruit de 10. » (`PanneauCibles.tsx:341-343`, [vu]) ; <br>• aucune image ni aucun crédit. |

**Pondéré : 0,4×5,8 + 0,3×6,3 + 0,2×5,5 + 0,1×6,5 = 5,96, arrondi à 6,0.**

### Developer Award

Il faut une moyenne supérieure à 7 sur six sous-notes (estimées) :

| Sous-note | Estimation | Pourquoi |
|---|---|---|
| Sémantique | 7 | Un seul `h1`, ordre du DOM égal à l'ordre de lecture (§11.3), scène décrite en texte. |
| Animations | 5,5 | Fondus seulement, par choix du PRD (voir §11.2). |
| Accessibilité | 7,5 | Moins le survol obligatoire de la frise. |
| Performance (WPO) | 4,5 | JS initial à **228 Ko gzip**, donc sous les 300 Ko [constaté]. Mais la TTF d'icônes fait **8 835 904 octets**, en `font-display: block`, et `.icone` reste masquée jusqu'à son arrivée (`styles.css:428-434`, `:477`) [constaté]. |
| Responsive | 4,5 | Un seul point de rupture, et une vue mobile empilée. |
| Balisage et métadonnées | 4 | `index.html` n'a ni `description`, ni Open Graph, ni image de partage [constaté]. `favicon.svg` est tracé en `stroke="#000000"` sur fond transparent, donc invisible dans un onglet sombre [constaté]. |

Moyenne : environ **5,5**. Le prix n'est pas atteignable en l'état ; il le devient à environ 7 si l'on corrige P0-1, P1-6 et les métadonnées.

**Un point qui pèse lourd.** Le jury visite le site de jour, en Europe ou aux États-Unis. Il verra exactement les captures du 02/10 : un ciel bleu à 10 h 14 ou 16 h 12, et « 0 objet ». Le PRD impose que l'application s'ouvre sur l'instant présent (§3.2, mode MAINTENANT). Il ne faut pas changer ce comportement. La réponse est ailleurs : le moment signature (§4) et, si le site est soumis, une page d'accueil (§4.6).

---

## 2. Ce qui marche déjà

- **La grammaire « étiquette en capitales, valeur en casse normale »** est née d'une vraie contrainte (§11.1 ôte la luminance comme moyen de hiérarchie). C'est exactement le genre de règle tirée du sujet que le jury apprécie, à condition de la rendre visible.
- **Le ciel de jour est calculé, pas décoratif.** Dégradé à deux variables (hauteur, ρ), grille réduite lissée en bilinéaire, sans `ctx.filter` pour rester compatible Firefox. C'est la matière première du moment signature.
- **Le mode nuit est le plus abouti qui soit sur le web.** Masque multiplicatif, `--luminance-nuit` jusqu'à 2 %, et en mode nuit le bouton enfoncé ne s'allume plus (`styles.css:1097`). Le jour, en revanche, n'applique pas encore cette leçon (voir P1-1).
- **La discipline technique** : jetons testés, compatibilité Firefox réfléchie (`@supports (anchor-name)` avec repli, repli de `::details-content` à `styles.css:3635`), et 228 Ko gzip de JS pour un planétarium complet.

---

## 3. Retours priorisés

### P0 : bloquent la note ou la première impression

**P0-1. La police d'icônes pèse 8,8 Mo et bloque l'affichage**

- **Constat [constaté].**
  - `src/fonts/MaterialSymbolsSharp-VariableFont_FILL,GRAD,opsz,wght.ttf` est livrée entière : 8 835 904 octets dans `dist/assets`.
  - Elle est en `font-display: block` (`styles.css:428-434`).
  - `:root:not(.icones-pretes) .icone { visibility: hidden }` (`:477`) cache le rail et tous les boutons à glyphe jusqu'à la fin du chargement. Le commentaire T-0300 lui-même parle de « vingt secondes ».
  - Le service worker la pré-cache aussi (`vite.config.ts:100-103`, plafond porté à 16 Mo pour l'occasion).
- **Pourquoi ça coûte.** Performance (Developer), vitesse perçue (ergonomie à 30 %), installation de la PWA en 4G sur le terrain.
- **Recommandation.**
  - Produire un sous-ensemble limité aux ligatures utilisées, une seule fois, puis le versionner comme les autres fontes. Les règles §12.2 et §13.1 restent respectées : rien n'est chargé à l'exécution.
  - **Mesuré** : l'API Google Fonts avec le paramètre `icon_names=` (34 glyphes, `opsz` 24, `GRAD` 0, `FILL` 0..1, `wght` 200..500) renvoie un WOFF2 de **4 368 octets**. Il faut vérifier dans le fichier obtenu que les axes `FILL` et `wght` sont bien conservés : la feuille utilise des graisses de 200 à 500 (`styles.css:1043`, `3282`, `3301`).
  - Ajouter une règle testée : la liste des ligatures est dérivée des `<Icone nom>` et `BoutonGlyphe icone`, et le test échoue si un nom manque dans le sous-ensemble.
  - Ensuite, `font-display: block` ne coûte plus rien.
- **Effort.** Une demi-journée. Aucune dépendance d'exécution. Seul un outil de construction serait éventuellement à valider : `pyftsubset` (fonttools), si l'on refuse de passer une seule fois par l'API.

**P0-2. Le grec, les flèches et l'espace fine insécable tombent dans une fonte de repli**

- **Constat [constaté].** Analyse de la table `cmap` des cinq WOFF2 livrés : ni Plex Mono ni Barlow Condensed ne contiennent δ, α, Δ, → ni U+202F. Par ailleurs, ni IBM Plex Mono ni Martian Mono n'existent en grec chez Google Fonts. Ces signes sont pourtant partout :
  - la puce « δ -13,51° » de la barre haute [vu] ;
  - les désignations de Bayer peintes sur la scène entre 10° et 40° de champ (`core/labels.ts:7`, police `POLICE_SCENE` dans `couleurs.ts:120`) ;
  - le Δ des écarts (`Terme.tsx:29`) ;
  - le « → » que le design system autorise explicitement.
  - Enfin, `Intl.NumberFormat('fr-FR')` sépare les milliers par U+202F (« 13 132 ») : cette espace vient aussi du repli.
- **Pourquoi ça coûte.** Le repli change avec le système (Menlo, Consolas, DejaVu). La chasse fixe n'est plus garantie, donc les colonnes de relevés se décalent. Le jury voit ce genre de défaut au pixel près.
- **Recommandation.**
  - *Immédiat* : un `@font-face` du même nom de famille `'IBM Plex Mono'`, avec `unicode-range: U+0370-03FF, U+2190-21FF, U+202F`. Il pointe vers un sous-ensemble d'une mono libre qui couvre le grec et dont l'avance est de 600 unités, comme Plex : JetBrains Mono ou Fira Mono, toutes deux OFL et disponibles en grec (vérifié par l'API). La valeur de 600 unités reste **à vérifier** dans les deux fichiers.
  - *Cible* : la famille proposée au §4.3, qui couvre tout d'emblée.
- **Effort.** Une demi-journée, plus une règle dans `polices.test.ts` qui vérifie que chaque caractère autorisé par le design system a son glyphe.

**P0-3. Le premier écran ne dit rien**

- **Constat [vu].** À l'arrivée : ciel de jour, « 0 objet. », deux boutons, et une phrase orpheline (« Temps de pose total… », `PanneauCibles.tsx:341-343`). Elle ne se rattache à aucune liste quand celle-ci est vide.
- **Pourquoi ça coûte.** Contenu, créativité et ergonomie à la fois. Le PRD a pourtant la bonne phrase : « "Impossible" n'existe presque jamais ; "combien de temps" existe toujours. » (§1.2)
- **Recommandation.**
  - Remplacer l'état vide par ce qui *est* possible ce soir, chiffré. Par exemple : « Ce soir, sans suivi : Voie lactée de 20 h 50 à 23 h 10, poses de 15 s à 20 mm. » Ces données existent déjà dans le moteur (filé, fenêtre nocturne).
  - N'afficher la phrase sur le rapport signal/bruit que si la liste n'est pas vide (`listees.length > 0`).
  - Quand le Soleil est levé, le premier geste proposé doit mener au moment signature (§4.2) : « Aller à la nuit ».
- **Effort.** Une journée (texte et condition). La phrase calculée dépend du moteur, à chiffrer.

### P1 : coûtent des points de design, d'ergonomie ou de créativité

**P1-1. Le jour devrait parler comme la nuit**

- **Constat [constaté].**
  - Le jour, un bouton enfoncé du rail devient un carré plein `--texte` (`styles.css:1086-1090`), et les barres de titre sont des aplats `--texte` (`--barre-fond`, `styles.css:76-79`).
  - La nuit, les deux règles ont déjà été réécrites en « filet doublé, glyphe rempli, sans aplat » (`:1097`, T-0375) et en « bandeau noir cerné ».
- **Pourquoi ça coûte.** Il y a deux grammaires pour une même interface. Le jour, une dizaine de blocs blancs écrasent le ciel [vu]. L'en-tête de la feuille dit pourtant que le passage au rouge doit être « continu au lieu d'être une rupture » (`styles.css:13`) : le jour contredit sa propre règle.
- **Recommandation.** Appliquer au jour la grammaire de nuit :
  - `--barre-fond: var(--fond)` et `--barre-encre: var(--texte)` ;
  - pour un bouton du rail enfoncé : filet doublé, glyphe rempli, fond `--surface-survol`.
  - L'aplat plein ne sert plus qu'à une chose, l'onglet de mode actif (il n'en existe qu'un, §11.3). La hiérarchie y gagne un étage.
- **Effort.** Une demi-journée : quatre jetons et un bloc. Les tests de contraste se recalculent seuls.

**P1-2. La marque, puis le type hero**

- **Constat [constaté].** Six rangs de texte s'étagent de 0,65 à 0,95 rem, puis rien jusqu'à 2,5 rem, qui est réservé à la marque (`styles.css:265-271`). L'information la plus importante de l'application, l'instant (§3.2, MAINTENANT est le mode de départ), est rangée dans des cases de formulaire « 2 | oct. | 2026 | 16 : 12 : 09 » [vu].
- **Pourquoi ça coûte.** La hiérarchie est plate. La seule grande taille de l'écran sert un mot qui n'apprend rien.
- **Recommandation.**
  - Descendre la marque au rang `--texte-appui`, en capitales, avec `--suivi-titre`.
  - Donner le rang `--texte-titre` à **l'heure**, en chiffres tabulaires, modifiable au clic. Le composant `Compteur` sait déjà tirer et taper.
  - Sur la fiche, ce rang revient au **nom de la cible** (« M42 »).
  - Revoir l'échelle en une suite modulaire (rapport environ 1,25), en gardant `--texte-mini` au-dessus de 0,7 rem pour la lecture au rouge à faible luminance.
- **Effort.** Une journée, en tenant les tests d'échelle.

**P1-3. Une règle de composition, et un seul endroit où elle casse**

- **Constat [vu].** Le rail, Site, Boîtier, Optique, les six puces de visée, le panneau du temps, le panneau latéral, la frise et le Plan de nuit occupent les quatre coins et le haut. Le centre, lui, ne porte qu'un petit rectangle blanc : le cadre.
- **Recommandation.**
  - **Règle** : tout ce qui commande se range sur deux colonnes. À gauche, le rail et une seule pile de cartes « Instrument » (lieu · boîtier · optique) de largeur fixe `--carte-large`. À droite, la colonne existante. La frise et le Plan de nuit fusionnent, puisque c'est le même sujet (la nuit), en bas à gauche, sous la pile.
  - **Endroit où la règle casse** : le cadre du matériel, seul objet autorisé au centre. C'est la « plaque » du concept (§4.1).
  - Faire passer les six puces AD/δ/AZ/H/CH/ROT **sur le bord du cadre**, peintes sur le canevas, à la manière des annotations écrites en marge d'une plaque photographique. Seuls CH et ROT, qui décrivent la vue, restent en bas, près du « S ».
- **Effort.** Deux à trois jours : coque, plus `dessine-cadre.ts`. À vérifier contre §11.3, qui nomme aujourd'hui les cartes Matériel, Vue et Plan de nuit.

**P1-4. La frise de la nuit devient l'instrument du temps**

- **Constat [constaté].** `CarteNuit.tsx:153` : survol seulement.
- **Recommandation.** Un clic ou un appui sur la frise fait « aller à » cet instant. La phase visée (crépuscule nautique, nuit astronomique, lever de Lune) reste affichée à demeure, sans survol. C'est la porte d'entrée du moment signature, et la mise en conformité avec §11.2.
- **Effort.** Une journée.

**P1-5. Une seule courbe d'accélération, partagée par le CSS et le canevas**

- **Constat [constaté].** La feuille utilise les mots-clés `ease` et `ease-out` (11 occurrences, par exemple `styles.css:171`, `3569`, `3611`). Le canevas utilise un smoothstep (`horizon-transition.ts:22`). Aucun jeton de courbe n'existe, alors que tout le reste en a un.
- **Recommandation.** Un jeton `--courbe: cubic-bezier(0.3333, 0, 0.6667, 1)`. C'est **exactement** le smoothstep 3t²−2t³ (points de contrôle à x = 1/3 et 2/3), donc la même courbe en CSS et en JS. Ajouter une règle à `echelles.test.ts` : aucun mot-clé d'accélération écrit en dur.
- **Effort.** Un quart de journée.

**P1-6. Métadonnées et icône**

- **Constat [constaté].**
  - `index.html` n'a ni `<meta name="description">`, ni `og:title`, ni `og:image`.
  - `favicon.svg` a un tracé noir sur fond transparent : invisible sur un onglet sombre.
  - L'icône d'application est un réticule rouge générique, un viseur de fusil [vu, `icone-192.png`].
- **Recommandation.**
  - Description et image de partage. L'image doit être un rendu réel du moteur au crépuscule, sans maquette.
  - Une favicon en `--texte` de nuit, sur fond noir.
  - À terme, une icône dérivée du concept : la plaque et son réseau (§4.1).
- **Effort.** Une demi-journée.

### P2 : finition

- **Le glyphe des astérismes est `auto_awesome`** (`RailVue.tsx:76`). En 2026, ces étincelles se lisent « IA ». Candidat : `star` ou `scatter_plot`, à faire valider selon la règle des icônes, sans bricoler d'approchant.
- **L'accent cyan `#8bffef`** (environ oklch(0,93 0,12 181)) est presque une couleur fluo de terminal. Il faut le figer et le justifier (§4.4), pas le changer encore.
- **Mobile.** Pour un SOTD, le jury teste au téléphone. Le PRD situe le MVP sur poste de bureau (§12.1). À arbitrer : une vraie mise en page portrait (scène plein écran et panneau en tiroir bas), ou soumettre une page d'accueil qui, elle, tient en mobile (§4.6). Effort : 5 jours ou plus pour l'app.
- **Typographie du canevas.** Les noms de constellations pourraient suivre la convention des atlas : capitales espacées pour les constellations, grec pour les étoiles, italique pour le ciel profond. C'est la convention de l'atlas de Skalnaté Pleso de Bečvář (références). C'est du contenu, pas de la décoration.

---

## 4. Direction artistique cible

### 4.1 Concept

> **Orion prépare une plaque photographique : le jour on vise en OIII, la nuit on voit en Hα.**

Ce concept tient sur trois faits du métier :

- **Les deux raies d'émission de l'astrophoto en bande étroite.** C'est la palette « HOO ». OIII à 501 nm, une teinte bleu-vert : c'est déjà, à peu près, l'accent actuel. Hα à 656 nm, un rouge profond : c'est exactement le rouge pur exigé par §11.1, au-delà de 620 nm. **Le basculement jour/nuit cesse d'être une contrainte subie : on change de filtre.**
- **Le cadre du matériel est une plaque.** Il est l'héritier des plaques de 2° de la Carte du Ciel, lancée à l'Observatoire de Paris en 1887. Il se porte donc comme elles, avec ses annotations en marge (P1-3).
- **La lumière rouge est aussi celle de la chambre noire** : la lumière inactinique, à laquelle le papier n'est pas sensible, comme les bâtonnets de l'œil.

### 4.2 Moment signature : « La tombée de la nuit »

1. Le Soleil est levé. Un geste (« Aller à la nuit », ou un clic sur la frise au repère « nuit astronomique ») fait défiler le temps jusqu'à la fin du crépuscule astronomique.
2. Le ciel physique rougit puis s'éteint. Les étoiles apparaissent, magnitude par magnitude, à mesure que le fond s'assombrit. La plaque OIII reste seule au centre.
3. À l'arrivée, l'application **propose** le mode nuit. Accepté, il passe d'OIII à Hα en 600 ms.

**Vitesse.** Le trajet dure environ 1,2 s. Exemple : de 16 h 12 à environ 20 h 50, soit environ 280 min de ciel. Il faudrait un facteur d'environ ×14 000, soit 375 px/s à 200° de champ et 1280 px de large, ce qui est « rapide, encore suivable » selon §3.2. Le facteur reste **écrêté par `facteur_max`** : sous un champ serré, le trajet s'allonge, ou devient un saut annoncé comme le veut §3.2.

**Pourquoi c'est conforme à §11.2.** C'est le défilement de §3.2, déclenché par un geste, et chaque image porte une information : à quelle heure chaque magnitude devient visible. Ce n'est pas une transition de position décorative.

**À vérifier dans le moteur.** La magnitude limite affichée doit suivre la brillance du fond pendant le défilement. Sinon, les étoiles n'« apparaissent » pas.

**Sous `prefers-reduced-motion`.** Saut direct à l'instant, puis le fondu de nuit à 120 ms qui existe déjà.

**Premier prototype à construire** : le trajet seul, sans toucher à la coque.

### 4.3 Typographie, entièrement livrable hors ligne

Toutes les fontes proposées sont sous licence OFL : auto-hébergement autorisé, et le texte de la licence doit accompagner les fichiers, comme `LICENCES.md` le fait déjà.

| Rôle | Fonte | Fonderie et source | Licence | Pourquoi |
|---|---|---|---|---|
| **Données et texte** (remplace Plex Mono) | **Iosevka**, espacement Fixed, construction sur mesure | Belleve Invis, https://github.com/be5invis/Iosevka | OFL 1.1 [vérifié] | Couvre le grec, y compris polytonique [vérifié], donc δ, α, Δ, → dans la même fonte. Plus étroite que Plex : environ 0,5 em contre 0,6 em, **à vérifier**. La règle « ~33 signes à 22 rem » de `README:195-197` passerait à environ 40, ce qui tronque moins. La construction sur mesure (jeux stylistiques choisis glyphe par glyphe) donne une voix propre sans payer de licence. |
| **Titres, marque, nom de cible** | **Iosevka Etoile** : même squelette, empattements, chasse quasi proportionnelle | même dépôt [vérifié : la sous-famille existe] | OFL 1.1 | Le contraste vient de la structure (empattements et chasse proportionnelle contre mono sans empattement), pas de l'humeur. Le ton « catalogue dactylographié » rappelle les étiquettes d'enveloppes de plaques et les catalogues NGC/IC. Une seule chaîne de construction, et le grec partout. |
| *Alternative pour l'affiche* (marque seulement) | **Le Murmure** | Jérémy Landes / Velvetyne, https://velvetyne.fr/fonts/le-murmure/ | OFL 1.1 [vérifié] | Couvre le latin, le grec et le cyrillique [vérifié]. Certificat d'excellence TDC 2019. Une seule graisse : `echelles.test.ts` (« chaque graisse a son fichier ») doit être adapté. Désactiver les variantes aléatoires : un instrument reproductible ne tire pas ses glyphes au hasard. |
| Icônes | Material Symbols Sharp, **sous-ensemble** (P0-1) | Google, Apache 2.0 | Apache 2.0, modification permise | — |
| *Écartées* | Martian Mono (pas de grec, vérifié par l'API) · JetBrains Mono (cliché d'outil de développeur ; utile seulement comme pansement grec en P0-2) · Barlow Condensed (choix Google par défaut, sans lien avec le sujet) | | | |

**Chargement.**
- WOFF2 uniquement, sous-ensemble latin + grec + flèches + U+202F.
- `font-display: swap`, avec un repli réglé par `size-adjust` et `ascent-override` pour éviter les sauts de mise en page.
- Précharger seulement la graisse du texte courant.
- La construction d'Iosevka (Node et ses outils) est un **outil de build à valider**. Ce n'est pas une dépendance d'exécution.

**Axes.** Pas d'axe variable animé dans l'application, par §11.2. Seule `.icone` garde `FILL` et `wght`, tels qu'aujourd'hui.

### 4.4 Couleur

Cinq tons de jour, en OKLCH. La nuit ne change pas : tout est rouge pur, et c'est testé.

| Jeton | Valeur proposée | Rôle |
|---|---|---|
| `--fond` | `oklch(0 0 0)` (inchangé) | Le noir est un pixel éteint sur OLED, ce qui assure la continuité avec la nuit. |
| `--base-neutre` | `oklch(0.93 0.004 250)` | Texte et filets. Une pointe froide, comme du verre de plaque, quasi neutre. |
| `--base-accent` « OIII » | `oklch(0.84 0.10 192)` | Ce qu'on vise : la plaque (le cadre), les instants de Lune, la marque. Moins fluo que `#8bffef` (environ chroma 0,12, clarté 0,93). Garder un contraste d'au moins 4,5:1 sur `--surface-haute`. **Figé : on ne le change plus.** |
| `--avertissement` | `oklch(0.85 0.12 82)` (≈ `#f4c76a`, inchangé) | Les corps du système solaire, le rail sous la main. |
| `--alerte` | `oklch(0.70 0.19 28)` (≈ `#ff6f5e`, inchangé) | Erreurs, toujours doublées du filet de 3 px et du glyphe `warning`. |
| Nuit « Hα » | `rgb(250 0 0)` ≈ `oklch(0.63 0.26 29)` | Inchangé. C'est la seconde raie du concept. |

**À vérifier.** Écrire les origines en `oklch()` (Firefox le gère depuis la version 113) suppose que le calcul de `mode-nuit.test.tsx` sache résoudre `oklch` avant de calculer les ratios. Sinon, garder l'hexadécimal et noter l'équivalence en commentaire.

### 4.5 Principes de mouvement compatibles avec le mode nuit

1. **Rien ne bouge sans cause, et rien ne se déplace dans l'interface.** §11.2 interdit les images clés, le défilement lissé et les transitions de position. Seuls bougent les **fondus de couleur** et la **simulation**.
2. **Une seule courbe**, `--courbe` = smoothstep (P1-5), dans le CSS comme dans le canevas.
3. **Échelle de durées** :
   - 80 ou 150 ms pour le retour d'état (existe) ;
   - 180 ms pour un dépli (existe) ;
   - 600 ms pour le passage OIII → Hα (existe) ;
   - **environ 1 200 ms pour un trajet dans le temps** (nouveau jeton `--duree-trajet`, plafonné par `facteur_max`).
4. **La nuit, aucun fondu ne fait monter la luminance au-dessus de son état final.** Pas de dépassement, pas de flash de survol.
5. **Sous `reduced-motion`**, les trajets deviennent des sauts et les fondus raccourcissent sans disparaître. C'est l'arbitrage déjà écrit au §11.1.
6. **Outils.** CSS et `requestAnimationFrame`, déjà présents. **Pas de GSAP, Lenis ni Motion dans l'application.**

### 4.6 Application et page d'accueil : la distinction

**Dans l'application** : P0, P1 et le moment signature. Pas de WebGL : le moteur Canvas 2D porte déjà la physique, et la 3D n'ajouterait pas d'idée.

**Une page d'accueil éventuelle** est celle qui serait soumise à Awwwards, avec l'application à une URL voisine. Proposition :
- **Hero** : le moteur réel, chargé en différé (`import()` après le LCP), le canevas en `aria-hidden` avec le texte dans le DOM.
- **Le défilement de la page = le temps**, du coucher à la nuit astronomique. C'est le même moment signature, piloté par la page.
- **Trois chapitres** reprenant les « trois écarts » de §1.1, avec leurs vrais chiffres (M84 = 44 px à 120 mm ; M33 contre M57 en brillance de surface ; la pose). C'est un contenu exceptionnel, déjà écrit.
- **Fin** : la démonstration du mode nuit total, puis « Ouvrir Orion » et l'installation.

**Outils de la page d'accueil.**
- Un écouteur de défilement et `requestAnimationFrame` suffisent.
- `animation-timeline: scroll()` n'est pas un socle fiable sous Firefox : repli JavaScript obligatoire.
- GSAP et ScrollTrigger seraient une **dépendance à valider**, utile seulement si la page devient narrative au-delà du crépuscule.
- Sous `reduced-motion` : trois images fixes rendues par le moteur (coucher, nuit nautique, nuit astronomique).

### Garde-fous chiffrés

| Point | Cible |
|---|---|
| JS initial | Rester sous 300 Ko gzip (aujourd'hui 228 Ko). |
| Fontes | Moins de 100 Ko au total, icônes comprises (aujourd'hui environ 8,9 Mo). |
| LCP | Moins de 2,5 s en 4G bridée, à mesurer. |
| INP | Moins de 200 ms pendant le trajet du temps. |
| Licences | Fichier OFL livré avec chaque fonte, et `LICENCES.md` mis à jour. |

### Risques

| Risque | Parade |
|---|---|
| Le changement de fonte casse les mesures de mise en page (troncature des `<select>`, `README:192-197`). | Changer d'abord Plex pour Iosevka seule. Relancer les tests de troncature. Les titres viennent après. |
| Le trajet du temps devient illisible en champ serré. | Respecter `facteur_max` et annoncer l'écrêtage, ou faire un saut au-delà de 600 px/s (§3.2). |
| L'accent continue de bouger. | Le figer dans le README avec sa justification (raie OIII), et accompagner toute modification d'un ticket de DA. |

---

## 5. Gains rapides et chantiers

**Gains rapides (une journée au plus chacun)**

1. Sous-ensemble de Material Symbols : de 8,8 Mo à environ 4 Ko (P0-1). Une demi-journée.
2. Couverture du grec, des flèches et de U+202F par `unicode-range`, avec son test (P0-2). Une demi-journée.
3. Le jour adopte la grammaire de nuit : 4 jetons `--barre-*` et `styles.css:1086-1090` (P1-1). Une demi-journée.
4. Jeton `--courbe` (smoothstep exact), remplacement des 11 `ease`, et test (P1-5). Un quart de journée.
5. État vide et phrase orpheline (`PanneauCibles.tsx:288-300`, `341-343`) (P0-3, partie texte). Une demi-journée.
6. Métadonnées, image de partage et favicon visible (P1-6). Une demi-journée.
7. Frise cliquable : « aller à » l'instant (P1-4). Une journée.
8. Remplacer `auto_awesome`, après validation. Une heure.

**Chantiers**

| Chantier | Effort |
|---|---|
| Prototype du moment signature « La tombée de la nuit » | 2 à 4 jours |
| Échelle typographique et type hero de l'heure (P1-2) | 1 à 2 jours |
| Construction d'Iosevka Fixed + Etoile, bascule des fontes et adaptation des tests de graisses | 2 à 3 jours |
| Composition en deux colonnes et annotations de plaque sur le cadre (P1-3) | 3 à 4 jours |
| Mise en page mobile en portrait | 5 jours ou plus (arbitrage PRD §12.1) |
| Page d'accueil de soumission | 5 à 10 jours |

---

## 6. Références

1. **Colonia Zacamil**, SOTD et Developer Award du 01/10/2026. https://www.awwwards.com/sites/colonia-zacamil
   *À retenir* : une bascule présent/passé et jour/nuit sur une carte navigable, notée 7,58 (créativité 7,81). C'est la barre à atteindre pour un sujet proche. Sa sous-note d'animation (8,8) vient de transitions qu'Orion s'interdit : Orion doit gagner sur la créativité et le contenu, pas sur le mouvement.
2. **Stellarium Web**, le concurrent direct. https://stellarium-web.org/
   *À retenir* : c'est la référence du rendu atmosphérique dans le navigateur. [estimé, interface non vue ce mois-ci] Son interface est générique ; Orion doit s'en distinguer par le cadre-plaque et le calcul de pose, pas par le rendu du ciel.
3. **Carte du Ciel, Observatoire de Paris** (référence hors web). https://observatoiredeparis.psl.eu/350-ans-d-astrometrie-a-l.html
   *À retenir* : le négatif de plaque (« 2340 étoiles ») et l'équatorial photographique de 1885. Le cadre du matériel devient une plaque, avec ses annotations en marge, et l'icône de l'application en dérive.
4. **Atlas de Skalnaté Pleso, Antonín Bečvář, 1948** (référence hors web). https://en.wikipedia.org/wiki/Skalnate_Pleso_Atlas_of_the_Heavens
   *À retenir* : les magnitudes indiquées par des cercles de tailles graduées, et la hiérarchie des noms (constellations, grec, ciel profond). C'est la grammaire du canevas, et elle fonctionne aussi en monochrome rouge, puisqu'elle ne repose pas sur la couleur.
5. **Iosevka**, Belleve Invis, OFL. https://github.com/be5invis/Iosevka
   *À retenir* : grec complet, sous-familles Fixed et Etoile, construction sur mesure. Un couple tiré d'une seule source et livrable hors ligne.
6. **Le Murmure**, Velvetyne, OFL. https://velvetyne.fr/fonts/le-murmure/
   *À retenir* : l'alternative d'affiche pour la marque, avec latin, grec et cyrillique. Certificat TDC 2019.

Sources consultées : [Awwwards SOTD](https://www.awwwards.com/websites/sites_of_the_day/) · [Colonia Zacamil](https://www.awwwards.com/sites/colonia-zacamil) · [Stellarium Web](https://stellarium-web.org/) · [Observatoire de Paris, 350 ans d'astrométrie](https://observatoiredeparis.psl.eu/350-ans-d-astrometrie-a-l.html) · [Skalnaté Pleso Atlas](https://en.wikipedia.org/wiki/Skalnate_Pleso_Atlas_of_the_Heavens) · [Iosevka](https://github.com/be5invis/Iosevka) · [Le Murmure](https://velvetyne.fr/fonts/le-murmure/) · [Martian Mono](https://github.com/evilmartians/mono) · [Compagnon, Velvetyne](https://velvetyne.fr/fonts/compagnon/) (consultée, écartée faute de grec confirmé) · [IBM Plex](https://github.com/IBM/plex/tree/master/packages/plex-mono) · API Google Fonts CSS2 (couverture par écriture et taille du sous-ensemble d'icônes).
