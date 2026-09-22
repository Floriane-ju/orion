# PRD — Application planétarium orientée observation et capture

**Version** 1.2 — arbitrages de périmètre
**Date** 19 août 2026
**Statut** Toutes sections rédigées. Liste `[HYP]` close : 27 hypothèses ouvertes en cours de rédaction, toutes résolues par formule ou par constante sourcée au registre §2.1.

**Ce que la version 1.1 a changé** — cinq features livrées mais non spécifiées entrent au document (§3.6 gestes de la scène, §3.7 Voie lactée repérée, §6.4 cibles visibles et recherche, §9.5 aperçu incrusté, §11.3 coque), le lot 6 rejoint la roadmap §14, et quatre chiffres de la rédaction initiale sont corrigés par la mesure ou par le calcul : `focale_ideale_mm` (§6.1), comptage HYG (§3.3), volumes des paquets (§12.2), arbitrage `prefers-reduced-motion` (§11.1).

**Ce que la version 1.2 change** — six arbitrages de périmètre, tous journalisés en Annexe C (entrées 16 à 21) :

| Sujet | Décision |
|---|---|
| §12.1 rendu et threads | Canvas 2D retenu, WebGL 2 non prérequis ; le Worker devient un moyen déclenché par la mesure, non une règle |
| §3.3 et §12.2 paquet Gaia | Reporté hors MVP ; plancher de zoom à 15°, cause nommée |
| §4.1 atlas de pollution lumineuse | **Supprimé.** Bortle déclaré ou SQM mesuré, tous deux exacts et hors ligne |
| §4.1 multi-sites | Reporté à une version ultérieure : un seul site au MVP |
| §7.4 lecture EXIF | **Supprimée** du périmètre |
| §7.6 **nouvelle feature** | Atténuation atmosphérique par masse d'air sur le flux de l'objet |
| §3.7 **feature étendue** | Bande de la Voie lactée modulée par le fond de ciel, et repère du centre galactique |

Les écarts entre ce document et le code livré sont suivis dans `ovrsee/tickets/` — pas ici. Le PRD dit ce qui doit être vrai, le tableau dit où en est le travail.

---

## Comment lire ce document

Chaque feature est spécifiée en cinq blocs : **Feature** (nom, une phrase, persona), **Règle métier** (formule exacte, variables nommées, unités), **Entrées / Sorties** (champs, types, plages), **Critères d'acceptation** (Gherkin, dont au moins un cas limite), **Dépendances données** (source, fraîcheur, fallback hors-ligne).

Deux conventions gouvernent tout le document :

- **`[À CALCULER]`** — aucune éphéméride, aucune coordonnée, aucune magnitude n'est écrite en dur. Le document donne la formule ou la bibliothèque ; la valeur est produite à l'exécution. Un PRD contenant une éphéméride inventée produit des tests d'acceptation faux, ce qui est pire que pas de test.
- **Chaque nombre vient d'une formule écrite ici, ou d'une entrée du registre §2.1 avec sa source.** Aucun ordre de grandeur non sourcé n'est présenté comme un fait.

Le setup de référence utilisé dans les exemples chiffrés est décrit en **Annexe A**. Les formules sont récapitulées en **Annexe B**.

---

## Sommaire

1. [Vision, personas, non-objectifs](#1--vision-personas-non-objectifs)
2. [Socle de calcul et registre de constantes](#2--socle-de-calcul-et-registre-de-constantes)
3. [Planétarium, rendu du ciel et constellations](#3--planétarium-rendu-du-ciel-et-constellations)
4. [Profil Lieu](#4--profil-lieu)
5. [Profil Matériel](#5--profil-matériel)
6. [Moteur Faisabilité ciel profond](#6--moteur-faisabilité-ciel-profond)
7. [Moteur Pose](#7--moteur-pose)
8. [Sélection de cibles pour la nuit](#8--sélection-de-cibles-pour-la-nuit)
9. [Grand champ et filé d'étoiles](#9--grand-champ-et-filé-détoiles)
10. [Couche pédagogique intégrée](#10--couche-pédagogique-intégrée)
11. [Mode nuit et ergonomie terrain](#11--mode-nuit-et-ergonomie-terrain)
12. [Données et architecture offline](#12--données-et-architecture-offline)
13. [Métriques produit](#13--métriques-produit)
14. [Roadmap et lots de livraison](#14--roadmap-et-lots-de-livraison)

Annexes : [A. Setup de référence](#annexe-a--setup-de-référence-chiffré) · [B. Formulaire](#annexe-b--formulaire-complet) · [C. Journal des décisions](#annexe-c--journal-des-décisions-de-périmètre)

---

# 1 — Vision, personas, non-objectifs

## 1.1 Problème

Les planétariums existants répondent à « qu'y a-t-il dans le ciel ». Ils ne répondent pas à « qu'est-ce que **je** peux en faire avec **mon** matériel depuis **mon** jardin.

Le débutant en astrophotographie affronte trois écarts que rien ne comble :

**L'écart de cadrage.** M84 est un objet de 6,5 minutes d'arc. Sur un boîtier plein format à 120 mm, il occupe 0,95 % de la hauteur du champ, soit 44 pixels de diamètre. Aucune application ne le dit avant que l'utilisateur ait passé une heure dans le froid à le chercher.

**L'écart de visibilité.** La magnitude intégrée ment. M33 (magnitude 5,7) est beaucoup plus difficile que M57 (magnitude 8,8), parce que sa brillance de surface est de 23,0 mag/arcsec² contre 17,8. Le débutant compare des magnitudes, échoue, et conclut que son matériel est mauvais.

**L'écart de dosage.** « Combien de temps je pose ? Combien d'images ? » n'a pas de réponse générique. La réponse dépend du bruit de lecture du capteur, du fond de ciel local, du rapport d'ouverture et du pas des pixels. Elle est calculable, et personne ne la calcule pour l'utilisateur.

## 1.2 Proposition

Une application web qui prend en entrée un **lieu**, une **date**, un **matériel**, et produit en sortie un **plan de session exécutable** : quelles cibles, dans quel ordre, à quelle heure, avec quelle pose, combien d'images, et comment les trouver sans pointage automatique.

Trois principes de conception :

**Tout verdict est dépliable en sa chaîne de calcul.** Un verdict sans explication est un oracle. Un oracle n'enseigne rien et ne se conteste pas. Voir §10.2.

**Le déterministe est calculé hors ligne, le probabiliste est signalé comme tel.** La position d'un astre, un champ, un échantillonnage sont physiques : calculables, reproductibles, disponibles sans réseau. La météo et le seeing sont probabilistes : ils dépendent d'un service, tombent hors ligne, et sont annoncés avec leur incertitude. Le « beau cadrage » est subjectif : l'application propose, elle ne tranche pas. Voir §12.5.

**« Impossible » n'existe presque jamais ; « combien de temps » existe toujours.** Un objet trop faible pour l'œil n'est pas invisible : il demande une durée d'intégration. Le verdict `PHOTO_SEULE` est une durée, pas un refus.

## 1.3 Personas

| Persona | Situation | Attente principale | Sections critiques |
|---|---|---|---|
| **Débutant grand champ** — persona primaire | Boîtier plein format, objectifs 10 à 200 mm, monture motorisée sans pointage automatique, ciel Bortle 4 à 6 | « Dis-moi ce que je peux faire ce soir et comment » | 5, 6, 7, 8, 10 |
| **Amateur de Voie lactée et de filé** | Grand angle, trépied, pas de suivi | « Combien de temps je pose, et à quoi ça ressemblera » | 9, 3 |
| **Confirmé en préparation** | Sait ce qu'il veut, veut vérifier vite | Cadrage et dosage sans pédagogie imposée | 5, 6, 7, 3.5 |
| **Curieux du ciel** | Aucun matériel | Reconnaître les constellations, voir le ciel défiler | 3 |

Le débutant grand champ est le persona **primaire**. Tout arbitrage de conception se tranche en sa faveur.

## 1.4 Non-objectifs

Chacun est un constat issu d'une décision de périmètre explicite, pas une intention. Le journal complet est en **Annexe C**.

| Non-objectif | Raison |
|---|---|
| **Suivi lunaire et planétaire** | À 120 mm, la dérive lunaire est de 5 px sur une pose de 60 s. Ces modes deviennent pertinents au-delà de ~600 mm, donc hors du domaine du matériel visé. |
| **Montures altazimutales** | Leur pose unitaire est plafonnée par la rotation de champ, moteur distinct non spécifié. Le profil §5.2 les déclare et les exclut explicitement. |
| **Calibration adaptative** | L'optimum de pose est plat : une erreur d'un facteur 2 coûte 2 à 5 points de SNR (§2.3). La calibration aurait raffiné une constante dont l'erreur plausible est imperceptible. Décision confirmée par calcul, pas par préférence. |
| **Serveur applicatif** | Conséquence de la précédente : aucune agrégation, aucun compte, aucun apprentissage. L'application est intégralement cliente. |
| **Guide séparé de l'application** | Un contenu pédagogique autonome dérive des moteurs quand le registre §2.1 évolue, et devient faux en silence. Remplacé par une couche pédagogique attachée aux sorties (§10). |
| **Occultations, transits, phénomènes de contact** | Exigent une précision de l'ordre de la seconde d'arc. Les séries analytiques retenues (§12.4) donnent la minute d'arc. |
| **Traitement d'images** | L'application planifie et prédit ; elle n'empile pas, ne dématrice pas, ne développe pas. |
| **Photométrie et astrométrie scientifiques** | Précision et traçabilité hors périmètre grand public. |
| **Pilotage de matériel** | Aucune connexion à une monture, un boîtier ou un séquenceur. |
| **Recommandation commerciale** | L'application nomme des catégories d'équipement et chiffre leur gain (§10.3). Jamais un prix, un lien, un conseil d'achat, ni une marque ou un modèle **suggérés**. Le non-objectif porte sur la prescription, pas sur l'identification : nommer le boîtier qu'on possède déjà (§5.1) sert à le décrire, et ne vend rien. |

## 1.5 Critères de réussite du MVP

Formulés en capacités vérifiables, sans métrique d'usage — cohérent avec l'absence de télémétrie comportementale (§13).

1. Depuis un lieu, une date et un matériel saisis en moins de deux minutes, l'application produit un plan de session ordonné, chiffré et exécutable.
2. Tout nombre affiché est dépliable jusqu'à sa formule et sa constante source.
3. Le noyau — planétarium, cadrage, pose, planification, filé — fonctionne intégralement sans réseau.
4. Aucune cible n'est écartée sans que la cause soit nommée.
5. Le mode nuit ne laisse subsister aucune composante verte ou bleue dans l'interface.

---

# 2 — Socle de calcul et registre de constantes

## 2.1 Feature — Registre de constantes de référence

**Feature** — Fichier unique, versionné, contenant toute constante non dérivable d'une formule, avec sa source et sa tolérance. Persona : équipe de développement. Aucune constante numérique n'est écrite ailleurs dans le code.

### Règle métier

```
PRINCIPE
  Toute valeur qui n'est pas le résultat d'une formule vient de ce registre.
  Chaque entrée porte : valeur, unité, source nommée, tolérance, sections consommatrices.
  Le registre est en lecture seule à l'exécution. Il n'existe aucun mécanisme
  d'ajustement automatique : ni apprentissage, ni retour utilisateur, ni télémétrie.
  → une prédiction reproductible est vérifiable ; une prédiction qui dérive ne l'est pas.
```

**Constantes astronomiques exactes — aucune tolérance**

| Constante | Valeur | Consommée par |
|---|---|---|
| Rotation apparente du ciel | 15,041 °/h | §3.1, §9.1, §9.3 |
| Jour sidéral | 86 164,09 s | §3.1 |
| Jour solaire moyen | 86 400 s | §3.1 |
| Mois synodique | 29,5306 j | aucune — conservée pour mémoire |
| Année tropique | 365,2422 j | aucune — conservée pour mémoire |
| Précession générale | 50,29 "/an | §3.1, §3.4 |
| Radian en arcsecondes | 206 265 | §5.1 |
| Limite de Dawes | 116 / D(mm) | §5.1 |
| Réfraction à l'horizon vrai | ≈ 34' | §12.4 |
| Époque des frontières IAU | B1875.0 | §3.4 |
| Facteur 57,296 (deg/rad) | approximation petits angles — **remplacée par arctangente** | §5.1 |

**Constantes conventionnelles — sourcées, avec tolérance**

| Réf | Constante | Valeur retenue | Source | Tolérance |
|---|---|---|---|---|
| C-01 | Seuil hauteur imagerie | 30° (masse d'air 2) | convention | — |
| C-02 | Seuil hauteur visuel | 20° | convention | — |
| C-03 | Facteur de pose `C` | 10 par défaut, 3 permissif | socle | optimum plat, voir §2.3 |
| C-04 | Échantillonnage nominal | 1 à 2 "/px | convention | dépend du seeing |
| C-05 | Remplissage de cadre | 1/3 à 1/2 du champ | convention | subjectif |
| C-06 | Tolérance NPF `k` | 1,0 strict / 2,0 tolérant | règle NPF | — |
| C-07 | Plafond de pose sans autoguidage | 240 s | convention terrain | ordre de grandeur |
| C-08 | Recouvrement de mosaïque | 15 % | convention | — |
| C-09 | Intervalle inter-pose en filé | ≤ 1 s | socle | contrainte dure |
| C-11 | Pupille de l'œil adapté | 6,5 mm | convention | 5 à 8 mm selon l'âge |
| C-12 | `t_ref_soigne` à 200 mm | 120 s | socle (1 à 4 min) | ordre de grandeur |
| C-13 | `t_ref_approx` à 200 mm | 45 s | socle | ordre de grandeur |
| C-14 | Point zéro système générique | `ZP_sys` = 20,20 | dérivé, voir §2.3 | ± 0,5 mag |
| C-15 | Poids de scoring | w_c 0,25 · w_h 0,20 · w_s 0,30 · w_f 0,15 · w_l 0,10 | convention, réglable | — |
| C-16 | Seuil de rappel batterie | 90 min de prise de vue | convention terrain | ordre de grandeur |

### Critères d'acceptation

```gherkin
Étant donné le code source de l'application
Quand j'y recherche une valeur numérique non triviale hors du registre
Alors aucune occurrence n'est trouvée dans les moteurs de calcul

Étant donné une constante affichée à l'utilisateur en mode expert
Quand j'ouvre son détail
Alors sa source et sa tolérance sont visibles

Étant donné une mise à jour du registre
Quand l'application redémarre
Alors les plans de session enregistrés sont recalculés,
    non conservés avec les anciennes valeurs

Étant donné une constante dont la tolérance est marquée "ordre de grandeur"  # cas limite
Quand une sortie en dépend
Alors cette sortie est affichée avec sa plage, jamais comme une valeur exacte
```

### Dépendances données

Registre embarqué, versionné avec le code. Fraîcheur : liée aux releases. Fallback hors-ligne : intégral.

---

## 2.2 Feature — Table Bortle et brillance de fond de ciel

**Feature** — Conversion Bortle → brillance de fond de ciel et magnitude limite à l'œil nu, par table de correspondance. Consommée par §6.3, §7.1, §8.4.

### Règle métier

Le socle donne deux points d'ancrage (Bortle 4 ≈ 21,3 ; Bortle 8 ≈ 18,5). L'interpolation linéaire entre les deux, à −0,70 mag par échelon, est correcte **entre 4 et 8** et fausse aux extrémités :

```
Extrapolation linéaire vers Bortle 1 : 21,3 + 0,70 × 3 = 23,4 mag/arcsec²
  → PHYSIQUEMENT IMPOSSIBLE. Le fond de ciel naturel a un plancher : lueur
    atmosphérique (airglow), lumière zodiacale et lumière stellaire intégrée
    le fixent autour de 21,7 à 22,0 mag/arcsec². Aucun site terrestre ne
    descend en dessous.

Extrapolation linéaire de la magnitude limite (m_lim = SB − 15) :
  Bortle 4 → 6,3   conforme aux valeurs publiées (6,1 à 6,5)
  Bortle 8 → 3,5   valeur publiée ≈ 4,5  → une magnitude d'écart
```

Le modèle linéaire est donc **remplacé par une table**, jamais extrapolée hors de ses bornes.

| Bortle | SB fond de ciel (mag/arcsec²) | Magnitude limite œil nu |
|---|---|---|
| 1 | 21,9 | 7,8 |
| 2 | 21,7 | 7,3 |
| 3 | 21,5 | 6,8 |
| **4** | **21,3** | 6,3 |
| 5 | 20,6 | 5,8 |
| 6 | 19,9 | 5,5 |
| 7 | 19,2 | 5,0 |
| **8** | **18,5** | 4,5 |
| 9 | 18,0 | 4,0 |

Lignes 4 et 8 : ancrages du socle. Colonne magnitude limite : échelle de Bortle telle que publiée (*Sky & Telescope*, 2001) — `[À VÉRIFIER]` contre la publication à l'implémentation.

```
INTERPOLATION LINÉAIRE AUTORISÉE entre deux lignes.
EXTRAPOLATION INTERDITE au-delà de 1 et de 9.
Le SQM mesuré, s'il est saisi, PRÉVAUT toujours sur le Bortle estimé.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `bortle` | float | — | 1 – 9 | profil Lieu §4 |
| `sqm_mesure` | float | mag/as² | 16 – 22 | optionnel, prioritaire |
| `sb_ciel` | float | mag/as² | sortie | |
| `m_lim_oeil` | float | mag | sortie | consommé par §6.3, §8.4 |
| `source_sb` | enum | — | TABLE_BORTLE / SQM_MESURE | affiché |

### Critères d'acceptation

```gherkin
Étant donné un Bortle de 4,5
Quand la brillance de fond de ciel est établie
Alors la valeur 20,95 mag/arcsec² est obtenue par interpolation entre les lignes 4 et 5
Et la magnitude limite œil nu vaut 6,05

Étant donné une valeur de Bortle inférieure à 1 ou supérieure à 9   # cas limite
Quand la conversion est demandée
Alors la saisie est refusée, sans extrapolation hors table

Étant donné un SQM mesuré de 21,1 saisi par l'utilisateur
Quand un verdict est calculé
Alors le SQM prévaut sur le Bortle
Et la magnitude limite est interpolée depuis la colonne correspondante

Étant donné un SQM saisi à 23,0                                     # cas limite
Quand il est validé
Alors l'app signale que la valeur dépasse le fond de ciel naturel le plus sombre
    et demande confirmation
```

### Dépendances données

Table embarquée, source publiée. Aucune source en ligne : le Bortle est déclaré, ou le SQM mesuré et saisi (§4.1). Fraîcheur : liée aux releases. Fallback hors-ligne : intégral.

---

## 2.3 Feature — Point zéro système et tolérance de la pose unitaire

**Feature** — Point zéro photométrique par boîtier, livré dans la base matériel, remplaçant toute constante calibrable. Aucune intervention de l'utilisateur.

### Règle métier

```
FORMULATION — un seul nombre par boîtier
  E_ciel = 10^( −0,4 × (SB_ciel − ZP_sys) ) × (pitch_um / N)²        [e⁻/s/px]

  ZP_sys = brillance de ciel produisant 1 e⁻/s/px pour un pixel de 1 µm à f/1.

DÉRIVATION — hors application, à partir de données publiées
  ZP_sys se déduit du point zéro photométrique de la bande passante, de l'efficacité
  quantique moyenne du capteur, de la transmission optique et du gain en e⁻/ADU.
  Sources : courbes QE constructeur, mesures de gain de Photons to Photos (Bill Claff).
  → une valeur par boîtier dans la base matériel §5.1, aux côtés du bruit de lecture
    et de la capacité de saturation.
  → Boîtier absent de la base : ZP_sys générique C-14 = 20,20, affiché [ESTIMÉ].
```

**Pourquoi aucune calibration n'est nécessaire — l'optimum est plat**

`t_opt` est proportionnel à `1 / E_ciel` : une erreur sur `ZP_sys` se répercute intégralement sur la pose recommandée. La question est ce que cette erreur coûte en qualité d'image.

```
SNR_obtenu / SNR_idéal = √( C / (C + 1) )
```

| `C` effectif | Perte de SNR | Situation |
|---|---|---|
| 3 | 13,4 % | mode permissif du socle |
| 5 | 8,7 % | pose deux fois trop courte |
| **10** | **4,7 %** | **cible du socle (C-03)** |
| 20 | 2,4 % | pose deux fois trop longue |
| 40 | 1,2 % | pose quatre fois trop longue |

Une erreur d'un facteur 2 sur la pose unitaire coûte entre 2 et 5 points de rapport signal sur bruit. Ces 4 % se récupèrent en allongeant l'intégration totale de 8 %, soit quelques minutes sur une heure. **L'optimum est plat par construction de la courbe.**

```
AFFICHAGE — conséquence directe
  valeur retenue : t_opt arrondie à une valeur d'obturateur usuelle
  plage utile    : [t_opt / 2 ; t_opt × 2], présentée comme équivalente
                   à quelques pourcents de SNR près
  → une pose de 10, 15 ou 20 s est indifférente quand l'optimum est 13 s.
    Information libératrice pour un débutant qui croit devoir viser une valeur exacte.
```

### Critères d'acceptation

```gherkin
Étant donné un boîtier présent en base matériel
Quand une pose unitaire est calculée
Alors le point zéro système du boîtier est utilisé, sans intervention de l'utilisateur
Et la pose est affichée avec sa plage utile

Étant donné un boîtier absent de la base                            # cas limite
Quand une pose est calculée
Alors le point zéro générique C-14 est appliqué et la pose porte la mention [ESTIMÉ]
Et l'app indique que la plage utile absorbe l'incertitude

Étant donné une pose recommandée de 13 s
Quand j'affiche le détail
Alors la plage 6 à 26 s est présentée comme équivalente
Et aucune valeur de cette plage n'est signalée comme erronée

Étant donné l'interface complète de l'application
Quand j'y cherche une fonction de calibration
Alors aucune n'existe, et aucun écran n'invite à en effectuer une
```

### Dépendances données

Base matériel embarquée : `zp_sys`, bruit de lecture par ISO, seuil de double gain, capacité de saturation, taille de fichier RAW. Sources : documentation constructeur, Photons to Photos. Fraîcheur : trimestrielle, non critique. Fallback : valeur générique C-14.

---

## 2.4 Résolutions de fin de rédaction

Les constantes que la calibration devait établir sont closes par convention documentée.

| Sujet | Résolution | Réf registre |
|---|---|---|
| Références de suivi | `t_max_suivi = t_ref × (200 / focale_mm)`, plafonné par C-07 | C-12, C-13 |
| Seuils de contraste visuel | Table publiée par Clark, *Visual Astronomy of the Deep Sky* (1990), d'après Blackwell (1946). Embarquée, jamais interpolée hors domaine | — |
| Tolérance NPF | `k = 1` par défaut ; `k = 2` en option explicite, jamais appliqué en silence | C-06 |
| Autonomie batterie | Hors périmètre : aucune autonomie n'est modélisée. Au-delà de C-16 minutes de prise de vue, un rappel, jamais un nombre de batteries | C-16 |
| Poids de scoring | Figés, exposés, réglables par l'utilisateur, sans apprentissage | C-15 |
| Constantes de rendu | Réglées une fois par comparaison visuelle à des photographies de référence, puis figées. Paramètres esthétiques, hors calibration physique | §3.3, §9.2 |
| Type de monture | Sélecteur explicite `GEM` / `TRACKER` / `ALTAZ`, aucune inférence | §5.2 |
| Limites de périmètre | SNR par pixel · mouvements propres ignorés · précision d'une minute d'arc · satellites et comètes en ligne seulement | §1.4, §12.4 |

---

## 2.5 Périmètre exclu du socle

```
EXCLU  journal de session réinjecté dans les moteurs
EXCLU  ajustement de constantes par retour utilisateur
EXCLU  agrégation multi-utilisateurs, donc tout serveur applicatif
       → l'architecture intégralement hors-ligne de §12 est confirmée sans réserve
```

---

# 3 — Planétarium, rendu du ciel et constellations

## 3.1 Feature — Pipeline temporel à deux horloges

**Feature** — Architecture de rendu découplant l'horloge d'affichage de l'horloge d'éphémérides, permettant un défilement fluide sans recalculer les positions planétaires à chaque image. Persona : moteur interne, jamais exposé.

### Règle métier

```
DEUX HORLOGES DISTINCTES
  horloge_rendu       : 60 Hz, produit une image
  horloge_ephemerides : 10 Hz par défaut, produit des positions

  Entre deux mises à jour d'éphémérides, les positions des corps mobiles sont
  interpolées linéairement. Les étoiles ne sont JAMAIS interpolées : elles sont
  fixes dans le référentiel équatorial, seule la matrice de rotation change.

ROTATION DU CIEL — coût constant
  TSL = TSG(t) + longitude_deg / 15                    [heures]
  angle_rotation = TSL × 15,041                        [degrés]
  → une seule matrice par image, appliquée à l'ensemble du catalogue.
    Le nombre d'étoiles n'a AUCUNE incidence sur le coût de l'animation.

CORPS MOBILES — coût proportionnel au nombre de corps, pas d'étoiles
  10 corps au MVP : Soleil, Lune, 6 planètes visibles.
  Vitesse propre maximale : la Lune, ≈ 0,55 °/h par rapport aux étoiles.
  Erreur d'interpolation à 10 Hz et vitesse ×3600 :
     0,55 °/s × 0,1 s = 0,055°, soit ≈ 1,8 px à 32 px/°  → invisible.

PRÉCESSION — obligatoire dès que le curseur sort de l'époque courante
  Taux 50,29 "/an, soit 1° tous les 71,6 ans.
  Un saut de 100 ans décale le ciel de 1,40° — visible à l'écran.
  → coordonnées J2000 du catalogue précessées vers l'époque affichée.
    Recalcul à chaque changement d'année entière, pas à chaque image.
```

Le découplage n'est pas une optimisation prématurée : sans lui, chaque image exige une évaluation complète des séries planétaires, ce qui plafonne le rendu à quelques images par seconde et rend l'animation saccadée — donc pire que le mode discret.

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `t_affiche_jd` | float | jour julien | −1e6 – 1e6 | horloge maîtresse |
| `facteur_vitesse` | float | — | −3600 – 3600 | négatif = marche arrière |
| `latitude`, `longitude` | float | ° | §4 | |
| `freq_ephemerides_hz` | float | Hz | 1 – 60 | défaut 10 |
| `tsl_h` | float | h | 0 – 24 | sortie, `[À CALCULER]` |
| `matrice_ciel` | mat3 | — | sortie | rotation unique |
| `positions_corps` | array | ° | sortie | interpolées, `[À CALCULER]` |
| `epoque_precession` | float | année | sortie | |
| `fps_effectif` | float | Hz | sortie | diagnostic local |

### Critères d'acceptation

```gherkin
Étant donné le catalogue complet d'étoiles réelles et un défilement à ×60
Quand le ciel est animé
Alors la fréquence d'images reste au-dessus de 50 Hz
Et l'ajout d'étoiles au catalogue ne dégrade pas mesurablement la fréquence

Étant donné un défilement à ×3600 et la Lune affichée
Quand je compare la position interpolée à la position calculée exactement
Alors l'écart reste inférieur à 0,06° à tout instant

Étant donné un curseur déplacé de 2026 à 1400                       # cas limite
Quand le ciel est rendu
Alors la précession est appliquée et le décalage attendu d'environ 8,7° est visible
Et l'app signale que les positions sont précessées, pas les magnitudes ni les noms

Étant donné une date hors du domaine de validité des séries    # cas limite
Quand le ciel est rendu
Alors les étoiles et constellations restent affichées
Et les corps du système solaire sont masqués avec la cause nommée,
    plutôt qu'extrapolés silencieusement
```

### Dépendances données

Éphémérides : séries analytiques VSOP87 (planètes) et ELP2000 (Lune) portées en JavaScript, calcul client. Temps sidéral : formule de Meeus. Précession : matrice IAU 2006. Fraîcheur : néant, tout est calculé. Fallback hors-ligne : total.

---

## 3.2 Feature — Curseur temporel et plafond de vitesse

**Feature** — Contrôle du temps affiché, du temps réel au défilement accéléré, avec plafond dérivé de la lisibilité et non de la performance machine. Persona : pédagogie et exploration.

### Règle métier

```
VITESSE APPARENTE À L'ÉCRAN
  v_ecran = 15,041 × facteur_vitesse × px_par_degre / 3600        [px/s]
  px_par_degre = largeur_viewport_px / fov_horizontal_deg

SEUILS PERCEPTIFS — dérivés de v_ecran, pas de la puissance de calcul
  v_ecran < 2 px/s     → mouvement imperceptible : l'animation ne sert à rien
  2 à 300 px/s         → PLAGE LISIBLE
  300 à 600 px/s       → rapide, encore suivable
  v_ecran > 600 px/s   → REPLIEMENT : le ciel devient illisible
                         → bascule en mode traînée ou saut discret ;
                           l'app ne continue pas d'animer dans le vide

PLAFOND
  facteur_max = 600 × 3600 / (15,041 × px_par_degre)
```

**Le chiffre qui condamne le temps réel** — viewport 1920 px, champ 60° → 32 px/° :

| Facteur | Sens | v_écran | Verdict |
|---|---|---|---|
| ×1 (temps réel) | 1 s/s | **0,13 px/s** | imperceptible — inutilisable en animation |
| ×60 | 1 min/s | 8,0 px/s | lisible, mouvement doux |
| **×150** (vitesse normale) | 2,5 min/s | **20 px/s** | lisible — écrêtée sous 2° de champ |
| ×600 | 10 min/s | 80 px/s | lisible, lecture d'une nuit entière |
| **×1500** (vitesse rapide) | 25 min/s | **201 px/s** | lisible — écrêtée sous 20° de champ |
| ×3600 | 1 h/s | 481 px/s | limite haute, encore suivable |
| ×10000 | 2,8 h/s | 1 337 px/s | repliement, illisible |

Plafond à 32 px/° : **×4 488**. À 5° de champ (384 px/°) : **×374**. Le plafond dépend du zoom.

```
CONSÉQUENCE PRODUIT
  Le curseur de vitesse est COUPLÉ AU ZOOM. Un réglage de vitesse fixe produit
  une animation fluide en vue large et illisible en vue serrée. C'est l'erreur
  classique des planétariums grand public.

MODES DE TEMPS — trois, et le mode de départ est la lecture
  MAINTENANT       le temps s'écoule à la cadence de l'horloge système, à un DÉCALAGE
                   CONSTANT près : instant_affiche = horloge_systeme + decalage.
                   Nul au démarrage — l'app ouvre sur l'instant présent. Resynchronisé
                   à chaque image, donc sans dérive. MODE PAR DÉFAUT.
  FIGE             instant arbitraire, aucun défilement
  DEFILEMENT       facteur ∈ [−facteur_max ; +facteur_max]

COMMANDES — un transport, pas un formulaire
  lecture / pause  bascule MAINTENANT ↔ FIGE. La lecture repart de l'INSTANT AFFICHÉ,
                   pas de l'heure du jour : le décalage est figé à la reprise. Reprendre
                   après avoir choisi le 21 août montre le 21 août qui s'écoule.
  défilement       DEUX VITESSES NOMMÉES, dans les deux sens :
                     normale  ×150   → 2,5 min de ciel par seconde
                     rapide   ×1500  → 25 min de ciel par seconde
  aller à          saisie d'une date-heure ; l'instant choisi met le temps en pause,
                   sans quoi la resynchronisation de MAINTENANT l'effacerait aussitôt

  Les deux vitesses RESTENT SOUMISES à facteur_max : elles ne remplacent pas le
  plafond, elles s'y écrêtent — et l'écrêtage est annoncé, comme partout ailleurs.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `mode_temps` | enum | — | 3 valeurs | MAINTENANT au démarrage |
| `facteur_vitesse` | float | — | borné par `facteur_max` | ×150 ou ×1500, au signe près |
| `facteur_max` | float | — | sortie | recalculé à chaque zoom |
| `instant_choisi` | datetime | — | entrée | fixe l'horloge et passe en FIGE |
| `decalage_ms` | int | ms | — | écart constant à l'horloge système en MAINTENANT |
| `v_ecran_px_s` | float | px/s | sortie | affiché en mode expert |
| `etat_lisibilite` | enum | — | IMPERCEPTIBLE / LISIBLE / RAPIDE / REPLIEMENT | sortie |

### Critères d'acceptation

```gherkin
Étant donné un champ de 60° sur un viewport de 1920 px
Quand je demande la vitesse normale puis la vitesse rapide
Alors le ciel défile à 20 px/s puis à 201 px/s
Et les deux valeurs tombent dans la plage lisible, sans écrêtage à annoncer

Étant donné la lecture temps réel, mode de départ
Quand je ne touche à rien
Alors l'horloge suit le système et le ciel avance de 0,13 px/s
Et l'app ne propose aucun défilement : une horloge juste n'est pas une animation ratée

Étant donné un défilement à ×3600 en champ de 60°
Quand je zoome jusqu'à un champ de 5°
Alors le facteur est automatiquement ramené sous ×374
Et l'app signale l'ajustement plutôt que de laisser l'image se replier

Étant donné la vitesse rapide demandée en champ de 5°
Quand le plafond s'applique
Alors le facteur retenu est ×374 et non ×1500
Et l'app affiche le facteur réellement appliqué et sa raison

Étant donné une date-heure saisie dans la barre
Quand je la valide
Alors le ciel montre cet instant, le plan de séance porte sur cette nuit
Et le temps est en pause

Étant donné un instant choisi la nuit du 21 août, temps en pause
Quand je reprends la lecture
Alors l'horloge repart du 21 août et avance à la seconde réelle
Et elle ne saute pas à l'heure du jour

Étant donné un défilement en marche arrière traversant un changement d'année  # cas limite
Quand la précession est réappliquée
Alors aucun saut visible n'apparaît dans le rendu
Et l'époque affichée reste cohérente avec la date

Étant donné le mode MAINTENANT laissé actif plusieurs heures
Quand je reviens sur la fenêtre
Alors le ciel correspond à l'heure système courante, sans dérive accumulée
```

### Dépendances données

Aucune source externe. Durées de référence : registre §2.1. Fallback : total.

---

## 3.3 Feature — Moteur de rendu unifié et niveau de détail

**Feature** — Un seul moteur de projection servant le planétarium (§3), la prévisualisation de champ (§9.2) et le filé (§9.3), avec profondeur du catalogue asservie au zoom. Persona : moteur interne. **Décision d'architecture, pas feature utilisateur.**

### Règle métier

```
UN MOTEUR, TROIS MODES — ne jamais implémenter deux fois la projection
  MODE_PLANETARIUM   projection stéréographique, champ 1° à 180°
                     conforme, déformation acceptable au bord
  MODE_CADRE         projection gnomonique (rectilinéaire), champ = FOV matériel §5.1
                     c'est la projection physique d'un objectif rectilinéaire
  MODE_FISHEYE       projection équidistante, pour type_objectif = FISHEYE
  Le filé §9.3 est MODE_CADRE avec la primitive polyligne au lieu du point.

  → si ces trois modes divergent en deux bases de code, le cadre affiché dans le
    planétarium ne correspondra pas à la prévisualisation. Défaut invisible en
    développement, fatal sur le terrain.

PROFONDEUR ASSERVIE AU ZOOM
  mag_limite = mag_base + 5 × log10(fov_ref / fov_courant)
  avec mag_base = 6,5 à fov_ref = 60°

BORNES DE CATALOGUE
  HYG v4.1     complet jusqu'à mag ≤ 9   → 83 479 étoiles → 2,02 étoiles/deg²
               comptage MESURÉ au paquet construit, non estimé. Le socle annonçait
               120 000 pour « HYG v3 mag ≈ 9 » : la coupure stricte à magnitude 9 sur
               la version courante en retient un tiers de moins.
  Gaia DR3     sous-ensemble mag ≤ 11    → ordre de 1e6 étoiles → 24,2 étoiles/deg²
               [À VÉRIFIER : comptage exact par requête Gaia DR3]

  Densité et conséquence sur un champ de 5° × 3,3° = 16,5 deg² :
     avec HYG seul  → ≈ 33 étoiles      : le ciel paraît vide
     avec Gaia      → ≈ 400 étoiles     : rendu crédible
  → ZOOM UTILE AU MVP : 15° de champ. Le paquet Gaia est reporté hors MVP (§12.2,
    §14) : il achèterait le zoom à 5° contre 12 Mo, pour un champ où le persona
    primaire ne prend aucune décision de capture.
    L'application plafonne donc à 15°, NOMME la cause du plancher, et complète par
    le semis génératif — jamais en silence.

  Sous la borne du catalogue chargé, le semis génératif de §9.2 complète le rendu,
  TOUJOURS en le déclarant à l'utilisateur.

RENDU DES ÉTOILES — modèle commun avec §9.2
  rayon_px = r0 × 10^(−0,15 × (mag − mag_ref))
  couleur dérivée de l'indice B−V du catalogue
  → une étoile brillante dans le planétarium est brillante dans la prévisualisation.

INDEXATION SPATIALE
  Découpage HEALPix ou quadtree équatorial ; seules les cellules intersectant
  le champ sont soumises au GPU. Coût de sélection indépendant du zoom.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `mode_projection` | enum | — | 3 valeurs | |
| `fov_deg` | float | ° | 15 – 180 | plancher lié au catalogue chargé |
| `centre_visee` | az/alt ou AD/δ | ° | — | |
| `mag_limite` | float | mag | sortie | |
| `n_etoiles_reelles` | int | — | sortie | traçabilité |
| `catalogue_epuise` | bool | — | sortie | **doit être affiché** |
| `sb_ciel` | float | mag/as² | §2.2 | plafonne `mag_limite` en vue réaliste |

### Critères d'acceptation

```gherkin
Étant donné un champ de 60° et le catalogue HYG
Quand le ciel est rendu
Alors les étoiles jusqu'à magnitude 6,5 sont affichées aux positions réelles
Et leur taille et couleur suivent magnitude et indice B−V

Étant donné un zoom poussé jusqu'au plancher de 15° de champ     # cas limite
Quand le rendu est produit
Alors catalogue_epuise vaut vrai
Et l'app déclare que les étoiles faibles affichées sont générées, non catalographiées
Et elle nomme le catalogue manquant comme cause du plancher, sans laisser le geste
    sans effet ni explication

Étant donné le même pointage affiché en MODE_PLANETARIUM puis en MODE_CADRE
Quand je superpose les deux
Alors les positions des étoiles brillantes coïncident aux déformations de projection près
Et aucune divergence systématique n'apparaît

Étant donné un Bortle 8 et la vue « réaliste » activée
Quand le ciel est rendu
Alors mag_limite est plafonnée par le fond de ciel local
Et le rendu montre le ciel tel qu'il serait vu, non le catalogue complet

Étant donné un champ de 180° en projection stéréographique
Quand le rendu est produit
Alors aucune étoile n'est projetée à l'infini ni hors du canevas par division nulle
```

### Dépendances données

HYG v4.1 embarqué (positions J2000, magnitude V, indice B−V, noms), coupure à mag ≤ 9. Sous-ensemble Gaia DR3 : hors MVP (§12.2). Fraîcheur : statique — mouvements propres ignorés, erreur inférieure à 0,1° sur ±1 000 ans pour la quasi-totalité des étoiles. Fallback : total.

---

## 3.4 Feature — Constellations, frontières et astérismes

**Feature** — Tracés de repérage permettant de se situer dans le ciel, en trois couches indépendamment activables. Persona : débutant.

### Règle métier

```
TROIS COUCHES DISTINCTES, souvent confondues à tort
  1. FIGURES      segments reliant les étoiles principales. Aucune existence
                  officielle : convention culturelle. Jeu de référence : Stellarium
                  (culture occidentale), licence libre.
  2. FRONTIÈRES   découpage officiel des 88 constellations IAU. Ce sont des RÉGIONS
                  du ciel, pas des dessins.
  3. ASTÉRISMES   motifs non officiels franchissant les frontières : Grande Casserole,
                  Triangle d'été, Ceinture d'Orion, Cintre.
                  → ce sont EUX que le débutant reconnaît, pas les figures IAU.
                    Couche obligatoire au MVP, pas un raffinement.

PIÈGE DES FRONTIÈRES — le détail qui décale tout
  Les frontières IAU sont définies le long de méridiens et parallèles de l'époque
  B1875, pas J2000. Sans précession :
     B1875 → J2000 : 50,29 "/an × 125 ans = 1,75° d'erreur
     B1875 → 2026  : 50,29 "/an × 151 ans = 2,11° d'erreur
  → largement visible. Les frontières DOIVENT être précessées de B1875 vers
    l'époque affichée, comme les étoiles.

LABELS — hiérarchie par zoom
  fov > 40°   noms de constellations uniquement
  10° à 40°   + désignations Bayer des étoiles de mag ≤ 3,5
  fov < 10°   + noms propres et désignations des objets du ciel profond
  Densité plafonnée à 25 labels simultanés, priorité à la magnitude.
  Anti-chevauchement obligatoire.

INTERACTION
  Survol d'une constellation → mise en évidence de sa figure et de sa frontière
  Clic sur une étoile        → désignation, magnitude, type spectral, distance
  Clic sur un objet profond  → fiches §6.2 et §6.3, plan de capture §7
  → le planétarium n'est pas décoratif : c'est le point d'entrée vers les moteurs.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `couches_actives` | set | — | FIGURES / FRONTIERES / ASTERISMES | indépendantes |
| `epoque_affichee` | float | année | — | pilote la précession |
| `fov_deg` | float | ° | §3.3 | pilote les labels |
| `constellation_survolee` | string | — | code IAU 3 lettres | |
| `figures` | array | — | sortie | paires d'identifiants HYG |
| `frontieres` | array | — | sortie | polylignes précessées |
| `labels_affiches` | array | — | sortie | ≤ 25 |

### Critères d'acceptation

```gherkin
Étant donné la couche FRONTIERES activée à l'époque courante
Quand les frontières sont tracées
Alors elles sont précessées depuis B1875 vers l'époque affichée
Et une étoile proche d'une limite est attribuée à la bonne constellation

Étant donné la couche ASTÉRISMES activée
Quand je regarde vers la Grande Ourse
Alors la Grande Casserole est tracée comme astérisme, distincte de la figure IAU
Et l'app indique qu'un astérisme n'est pas une constellation

Étant donné un champ de 60° dans une région dense                   # cas limite
Quand les labels sont composés
Alors leur nombre ne dépasse pas 25, priorité aux plus brillants
Et aucun label ne chevauche un autre

Étant donné un clic sur un objet du ciel profond dans le planétarium
Quand la fiche s'ouvre
Alors elle affiche le verdict de cadrage, le verdict de détectabilité
    et un accès direct au plan de capture

Étant donné le curseur temporel déplacé de 10 000 ans dans le futur  # cas limite
Quand les figures sont tracées
Alors elles restent reliées aux mêmes étoiles, désormais déplacées
Et l'app signale que les figures perdent leur sens à cette échelle de temps
```

### Dépendances données

Figures et astérismes : jeu Stellarium (culture occidentale), licence libre, embarqué. Frontières IAU : jeu de Delporte (1930) en coordonnées B1875, embarqué. Métadonnées d'étoiles : HYG. Fraîcheur : statique. Fallback : total.

---

## 3.5 Feature — Superposition du cadre matériel

**Feature** — Affiche dans le planétarium le rectangle exact de ce que le matériel déclaré capturerait, manipulable en position et en rotation. Persona : préparation de cadrage. C'est la couture entre le planétarium et tous les moteurs.

### Règle métier

```
CADRE PROJETÉ
  dimensions angulaires issues de §5.1 (arctangente, jamais l'approximation linéaire)
  position : centre de visée courant
  rotation : angle_rotation_cadre, manipulable à la souris
  → le cadre est un objet de la scène, projeté par le moteur §3.3.
    À grand champ, ses bords ne sont PAS des droites dans le planétarium.

UN SEUL CADRE — celui du matériel déclaré, dans son mode de recadrage courant
  → la scène montre ce que CE matériel capturerait, pas un éventail de possibles.
    L'effet du recadrage se constate en changeant de mode : le cadre se resserre,
    l'échantillonnage affiché ne bouge pas, et §5.1 le dit en mots au même endroit.

DONNÉES AFFICHÉES EN CONTINU sur le cadre survolé
  taux de remplissage de la cible (§6.2), échantillonnage (§5.1),
  pose max ou pose optimale selon le mode de suivi (§5.2, §7.2, §9.1)
  → un seul geste donne le cadrage, la pose et le nombre d'images.

ROTATION SUGGÉRÉE
  Si une cible allongée est dans le cadre, l'app propose l'angle alignant son
  grand axe sur la grande dimension du capteur (§6.2). Un clic applique.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `profils_actifs` | array | — | 1 | le matériel déclaré, dans son mode de recadrage |
| `angle_rotation_cadre` | float | ° | 0 – 360 | |
| `cible_dans_cadre` | string | — | sortie | objet dominant |
| `remplissage`, `verdict_cadrage` | — | — | §6.2 | sortie |
| `t_pose_affichee_s` | float | s | §7.2 ou §9.1 | selon mode de suivi |
| `angle_suggere` | float | ° | §6.2 | sortie |

### Critères d'acceptation

```gherkin
Étant donné le profil de référence 120 mm plein format
Quand j'active la superposition du cadre
Alors un rectangle de 17,0° × 11,4° est projeté aux positions correctes du ciel
Et il porte les valeurs d'échantillonnage et de pose

Étant donné le profil de référence en plein format
Quand je bascule le format du capteur en recadrage APS-C
Alors le cadre projeté devient environ 1,5 fois plus petit sur chaque dimension
Et l'échantillonnage affiché est inchangé
Et l'app rappelle que recadrer n'est pas grossir

Étant donné le cadre déplacé sur une cible allongée
Quand l'angle suggéré est calculé
Alors il aligne le grand axe de l'objet sur la grande dimension du capteur
Et un clic l'applique

Étant donné aucun profil matériel renseigné                         # cas limite
Quand j'active la superposition
Alors l'app demande le profil au lieu d'afficher un cadre par défaut arbitraire

Étant donné un cadre de 130° de diagonale (objectif 10 mm)          # cas limite
Quand il est projeté en vue stéréographique
Alors ses bords sont rendus courbes conformément à la projection
Et non comme un rectangle à côtés droits
```

### Dépendances données

Agrège §5.1, §6.2, §7.2, §9.1. Aucune source nouvelle. Fallback : total.

---

## 3.6 Feature — Gestes de navigation de la scène

**Feature** — Les trois gestes qui promènent la visée et changent le champ, distingués les uns des autres sur un matériel qui ne les distingue pas. Persona : tous. §3.2 donne le temps, §3.6 donne l'espace.

### Règle métier

```
TROIS GESTES, TROIS EFFETS — et un seul événement navigateur pour les porter
  PINCEMENT au pavé tactile   → change le champ, EN CONTINU
  MOLETTE                     → change le champ, PAR CRANS
  DÉFILEMENT à deux doigts    → promène la visée, sans changer le champ
  GLISSER                     → promène la visée

  Les navigateurs traduisent les trois premiers en un même `wheel`. Aucun ne dit
  lequel c'est. La source est donc DÉDUITE de trois signaux, du plus sûr au moins sûr :
    1. `ctrlKey` posé par le navigateur         → PINCEMENT   (signal certain)
    2. delta exprimé en lignes, non en pixels   → MOLETTE     (Firefox seulement)
    3. `wheelDeltaY` multiple d'un cran de 120  → MOLETTE     (WebKit, Blink)
    sinon                                       → DÉFILEMENT

CONTINU CONTRE CRANTÉ — ce n'est pas un réglage de confort
  pincement : facteur_champ = exp( deltaY × sensibilité )
              → deux demi-gestes valent exactement le geste entier. Un facteur fixe
                par événement rendrait le zoom dépendant de la cadence d'événements
                du pavé, donc du matériel.
  molette   : facteur_champ = facteur_cran, ou son inverse selon le signe.

LE ZOOM DE LA SCÈNE N'EST JAMAIS LE ZOOM DE LA PAGE
  Un pincement au-dessus de la scène qui agrandit toute l'interface est un défaut,
  pas une commodité : la scène est l'instrument, pas un document. L'écouteur est donc
  posé hors du cycle de rendu, en mode non passif, pour que l'annulation de l'action
  par défaut prenne effet. Les gestes propres à WebKit sont neutralisés de même.

BORNES
  champ borné par §3.3 — plancher lié au catalogue chargé, plafond à 180°
  hauteur de visée bornée à [−90° ; +90°] : au-delà, la vue basculerait
  Aucun recalcul d'éphéméride pendant le geste : le geste ne touche que la vue.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `source_geste` | enum | — | PINCEMENT / MOLETTE / DEFILEMENT | déduite, non déclarée |
| `facteur_champ` | float | — | > 0 | multiplicatif |
| `fov_deg` | float | ° | §3.3 | borné par le catalogue chargé |
| `visee_az_deg`, `visee_alt_deg` | float | ° | 0–360, −90–90 | sortie |

### Critères d'acceptation

```gherkin
Étant donné un pincement à deux doigts au-dessus de la scène
Quand le geste s'applique
Alors seul le champ de la scène change
Et l'interface ne subit aucun zoom de page

Étant donné un pincement décomposé en deux demi-gestes de même amplitude
Quand je compare au geste entier
Alors le champ obtenu est identique

Étant donné un défilement à deux doigts sans pincement
Quand le geste s'applique
Alors la visée se déplace et le champ reste inchangé

Étant donné un zoom poussé jusqu'au plancher du catalogue chargé   # cas limite
Quand je continue à pincer
Alors le champ ne descend pas sous le plancher
Et l'app nomme le catalogue manquant plutôt que de laisser le geste sans effet

Étant donné un geste en cours
Quand la visée change de plusieurs dizaines de degrés
Alors aucune éphéméride n'est réévaluée pendant le geste
```

### Dépendances données

Aucune. Bornes de zoom : §3.3. Fallback : total.

---

## 3.7 Feature — Voie lactée repérée sur la scène : plan, bande et centre galactique

**Feature** — Quatrième couche de repérage : le plan de la Voie lactée, la bande telle qu'elle sera vue depuis ce site, et la position du centre galactique. Persona : amateur de Voie lactée et de filé — c'est sa cible, et aucune constellation ne la délimite.

### Règle métier

```
CE QUI EST TRACÉ — une ligne, pas une bande photométrique
  Le plan galactique b = 0°, échantillonné en longitude galactique et converti en
  directions J2000, puis projeté par le moteur unique de §3.3 — même chemin que les
  frontières de §3.4.
  → à grand champ la ligne n'est pas droite : c'est la projection qui la courbe.

  CE N'EST PAS la couche 3 de §9.2. §9.2 module un CONTRASTE dans une image de
  prévisualisation ; §3.7 pose un REPÈRE sur une carte. Confondre les deux ferait
  d'un repère de pointage une promesse photométrique.

LABEL POSÉ SUR LA BANDE
  Le nom se pose sur la ligne, dans la zone visible du canevas, et entre dans le
  budget de labels de §3.4 — plafond, priorité et anti-chevauchement compris.
  Un label hors du champ ou superposé à un nom de constellation ne repère rien.

LA BANDE, MODULÉE PAR LE FOND DE CIEL DU SITE
  La ligne dit OÙ passe le plan ; la bande dit CE QUE L'UTILISATEUR VERRA. Densité
  modulée par la latitude galactique et contraste modulé par SB_ciel (§2.2), comme la
  couche 3 de §9.2 :
     densite(b)  = d0 × exp( −|b| / 20° )
     contraste   ← SB_ciel : visible mais atténuée à Bortle 4–5, effacée à Bortle 8
  → à Bortle 8 la bande disparaît, et c'est l'information juste : l'application montre
    le ciel de ce site, pas une carte de référence idéale.
  → la bande est peinte AVEC LE FOND, sous les repères, les étoiles et les labels. Un
    fond peint par-dessus le repérage masque exactement ce qui sert à s'orienter. C'est
    l'ordre des passes, et l'aperçu incrusté de §9.5 le partage : il se dépose au même
    rang. Ce que §9.5 change, quand l'aperçu couvre TOUTE LA SCÈNE, ce n'est pas ce
    rang — c'est que la bande, comme les autres couches de repérage, ne se peint plus du
    tout. LE TRAIT DU PLAN, LUI, RESTE : la bande dit ce que l'utilisateur verra, et
    l'aperçu le montre déjà ; le trait dit OÙ passe le plan, et sur une prise de vue rien
    d'autre ne le dit.
  → ce n'est PAS une promesse photométrique : c'est un repère de lecture. La couche 3
    de §9.2 module un contraste dans une IMAGE DE CAPTURE ; §3.7 repère une région du
    ciel sur une CARTE.

LE CENTRE GALACTIQUE — repère nommé, avec sa conséquence site-dépendante
  Position : l0 = 0°, b = 0° en coordonnées galactiques, soit δ ≈ −29°.
  C'est la cible la plus demandée du grand champ d'été, et §8.2 a déjà calculé qu'elle
  culmine à 14,6° depuis le site de référence — inaccessible. Ce chiffre vit
  aujourd'hui dans un tableau du PRD ; un repère sur la scène le rend lisible d'un
  coup d'œil, là où un tableau demande d'y croire.
  → quand alt_culmination < seuil d'imagerie C-01 depuis ce site, le repère PORTE la
    cause et la latitude en dessous de laquelle la cible deviendrait accessible (§8.2).
  → aucune cible n'est masquée pour autant : elle est repérée ET qualifiée.

ACTIVATION
  Couche indépendante, au même titre que FIGURES, FRONTIERES et ASTERISMES (§3.4).
  UNE SEULE BASCULE pour les trois éléments — plan, bande, centre galactique. Trois
  interrupteurs pour une même question produisent un panneau de réglages, pas une carte.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `couche_voie_lactee` | bool | — | — | indépendante des trois autres, bascule unique |
| `sb_ciel` | float | mag/as² | §2.2 | pilote le contraste de la bande |
| `latitude_site` | float | ° | §4.1 | pilote la hauteur du centre galactique |
| `plan_galactique` | polyligne | — | sortie | directions J2000, projetées |
| `contraste_bande` | float | — | 0 – 1 | sortie, 0 = effacée |
| `centre_galactique` | objet | — | sortie | position, hauteur courante, verdict de portée |
| `label_voie_lactee` | objet | — | sortie | posé sur la bande, budget §3.4 |

### Critères d'acceptation

```gherkin
Étant donné la couche Voie lactée activée et un champ de 60°
Quand la scène est rendue
Alors la ligne du plan galactique est tracée et courbée par la projection
Et son label est posé sur la ligne, dans le canevas

Étant donné un pointage où le plan galactique ne traverse pas le champ  # cas limite
Quand la scène est rendue
Alors aucun label n'est posé hors du canevas

Étant donné un champ dense où le budget de labels de §3.4 est atteint  # cas limite
Quand les labels sont composés
Alors le label de la Voie lactée est arbitré par la même règle que les autres,
    sans passe-droit

Étant donné un site à Bortle 4 puis le même site à Bortle 8
Quand la scène est rendue
Alors la bande est visible mais atténuée dans le premier cas, effacée dans le second
Et la ligne du plan galactique reste tracée dans les deux

Étant donné la bande affichée et la couche FRONTIERES active
Quand la scène est rendue
Alors les frontières, les étoiles et les labels sont visibles par-dessus la bande

Étant donné le centre galactique et le site de référence à 46,391° N   # cas limite
Quand son repère est affiché
Alors sa hauteur de culmination de 14,6° est portée avec le repère
Et l'app annonce qu'il n'atteint jamais le seuil d'imagerie depuis ce site,
    en nommant la latitude qui le rendrait accessible

Étant donné le mode nuit actif
Quand la bande est composée
Alors elle est rendue en rouge monochrome, sous la luminance plafond du mode (§11.1)
```

### Dépendances données

Aucune. Conversion galactique ↔ équatorial calculée, contraste dérivé de §2.2, hauteur de culmination de §8.2. Fallback : total.

---

# 4 — Profil Lieu

## 4.1 Feature — Saisie et caractérisation d'un site

**Feature** — Enregistrement d'un ou plusieurs sites d'observation, chacun portant ses coordonnées, son fond de ciel et son masque d'horizon. Persona : tous. Contrat d'entrée des §6.3, §7.1, §8.

### Règle métier

```
IDENTIFICATION
  latitude_deg   ∈ [−90 ; 90]      décimal, précision ≈ 0,001° suffisante (≈ 110 m)
  longitude_deg  ∈ [−180 ; 180]
  altitude_m     ∈ [−400 ; 6000]   influe marginalement sur la réfraction et
                                   l'extinction ; non critique
  fuseau         identifiant IANA, déduit des coordonnées, modifiable

DÉCALAGE DU MIDI SOLAIRE VRAI — conséquence de la longitude
  offset_min = (longitude_deg / 15) × 60 − offset_fuseau_h × 60
  → le milieu de nuit ne tombe PAS à minuit légal. L'app centre ses créneaux
    sur le milieu de nuit vrai (§8.1), jamais sur l'heure ronde.

FOND DE CIEL — deux sources, par ordre de priorité décroissante
  1. sqm_mesure      saisi par l'utilisateur, mag/arcsec²    → prévaut toujours
  2. bortle_declare  saisi à la main, échelle 1 à 9
  Conversion et bornes : table §2.2. Extrapolation interdite.

  L'ATLAS DE POLLUTION LUMINEUSE EST ÉCARTÉ. La rédaction initiale plaçait un atlas
  VIIRS aux coordonnées entre les deux, en source par défaut. Il exige le réseau à la
  première visite d'un site et un cache par site, pour remplacer une saisie de deux
  secondes par une estimation que l'utilisateur ne peut pas contester. Or le Bortle
  déclaré et le SQM mesuré sont exacts, hors ligne et déjà prioritaires. La frontière
  de §1.2 — le déterministe hors ligne, le probabiliste en ligne — n'a pas à être
  franchie pour une commodité de saisie.

MASQUE D'HORIZON
  masque : azimut (0–360°, pas de 1°) → altitude d'obstruction (°)
  Source MVP : profil d'altitude terrain aux coordonnées, rayon 30 km, converti
               en élévation apparente avec correction de courbure terrestre.
  Édition manuelle par-dessus (arbres, bâtiments), non requise.
  Site sans donnée de relief → masque plat à 0°, marqué [HYP] et affiché comme tel.

CONSÉQUENCES SITE-DÉPENDANTES, calculées à la validation
  alt_culmination(δ) = 90° − |latitude − δ|
  δ_min_imagerie = latitude − 60°      (seuil C-01 : 30°)
  δ_min_visuel   = latitude − 70°      (seuil C-02 : 20°)
  → l'app annonce à la validation quelle part du ciel austral est hors de portée
    depuis ce site. Information structurante que rien d'autre ne donne.

UN SEUL SITE AU MVP — le multi-sites est reporté
  Un site enregistré, actif. Il est saisi, persisté (§12.3) et exporté.

  La comparaison de deux sites — le même plan de séance évalué depuis deux endroits,
  pour chiffrer le gain d'un déplacement — est REPORTÉE À UNE VERSION ULTÉRIEURE
  (§14, post-MVP). Elle alimenterait le levier « site plus sombre » de §10.2 par un
  différentiel calculé plutôt que par une phrase, ce qui reste la bonne cible ; mais
  elle exige d'abord qu'un site survive au rechargement, et suppose une gestion de
  collection — création, choix de l'actif, suppression — qui n'apporte rien tant qu'un
  seul site est saisissable.
  → en attendant, le levier « site plus sombre » de §10.2 reste énoncé sans chiffre.
    C'est une dette assumée, pas un oubli.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `nom_site` | string | — | — | libellé utilisateur |
| `latitude_deg`, `longitude_deg` | float | ° | −90–90, −180–180 | |
| `altitude_m` | float | m | −400 – 6000 | |
| `fuseau` | string | — | IANA | déduit, modifiable |
| `sqm_mesure` | float | mag/as² | 16 – 22 | optionnel, prioritaire |
| `bortle_declare` | float | — | 1 – 9 | |
| `masque_horizon` | array[360] | ° | 0 – 90 | MNT + édition |
| `sb_ciel`, `m_lim_oeil` | float | mag/as², mag | sortie | §2.2 |
| `source_sb` | enum | — | SQM_MESURE / BORTLE_DECLARE | affiché |
| `dec_min_imagerie`, `dec_min_visuel` | float | ° | sortie | |
| `offset_midi_solaire_min` | float | min | sortie | |

### Critères d'acceptation

```gherkin
Étant donné les coordonnées 46,391° N / 6,697° E
Quand je valide le site
Alors le décalage du midi solaire vrai calculé est de +26,8 min par rapport à UTC
Et l'app annonce que les objets de déclinaison inférieure à −13,6°
    n'atteignent jamais 30° depuis ce site

Étant donné un SQM mesuré et un Bortle déclaré contradictoires
Quand le fond de ciel est établi
Alors le SQM prévaut et source_sb l'indique

Étant donné un site sans donnée de relief disponible                # cas limite
Quand le masque est construit
Alors un masque plat à 0° est appliqué, marqué [HYP] et affiché comme tel
Et l'app invite à le compléter manuellement

Étant donné une latitude de 68° N                                   # cas limite
Quand je valide le site
Alors l'app annonce que la nuit astronomique est nulle une partie de l'année
Et indique la période concernée, sans refuser le site

Étant donné un site saisi puis l'application rechargée               # cas limite
Quand je reviens sur l'application
Alors le site est retrouvé tel qu'il a été saisi, masque compris
Et aucune valeur par défaut ne s'est substituée à la saisie
```

### Dépendances données

Modèle numérique de terrain type SRTM (statique, mis en cache par site). Fuseaux IANA embarqués. Fallback hors-ligne : total après première mise en cache ; site inconnu hors réseau → masque plat et Bortle saisi à la main.

---

# 5 — Profil Matériel

## 5.1 Feature — Profil optique et capteur

**Feature** — Saisie du train optique (objectif + boîtier) produisant les grandeurs dérivées qui alimentent tous les moteurs. Persona : débutant en astrophoto grand champ, matériel photo standard. Contrat d'entrée des §6, §7, §9.

### Règle métier

```
CHAMP — formule exacte, jamais l'approximation linéaire
  FOV_deg = 2 × atan( dimension_capteur_mm / (2 × focale_mm) )

  L'approximation FOV ≈ 57,3 × d / f est excellente à petit champ (0,4 % d'écart
  à 120 mm) et FAUSSE en grand angle : à 10 mm sur plein format elle donne 205,7°,
  valeur physiquement impossible, contre 121,8° pour la formule exacte.
  → l'arctangente est utilisée PARTOUT, sans condition de bascule.

AUTRES GRANDEURS DÉRIVÉES
  D_mm     = focale_mm / ouverture_N                 diamètre de pupille d'entrée
  ech_apx  = 206,265 × pitch_um / focale_mm           échantillonnage, arcsec/px
  dawes_as = 116 / D_mm                               pouvoir séparateur, arcsec

MODE DE RECADRAGE CAPTEUR
  capteur_mode ∈ {FULL_FRAME, APSC_CROP}
  Le recadrage MODIFIE   : capteur_L_mm, capteur_H_mm, donc FOV
  Le recadrage NE MODIFIE PAS : pitch_um, donc ni échantillonnage, ni NPF, ni pose max

  → LE RECADRAGE NE GROSSIT RIEN. Il jette des pixels sur les bords. Un débutant
    croit très souvent gagner de la portée en passant en APS-C. L'app le dit
    explicitement au moment du basculement, en une ligne.

CAPTEUR — un modèle de la base, ou un format et une résolution
  Deux modes, et un seul sélecteur pour en changer.

  boitier_id — une ligne de la base matériel embarquée, ou vide pour le mode personnalisé.
  Un modèle apporte ce qu'aucune fiche produit ne donne : la courbe de bruit de lecture par
  ISO, le seuil de double gain, la capacité de saturation. Ce sont ces grandeurs, et elles
  seules, qui permettent de recommander un ISO (§7.2) et de chiffrer une pose sans repli
  générique. Les exiger d'une saisie manuelle revenait à ne jamais les avoir.
  → modèle choisi : plus aucun champ DÉCRIVANT LE CAPTEUR n'est posé, il n'y a plus rien à
    décider. Une seule exception, `taille_raw_mo` : elle ne décrit pas le capteur mais le
    réglage RAW du moment — compressé, sans perte ou non compressé changent le fichier du
    simple au triple sur le même appareil. La ligne de la base la préremplit, elle ne
    l'impose pas.

  Mode personnalisé — le capteur se décrit par son type et sa résolution, jamais par des
  millimètres ou un pitch tapés à la main : ni l'un ni l'autre ne se lit sur une fiche
  produit aussi directement que le type de capteur et le nombre de mégapixels. Ce mode est
  un chemin de première classe, pas un rattrapage : aucune base matériel n'est exhaustive.

  type_capteur ∈ {PLEIN_FORMAT, APSC_NIKON, APSC_CANON, MICRO_4_3, MOYEN_FORMAT}
  Chaque format fixe capteur_L_mm et capteur_H_mm (table sourcée, documentation
  constructeur — aucune marque de boîtier ni prix commercial).

  resolution_mpx (mégapixels totaux) donne le pitch, par la largeur en pixels qu'il implique
  au ratio du format choisi :
    L_px     = √( resolution_mpx × 10⁶ × capteur_L_mm / capteur_H_mm )
    pitch_um = capteur_L_mm × 1000 / L_px

  Le pitch dérivé reste validé contre sa plage habituelle (0,8 – 24 µm) : un format et une
  résolution incohérents entre eux sont refusés, en nommant le pitch — pas la résolution, qui
  peut être valide dans l'absolu et absurde seulement rapportée à ce format.

TYPE D'OBJECTIF
  type_objectif ∈ {RECTILINEAIRE, FISHEYE}
  Pilote la projection de §3.3, §9.2 et §9.3. Un 10 mm plein format peut être
  l'un ou l'autre, et le rendu diffère du tout au tout.

DIAGNOSTIC D'ÉCHANTILLONNAGE (seeing courant 2–3", constante C-04)
  ech < 1,0        → sur-échantillonné : on collecte du bruit, pas du signal
  1,0 ≤ ech ≤ 2,0  → nominal longue pose
  2,0 < ech ≤ 4,0  → sous-échantillonné modéré, acceptable en grand champ
  ech > 4,0        → grand champ assumé : la résolution est limitée par le pixel,
                     pas par l'optique. NON BLOQUANT, aucun message affiché.

  La dernière ligne est une exigence produit : à 120 mm l'app ne doit PAS afficher
  de warning anxiogène. Le sous-échantillonnage est le régime normal du grand champ,
  et n'a pas besoin d'être commenté à l'écran.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `focale_mm` | float | mm | 8 – 4000 | saisie libre, préréglages courants |
| `ouverture_N` | float | — | 0,95 – 32 | nombre f/N, réglable |
| `type_objectif` | enum | — | RECTILINEAIRE / FISHEYE | pilote la projection |
| `capteur_mode` | enum | — | FULL_FRAME / APSC_CROP | |
| `type_capteur` | enum | — | PLEIN_FORMAT / APSC_NIKON / APSC_CANON / MICRO_4_3 / MOYEN_FORMAT | pilote capteur_L_mm/H_mm |
| `resolution_mpx` | float | Mpx | 1 – 200 | avec type_capteur donne pitch_um |
| `capteur_L_mm`, `capteur_H_mm` | float | mm | 3 – 60 | pilotées par type_capteur |
| `pitch_um` | float | µm | 0,8 – 24 | dérivé de type_capteur + resolution_mpx |
| `read_noise_e` | float | e⁻ | 0,5 – 40 | par ISO, saisi ou repli générique |
| `seuil_double_gain_iso` | int | — | 100 – 6400 | saisi ou absent |
| `full_well_e` | int | e⁻ | 5 000 – 250 000 | saturation |
| `zp_sys` | float | mag | 18 – 22 | §2.3, saisi ou repli générique |
| `taille_raw_mo` | float | Mo | 5 – 120 | budget stockage §7.3, §9.4 |
| `fov_l_deg`, `fov_h_deg` | float | ° | sortie | |
| `ech_apx` | float | "/px | sortie | |
| `dawes_as`, `D_mm` | float | ", mm | sortie | |
| `diag_ech` | enum | — | 4 valeurs | sortie |

Les champs `read_noise_e`, `full_well_e`, `zp_sys` et `seuil_double_gain_iso` sont invisibles pour le débutant : facultatifs, éditables en mode avancé, remplacés par le repli générique du registre quand ils sont absents. `taille_raw_mo` est facultatif de la même manière, mais il se saisit EN CLAIR, sous le libellé « poids d'une image » : c'est la seule de ces grandeurs qui commande une sortie affichée — le budget de stockage, que §7.3 tient pour bloquant en pratique. Replié sous un dépliant, il laisse tout volume annoncé reposer sur un repli générique. C'est aussi la seule de ces grandeurs qui reste saisissable sous un boîtier de la base : elle appartient au réglage, pas au modèle.

### Critères d'acceptation

```gherkin
Étant donné focale = 120 mm, N = 2,8, capteur plein format 35,9 × 23,9, pitch 5,12 µm
Quand je valide le profil
Alors l'app affiche un champ de 17,0° × 11,4°, un échantillonnage de 8,80 "/px,
      un diamètre de 42,9 mm et un pouvoir séparateur de 2,70"
Et le diagnostic est « grand champ assumé », sans alerte bloquante

Étant donné focale = 10 mm sur plein format                         # cas limite
Quand le champ est calculé
Alors la valeur retournée est 121,8° × 100,2° par l'arctangente
Et jamais une valeur supérieure à 180°

Quand je bascule de FULL_FRAME vers APSC_CROP à focale constante
Alors le champ diminue d'un facteur ≈ 1,5 sur chaque dimension
Et l'échantillonnage, la NPF et la pose max affichés restent strictement identiques
Et l'app affiche : « recadrage, pas grossissement — même détail, moins de champ »

Étant donné un profil avec ech_apx = 0,6 "/px
Quand je valide
Alors l'app signale un sur-échantillonnage et propose une réduction de focale

Étant donné le mode personnalisé, type_capteur = APS-C Nikon/Sony/Pentax/Fujifilm et resolution_mpx = 24
Quand je valide le profil
Alors pitch_um se déduit de la formule de dérivation, jamais d'une saisie directe
Et capteur_L_mm, capteur_H_mm ne sont à aucun moment saisis à la main

Étant donné un boitier_id de la base matériel
Quand je valide le profil
Alors aucun champ décrivant le capteur ne m'est présenté
Et le seul champ qui subsiste est le poids d'une image, prérempli par la ligne choisie
Et le profil enregistré porte l'identifiant du modèle, jamais une copie de ses grandeurs

Étant donné un boitier_id de la base et un poids d'une image saisi à la main
Quand un volume de stockage est calculé
Alors c'est la valeur saisie qui s'applique, pas celle de la ligne

Étant donné un profil dont le boitier_id ne figure plus dans la base    # cas limite
Quand l'application démarre
Alors le mode personnalisé s'applique avec les champs enregistrés
Et rien du profil n'est perdu

Étant donné un type_capteur et une resolution_mpx dont le pitch dérivé dépasse 24 µm  # cas limite
Quand je valide le profil
Alors la saisie est refusée avec un message nommant pitch_um, pas resolution_mpx

Étant donné un profil sans bruit de lecture renseigné                # cas limite
Quand un moteur de pose est invoqué
Alors RN = 3,0 e⁻ et ZP générique C-14 sont appliqués et affichés comme [ESTIMÉ]
Et aucun résultat n'est annoncé comme une valeur mesurée

Étant donné focale = 0 ou ouverture = 0
Quand je valide
Alors la saisie est refusée avec un message nommant le champ fautif
```

### Dépendances données

Table de formats de capteur embarquée (5 formats, dimensions physiques uniquement) : documentation constructeur.

Base matériel embarquée, versionnée avec le code et éditable à la main (`src/data/boitiers.md`) : par modèle, format de capteur, résolution, courbe de bruit de lecture par ISO, seuil de double gain, capacité de saturation, poids d'une image. Sources : Photons to Photos pour l'électronique du capteur, documentation constructeur pour le format et la résolution ; chaque ligne porte la sienne (§2.1). Fraîcheur : liée aux releases, aucun appel réseau — la matrice §12.5 tient. Fallback : une colonne vide vaut « inconnu », le repli générique du registre s'applique et la sortie porte [ESTIMÉ].

Le point zéro système ne figure dans aucune ligne : il n'est publié nulle part et ne se dérive pas d'une fiche produit. Le générique C-14 s'applique pour tous les boîtiers (§2.3), et la plage utile de pose absorbe l'incertitude.

Les bornes de saisie de `read_noise_e` (0,5 – 40 e⁻) et de `full_well_e` (5 000 – 250 000 e⁻) couvrent les valeurs réellement mesurées : un capteur ISO-variant lit 36,5 e⁻ à ISO 100, un capteur à très gros photosites sature au-delà de 200 000 e⁻. Des bornes plus étroites refuseraient la mesure au profit de la spécification.

---

## 5.2 Feature — Profil Suivi

**Feature** — Déclaration de la capacité de suivi, produisant le plafond de pose unitaire consommé par §7 et §9. Une seule question posée à l'utilisateur, deux clics.

### Règle métier

```
mode_suivi ∈ {AUCUN, SUIVI_APPROX, SUIVI_SOIGNE}

AUCUN         → t_max = NPF, dépendante de la déclinaison de la cible (§9.1)
                → domaine ciel profond VERROUILLÉ, seul le grand champ reste ouvert
SUIVI_APPROX  → mise en station à la boussole, viseur polaire non réglé
                t_max = C-13 × (200 / focale_mm)      soit 45 s × 200 / f
SUIVI_SOIGNE  → viseur polaire réglé, ou dérive contrôlée
                t_max = C-12 × (200 / focale_mm)      soit 120 s × 200 / f

Plafond dur sans autoguidage : t_max ≤ C-07 = 240 s, quelle que soit la focale.

Le facteur (200 / focale_mm) traduit le fait que l'erreur de suivi se mesure en
arcsecondes : plus la focale est courte, plus elle est tolérée.

TYPE DE MONTURE — sélecteur explicite, aucune inférence
  GEM      équatoriale allemande → retournement au méridien obligatoire (§8.2)
  TRACKER  monture sur rotule    → pas de retournement, butée en angle horaire
  ALTAZ    altazimutale          → HORS MVP : la pose est plafonnée par la rotation
                                   de champ, moteur non spécifié. L'app le déclare
                                   et refuse le domaine ciel profond.

INTERFACE — deux clics, trois niveaux
  1. toggle « ma monture suit les étoiles »
  2. si activé, une question unique : « viseur polaire réglé / mise en station
     soignée ? » → Oui / Non / Je ne sais pas
     « Je ne sais pas » → SUIVI_APPROX
  Aucune saisie technique n'est demandée. La mise en station reste à la charge
  de l'utilisateur sur le terrain : l'app annonce des ordres de grandeur, jamais
  une valeur mesurée.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `suivi_actif` | bool | — | — | toggle principal |
| `qualite_mes` | enum | — | SOIGNEE / APPROX / INCONNUE | posé si `suivi_actif` |
| `type_monture` | enum | — | GEM / TRACKER / ALTAZ | explicite |
| `t_max_suivi_s` | float | s | 1 – 240 | sortie |
| `domaine_cp_ouvert` | bool | — | — | sortie, autorise le ciel profond |

### Critères d'acceptation

```gherkin
Étant donné suivi_actif = faux et le profil de référence 120 mm f/2,8 pitch 5,12 µm
Quand j'ouvre l'onglet ciel profond
Alors la pose max affichée est 2,10 s (NPF)
Et le domaine ciel profond est présenté comme fermé, avec le grand champ en alternative

Étant donné suivi_actif = vrai, qualite_mes = INCONNUE, focale 120 mm
Quand je consulte une cible
Alors t_max_suivi vaut 75 s, calculé en SUIVI_APPROX
Et l'app indique en une phrase le gain obtenable en soignant la mise en station

Étant donné une focale de 800 mm et qualite_mes = SOIGNEE           # cas limite
Quand le moteur calcule t_max
Alors la valeur retournée n'excède pas 240 s (C-07)
Et l'app mentionne l'autoguidage comme condition d'aller au-delà

Étant donné type_monture = ALTAZ                                    # cas limite
Quand j'ouvre le domaine ciel profond
Alors l'app déclare que la rotation de champ n'est pas traitée dans cette version
Et n'affiche aucune pose unitaire pour ce type de monture

Étant donné un profil sans suivi et une demande de filé d'étoiles
Quand j'ouvre le module filé
Alors aucune restriction n'est appliquée : l'absence de suivi est ici un prérequis
```

### Dépendances données

Aucune source externe. Constantes C-07, C-12, C-13 du registre §2.1, présentées comme ordres de grandeur. Fallback : total.

---

# 6 — Moteur Faisabilité ciel profond

## 6.1 Feature — Verdict de domaine

**Feature** — À la validation du profil matériel, l'application annonce quelle famille d'objets ce setup peut réellement cadrer, avant que l'utilisateur ne cherche par lui-même. Persona : débutant qui ne sait pas encore que son matériel choisit ses cibles.

### Règle métier

```
Le cadrage propre exige que l'objet occupe 1/3 à 1/2 du champ (C-05).
On contraint sur la PETITE dimension du champ : c'est elle qui limite.

taille_min_deg = FOV_H_deg / 3
taille_max_deg = FOV_H_deg / 2
domaine = { objets du catalogue dont la taille tombe dans [min ; max] }

CLASSIFICATION (bornes en degrés, sur taille_min_deg)
  < 0,05      DOMAINE_LONGUE_FOCALE     galaxies lointaines, nébuleuses planétaires
  0,05 – 0,5  DOMAINE_CLASSIQUE         Messier standard, amas, galaxies proches
  0,5 – 2,0   DOMAINE_GRAND_CHAMP       grandes nébuleuses, M31, M42, Pléiades
  > 2,0       DOMAINE_TRES_GRAND_CHAMP  complexes, Voie lactée, régions entières

FOCALE IDÉALE pour une cible rejetée
  fov_h_visee_deg  = taille_objet_deg / remplissage_visé
  focale_ideale_mm = capteur_H_mm / ( 2 × tan( fov_h_visee_deg / 2 ) )
  → remplissage visé 0,42, milieu de la plage C-05.
  → SORTIE AVEC SA PLAGE, jamais un nombre seul : la même formule évaluée aux deux
    bornes de C-05 (1/3 et 1/2) encadre la focale utile. Le remplissage est
    subjectif (C-05) ; une focale unique annoncée au millimètre le nierait.

  La rédaction initiale portait un facteur 2 surnuméraire au dénominateur
  (`taille / (2 × 0,42) / 2`), qui doublait la focale annoncée. Corrigé ici.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `fov_h_deg` | float | ° | §5.1 | |
| `ech_apx` | float | "/px | §5.1 | |
| `taille_min_deg`, `taille_max_deg` | float | ° | sortie | |
| `domaine` | enum | — | 4 valeurs | sortie |
| `cibles_exemples` | list | — | 5 à 8 | tirées du catalogue, `[À CALCULER]` |
| `focale_ideale_mm` | float | mm | sortie | pour une cible rejetée |

### Critères d'acceptation

```gherkin
Étant donné le profil de référence plein format, 120 mm (FOV_H = 11,375°)
Quand je valide le profil matériel
Alors l'app annonce un domaine TRES_GRAND_CHAMP, fenêtre de cadrage 3,79° – 5,69°
Et propose 5 à 8 cibles réelles issues du catalogue dans cette fenêtre
Et formule le verdict en une phrase, du type « excellent pour la Voie lactée
    et les grands complexes nébuleux, hors domaine pour les galaxies »

Étant donné le même profil basculé en APSC_CROP (FOV_H = 7,44°)
Quand le domaine est recalculé
Alors la fenêtre devient 2,48° – 3,72° et la liste de cibles est mise à jour
Et le domaine reste TRES_GRAND_CHAMP

Étant donné une recherche de M84 (6,5', soit 0,108°)                # cas limite
Quand j'ouvre sa fiche
Alors le verdict de cadrage est « hors domaine — 0,95 % du champ, 44 px de diamètre »
Et l'app indique la focale nécessaire pour un cadrage propre : 5 300 mm au remplissage
    visé de 42 %, plage 4 230 à 6 340 mm aux deux bornes de C-05
Et l'app ne propose PAS de compenser par un recadrage logiciel

Étant donné un catalogue vide pour la fenêtre calculée              # cas limite
Quand le domaine est évalué
Alors l'app annonce l'absence de cible cataloguée à cette échelle
    plutôt que de retourner une liste par défaut hors fenêtre
```

### Dépendances données

OpenNGC (dimensions `MajAx` / `MinAx`), Messier, **Sharpless** et **Barnard**. Ces deux derniers sont obligatoires au MVP : sans eux, le domaine d'un setup grand champ est quasi vide dans les catalogues standard — la Boucle de Barnard est Sh2-276. Fraîcheur : statique. Fallback : catalogues embarqués intégralement, quelques Mo (§12.2).

---

## 6.2 Feature — Verdict de cadrage par cible

**Feature** — Pour une cible donnée : taux de remplissage du champ, orientation optimale du boîtier, détection des cas mosaïque et objet trop petit. Persona : préparation de session.

### Règle métier

```
remplissage = taille_objet_max_deg / FOV_H_deg

  > 1,0          MOSAIQUE_REQUISE   n_tuiles = ceil(taille / FOV × 1,15)²   (C-08)
  0,5 – 1,0      CADRAGE_SERRE      marge faible, mise en station critique
  0,33 – 0,5     CADRAGE_OPTIMAL
  0,15 – 0,33    CADRAGE_LARGE      acceptable, contexte de champ
  0,02 – 0,15    CADRAGE_PERDU      objet noyé dans le champ
  < 0,02         HORS_DOMAINE

ORIENTATION DU BOÎTIER
  si (a/b)_objet > 1,3 et cadre en paysage → suggérer 90° ou un angle intermédiaire
  angle_optimal_deg = angle de position du grand axe de l'objet (catalogue)

DIAMÈTRE EN PIXELS — pour trancher le « trop petit »
  diam_px = taille_objet_arcsec / ech_apx
  diam_px < 50 → l'objet est un amas de pixels, aucun détail exploitable
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `objet_id` | string | — | — | Messier / NGC / IC / Sh2 / B |
| `taille_maj_arcmin`, `taille_min_arcmin` | float | ' | catalogue | `[À CALCULER]` |
| `angle_position_deg` | float | ° | 0 – 180 | catalogue, souvent absent |
| `remplissage` | float | — | 0 – ∞ | sortie |
| `verdict_cadrage` | enum | — | 6 valeurs | sortie |
| `diam_px` | int | px | sortie | |
| `n_tuiles` | int | — | sortie | si mosaïque |
| `angle_boitier_suggere` | float | ° | sortie | |

### Critères d'acceptation

```gherkin
Étant donné le profil de référence plein format 120 mm et la cible M31 (190' × 60')
Quand j'ouvre la fiche de cadrage
Alors le remplissage vaut 3,17° / 11,375° = 27,8 %, verdict CADRAGE_LARGE
Et l'app suggère une orientation exploitant le grand axe
Et affiche une prévisualisation du cadre sur imagerie de fond

Étant donné une cible dont la taille dépasse le champ
Quand j'ouvre la fiche
Alors le verdict est MOSAIQUE_REQUISE avec le nombre de tuiles
Et le facteur multiplicatif sur le temps total de session

Étant donné une cible sans angle de position au catalogue           # cas limite
Quand l'orientation est calculée
Alors l'app propose l'orientation par défaut du boîtier
Et signale l'absence de donnée plutôt que d'afficher un angle arbitraire

Étant donné une cible de 44 px de diamètre
Quand j'ouvre la fiche
Alors l'app affiche le diamètre en pixels et refuse le verdict « faisable »
```

### Dépendances données

OpenNGC pour dimensions et angle de position. Imagerie de fond : HiPS via Aladin (DSS2 couleur) pour la prévisualisation du cadre. Fraîcheur : statique. **Fallback hors-ligne : la prévisualisation image tombe** — les tuiles HiPS ne se pré-téléchargent pas raisonnablement. Le calcul de remplissage reste hors ligne ; dégradation acceptable : cadre schématique sur les positions d'étoiles réelles (§9.2).

---

## 6.3 Feature — Détectabilité et quatre verdicts

**Feature** — Traduction de la magnitude surfacique en verdict opérationnel : visible à l'œil nu, aux jumelles, au télescope, ou seulement en photo. Persona : tous. C'est la feature anti-frustration.

### Règle métier

```
MAGNITUDE SURFACIQUE — la magnitude intégrée ment, la brillance de surface décide
  Ellipse : aire_arcsec2 = 2827,4 × a'_arcmin × b'_arcmin
  SB_obj = m_int + 2,5 × log10(aire_arcsec2)
         = m_int + 8,63 + 2,5 × log10(a'_arcmin × b'_arcmin)     [mag/arcsec²]

CONTRASTE CONTRE LE FOND DE CIEL
  ΔSB = SB_ciel − SB_obj        > 0 : objet plus brillant que le ciel par arcsec²
  SB_ciel et m_lim_oeil : table §2.2 (SQM mesuré prioritaire)

GAIN INSTRUMENTAL
  gain_mag    = 5 × log10(D_mm / 6,5)          C-11 : pupille de l'œil adapté
  m_lim_instr = m_lim_oeil + gain_mag

LE POINT QUE 90 % DES APPLICATIONS RATENT
  Un instrument N'AUGMENTE JAMAIS la brillance de surface d'un objet étendu.
  Il augmente sa taille apparente. La détection visuelle d'un objet étendu dépend
  donc du couple (ΔSB, taille apparente), pas de la seule magnitude limite.
  Modèle de référence : Blackwell (1946), popularisé par Clark, Visual Astronomy
  of the Deep Sky (1990) — seuil de contraste décroissant avec la taille angulaire.
  Tables embarquées, jamais interpolées hors domaine.

QUATRE VERDICTS — évalués dans l'ordre, le premier satisfait gagne
  a) ŒIL_NU      m_int ≤ m_lim_oeil ET (ponctuel OU ΔSB ≥ seuil_oeil(taille))
  b) JUMELLES    m_int ≤ m_lim_instr(50 mm) ET ΔSB ≥ seuil_jum(taille × grossissement)
  c) TELESCOPE   m_int ≤ m_lim_instr(D_user) ET ΔSB ≥ seuil_tel(taille × grossissement)
  d) PHOTO_SEULE par défaut — l'intégration franchit tout contraste, la question
                 devient « combien d'heures » → renvoi §7.3, JAMAIS un refus
```

**Vérification de la formule sur trois cas de référence** (calculs explicites, non mémorisés) :

| Objet | m_int | Taille | SB calculée | ΔSB à SB_ciel = 20,95 |
|---|---|---|---|---|
| M57 | 8,8 | 1,4' × 1,0' | **17,79** | **+3,16** |
| M31 | 3,4 | 190' × 60' | **22,17** | **−1,22** |
| M33 | 5,7 | 71' × 42' | **23,02** | **−2,07** |

M57, cinq magnitudes plus faible que M31, est 18 fois plus brillante par arcsec² qu'un ciel Bortle 4,5. M33, plus brillante que M57 en magnitude intégrée, est 7 fois plus faible que ce même fond de ciel. Les valeurs de référence publiées (M31 ≈ 22,2 ; M33 ≈ 23,2 ; M57 ≈ 17,5–18) confirment la formule à ±0,2 mag.

```
MODULATION PAR TYPE D'OBJET — conséquence directe du socle
  EMISSION       filtre dual-band (bi-bande Hα/OIII) : tolère la Lune et le Bortle 5–6
  GALAXIE        large bande obligatoire : exige ciel noir ET Lune couchée
  REFLEXION      idem galaxie, plus exigeant encore
  NEB_OBSCURE    exige le ciel le plus noir ; aucun filtre n'aide
  AMAS           peu sensible à la pollution lumineuse
  NEB_PLANETAIRE tolère la Lune et la focale longue
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `m_int` | float | mag | −2 – 20 | catalogue, `[À CALCULER]` |
| `a_arcmin`, `b_arcmin` | float | ' | catalogue | |
| `sb_ciel`, `m_lim_oeil` | float | mag/as², mag | §2.2, §4 | |
| `type_objet` | enum | — | EMISSION / REFLEXION / GALAXIE / AMAS_OUVERT / AMAS_GLOB / NEB_PLANETAIRE / NEB_OBSCURE | |
| `sb_obj`, `delta_sb` | float | mag/as² | sortie | |
| `verdict` | enum | — | 4 valeurs | sortie |
| `tolerance_lune` | enum | — | FORTE / MOYENNE / FAIBLE | dérivé du type |

### Critères d'acceptation

```gherkin
Étant donné SB_ciel = 20,95 et la cible M33 (m = 5,7 ; 71' × 42')
Quand j'ouvre la fiche de détectabilité
Alors l'app affiche SB = 23,02 mag/arcsec² et ΔSB = −2,07
Et le verdict est PHOTO_SEULE, accompagné d'une estimation de durée d'intégration
Et l'app explique en une phrase pourquoi une magnitude de 5,7 n'implique pas la visibilité

Étant donné une nébuleuse en émission et une Lune gibbeuse à 60° de la cible
Quand j'évalue la faisabilité de ce soir
Alors l'app maintient la cible comme faisable à condition d'un filtre dual-band
Et affiche la même cible comme non recommandée en large bande

Étant donné une Lune pleine située sous l'horizon local             # cas limite
Quand j'évalue une galaxie
Alors la Lune n'entre pas dans le calcul de fond de ciel
Et l'app le dit explicitement plutôt que de pénaliser la cible

Étant donné un objet sans magnitude intégrée au catalogue           # cas limite
Quand j'ouvre sa fiche
Alors l'app affiche [DONNÉE MANQUANTE] pour SB et pour le verdict
Et ne produit aucune estimation de temps de pose

Étant donné un SQM mesuré de 21,1 saisi par l'utilisateur
Quand un verdict est calculé
Alors le SQM prévaut sur la valeur Bortle du profil
```

### Dépendances données

Magnitudes, dimensions et types : OpenNGC, Messier, Sharpless, Barnard. Fond de ciel : table §2.2, Bortle déclaré ou SQM utilisateur, prioritaire. Position et phase lunaire : séries ELP en JS, calcul client, `[À CALCULER]`. Tables de contraste : Clark / Blackwell, embarquées. Fraîcheur : catalogues statiques, éphémérides calculées. Fallback : total.

---

## 6.4 Feature — Choisir sa cible parmi ce que le ciel offre

**Feature** — La liste des objets du catalogue actuellement levés pour lesquels ce setup produit un verdict, filtrable par type, et la recherche du catalogue entier par nom. Persona : débutant grand champ — il ne connaît pas les désignations, donc il ne peut pas les taper.

### Règle métier

```
POURQUOI UNE LISTE, ET PAS UN CHAMP DE SAISIE
  Le contrat d'entrée de §6.2 et §6.3 est une cible. Tant qu'elle se saisit à la main,
  l'application demande à l'utilisateur la réponse qu'il vient chercher. La liste
  renverse le sens de la question : le ciel propose, les moteurs qualifient.

CIBLES VISIBLES — deux motifs d'exclusion, et deux seulement
  1. sous l'horizon à l'instant affiché    (hauteur ≤ 0°)
  2. verdict incalculable faute de magnitude intégrée ou de dimensions au catalogue

  La conversion J2000 → horizon emprunte la matrice unique de l'image (§3.1) : la liste
  et la scène ne peuvent pas désigner deux ciels différents.

  CE QUI N'EXCLUT PAS, ET C'EST DÉLIBÉRÉ
    - le seuil de hauteur C-01 / C-02 : la liste dit ce qui est LEVÉ, le créneau de
      §8.2 dit ce qui est OBSERVABLE. Fusionner les deux ferait disparaître de la vue
      une cible qui sera bonne dans deux heures.
    - le cadrage : un objet trop grand ou trop petit pour le capteur reste listé, avec
      son verdict de §6.2. C'est `ciblesDansFenetre` (§6.1) qui répond à l'autre question.
    - PHOTO_SEULE : c'est un verdict, pas un refus (§6.3). Il est porté comme les trois
      autres.

ORDRE — du plus brillant au plus faible, en magnitude intégrée
  C'est l'ordre dans lequel un observateur pense au ciel. Ce n'est PAS un classement de
  difficulté : la magnitude intégrée ment (§6.3), et c'est le verdict porté par chaque
  ligne qui tranche, pas son rang.

FILTRE PAR TYPE D'OBJET
  Les types proposés sont ceux RÉELLEMENT présents dans la liste, jamais l'énumération
  complète de §6.3 : offrir « nébuleuse obscure » quand aucune n'est levée est une
  impasse. Le filtre s'applique AVANT tout plafond d'affichage — filtrer les 200
  premières lignes ne dirait rien du ciel.
  Le choix est MULTIPLE : « galaxies et amas globulaires » est une seule question, et un
  filtre à valeur unique la fait poser en deux fois sans jamais afficher la réponse commune.
  Tous les types sont cochés au départ — le filtre ne restreint rien tant qu'on n'a rien
  décoché. Deux gestes cochent ou décochent tout d'un coup. Aucun type coché ne laisse passer
  AUCUN objet : une liste vide est la réponse à « aucun type », pas un filtre à ignorer.
  Fermé, le filtre dit ce qu'il retient (tous, aucun, le type seul, ou le compte) : un filtre
  replié qui restreint sans le dire ferait chercher pourquoi la liste est courte.

RECHERCHE DU CATALOGUE — portée entière, jamais plafonnée
  Cherche dans la désignation et dans chacun des noms communs, casse et accents ignorés.
  Les préfixes passent devant les occurrences internes, puis du plus brillant au plus
  faible ; une magnitude absente part en fin de tri plutôt que de valoir zéro (§6.3).
  Un plafond borne le nombre de résultats RENDUS, jamais l'étendue parcourue : aucun
  objet du catalogue n'est hors d'atteinte.
  Une saisie vide ne rend rien. Dérouler 12 000 entrées avant la première frappe est le
  défaut que la recherche corrige, pas son état par défaut.
  La recherche ignore horizon et verdict : chercher dans le catalogue, c'est chercher
  dans le catalogue entier, y compris sous l'horizon.

LA CIBLE VIENT DU CATALOGUE, ET DE NULLE PART AILLEURS
  Désignation, type, magnitude, dimensions et angle de position sont des LECTURES :
  ils viennent d'OpenNGC et ne se retouchent pas. Un champ éditable par-dessus une
  donnée sourcée produit un verdict dont personne ne sait plus d'où il vient.
  Il n'y a pas de second régime. Une cible saisie à la main n'a pas de coordonnées :
  ni la séparation à la Lune, ni la hauteur de culmination, ni l'extinction, ni l'image
  de l'objet ne se calculent pour elle — la moitié de la fiche serait chiffrée sous des
  hypothèses muettes. Le catalogue embarqué compte plus de 13 000 objets et la recherche
  porte sur son étendue entière : ce qui en manque relève d'une mise à jour du catalogue,
  pas d'un formulaire.
  Sans cible désignée, la fiche n'existe pas et l'écran le dit. Aucune cible de
  démonstration n'est montée à l'ouverture : un verdict affiché est un verdict demandé.

AMENER LA CIBLE AU CENTRE
  Un geste unique pointe la scène sur la cible choisie. Sans lui, la liste nomme des
  objets que l'utilisateur ne sait pas retrouver dans le champ — et §8.4 ne répond qu'à
  la question du pointage sur le terrain, pas à celle du repérage à l'écran.

AJOUTER LA CIBLE AU PLAN DE LA NUIT
  Un geste unique, réversible, porté par le MÊME contrôle sur la ligne de liste et dans
  la fiche : deux dessins du même geste finiraient par annoncer deux choses. C'est lui
  qui constitue l'entrée de §8.3 — sans lui, le plan se fabrique tout seul et l'utilisateur
  subit un classement qu'il n'a pas demandé.
  OFFERT SUR CE QUI EST PHOTOGRAPHIABLE, et là seulement : une cible dont la nuit
  n'annonce aucune pose n'est pas ajoutable, parce que l'ajouter promettrait une étape
  qui n'arriverait jamais. Le critère est celui du CRÉNEAU (§8.2), jamais la hauteur à
  l'instant affiché — voir plus haut, c'est la même règle qui vaut pour la liste.
  L'ÉTAT EST ANNONCÉ, pas seulement teinté : §11.1 confisque la couleur comme porteuse
  d'information, donc la forme du contrôle dit s'il est enfoncé.
  LA SÉLECTION SURVIT À LA SÉANCE. Elle se range comme le lieu et le matériel (§12.3) :
  un plan composé la veille au chaud doit se retrouver sur le terrain. Ce qui en revient
  est validé comme toute donnée relue, et une entrée illisible rend une sélection vide
  plutôt qu'un écran cassé.

UNE IMAGE DE L'OBJET, ET CE QU'ELLE COÛTE
  La liste et la recherche rendent la désignation atteignable, pas reconnaissable. Un
  débutant qui ne sait pas taper « NGC 7000 » ne sait pas davantage ce qu'il choisit
  quand il le lit. L'image est ce qui referme cet écart, et c'est sa seule fonction :
  elle n'entre dans aucun verdict, elle ne modifie aucune sortie de §6.2 ni de §6.3.

  DEUX SOURCES, DANS CET ORDRE
    1. l'image de tête de la page encyclopédique de l'objet, quand elle existe
    2. sinon, une découpe du relevé DSS2 couleur aux coordonnées de l'objet

  L'ordre vient de la mesure, pas de l'intuition : interrogée par son numéro NGC, la
  source encyclopédique rend une image pour 60 objets NGC sur 60 — des découpes DSS,
  PanSTARRS et SDSS. Interrogée par son numéro Messier, elle en rend 42 sur 110. C'est
  donc la désignation NGC qui interroge, y compris pour un objet Messier.
  Hors NGC, la couverture s'effondre : 8 IC sur 30, 1 Barnard sur 20. La découpe de
  relevé n'est pas un repli d'exception, c'est le cas courant pour Sharpless et Barnard.

  LE CHAMP DE LA DÉCOUPE EST CALCULÉ, JAMAIS CHOISI
    champ_decoupe_deg = taille_maj_arcmin / 60 × marge        (marge : registre)
    Un objet de 71' et un objet de 2' ne se regardent pas au même champ. Une taille
    absente au catalogue prend une valeur de repli nommée, comme partout ailleurs.

  UNE IMAGE FAUSSE EST PIRE QU'AUCUNE IMAGE
    L'image de tête d'une page encyclopédique n'est pas toujours l'objet : pour un
    Sharpless, c'est fréquemment la carte de la constellation qui le contient. Un
    fichier dont le nom trahit un diagramme — carte, atlas, schéma, frontières — est
    refusé, et l'objet retombe sur la découpe de relevé. Le motif de refus est une
    donnée de registre, pas une condition dans le code.

  L'ATTRIBUTION EST UNE CONDITION D'AFFICHAGE, PAS UNE MENTION
    Les images encyclopédiques sont sous licence libre à attribution. Auteur, licence et
    lien vers le fichier source sont visibles sous l'image, sans interaction. Une image
    dont l'auteur ou la licence n'a pas pu être lu n'est pas affichée.

  CE QUE L'IMAGE NE FAIT PAS
    - elle n'entre dans aucun paquet livré : le catalogue embarqué compte plus de 13 000
      objets, et §12.2 plafonne le volume livré. Une image est TÉLÉCHARGÉE, jamais
      embarquée.
    - elle ne se précharge que par le HAUT D'UNE LISTE DE RÉSULTATS, et sous quatre
      bornes. Rendre atteignable une désignation qu'on ne reconnaît pas ne sert à rien si
      l'image n'arrive qu'à l'ouverture de la fiche : c'est le premier écran de résultats
      qui doit être reconnaissable.
        1. les N premiers résultats seulement — N est une valeur de registre, plus basse
           que le plafond d'affichage : ce qui est demandé est le haut de la liste, pas la
           liste ;
        2. une fois par jeu de résultats, après un délai de repos de registre — la liste
           se refiltre à chaque frappe, et une salve par caractère est le défaut que ce
           délai empêche ;
        3. à débit plafonné, valeur de registre — le motif du plafond est le 429 d'un
           service public, pas le volume ;
        4. jamais au défilement, et jamais hors ligne (§12.5).
      Un jeu de résultats abandonné n'est pas achevé : changer la liste abandonne ce qui
      n'est pas encore parti.
    - elle ne bloque rien : son absence n'est pas une erreur, et la fiche reste complète
      sans elle. C'est la formulation que §12.5 emploie déjà pour l'imagerie de fond.
    - elle ne quitte pas le cadre de §13 : ce qui sort est une désignation ou un couple
      de coordonnées. Ni profil, ni site, ni plan de séance.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `matrice_ciel` | mat3 | — | §3.1 | l'instant affiché, partagé avec la scène |
| `sb_ciel`, `m_lim_oeil` | float | mag/as², mag | §2.2 | |
| `d_mm` | float | mm | §5.1 | gain instrumental de §6.3 |
| `saisie_recherche` | string | — | — | vide = aucun résultat |
| `types_retenus` | ensemble d'enum | — | sous-ensemble de §6.3 | filtre ; tous au départ, vide = aucun objet |
| `visibles` | array | — | sortie | objet, azimut, hauteur, verdict |
| `types_presents` | array | — | sortie | sous-ensemble de §6.3 |
| `image_objet` | blob ou nul | — | sortie | nul = aucune image, pas une erreur |
| `image_origine` | enum | — | ENCYCLOPEDIE / RELEVE | sortie, pilote l'attribution |
| `image_credit` | string ou nul | — | sortie | auteur, licence, lien du fichier source |

### Critères d'acceptation

```gherkin
Étant donné un site, un instant et un setup valides
Quand j'ouvre la liste des cibles visibles
Alors chaque ligne porte son type et son verdict de détectabilité
Et les objets sous l'horizon à cet instant en sont absents
Et l'ordre est celui de la magnitude intégrée croissante

Étant donné une cible listée dont la hauteur est inférieure au seuil C-01
Quand je la lis
Alors elle reste listée avec son verdict
Et c'est son créneau de §8.2 qui dit à quelle heure elle devient observable

Étant donné un objet du catalogue sans magnitude intégrée           # cas limite
Quand la liste est composée
Alors l'objet n'y figure pas
Et aucun verdict n'est estimé pour lui

Étant donné aucune nébuleuse obscure levée à cet instant            # cas limite
Quand j'ouvre le filtre par type
Alors ce type n'est pas proposé

Étant donné les types « galaxie » et « amas globulaire » cochés, et eux seuls
Quand la liste est composée
Alors elle porte les objets de chacun de ces deux types, et d'aucun autre
Et la scène estompe les marqueurs des autres types

Étant donné tous les types décochés                                  # cas limite
Quand la liste est composée
Alors elle est vide
Et elle le dit, plutôt que de retomber sur le catalogue entier

Étant donné la saisie « pleiades » sans accent ni majuscule
Quand je cherche dans le catalogue
Alors M45 est trouvée par son nom commun
Et un objet dont le nom COMMENCE par la saisie passe devant un objet où elle est interne

Étant donné une cible venue du catalogue
Quand j'ouvre sa fiche
Alors sa magnitude et ses dimensions sont des lectures
Et aucun champ de la fiche ne se saisit

Étant donné qu'aucune cible n'a été désignée                        # cas limite
Quand je regarde la fiche
Alors elle annonce qu'il n'y a pas de cible et comment en choisir une
Et aucun verdict n'est affiché pour une cible de démonstration

Étant donné une cible choisie dans la liste
Quand je demande à la voir
Alors la scène se pointe sur elle sans changer l'instant affiché

Étant donné une recherche qui rend plus de résultats que le plafond de préchargement
Quand la saisie se pose
Alors les images des N premiers résultats sont demandées, et aucune autre
Et le nombre de requêtes menées de front ne dépasse pas le plafond de débit du registre
Et fermer le panneau n'abandonne pas les téléchargements déjà lancés

Étant donné une liste de résultats inchangée                        # cas limite
Quand l'instant affiché avance d'une minute et recompose la liste
Alors aucune image n'est demandée une seconde fois

Étant donné le mode hors ligne de §12.5                             # cas limite
Quand une liste de résultats s'affiche
Alors aucune requête d'image n'est émise
Et les lignes restent complètes, sans image et sans message d'erreur

Étant donné une cible dont la nuit annonce une pose
Quand j'ajoute cette cible au plan depuis sa fiche, puis une autre depuis la liste
Alors les deux se retrouvent dans la chronologie de §8.3, et elles seules
Et le même geste les en retire
Et elles y sont encore après un rechargement de l'application

Étant donné une cible dont la nuit n'annonce aucune pose            # cas limite
Quand je consulte sa fiche
Alors le geste d'ajout au plan n'est pas offert
Et la fiche dit ce qui l'en empêche — cadrage, créneau ou portée

Étant donné une cible Messier dont la page encyclopédique porte une image
Quand j'ouvre sa fiche
Alors l'image de l'objet est affichée
Et son auteur, sa licence et le lien vers le fichier source sont visibles sans interaction

Étant donné une cible Sharpless dont l'image de tête est une carte de constellation
Quand son image est résolue
Alors la carte est refusée
Et c'est la découpe du relevé aux coordonnées de l'objet qui est affichée

Étant donné une cible sans image et sans réseau                     # cas limite
Quand j'ouvre sa fiche
Alors la fiche est complète, désignation et type compris
Et l'absence d'image n'est pas présentée comme une erreur

Étant donné une liste de cibles visibles que je fais défiler        # cas limite
Quand les lignes se rendent
Alors aucune image n'est demandée au réseau
Et seules les images déjà en cache local apparaissent en vignette
```

### Dépendances données

Catalogue d'objets du ciel profond embarqué (§12.2). Verdicts : §6.2, §6.3. Matrice du ciel : §3.1. Liste, recherche, filtre et pointage : aucune source nouvelle, aucun réseau, fallback total. **Image de l'objet : en ligne seulement** — page encyclopédique et fichier associé (Wikipédia, Wikimedia Commons), découpe de relevé DSS2 en repli (service HiPS du CDS, Strasbourg), la même source que §6.2. Fraîcheur : statique. Fallback hors-ligne : l'image tombe pour une cible neuve, et reste servie du cache local pour une cible déjà consultée (§12.5).

---

# 7 — Moteur Pose

## 7.1 Feature — Estimateur de flux du fond de ciel

**Feature** — Convertit une brillance de ciel (mag/arcsec²) en électrons par seconde et par pixel. Aucune autre feature de la section ne peut exister sans elle. Persona : moteur interne, jamais exposé brut.

### Règle métier

```
E_ciel = 10^( −0,4 × (SB_ciel − ZP_sys) ) × (pitch_um / N)²      [e⁻/s/px]
E_obj  = 10^( −0,4 × (SB_obj  − ZP_sys) ) × (pitch_um / N)²      [e⁻/s/px]

  SB_ciel  brillance de fond de ciel, §2.2 (SQM mesuré prioritaire)
  SB_obj   magnitude surfacique de l'objet, §6.3
  pitch_um pas des pixels, µm
  N        nombre f/N
  ZP_sys   point zéro système du boîtier, §2.3, base matériel (générique C-14 = 20,20)

ATTÉNUATION PAR LA MASSE D'AIR — §7.6
  `E_obj` ci-dessus est le flux hors atmosphère : la magnitude de catalogue l'est. Le
  flux réellement collecté est atténué en fonction de la hauteur de la cible (§7.6).
  `E_ciel`, lui, dérive d'une brillance mesurée au sol : il n'est jamais atténué.

LE FLUX DE FOND DE CIEL PAR PIXEL NE DÉPEND PAS DU DIAMÈTRE DE L'INSTRUMENT.
Il dépend du rapport d'ouverture et du pas des pixels. Deux setups de même f/N
et même pitch collectent le même fond de ciel par pixel, quel que soit leur diamètre.

AUCUNE CALIBRATION UTILISATEUR — voir §2.3
  L'optimum de pose est plat : une erreur d'un facteur 2 sur E_ciel coûte 2 à 5 points
  de SNR. Le point zéro est livré par boîtier, en lecture seule. Il n'existe ni
  fonction de calibration, ni import de fichier RAW, ni champ éditable.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `sb_ciel` | float | mag/as² | 16 – 22 | §2.2, §4 |
| `sb_obj` | float | mag/as² | 16 – 26 | §6.3 |
| `pitch_um`, `ouverture_N` | float | µm, — | §5.1 | |
| `zp_sys` | float | mag | 18 – 22 | base matériel, lecture seule |
| `zp_source` | enum | — | BASE_MATERIEL / GENERIQUE | **doit être affiché** |
| `e_ciel`, `e_obj` | float | e⁻/s/px | sortie | |

### Critères d'acceptation

```gherkin
Étant donné SB_ciel = 20,95 ; pitch = 5,12 µm ; N = 2,8 ; ZP_sys = 20,20
Quand le flux est calculé
Alors E_ciel vaut 1,68 e⁻/s/px

Étant donné le même setup passé de f/2,8 à f/4
Quand le flux est recalculé
Alors E_ciel est divisé par (4 / 2,8)² = 2,04
Et la pose unitaire optimale est multipliée d'autant

Étant donné zp_source = GENERIQUE                                   # cas limite
Quand une pose unitaire est affichée
Alors elle porte la mention [ESTIMÉ]
Et l'app indique que la plage utile de §2.3 absorbe l'incertitude

Étant donné un SB_ciel hors de la plage 16 – 22                     # cas limite
Quand le flux est demandé
Alors le calcul est refusé plutôt que d'extrapoler
```

### Dépendances données

Base matériel embarquée : `zp_sys`, gain en e⁻/ADU par ISO. Sources : documentation constructeur, Photons to Photos. Fraîcheur : statique. Fallback : total.

---

## 7.2 Feature — Pose unitaire optimale

**Feature** — Durée d'une pose élémentaire noyant le bruit de lecture sous le bruit de photons du ciel, plafonnée par la capacité de suivi. Persona : débutant qui demande « je pose combien de secondes ? ».

### Règle métier

```
t_opt = C × RN² / E_ciel                                          [s]
  C = 10 par défaut (C-03) → perte de SNR ≈ 4,7 %
  C = 3 en mode permissif  → perte ≈ 13,4 %  (ciel pollué, suivi imprécis, vent)
  RN = bruit de lecture à l'ISO retenu, e⁻

t_recommande = min(t_opt, t_max_suivi)          t_max_suivi issu de §5.2

RÉGIMES
  t_max_suivi < t_opt  → REGIME_LIMITE_SUIVI
                         la pose est bridée par la monture, pas par la physique
                         → l'app chiffre le gain d'une meilleure mise en station
  t_opt ≤ t_max_suivi  → REGIME_NOMINAL
                         poser plus longtemps n'apporte quasi rien et augmente le
                         risque de perte (rafale, avion, saturation d'étoiles brillantes)

CHOIX DE L'ISO — le double gain de conversion
  Les capteurs à double gain de conversion (bascule d'amplification) présentent une
  chute brutale du bruit de lecture au-delà d'un seuil d'ISO. Or t_opt ∝ RN² :
  diviser RN par 2 divise la pose optimale par 4.
  iso_recommande = plus petit ISO ≥ seuil_double_gain (base matériel)
  Au-delà : RN ne diminue plus significativement, mais la capacité de saturation
  chute proportionnellement à l'ISO → étoiles brillantes cramées.

  Le seuil se lit sur la courbe de bruit de lecture : une chute brutale, suivie d'un bruit
  qui ne descend plus. C'est la signature physique de la bascule — au-delà, amplifier
  davantage ne réduit plus le bruit en électrons. Un capteur qui décroît régulièrement
  marche après marche n'a pas de seuil : aucun palier ne justifie alors un ISO plutôt qu'un
  autre, et AUCUNE recommandation n'est affichée. Inventer un seuil là où la courbe n'en
  montre pas ferait recommander un réglage sans raison.

  AFFICHAGE — boîtier de la base : l'ISO recommandé est un FAIT, pas un champ, et il ne se
  modifie pas. Demander de taper le chiffre qu'on vient de calculer est une question dont on
  connaît la réponse ; le rendre modifiable offrait un réglage dont TOUTES les valeurs sont
  moins bonnes que celle affichée — en dessous du seuil, RN² impose des poses plus longues ;
  au-dessus, la capacité de saturation chute sans que RN diminue. Le seuil ne recommande pas,
  il tranche.
  Conséquence sur le calcul : tant qu'un boitier_id est choisi, un ISO forcé — resté d'une
  saisie antérieure ou relu d'un profil enregistré — est IGNORÉ. La pose se calcule avec le
  bruit de lecture du palier affiché, jamais avec une valeur que l'écran ne montre pas.
  Mode personnalisé : l'ISO se saisit, et le seuil saisi le justifie s'il est renseigné.

AFFICHAGE — §2.3
  valeur retenue arrondie à une valeur d'obturateur usuelle
  plage utile [t_opt / 2 ; t_opt × 2] présentée comme équivalente
```

**Application au setup de référence** — SB_ciel 20,95 · 120 mm f/2,8 · E_ciel = 1,68 e⁻/s/px :

| ISO | RN `[À VÉRIFIER]` | t_opt (C = 10) | Commentaire |
|---|---|---|---|
| 200 | ≈ 3,5 e⁻ | **72,9 s** | avant bascule — pose longue imposée par le bruit de lecture |
| 640 | ≈ 1,5 e⁻ | **13,4 s** | après bascule — optimum, dynamique préservée |
| 3200 | ≈ 1,4 e⁻ | 11,7 s | gain nul en pose, dynamique sacrifiée |

`t_max_suivi` en `SUIVI_APPROX` à 120 mm = 75 s → **REGIME_NOMINAL** : la monture n'est pas le facteur limitant. Pose de référence : **13 s à ISO 640, plage utile 6 à 26 s**.

Les valeurs de bruit de lecture sont `[À VÉRIFIER]` en base matériel, jamais figées dans la spécification.

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `e_ciel` | float | e⁻/s/px | §7.1 | |
| `read_noise_e` | float | e⁻ | 0,5 – 40 | fonction de l'ISO |
| `c_facteur` | float | — | 3 – 10 | défaut C-03 = 10 |
| `t_max_suivi_s` | float | s | §5.2 | |
| `t_opt_s`, `t_recommande_s` | float | s | sortie | |
| `plage_utile_s` | [float, float] | s | sortie | [t/2 ; t×2] |
| `iso_recommande` | int | — | sortie | |
| `regime` | enum | — | NOMINAL / LIMITE_SUIVI | sortie |

### Critères d'acceptation

```gherkin
Étant donné E_ciel = 1,68 e⁻/s/px ; RN = 1,5 e⁻ ; C = 10
Quand la pose unitaire est calculée
Alors t_opt vaut 13,4 s, affiché 13 s avec la plage utile 6 à 26 s
Et le régime est NOMINAL
Et l'app recommande l'ISO du seuil de double gain en le nommant

Étant donné suivi_actif = faux (t_max = NPF = 2,10 s) et t_opt = 13,4 s   # cas limite
Quand j'ouvre le moteur de pose en ciel profond
Alors le régime est LIMITE_SUIVI
Et l'app annonce que le bruit de lecture dominera, chiffre la perte de SNR,
    et redirige vers le module grand champ §9

Étant donné une nuit à Bortle 2 (SB = 21,7)
Quand la pose est recalculée
Alors E_ciel chute d'un facteur 1,99 et t_opt monte à environ 27 s
Et l'app explique qu'un ciel plus noir exige des poses PLUS LONGUES, pas plus courtes

Étant donné un boîtier sans bruit de lecture connu                  # cas limite
Quand la pose est calculée
Alors RN = 3,0 e⁻ est appliqué, affiché, et le résultat porte la mention [ESTIMÉ]

Étant donné un boitier_id de la base et un ISO forcé resté dans la saisie   # cas limite
Quand la pose unitaire est calculée
Alors l'ISO affiché est le palier du seuil de double gain, et il n'est pas saisissable
Et la pose se calcule avec le bruit de lecture de ce palier, pas avec l'ISO forcé
```

### Dépendances données

Courbes bruit de lecture / ISO et seuil de double gain par boîtier : base embarquée. Fraîcheur : trimestrielle. Fallback : total.

---

## 7.3 Feature — Nombre de poses et intégration totale

**Feature** — Traduit un objectif de qualité en durée de session, nombre d'images et budget matériel. Persona : préparation de session. C'est le « combien de photos ? ».

### Règle métier

```
SNR par pixel après un temps d'intégration total T, en N = T / t_pose poses
  SNR(T) = E_obj × T / √( (E_obj + E_ciel) × T + (T / t_pose) × RN² )

RÉSOLUTION INVERSE
  T_requis = SNR_cible² × ( E_obj + E_ciel + RN² / t_pose ) / E_obj²
  N_poses  = ceil( T_requis / t_pose )

LOI FONDAMENTALE, affichée en permanence
  SNR ∝ √T  →  DOUBLER LA QUALITÉ = QUADRUPLER LE TEMPS.

  `E_obj` employé ici est le flux ATTÉNUÉ de §7.6. Comme T_requis ∝ 1 / E_obj² dans le
  régime dominé par le ciel, la hauteur de la cible pèse au carré sur la durée : une
  cible au seuil C-01 coûte près du double d'une cible au zénith.

BUDGET MATÉRIEL
  volume_go = N_poses × taille_raw_mo / 1024
  n_nuits   = ceil( T_requis / duree_creneau_disponible )        §8.2
```

**Application au setup de référence** — SB_ciel 20,95 · pose 13,4 s à ISO 640 · E_ciel 1,68 · RN 1,5 · taille RAW 33 Mo `[À VÉRIFIER]` :

| Cible | SB_obj | E_obj (e⁻/s/px) | T pour SNR 10 | T pour SNR 20 | N poses (SNR 10) | Volume |
|---|---|---|---|---|---|---|
| M31 | 22,17 | 0,545 | **13,4 min** | 53,7 min | 60 | 2,0 Go |
| M33 | 23,02 | 0,249 | **56,3 min** | 3 h 45 | 252 | 8,3 Go |

M33 demande quatre fois le temps de M31 pour la même qualité, alors que sa magnitude intégrée la dit plus faible de seulement 2,3 mag. Toute la valeur du moteur tient dans cet écart.

**Le budget stockage est bloquant en pratique** : 252 poses sur une seule cible représentent 8,3 Go. Une session de trois cibles sature une carte de 32 Go. L'application l'annonce avant la sortie, pas pendant.

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `snr_cible` | float | — | 5 – 50 | préréglages Aperçu 5 / Correct 10 / Bon 20 / Excellent 30 |
| `e_obj`, `e_ciel` | float | e⁻/s/px | §7.1 | |
| `t_pose_s`, `read_noise_e` | float | s, e⁻ | §7.2 | |
| `taille_raw_mo` | float | Mo | §5.1 | |
| `t_requis_s` | float | s | sortie | |
| `n_poses` | int | — | sortie | |
| `volume_go` | float | Go | sortie | |
| `n_nuits_estime` | int | — | sortie | si T > créneau disponible |

### Critères d'acceptation

```gherkin
Étant donné M33 ; E_obj = 0,249 ; E_ciel = 1,68 ; t_pose = 13,4 s ; RN = 1,5 ; SNR cible 10
Quand je calcule le plan de capture
Alors T_requis vaut 56 min, N = 252 poses, volume ≈ 8,3 Go
Et l'app affiche que passer à SNR 20 exige 3 h 45, soit quatre fois plus

Étant donné une cible dont T_requis dépasse le créneau disponible   # cas limite
Quand je calcule le plan
Alors l'app répartit la capture sur plusieurs nuits et indique leur nombre
Et rappelle que chaque nuit demande son propre lot de darks

Étant donné une nuit astronomique de durée nulle                    # cas limite
Quand j'ouvre le planificateur
Alors l'app affiche l'absence de fenêtre plutôt qu'une durée négative
Et propose la fenêtre nautique en mode dégradé, avec la pénalité de fond de ciel appliquée

Étant donné E_obj proche de zéro                                    # cas limite
Quand T_requis est calculé
Alors l'app plafonne l'affichage et annonce la cible hors de portée du setup
    plutôt que d'afficher une durée de plusieurs centaines d'heures
```

### Dépendances données

Durée de créneau : §8.2, calcul client. Taille RAW par boîtier : base embarquée. Fallback : total.

---

## 7.4 Feature — Plan de calibration et dithering

**Feature** — Génère la liste des images de calibration et les consignes de dithering (décalage inter-pose) adaptées à la session planifiée. Persona : débutant — c'est l'étape systématiquement oubliée, et celle qui ruine le plus de sessions.

### Règle métier

```
OFFSETS (bias)  50 à 100 poses au temps minimum, à l'ISO de session, obturateur fermé.
                Réutilisables tant que l'ISO ne change pas.
DARKS           20 à 50 poses, MÊME durée, MÊME ISO, MÊME température capteur.
                Sur boîtier photo non régulé : en fin de session, capteur encore froid.
                AUCUNE BIBLIOTHÈQUE RÉUTILISABLE N'EST VALIDÉE. Un dark ne vaut que
                pour la température du capteur, et l'application ne la mesure pas :
                déclarer une bibliothèque valide sur le seul ISO et la seule durée
                autoriserait à sauter les darks à tort. Un lot par séance, prescrit
                sans condition.
FLATS           20 à 30 poses, MÊME focale, MÊME mise au point, MÊME orientation,
                sans jamais démonter l'objectif. Exposition visant ≈ 1/2 saturation.
                Ils corrigent le vignettage.
DITHERING       décalage aléatoire de 5 à 15 px entre poses.
                Sans autoguidage : à chaque pose, la dérive naturelle étant exploitée.
                Supprime le bruit à motif fixe et les colonnes chaudes que les darks
                laissent passer.

temps_calibration ≈ n_darks × t_pose + marge      → ajouté au budget de session §8.3

HIÉRARCHIE POUR LE GRAND CHAMP RAPIDE
  À f/2,8 sur plein format, le vignettage atteint couramment 1 à 2 diaphragmes dans
  les coins. Sans flats, l'image présente un halo central et des angles sombres
  impossibles à corriger proprement.
  → ordre d'importance affiché : FLATS > DARKS > OFFSETS.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `t_pose_s`, `iso`, `n_poses` | — | — | §7.2, §7.3 | |
| `plan_calibration` | objet | — | sortie | 3 listes + consignes |
| `surcout_temps_min` | float | min | sortie | ajouté au budget session |

### Critères d'acceptation

```gherkin
Étant donné une session de 252 poses de 13 s à ISO 640
Quand j'ouvre le plan de calibration
Alors l'app prescrit 30 darks de 13 s à ISO 640, 25 flats et 50 offsets
Et ajoute environ 7 min au budget de session pour les darks
Et rappelle de ne pas toucher la bague de mise au point avant les flats

Étant donné une session planifiée, quelle qu'elle soit
Quand le plan de calibration est généré
Alors un lot de darks est prescrit sans condition, à prendre en fin de séance
Et aucune température ne se saisit ni ne se compare

Étant donné une session sans autoguidage
Quand le plan est généré
Alors le dithering est recommandé à chaque pose
Et l'app explique en une phrase ce qu'il supprime que les darks ne suppriment pas

Étant donné un changement de focale ou d'orientation en cours de session
Quand je passe à la cible suivante
Alors l'app signale que les flats de la première cible ne sont plus valides
```

### Dépendances données

Aucune source externe, aucune saisie. Fallback : total.

**La température capteur est hors périmètre, et la lecture EXIF avec elle.** La rédaction initiale prévoyait de lire la température dans les métadonnées d'un fichier fourni, puis de la faire saisir après la disparition du décodeur RAW (Annexe C, décision 9). Son seul usage était de valider une bibliothèque de darks d'une séance à l'autre. Cette validation tombe (Annexe C, décision 23) : un lot de darks par séance est prescrit sans condition, ce qui est la consigne juste dans tous les cas et ne demande aucun thermomètre.

---

## 7.5 Feature — Conseil filtre contextuel

**Feature** — Quand l'absence d'un filtre est le seul facteur bloquant d'une cible autrement faisable, l'application le signale et chiffre le gain. Déclenchement conditionnel strict, jamais de bandeau. Cas particulier de §10.3.

### Règle métier

```
DÉCLENCHEMENT si toutes ces conditions sont réunies
  type_objet = EMISSION
  ET filtres_possedes ne contient pas DUAL_BAND
  ET ( SB_ciel dégradé par la Lune  OU  bortle ≥ 5 )
  ET verdict_cadrage ∈ {SERRE, OPTIMAL, LARGE}
  ET l'utilisateur a déplié l'explication de verdict (§10.2)

MESSAGE — gain chiffré, jamais qualitatif
  Le dual-band ne transmet que Hα et OIII (deux raies d'émission étroites). Il rejette
  l'essentiel du fond de ciel — pollution lumineuse comme Lune — tout en conservant
  le signal de la nébuleuse.
  gain_snr ≈ √( E_ciel_sans / E_ciel_avec )
  → l'app recalcule T_requis avec et sans filtre par les moteurs existants,
    et affiche les deux durées côte à côte.

JAMAIS DÉCLENCHÉ sur galaxie, nébuleuse par réflexion, amas, nébuleuse obscure :
  ces objets émettent en spectre continu ; le dual-band coupe leur signal aussi.
```

### Critères d'acceptation

```gherkin
Étant donné une nébuleuse en émission, Lune gibbeuse levée, aucun filtre possédé
Quand j'ouvre le plan de capture et déplie l'explication
Alors l'app affiche T_requis sans filtre et T_requis avec dual-band, avec le rapport
Et la cible reste planifiable sans filtre, dégradée mais pas refusée

Étant donné une galaxie et aucun filtre possédé                     # cas limite
Quand j'ouvre le plan de capture
Alors aucun conseil filtre n'est émis
Et l'app indique que seuls un ciel plus noir ou plus de temps aideront

Étant donné un dual-band déclaré dans le profil
Quand j'ouvre une cible en émission
Alors le conseil ne s'affiche plus et le filtre est intégré au calcul de E_ciel
```

### Dépendances données

Table de transmission par famille de filtres (bande passante en nm), quelques dizaines de lignes, embarquée. Aucune donnée commerciale. Fallback : total.

---

## 7.6 Feature — Atténuation atmosphérique par masse d'air

**Feature** — Le flux de l'objet est atténué par l'épaisseur d'atmosphère traversée, en fonction de la hauteur de la cible. Persona : moteur interne, conséquence visible sur l'intégration totale. Sans elle, une cible basse coûte près du double du temps annoncé.

### Règle métier

```
POURQUOI L'OBJET SEUL, ET PAS LE FOND DE CIEL — la raison est photométrique
  Une magnitude de catalogue est une magnitude HORS ATMOSPHÈRE. Le flux qui atteint
  réellement le capteur est atténué par la traversée. Il FAUT donc l'éteindre.
  Une brillance de fond de ciel, elle, est mesurée AU SOL — SQM de l'utilisateur, ou
  table Bortle §2.2, toutes deux relevées depuis le site. Elle est déjà atténuée : lui
  appliquer l'extinction une seconde fois serait la compter deux fois.
  → ce n'est donc pas une approximation choisie par facilité, c'est la seule
    combinaison cohérente des deux sources.

FORMULATION
  X            = masse d'air de la cible, 1 / sin(alt)              §8.2
  attenuation  = 10^( −0,4 × k × X )                                sans unité
  E_obj_reel   = E_obj × attenuation                                [e⁻/s/px]

  k = coefficient d'extinction en bande V, registre §2.1 (L-04).
      Marqué ORDRE DE GRANDEUR : 0,15 à 0,30 selon la transparence du soir. Toute
      sortie qui en dépend porte donc sa plage, jamais une valeur exacte (§2.1).

CE QUE ÇA CHANGE SUR L'INTÉGRATION — l'effet est quadratique
  Le régime nominal du grand champ est dominé par le fond de ciel, où
  T_requis ∝ 1 / E_obj² (§7.3). L'atténuation du flux se paie donc au carré :

     facteur sur T_requis = 10^( +0,8 × k × X )

  | Hauteur de la cible | X | Perte à k = 0,172 | T_requis × |
  |---|---|---|---|
  | zénith | 1,00 | 0,17 mag | 1,37 |
  | 60° | 1,15 | 0,20 mag | 1,45 |
  | 30° — seuil C-01 | 2,00 | 0,34 mag | 1,88 |
  | 20° — seuil C-02 | 2,92 | 0,50 mag | 2,52 |

  À k = 0,25, valeur de plaine dans la tolérance annoncée, le facteur à 30° atteint 2,5.
  Ignorer ce terme, c'est sous-estimer d'un facteur deux le temps d'une cible basse.

CONSÉQUENCE SUR LE SCORING §8.3 — un proxy remplacé par un calcul
  S_hauteur pondère la hauteur de culmination par une rampe linéaire. Cette rampe était
  un substitut à un effet non modélisé. L'effet est désormais chiffré dans T_requis, donc
  déjà porté par S_signal. Les deux termes ne doivent pas compter deux fois la même
  physique : l'arbitrage est à trancher au ticket, pas à laisser en double silencieux.

DOMAINE DE VALIDITÉ — la borne est dure
  L'approximation plane 1 / sin(alt) dévie au-delà d'environ X = 4, soit sous 15° de
  hauteur (§8.2). Sous cette borne, le calcul est REFUSÉ ou l'approximation remplacée
  par une formule valide — jamais extrapolée en silence.
  Les seuils C-01 (30°) et C-02 (20°) restent au-dessus de la borne : le cas nominal
  n'est jamais concerné.

CE QUE ÇA NE FAIT PAS
  Le fond de ciel est pris à sa valeur DÉCLARÉE, indépendamment du pointage. Le ciel
  réel est plus lumineux à basse hauteur qu'au zénith — davantage de trajet lumineux et
  de diffusion — ce qui allongerait encore T_requis. L'ignorer laisse le résultat
  optimiste : la correction va donc dans le bon sens, jamais dans le mauvais. C'est une
  approximation ASSUMÉE, à trancher, pas une omission.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `alt_cible_deg` | float | ° | 15 – 90 | hauteur d'évaluation, §8.2 |
| `masse_air` | float | — | 1,0 – 4,0 | sortie, refusée au-delà |
| `k_extinction` | float | mag/masse d'air | 0,15 – 0,30 | registre, ordre de grandeur |
| `attenuation` | float | — | 0 – 1 | sortie |
| `e_obj_reel` | float | e⁻/s/px | sortie | consommé par §7.3 |
| `instant_evaluation` | datetime | — | — | **doit être affiché** |

### Critères d'acceptation

```gherkin
Étant donné une cible au zénith et k = 0,172
Quand l'intégration totale est calculée
Alors T_requis est 1,37 fois celui qu'on obtiendrait sans atténuation
Et la masse d'air employée est affichée avec la hauteur qui la produit

Étant donné la même cible à 30° de hauteur
Quand l'intégration est recalculée
Alors le facteur sur T_requis vaut 1,88
Et l'app énonce que la hauteur, pas seulement la cible, dicte le temps de pose

Étant donné une cible à 10° de hauteur                              # cas limite
Quand l'atténuation est demandée
Alors le calcul est refusé, ou une formule valide hors approximation plane est employée
Et aucune valeur n'est extrapolée en silence

Étant donné que k est marqué ordre de grandeur au registre
Quand l'intégration est affichée
Alors elle porte sa plage sur la fourchette 0,15 à 0,30
Et aucune durée n'est présentée comme une valeur exacte

Étant donné le résultat déplié au niveau N3 de §10.2
Quand je lis la chaîne
Alors l'étape d'atténuation porte sa formule et renvoie à l'entrée L-04 du registre

Étant donné une même cible évaluée depuis la fiche puis depuis le plan de séance
Quand je compare les deux intégrations
Alors elles emploient la même masse d'air pour le même instant d'évaluation
```

### Dépendances données

Coefficient d'extinction : registre §2.1 (L-04), déjà consommé par le modèle lunaire de §8.1. Hauteur et masse d'air : §8.2, calcul client. Aucune source nouvelle, aucun réseau. Fallback : total.

---

# 8 — Sélection de cibles pour la nuit

## 8.1 Feature — Fenêtre nocturne et masque d'horizon

**Feature** — Établit le budget de temps réellement exploitable d'une nuit donnée, borné par les crépuscules, la Lune et le relief local. Toutes les autres features de la section en dépendent.

### Règle métier

```
CRÉPUSCULES — hauteur du Soleil, calculée par éphéméride, JAMAIS tabulée
  h > 0°          jour
  0° à −6°        civil
  −6° à −12°      nautique
  −12° à −18°     astronomique (transition)
  h < −18°        NUIT NOIRE, fenêtre de référence

  Durée : cos H = (sin(−18°) − sin δ_soleil × sin φ) / (cos δ_soleil × cos φ)
          duree_h = 2 × (180° − H) / 15,041

  Nuit noire nulle si  δ_soleil + φ − 90 > −18°, soit φ > 48,6° au solstice d'été.
  → mode dégradé : fenêtre nautique retenue, pénalité de fond de ciel appliquée
    et affichée. Jamais une durée négative, jamais un plantage.

FENÊTRE UTILE = nuit_noire ∩ (Lune sous l'horizon OU tolérance du type d'objet)
  Une Lune sous l'horizon ne dégrade rien, quelle que soit sa phase.

DÉGRADATION LUNAIRE — modèle de Krisciunas & Schaefer (1991)
  Fonction de l'illumination fractionnaire, de la hauteur de la Lune, de la
  séparation angulaire à la cible et de la masse d'air des deux.
  → produit ΔSB_lune, ajouté à SB_ciel (§2.2), donc propagé jusqu'à E_ciel (§7.1)
  → une nuit de Lune n'est pas « perdue » : elle a un fond de ciel plus élevé, donc
    des poses plus courtes et une intégration plus longue. Le moteur le chiffre.

MASQUE D'HORIZON — §4
  Une cible est observable si alt_cible > max( masque[azimut_cible], seuil_hauteur )

MIDI SOLAIRE VRAI — §4
  L'app centre ses créneaux sur le milieu de nuit vrai, jamais sur minuit légal.
```

**Application au site de référence** (46,391° N) — nuit astronomique calculée :

| Date | δ Soleil | Nuit astronomique |
|---|---|---|
| 1er mai | +14,9° | 5 h 35 |
| 1er juin | +22,0° | **3 h 18** |
| 21 juin | +23,44° | **2 h 35** |
| 15 juillet | +21,5° | 3 h 32 |
| 14 août | +13,9° | **5 h 49** |
| Équinoxes | 0° | 8 h 26 |
| 21 décembre | −23,44° | 11 h 43 |

Ce site est à 2,2° de latitude du seuil d'annulation. La nuit n'est jamais nulle, mais elle fond de 11 h 43 à 2 h 35. **Le planificateur doit raisonner en budget de temps, pas en faisabilité binaire.**

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `latitude`, `longitude`, `altitude_m` | float | °, m | §4 | |
| `date_locale`, `fuseau` | — | — | §4 | |
| `crepuscules` | objet | ISO 8601 | sortie | 6 instants, `[À CALCULER]` |
| `nuit_noire_debut`, `nuit_noire_fin`, `duree_min` | — | min | sortie | `[À CALCULER]` |
| `milieu_nuit_vrai` | datetime | — | sortie | |
| `lune_phase`, `lune_illumination` | float | °, % | 0 – 100 | `[À CALCULER]` |
| `lune_lever`, `lune_coucher` | datetime | — | sortie | `[À CALCULER]` |
| `delta_sb_lune` | float | mag/as² | sortie | Krisciunas & Schaefer |
| `masque_horizon` | array[360] | ° | §4 | |
| `mode_degrade` | bool | — | sortie | vrai si nuit noire nulle |

### Critères d'acceptation

```gherkin
Étant donné la latitude 46,391° N et la date du 21 juin
Quand j'ouvre le planificateur
Alors la durée de nuit astronomique calculée est d'environ 2 h 35
Et l'app signale que la fenêtre est parmi les plus courtes de l'année
Et centre les créneaux sur le milieu de nuit vrai, décalé de la longitude

Étant donné la latitude 52° N et la date du 21 juin                 # cas limite
Quand j'ouvre le planificateur
Alors l'app annonce une nuit astronomique nulle, sans durée négative ni erreur
Et propose la fenêtre nautique en mode dégradé, avec la pénalité de fond de ciel chiffrée

Étant donné une Lune pleine se couchant à 2 h 10
Quand je consulte la fenêtre utile pour une galaxie
Alors la fenêtre utile commence à 2 h 10, pas au début de la nuit noire
Et l'app affiche les deux durées séparément

Étant donné un masque de relief culminant à 22° dans l'azimut 165°
Quand j'évalue une cible passant au méridien à 19° de hauteur
Alors la cible est déclarée non observable depuis ce site
Et l'app nomme le relief comme cause, pas la hauteur seule

Étant donné un site sans donnée de relief disponible                # cas limite
Quand le masque est construit
Alors un masque plat à 0° est appliqué, marqué [HYP], affiché comme tel
```

### Dépendances données

Éphémérides Soleil et Lune : séries VSOP87 / ELP portées en JS, calcul client, `[À CALCULER]` sans exception. Relief : modèle numérique de terrain type SRTM, mis en cache par site. Modèle de brillance lunaire : Krisciunas & Schaefer (1991), implémenté localement. Fraîcheur : éphémérides calculées, MNT statique. Fallback : total après mise en cache du MNT.

---

## 8.2 Feature — Créneau d'observation par cible

**Feature** — Pour une cible : l'intervalle horaire où elle est simultanément assez haute, hors relief et dans la fenêtre nocturne, avec le passage au méridien et son éventuel retournement.

### Règle métier

```
HAUTEUR ET MASSE D'AIR
  alt_culmination = 90° − |φ − δ|
  masse_air ≈ 1 / sin(alt)      approximation plane, valide au-dessus de ~15°
  seuil imagerie C-01 : alt > 30°  (masse d'air < 2)
  seuil visuel   C-02 : alt > 20°  (sous 20°, extinction et turbulence dominent)

CIRCUMPOLARITÉ ET SEUILS SITE-DÉPENDANTS (§4)
  δ > 90° − φ      circumpolaire, ne se couche jamais
  δ < φ − 90°      ne se lève jamais
  δ < φ − 60°      n'atteint jamais 30° : hors domaine imagerie depuis ce site
  δ < φ − 70°      n'atteint jamais 20° : hors domaine total

CRÉNEAU = [alt > seuil] ∩ fenêtre_utile ∩ [alt > masque(azimut)]
  duree_creneau_min → consommée par §7.3 pour savoir si N_poses tient dans la nuit

MÉRIDIEN
  heure_culmination : instant où l'angle horaire s'annule → masse d'air minimale

RETOURNEMENT AU MÉRIDIEN — conditionnel au type de monture (§5.2)
  GEM      : le tube heurte le pied au passage du méridien → interruption obligatoire
             → créneau SCINDÉ en deux sous-créneaux
             → l'orientation du capteur bascule de 180° : les flats restent valides,
               le cadrage doit être re-vérifié, la séquence redémarre
  TRACKER  : pas de retournement, mais butée mécanique en angle horaire, saisie au profil
  ALTAZ    : hors MVP
```

**Application au site de référence** (φ = 46,391°) — seuils : circumpolaire au-delà de δ = +43,6° ; imagerie impossible sous δ = −13,6° ; visuel impossible sous δ = −23,6°.

| Cible | δ | Alt. culmination | Verdict imagerie (C-01) |
|---|---|---|---|
| Cygne (région) | +40° | **83,6°** | excellent, quasi zénithal |
| M31 | +41° | 84,6° | excellent |
| Cassiopée (Cœur & Âme) | +60° | 76,4° | excellent, circumpolaire |
| Dentelles du Cygne | +31° | 74,6° | excellent |
| Boucle de Barnard / Orion | −5° | 38,6° | correct |
| Rho Ophiuchi | −24° | **19,6°** | hors domaine imagerie |
| Centre galactique | −29° | **14,6°** | inaccessible |

Conséquence à annoncer à la validation du profil Lieu : depuis ce site, un setup grand champ est excellent sur la Voie lactée côté Cygne–Cassiopée et inopérant sur son cœur.

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `objet_id`, `ad_j2000`, `dec_j2000` | — | h, ° | catalogue | `[À CALCULER]` |
| `fenetre_utile` | intervalle | — | §8.1 | |
| `masque_horizon` | array[360] | ° | §4 | |
| `seuil_hauteur` | float | ° | 20 / 30 | selon usage |
| `type_monture` | enum | — | GEM / TRACKER / ALTAZ | §5.2 |
| `alt_culmination` | float | ° | sortie | |
| `heure_culmination` | datetime | — | sortie | `[À CALCULER]` |
| `creneaux` | array | — | sortie | 1 ou 2 intervalles |
| `duree_totale_min` | float | min | sortie | |
| `masse_air_min` | float | — | sortie | |
| `cause_exclusion` | enum | — | HAUTEUR / RELIEF / LUNE / HORS_FENETRE / JAMAIS_LEVE | sortie |

`cause_exclusion` est une exigence produit, pas une donnée technique : une cible rejetée sans motif nommé est la première source de méfiance envers l'application.

### Critères d'acceptation

```gherkin
Étant donné la latitude 46,391° et une cible de déclinaison +31°
Quand j'évalue son créneau une nuit d'août
Alors la hauteur de culmination calculée est de 74,6°
Et le créneau au-dessus de 30° couvre une large part de la nuit
Et l'heure de culmination est marquée [À CALCULER] jusqu'au calcul d'éphéméride

Étant donné une cible de déclinaison −24° depuis 46,391° N          # cas limite
Quand j'évalue son créneau
Alors la hauteur maximale calculée est de 19,6°
Et la cible est exclue du domaine imagerie avec la cause HAUTEUR
Et l'app indique la latitude en dessous de laquelle elle deviendrait accessible

Étant donné type_monture = GEM et une cible culminant à 1 h 20
Quand j'ouvre son créneau
Alors deux sous-créneaux sont affichés, séparés par le retournement au méridien
Et l'app rappelle que l'orientation du capteur bascule de 180°

Étant donné une cible circumpolaire (δ = +60° depuis 46,391° N)
Quand j'évalue son créneau
Alors aucun lever ni coucher n'est affiché
Et le créneau est borné uniquement par la fenêtre nocturne et le masque de relief

Étant donné une cible dont le créneau est plus court que T_requis (§7.3)
Quand j'ouvre le plan de capture
Alors l'app annonce le nombre de nuits nécessaires plutôt qu'un plan irréalisable
```

### Dépendances données

Coordonnées : OpenNGC, Messier, Sharpless, Barnard. Transformations et instants : séries analytiques en JS, calcul client. Fraîcheur : catalogues statiques, positions calculées. Fallback : total.

---

## 8.3 Feature — Plan de session ordonné

**Feature** — Ordonne dans le temps les cibles que l'utilisateur a choisies (§6.4), en ne gardant que ce qui est réalisable dans la nuit disponible avec le matériel déclaré, chaque cible portant son verdict et son plan de capture. Synthèse des §5, §6, §7.

### Règle métier

```
0. SÉLECTION — l'entrée du moteur est CE QUE L'UTILISATEUR A CHOISI, jamais le catalogue
   §6.4 lui donne de quoi choisir : le ciel propose, les moteurs qualifient, il décide.
   Un plan qu'on n'a pas composé est un palmarès de plus, et un palmarès n'est pas
   exécutable — c'est déjà ce que le point 3 refuse en sortie, ça vaut aussi en entrée.
   Sélection vide → l'app le DIT et nomme le geste qui manque. Elle ne propose alors ni
   contrainte dominante — aucune contrainte n'a joué — ni domaine de repli : le grand
   champ répond à « aucune cible compatible », pas à « rien n'a été coché ».
   AUCUN PLAFOND sur la sélection. C-20 borne le coût d'un balayage de catalogue (§6.4) ;
   appliqué à un choix, il écarterait sans cause — ce que le point 1 interdit.

1. PRÉ-FILTRAGE — ce qui empêche une cible CHOISIE de tenir, avec cause nommée
   cadrage       verdict_cadrage ∈ {SERRE, OPTIMAL, LARGE}          §6.2
   hauteur       alt_culmination > seuil, hors masque de relief      §8.2
   fenêtre       durée de créneau non nulle                          §8.2
   détectabilité verdict ≠ HORS_PORTEE                              §6.3
   Une cible choisie qui ne passe pas est RENDUE à l'écran avec sa cause, jamais retirée
   en silence : sans elle, le geste d'ajout se lit comme un bouton cassé.

2. SCORING — pondération explicite, exposée et réglable (C-15)
   score = w_c·S_cadrage + w_h·S_hauteur + w_s·S_signal + w_f·S_fenetre + w_l·S_lune

   S_cadrage = 1 − |remplissage − 0,42| / 0,42      optimum au milieu de C-05
   S_hauteur = min(1, (alt_culmination − 30) / 40)
   S_signal  = min(1, duree_creneau / T_requis)     ce que la nuit permet vraiment
   S_fenetre = duree_creneau / duree_nuit_noire
   S_lune    = 1 − ΔSB_lune / 3,0, borné à [0 ; 1]  tolérance selon type d'objet

3. ORDONNANCEMENT — LA NUIT SE PARTAGE, ELLE NE SE PREND PAS
   Les créneaux se chevauchent : la nuit est une ressource à allouer. Partage équitable
   max-min, deux règles qui se tiennent l'une l'autre :
     a) ON SERT LA PLUS PETITE DEMANDE D'ABORD. La demande d'une cible est ce qu'elle
        consommera vraiment ce soir : min(T_requis, durée de son créneau). Une cible qui
        ne passe qu'une heure au-dessus du seuil demande une heure, même s'il lui en
        faut seize.
     b) PERSONNE NE PREND PLUS QUE SA PART tant que d'autres attendent. La part est le
        temps encore libre DANS SON CRÉNEAU, divisé par le nombre de cibles restant à
        servir qui se disputent ce même morceau de nuit. Des créneaux disjoints ne se
        comptent pas l'un contre l'autre.
   Servies par demande croissante, les cibles qui se contentent de peu libèrent leur
   surplus : la part ne borne que celles qui en voulaient plus de toute façon. Aucune
   minute perdue, aucune cible affamée. Sans ces deux règles, une cible de seize heures
   prenait les cinq heures de la nuit et une cible de neuf minutes en ressortait.
   LE SCORE DÉPARTAGE LES DEMANDES ÉGALES — deux cibles qui veulent exactement le même
   morceau de nuit. C'est le seul moment où l'arbitrage a lieu d'être.
   Créneau sans une minute libre → la cible est REPORTÉE, en le disant, jamais supprimée
   en silence.
   → SORTIE : UNE CHRONOLOGIE, PAS UN PALMARÈS. Un palmarès n'est pas exécutable
     sur le terrain ; une chronologie l'est.

4. BUDGET GLOBAL — RÉSERVÉ D'ABORD, CONSTATÉ ENSUITE, JAMAIS RÉSOLU EN DÉFAISANT UN CHOIX
   temps_capture + temps_calibration (§7.4) + temps_mise_en_station (≈ 15 min)
   + temps_pointage × n_cibles (§8.4)  ≤  durée de nuit noire
   LES FRAIS NE SE DÉCOUVRENT PAS À LA FIN. Mise en station, pointages et calibration se
   retranchent de la nuit AVANT le partage : distribuer la nuit entière à la capture,
   puis constater qu'il manque neuf minutes, c'est annoncer un dépassement qu'il
   suffisait de ne pas créer. La calibration dépend du plan qu'elle chiffre : une
   première passe la mesure, une seconde la réserve.
   Dépassement résiduel → ANNONCÉ, avec le nombre de minutes en trop. Retirer « la cible
   de plus faible score » supposait un plan produit par l'app ; la sélection vient de
   l'utilisateur (point 0), et la retirer défaisait son geste sans le lui dire — pendant
   que la liste, elle, continuait d'annoncer la même cible comme photographiable. Une
   cible photographiable EST au plan : c'est à l'utilisateur d'en retirer une.
   JAMAIS de troncature silencieuse d'une intégration : ce qui ne tient pas dans la nuit
   annonce son nombre de nuits — LE MÊME que celui de la liste (§6.4), déduit du créneau
   de la cible et non de ce que l'allocation lui laisse ce soir.
```

**Ce que ça donne sur le setup et le site de référence, une nuit d'août** : 5 h 49 de nuit noire, fenêtre de cadrage 3,79°–5,69°, poses de 13 s. Le pré-filtrage écarte tout le domaine galactique par cadrage et tout ce qui est sous δ = −13,6° par hauteur. Restent les grands complexes du plan galactique nord. Avec des `T_requis` de 15 min à 1 h par cible, **la nuit permet trois à quatre cibles** — c'est l'ordre de grandeur de ce qu'il vaut la peine de choisir. Les cibles nommées sont `[À CALCULER]` : le moteur ordonne celles qu'on lui donne.

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `date`, `lieu`, `profil_materiel` | — | — | §4, §5 | |
| `cibles_choisies` | array | — | entrée | désignations retenues par l'utilisateur, §6.4 ; vide = pas de plan |
| `poids_scoring` | objet | — | somme = 1 | C-15, réglable, affiché |
| `snr_cible` | float | — | §7.3 | |
| `plan` | array | — | sortie | cibles ordonnées |
| `plan[].creneau_alloue` | intervalle | — | sortie | |
| `plan[].n_poses`, `plan[].t_pose_s` | — | — | §7 | |
| `plan[].score`, `plan[].detail_score` | float, objet | — | sortie | **décomposition exposée** |
| `plan[].verdict` | enum | — | §6.3 | |
| `cibles_ecartees` | array | — | sortie | avec `cause_exclusion` |
| `budget_nuit` | objet | — | sortie | capture / calibration / mise en station / pointage |
| `rappel_batterie` | string | — | sortie | quand la capture dépasse C-16, sinon absent |

### Critères d'acceptation

```gherkin
Étant donné le profil de référence, le site 46,391° N Bortle 4,5, la date du 14 août
Et trois cibles ajoutées au plan depuis leur fiche ou depuis la liste (§6.4)
Quand je consulte le plan de la nuit
Alors l'app rend une chronologie de ces trois cibles, et d'aucune autre
Et le budget total, calibration et pointage inclus, tient dans les 5 h 49 disponibles
Et chaque cible affiche la décomposition de son score
Et chaque étape porte sa consigne de terrain

Étant donné qu'aucune cible n'a encore été ajoutée au plan          # état de départ
Quand je consulte le plan de la nuit
Alors l'app annonce qu'aucune cible n'est choisie et nomme le geste qui manque
Et n'invente AUCUNE chronologie
Et ne nomme ni contrainte dominante ni domaine de repli : rien n'a été refusé

Étant donné une cible que j'ai choisie et que la nuit ne permet pas  # cas limite
Quand je consulte le plan
Alors elle est absente de la chronologie
Et l'app en nomme la cause, à part, sans remplir le plan de cibles écartées

Étant donné une nuit où aucune cible choisie ne franchit le pré-filtrage
Quand je consulte le plan
Alors l'app annonce l'absence de cible compatible et nomme la contrainte dominante
Et propose une alternative dans le domaine grand champ ou filé (§9)
Et ne remplit PAS la liste avec des cibles écartées

Étant donné deux cibles dont les créneaux se chevauchent intégralement
Quand le plan est construit
Alors une seule est retenue sur son créneau, l'autre est reportée ou écartée
Et l'app expose l'arbitrage plutôt que de les planifier simultanément

Étant donné un budget dépassant la nuit de 40 min
Quand le plan est finalisé
Alors l'app annonce le dépassement et les minutes en trop
Et aucune cible choisie n'est retirée : c'est à l'utilisateur d'arbitrer
Et aucune intégration n'est tronquée sans mention explicite

Étant donné une cible qui demande 16 h d'intégration et une cible qui en demande 9 min
Et des créneaux qui se recouvrent, la première étant la mieux notée
Quand le plan est construit
Alors les deux sont au plan
Et la seconde est servie d'abord, la première prenant ce qu'elle laisse
Et aucune minute de nuit ne reste inutilisée de ce fait

Étant donné une cible que la liste annonce photographiable en 2 nuits
Quand je l'ajoute au plan
Alors elle figure dans la chronologie
Et le plan annonce 2 nuits, le même nombre que la liste
```

### Dépendances données

Agrège §5, §6, §7, §8.1, §8.2. Aucune source nouvelle. Fallback : total. Les poids C-15 sont figés et réglables, sans aucun apprentissage.

---

## 8.4 Feature — Cheminement d'étoiles et carte de pointage

**Feature** — Permet d'amener la cible dans le champ sans pointage automatique, en partant d'une étoile visible à l'œil nu. Persona : débutant équipé d'une monture motorisée sans GoTo. C'est le chaînon entre « l'app recommande une cible » et « la cible est dans le cadre ».

### Règle métier

```
Le besoin dépend du champ. Un chercheur de télescope classique couvre 5° à 8° ;
un objectif de 120 mm sur plein format couvre 17°. À cette échelle, le cheminement
au sens traditionnel — sauts successifs dans un chercheur étroit — est surdimensionné :
le cadre contient toujours plusieurs étoiles brillantes.

MODE_POINTAGE — sélectionné automatiquement selon le champ
  FOV_H > 8°   → CARTE_DIRECTE
     Étoiles d'ancrage = celles de mag ≤ m_lim_oeil (§2.2) présentes dans le cadre
     Ancrage principal : la plus brillante, mag ≤ 4,5, pour fiabilité en ciel dégradé
     Sortie : schéma du cadre, cible marquée, ancrages positionnés en x/y,
              décalages angulaires cible ↔ ancrage
     → une seule étape de pointage

  FOV_H ≤ 8°   → CHEMINEMENT
     Graphe de sauts depuis une étoile de mag ≤ 3,5
     Contrainte de saut : distance ≤ 0,7 × FOV_chercheur (recouvrement garanti)
     Sauts sur étoiles de mag ≤ 6,5, motifs géométriques reconnaissables privilégiés
     Plus court chemin, 5 sauts maximum
     Sortie : séquence de vignettes de champ, orientées selon l'heure et le lieu

ORIENTATION — la contrainte que les cartes papier ratent
  Le champ tourne au cours de la nuit dans le référentiel de l'observateur. Le schéma
  est orienté selon l'angle de position du zénith à l'instant du pointage, avec
  l'indication haut/bas réelle telle que l'œil la verra.
  Un schéma non orienté est inutilisable dans le noir.

DÉCALAGES CHIFFRÉS — pour monture motorisée à cercles gradués ou à main
  Δad_h  = AD_cible − AD_ancrage              en heures d'angle horaire
  Δdec_° = δ_cible − δ_ancrage                en degrés
  → conversion en tours de flexible si le pas de la monture est déclaré

LA MISE EN STATION RESTE À LA CHARGE DE L'UTILISATEUR. L'application aide à
trouver les objets ; elle ne prétend ni mesurer ni corriger l'installation.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `objet_id` | string | — | — | cible du plan §8.3 |
| `fov_h_deg`, `fov_l_deg` | float | ° | §5.1 | pilote le mode |
| `fov_chercheur_deg` | float | ° | 1 – 10 | optionnel, mode CHEMINEMENT |
| `m_lim_oeil` | float | mag | §2.2 | pilote les ancrages |
| `datetime`, `lieu` | — | — | §4 | pilote l'orientation |
| `mode_pointage` | enum | — | CARTE_DIRECTE / CHEMINEMENT | sortie |
| `ancrages` | array | — | sortie | nom, mag, position x/y |
| `sauts` | array | — | sortie | si CHEMINEMENT, ≤ 5 |
| `delta_ad_h`, `delta_dec_deg` | float | h, ° | sortie | |
| `angle_orientation_deg` | float | ° | sortie | angle de position du zénith |

### Critères d'acceptation

```gherkin
Étant donné le profil de référence 120 mm plein format (17,0° × 11,4°)
Quand j'ouvre l'aide au pointage sur une cible du plan
Alors le mode retenu est CARTE_DIRECTE
Et l'app liste les étoiles de magnitude ≤ 6,05 présentes dans le cadre,
    avec leur position et les décalages angulaires vers la cible
Et le schéma est orienté selon l'heure et le lieu du pointage

Étant donné un champ de 2° et une cible sans étoile brillante à proximité
Quand j'ouvre l'aide au pointage
Alors le mode retenu est CHEMINEMENT
Et l'itinéraire compte au maximum 5 sauts depuis une étoile de magnitude ≤ 3,5
Et chaque saut garantit un recouvrement de champ

Étant donné un ciel à Bortle 8 (m_lim_oeil = 4,5)                   # cas limite
Quand les ancrages sont sélectionnés
Alors seules les étoiles de magnitude ≤ 4,5 sont proposées
Et si aucune n'est disponible, l'app le déclare au lieu de proposer une étoile invisible

Étant donné une cible circumpolaire pointée à deux heures différentes
Quand je compare les deux schémas
Alors l'orientation du champ diffère conformément à la rotation du ciel
Et l'app n'affiche pas un schéma figé

Étant donné aucun chemin trouvé sous 5 sauts                        # cas limite
Quand le cheminement est calculé
Alors l'app propose la contrainte à relâcher : magnitude limite, nombre de sauts,
    ou champ de chercheur
Et n'invente pas un itinéraire au-delà de la contrainte déclarée
```

### Dépendances données

HYG v4.1 embarqué, coupé à mag ≤ 9 (réutilise §9.2, coût marginal nul). Noms propres et désignations Bayer : HYG. Positions apparentes et angle du zénith : séries en JS, calcul client. Fraîcheur : statique. Fallback : total.

---

# 9 — Grand champ et filé d'étoiles

## 9.1 Feature — Pose maximale à étoiles ponctuelles

**Feature** — Durée de pose la plus longue conservant des étoiles en points, calculée par région du ciel et non globalement. Persona : débutant en grand champ, sans suivi.

### Règle métier

```
IL N'EXISTE PAS UNE POSE MAX, MAIS UNE POSE MAX PAR DÉCLINAISON.

TRAÎNÉE RÉELLEMENT INSCRITE SUR LE CAPTEUR
  trace_arcsec = 15,041 × t_s × cos(δ)         δ = déclinaison de la zone visée
  trace_px     = trace_arcsec / ech_apx

NPF COMPLÈTE — c'est celle-ci que le moteur implémente
  t_npf(s) = k × (35 × N + 30 × pitch_um) / ( focale_mm × cos(δ) )
  k = 1,0 strict (étoiles ponctuelles à 100 % en visualisation pixel)
  k = 2,0 tolérant (acceptable pour un tirage ou un affichage écran)   C-06

FOCALE ÉQUIVALENTE 24×36 — repère de comparaison entre formats, jamais un dénominateur
  Elle situe un objectif d'un format à l'autre, et rien de plus. Aucune pose ne s'en
  déduit : la NPF part de la focale réelle et du pitch, qui décrivent déjà le capteur.

SORTIE — une carte, pas un nombre
  Sur un grand champ, la déclinaison varie de plusieurs dizaines de degrés d'un bord
  à l'autre du cadre. La pose est dictée par la zone la plus contraignante présente
  dans le champ, c'est-à-dire celle de plus faible déclinaison absolue :
     t_max_cadre = t_npf( δ_min_abs présent dans le cadre )

AVEC SUIVI
  La pose opérante devient t_max_suivi (§5.2), qui dépend de la mise en station et
  de l'erreur périodique, pas de la NPF. La NPF reste affichée à titre informatif.
```

**Application au setup grand angle de référence** — 10 mm f/2,8, pitch 5,12 µm, k = 1. Base : `(35 × 2,8 + 30 × 5,12) / 10 = 25,16 s` à δ = 0, divisé par cos δ.

| Zone visée | δ | cos δ | Pose max (NPF) |
|---|---|---|---|
| Équateur céleste | 0° | 1,000 | **25,2 s** |
| Voie lactée d'été | −25° | 0,906 | **27,8 s** |
| Cygne / Cassiopée | +50° | 0,643 | **39,1 s** |
| Circumpolaire | +89° | 0,017 | **1 442 s** |

D'un bord du ciel à l'autre, la pose max varie d'un facteur 57 : 25,2 s sur l'équateur céleste contre 1 442 s près du pôle. Aucune valeur unique ne couvre cet écart — annoncer une pose globale, c'est filer les étoiles d'un côté du ciel et jeter du signal de l'autre. La pose se lit par zone visée.

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `focale_mm`, `ouverture_N`, `pitch_um` | float | — | §5.1 | |
| `centre_cadre_ad`, `centre_cadre_dec` | float | ° | −90 – 90 | pointage visé |
| `angle_rotation_cadre` | float | ° | 0 – 360 | orientation du boîtier |
| `k_tolerance` | float | — | 1,0 / 2,0 | C-06 |
| `t_max_cadre_s` | float | s | sortie | zone la plus contraignante |
| `carte_pose_max` | grille | s | sortie | valeur par cellule du champ |
| `zone_limitante` | string | — | sortie | nommée, ex. « bord bas, δ = −8° » |

### Critères d'acceptation

```gherkin
Étant donné un 10 mm f/2,8, pitch 5,12 µm, k = 1, cadre centré sur δ = 0°
Quand je consulte la pose max
Alors l'app affiche 25,2 s

Étant donné le même objectif pointé près du pôle
Quand je consulte la pose max
Alors la valeur dépasse 20 min
Et l'app avertit que la contrainte devient le bruit thermique et le fond de ciel,
    plus le filé

Étant donné un cadre couvrant à la fois δ = +70° et δ = +5°         # cas limite
Quand la pose max est calculée
Alors la valeur retenue est celle de δ = +5°

Étant donné suivi_actif = vrai                                      # cas limite
Quand j'ouvre le module grand champ
Alors la NPF est affichée à titre informatif
Et la pose opérante devient t_max_suivi de §5.2, avec la raison du basculement énoncée
```

### Dépendances données

Transformations horizontales ↔ équatoriales : séries en JS, calcul client. Aucune donnée externe. Fallback : total.

---

## 9.2 Feature — Prévisualisation de champ à étoiles fixes

**Feature** — Rendu du cadre tel qu'il sera capturé, à la pose et à l'orientation choisies, avec les étoiles brillantes aux positions réelles. Persona : préparation de cadrage Voie lactée.

### Règle métier

```
ARCHITECTURE HYBRIDE EN TROIS COUCHES

COUCHE 1 — ÉTOILES RÉELLES        catalogue HYG, mag ≤ SEUIL_REEL
  SEUIL_REEL = 7,5 → ≈ 15 000 étoiles sur la sphère, quelques milliers par grand champ
  Rendu vectoriel, position exacte, couleur dérivée de l'indice B−V.
  rayon_px = r0 × 10^(−0,15 × (mag − mag_ref))     modèle commun avec §3.3
  → c'est cette couche qui rend les constellations reconnaissables
    et le cadrage exploitable.

COUCHE 2 — FOND GÉNÉRATIF         mag > SEUIL_REEL
  Semis procédural, graine déterministe : même cadre = même rendu, non scintillant.
  Densité NON uniforme, modulée par la latitude galactique b :
     densite(b) = d0 × exp( −|b| / 20° )
  → sans cette modulation, la bande de la Voie lactée n'apparaît pas et la prévisu
    devient inutile pour le cas d'usage principal du grand champ.

COUCHE 3 — VOIE LACTÉE            imagerie de fond en coordonnées galactiques
  MVP      : masque procédural en coordonnées galactiques, léger, hors ligne
  POST-MVP : tuiles HiPS (relevé couleur), photoréaliste, nécessite le réseau
  Contraste modulé par SB_ciel (§2.2) : à Bortle 4–5 la bande est visible mais
  atténuée ; à Bortle 8 elle disparaît.
  → l'app montre ce que L'UTILISATEUR verra, pas une carte de référence idéale.

MODULATION PAR LES PARAMÈTRES DE CAPTURE — ce qui distingue une prévisu d'une carte
  profondeur atteinte    ← t_pose, N, ISO, SB_ciel  → nombre d'étoiles affichées
  étirement des étoiles  ← trace_px de §9.1         → si t > t_max, les étoiles
                                                      s'ovalisent DANS la prévisu
  vignettage             ← ouverture_N, format      → assombrissement des coins
                                                      (1 à 2 diaphragmes à f/2,8)
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `centre_ad`, `centre_dec`, `angle_rotation` | float | ° | — | pointage |
| `datetime_utc`, `lieu` | — | — | §4 | version azimutale |
| `t_pose_s`, `n_poses`, `iso` | — | — | §7 | pilotent la profondeur |
| `sb_ciel` | float | mag/as² | §2.2 | pilote le contraste |
| `type_objectif` | enum | — | RECTILINEAIRE / FISHEYE | §5.1 |
| `rendu` | image | — | sortie | 3 couches composées |
| `mag_limite_atteinte` | float | mag | sortie | `[À CALCULER]` |
| `etoiles_reelles_affichees` | int | — | sortie | traçabilité du rendu |

### Critères d'acceptation

```gherkin
Étant donné un 10 mm plein format pointé vers une région du plan galactique
Quand j'ouvre la prévisualisation
Alors la bande de la Voie lactée apparaît, orientée conformément aux coordonnées galactiques
Et les étoiles de magnitude ≤ 7,5 sont aux positions réelles du catalogue

Étant donné une pose de 60 s à δ = 0 alors que t_max vaut 25,2 s
Quand la prévisualisation est générée
Alors les étoiles sont rendues ovalisées, avec la traînée en pixels chiffrée
Et l'app propose la pose corrigée

Étant donné le même cadre régénéré deux fois de suite
Quand je compare les rendus
Alors le semis génératif est identique (graine déterministe)

Étant donné un pointage vers un champ vide de toute étoile ≤ 7,5    # cas limite
Quand la prévisualisation est générée
Alors seules les couches 2 et 3 sont composées
Et l'app signale l'absence de repère brillant, information utile en pointage manuel
```

### Dépendances données

HYG v4.1 (positions, magnitudes, B−V), coupure à mag ≤ 9, embarqué. Sous-ensemble Gaia DR3 : hors MVP (§12.2). Masque Voie lactée procédural embarqué. Fraîcheur : statique. **Fallback hors-ligne : total au MVP** — c'est l'argument décisif du masque procédural contre HiPS.

---

## 9.3 Feature — Prévisualisation du filé d'étoiles

**Feature** — Rendu du tracé obtenu pour une durée d'accumulation donnée, avec centre de rotation exact. Persona : amateur de filé — « si je pose 20 min ça donne quoi, et 1 h ? ».

### Règle métier

```
CE QUI DOIT ÊTRE EXACT, ET POURQUOI

1. LE PÔLE — position du centre de rotation dans le cadre
   Le pôle céleste est fixe dans le référentiel local :
     altitude_pole = |latitude_observateur|
     azimut_pole   = 0° (nord vrai) si latitude > 0, sinon 180°
   Sa position dans le cadre découle du pointage et de la projection.
   → CAS CRITIQUE : le pôle est très souvent HORS du cadre. Les arcs sont alors
     concentriques autour d'un point situé en dehors du canevas. Une prévisu qui
     force le centre dans l'image est FAUSSE et induit un cadrage raté sur le terrain.

2. LA GÉOMÉTRIE DES ARCS
   En projection rectilinéaire, un cercle de déclinaison NE se projette PAS en cercle :
   il devient une conique (ellipse, parabole ou hyperbole selon l'angle au pôle).
   Aux grands champs, les arcs près du bord sont visiblement non circulaires.
   Tracer des cercles concentriques est le raccourci classique, et il est faux à 130°.

3. LA LONGUEUR D'ARC
   longueur_arc_deg = 15,041 °/h × duree_totale_h × cos(δ)
   → varie d'une étoile à l'autre dans le même cadre. Un rendu à longueur uniforme
     cache l'effet le plus caractéristique du filé.

CE QUI PEUT ÊTRE GÉNÉRIQUE
  Les positions et magnitudes des étoiles hors catalogue réel. Aucune conséquence
  sur une décision de cadrage.

ARCHITECTURE RETENUE — le coût marginal du catalogue réel est nul
  La §9.2 embarque déjà HYG projeté correctement. Un arc n'est que la même étoile
  balayée en angle horaire : le code de projection est identique, seule la primitive
  de dessin change, du point vers la polyligne. La vraie dépense est le nombre de
  segments à tracer, pas la source des positions.

  Étoiles mag ≤ 7,5   → arcs aux positions réelles
  Étoiles mag > 7,5   → arcs sur semis génératif, densité modulée par latitude galactique
  Pôle et géométrie   → EXACTS dans les deux cas, sans exception

  Tracé d'un arc, par étoile :
    pour h de h0 à h0 + 15,041 °/h × duree :
        projeter (AD + h, δ) → (x, y) dans le cadre
    polyligne des points obtenus, pas d'échantillonnage ≤ 0,25° d'angle horaire
    intensité de la trace ∝ 1 / longueur

  Le dernier point est celui que ratent la plupart des simulateurs : UNE ÉTOILE QUI
  FILE EST MOINS BRILLANTE PAR PIXEL qu'une étoile ponctuelle, puisque le même flux
  s'étale. Sans cette pondération, la prévisu montre des traces trop marquées et
  l'utilisateur est déçu du résultat réel.

LE MODE D'APERÇU SE DÉDUIT DE LA DURÉE, IL NE SE CHOISIT PAS
  duree_totale_min = 0  → aperçu de champ §9.2, une pose unique
  duree_totale_min > 0  → filé §9.3, poses accumulées
  Une commande séparée — menu ou bascule — posée à côté du curseur pouvait le
  contredire : mode « champ » affiché avec une durée de 2 h, ou mode « filé » avec
  une durée au minimum. Deux commandes pour une seule intention, dont l'une mentait.
  Le curseur porte donc les deux aperçus, et 0 est le cran qui les sépare.

  → CONSÉQUENCE SUR LA PLAGE : 0 est accepté au curseur alors que le filé n'est
    VALIDE qu'à partir de 5 min. Ce n'est pas un filé plus court que la borne, c'est
    l'autre aperçu. Le domaine du filé reste 5 – 480.

  → CE QUE 0 N'EST PAS : une durée d'accumulation nulle. Une pose unique accumule sa
    propre pose, et ses étoiles portent l'arc de cette pose (§9.1). Lire zéro
    annoncerait un ciel figé que le cadre ne montre pas.
```

**Application au setup grand angle** — 10 mm plein format, champ vertical 100,2°, 4 672 px de hauteur, soit 46,6 px/° :

| Durée | Arc à δ = 0° | Arc à δ = −25° | Arc à δ = +60° |
|---|---|---|---|
| 20 min | **5,01° ≈ 234 px** | 4,54° ≈ 212 px | 2,51° ≈ 117 px |
| 1 h | **15,04° ≈ 701 px** | 13,63° ≈ 636 px | 7,52° ≈ 351 px |
| 2 h | 30,1° ≈ 1 403 px | 27,3° ≈ 1 271 px | 15,0° ≈ 701 px |
| 4 h | 60,2° ≈ 2 806 px | 54,5° ≈ 2 542 px | 30,1° ≈ 1 403 px |

À 20 min, l'arc fait 5 % de la hauteur du cadre : le résultat ressemble à des étoiles légèrement étirées, pas à un filé. **C'est la déception numéro un du débutant, et le moteur doit le dire** — le filé lisible commence vers 1 h et devient spectaculaire à partir de 2 h.

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `duree_totale_min` | float | min | 0 – 480 | curseur, prévisu en direct · **0 sélectionne l'aperçu de §9.2**, le filé n'est valide qu'à partir de 5 |
| `latitude_observateur` | float | ° | −90 – 90 | pilote la position du pôle |
| `centre_az`, `centre_alt`, `angle_rotation` | float | ° | — | pointage |
| `type_objectif` | enum | — | RECTILINEAIRE / FISHEYE | §5.1 |
| `pole_dans_cadre` | bool | — | sortie | **doit piloter l'affichage** |
| `pole_x_px`, `pole_y_px` | float | px | sortie | peut être hors bornes du canevas |
| `longueur_arc_min_deg`, `longueur_arc_max_deg` | float | ° | sortie | extrêmes du cadre |
| `rendu_file` | image | — | sortie | |

### Critères d'acceptation

```gherkin
Étant donné une latitude de 46,4° N et un cadre centré sur le pôle nord céleste
Quand je règle la durée à 1 h
Alors le centre de rotation est rendu dans le cadre à l'altitude 46,4°, azimut nord vrai
Et les arcs sont concentriques autour de ce point, de longueur croissante avec
    la distance au pôle

Étant donné un cadre centré au sud, pôle nord hors du champ         # cas limite majeur
Quand la prévisualisation est générée
Alors pole_dans_cadre vaut faux et les arcs sont concentriques autour d'un point
    situé hors du canevas
Et l'app ne recentre PAS artificiellement le pôle dans l'image

Étant donné une durée de 20 min à δ = 0
Quand la prévisualisation est générée
Alors la longueur d'arc affichée est 5,01°, soit environ 5 % de la hauteur du cadre
Et l'app indique qu'un filé lisible demande typiquement au moins une heure

Étant donné un objectif déclaré FISHEYE
Quand les arcs sont tracés
Alors la projection équidistante est utilisée et les arcs restent quasi circulaires
    autour du pôle, contrairement au rendu rectilinéaire

Étant donné une durée d'accumulation ramenée à 0
Quand la prévisualisation est générée
Alors l'aperçu rendu est celui de §9.2 — une pose unique, étoiles ponctuelles sous suivi
Et aucune commande séparée ne permet de contredire le curseur sur le mode affiché
Et la durée peinte est celle de la pose unitaire, jamais zéro

Étant donné une durée telle que l'arc dépasse le champ              # cas limite
Quand la prévisualisation est générée
Alors les arcs sont correctement tronqués aux bords du cadre
Et l'app signale que les étoiles concernées entrent et sortent du champ
    pendant la séquence
```

### Dépendances données

HYG (couche réelle), transformations de coordonnées en JS. Aucun réseau. Fallback : total.

---

## 9.4 Feature — Logistique de séquence de filé

**Feature** — Traduit la durée souhaitée en paramètres d'intervallomètre et en contraintes matérielles vérifiables avant de sortir. Persona : terrain.

### Règle métier

```
n_poses = floor( duree_totale_s / (t_pose_s + intervalle_s) )
  t_pose recommandé   20 à 30 s
  intervalle ≤ 1 s (C-09) → au-delà, TROUS VISIBLES dans les traces,
                            défaut irréparable en post-traitement

CONTRAINTE MATÉRIELLE QUI PLAFONNE L'INTERVALLE
  Réduction de bruit sur longue exposition (dark automatique du boîtier) :
  si activée, le boîtier occupe un temps égal à la pose après chaque image
  → intervalle effectif ≥ t_pose → traces pointillées, séquence ruinée
  → CONSIGNE BLOQUANTE : désactivation prescrite avant la sortie.

BUDGET
  volume_go   = n_poses × taille_raw_mo / 1024

  AUCUNE AUTONOMIE DE BATTERIE N'EST MODÉLISÉE.
  L'autonomie CIPA se mesure en rafale au flash, la température prévue se saisit à la
  main : leur produit donnait à un ordre de grandeur l'allure d'une prédiction, posée à
  côté de grandeurs réellement calculées. Ni la norme, ni la température, ni un facteur
  de froid n'entrent plus dans l'application.
  → RAPPEL SEUL : au-delà de C-16 minutes de prise de vue, l'app rappelle de prévoir de
    quoi tenir la nuit. Une durée qu'elle a calculée, pas un nombre de batteries.

VOIE À SPÉCIFIER : empilement de poses courtes en mode éclaircir.
  La pose unique très longue est écartée : bruit thermique, ciel cramé en présence
  de pollution lumineuse.

CETTE SECTION NE S'APPLIQUE PAS HORS DU FILÉ
  À duree_totale_min = 0, l'aperçu est celui de §9.2 : une photo, pas une séquence.
  Il n'y a rien à cadencer, et les compteurs ci-dessus annonceraient zéro pose et
  zéro gigaoctet. La logistique est alors ABSENTE, pas affichée à zéro — un compteur
  à zéro se lit comme un budget calculé, donc comme un résultat.
```

**Séquence type, 2 h à 25 s** : `n_poses = 7200 / 26 = 276 images` · volume ≈ 8,9 Go (33 Mo par RAW `[À VÉRIFIER]`) · arc obtenu 30,1° à δ = 0, 27,3° dans la Voie lactée d'été.

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `duree_totale_min` | float | min | 5 – 480 | hors plage, la section ne s'applique pas (§9.3) |
| `t_pose_s` | float | s | 5 – 60 | recommandé 20–30 |
| `intervalle_s` | float | s | 0 – 30 | refusé au-delà de C-09 |
| `n_poses` | int | — | sortie | |
| `volume_go` | float | Go | sortie | |
| `rappel_batterie` | string | — | sortie | au-delà de C-16, sinon absent |
| `consignes_bloquantes` | array | — | sortie | dont dark automatique |

### Critères d'acceptation

```gherkin
Étant donné une durée cible de 2 h et une pose de 25 s
Quand j'ouvre la fiche de séquence
Alors l'app prescrit 276 poses, un intervalle de 1 s au maximum, environ 8,9 Go
Et liste en consigne bloquante la désactivation de la réduction de bruit longue exposition

Étant donné un intervalle saisi à 3 s
Quand je valide
Alors l'app refuse et chiffre la longueur du trou produit dans chaque trace

Étant donné une durée d'accumulation dépassant le seuil C-16
Quand j'ouvre la fiche de séquence
Alors l'app rappelle de prévoir de quoi tenir la nuit en batterie
Et n'affiche ni nombre de batteries, ni autonomie, ni température, ni facteur de froid

Étant donné une durée d'accumulation ramenée à 0                     # aperçu §9.2
Quand j'ouvre le panneau du filé
Alors la logistique de séquence est absente du panneau
Et aucun compteur de poses ni de volume n'est affiché à zéro
```

### Dépendances données

Taille RAW par boîtier : base embarquée, valeur `[À VÉRIFIER]`. Seuil de rappel batterie : C-16, ordre de grandeur. Aucune donnée météo n'est requise : la température n'entre plus dans aucun calcul de cette section.

---

## 9.5 Feature — Aperçu incrusté dans le cadre matériel

**Feature** — Les prévisualisations de §9.2 et §9.3 sont rendues À L'INTÉRIEUR du cadre de §3.5, sur la scène, et non dans un second canevas ailleurs. Persona : préparation de cadrage. C'est ce qui rend l'aperçu comparable au ciel qui l'entoure.

### Règle métier

```
POURQUOI DANS LE CADRE, ET PAS À CÔTÉ
  Un aperçu affiché dans un panneau séparé oblige l'utilisateur à comparer deux images
  de projections, d'échelles et d'orientations différentes. Il en tire une impression,
  pas une décision de cadrage. Incrusté, l'aperçu se lit contre les étoiles réelles qui
  entourent le cadre : allonger la pose ovalise les étoiles là où l'utilisateur regarde
  déjà, et les arcs de filé tombent exactement sur les étoiles de la scène.

LE PROJECTEUR EST CELUI DE LA SCÈNE — conséquence de §3.3
  L'aperçu emprunte la vue et la matrice de l'image courante. Aucun second code de
  projection n'existe, donc aucune divergence entre le cadre affiché et son contenu
  n'est possible. Le cadre borne la SÉLECTION des étoiles, jamais le canevas.

ORDRE DES PASSES — l'aperçu est un fond, pas un calque de tête
  fond → APERÇU INCRUSTÉ → frontières, figures, astérismes, plan galactique, étoiles,
  corps, cadres, labels.
  Les repères du planétarium passent donc PAR-DESSUS l'aperçu. Un aperçu déposé en
  dernier masquerait le repérage au moment précis où l'utilisateur en a besoin.
  Ce rang ne bouge jamais ; ce qui varie, c'est quelles passes de repérage s'exécutent —
  voir la portée juste en dessous.

DEUX PORTÉES, DEUX RÈGLES — l'aperçu tient dans le cadre, ou couvre toute la scène
  DANS LE CADRE : ce qui précède s'applique intégralement. L'aperçu se lit CONTRE le
  ciel qui l'entoure, et le repérage est justement ce qui fait le lien entre les deux.

  SUR TOUTE LA SCÈNE : il n'y a plus d'entour, donc plus de lien à faire. L'aperçu EST
  la prise de vue, et les couches de repérage s'y superposent au lieu de la situer — un
  arc de filé qui passe sous une figure de constellation ne se lit plus comme une trace.
  Les passes de repérage ne s'exécutent donc pas : frontières, figures et astérismes de
  §3.4, bande de la Voie lactée et repère du centre galactique de §3.7, marqueurs
  d'objets du ciel profond, corps mobiles de §3.1, et TOUS les noms.
  QUATRE SURVIVANTS, et la raison est la même pour les quatre : ils CADRENT la prise de
  vue au lieu de l'annoter — le sol de §4.1, l'horizon avec ses quatre points cardinaux,
  le contour du cadre matériel de §3.5, et le TRAIT du plan galactique de §3.7. Aucun
  d'eux ne se dessine SUR l'image : ils disent où elle est prise, ce que le capteur en
  retient, et où passe la Voie lactée qui s'y voit. Chacun garde sa couche : éteinte au
  panneau Vue, elle l'est aussi sous l'aperçu.
  ÉTEINDRE N'EST PAS PERDRE. La sélection de §3.3 continue de tourner : les cibles
  restent cliquables au même pixel, et le survol reste la façon de lire un nom. Seule la
  PEINTURE est suspendue — même règle que les étoiles ponctuelles, que le filé remplace
  par ses arcs sans cesser de les désigner. §11.2 tient malgré tout : rien de critique ne
  dépend du seul survol, puisque décocher la case rend l'intégralité du repérage.

CADENCE — une image par changement de réglage, jamais soixante par seconde
  L'aperçu est recalculé au changement de pointage, de champ, de mode, d'instant, de
  matériel ou de réglage ; sinon l'image conservée est redéposée telle quelle. Le coût
  d'un arc par étoile est incompatible avec la contrainte de 60 Hz de §3.1 : c'est la
  seule raison de ce découplage, et non une économie de confort.

DEUX MENTIONS OBLIGATOIRES, parce que l'incrustation change ce qui est vrai
  1. VIGNETTAGE NON INCRUSTÉ. Il se centre sur le canevas de la scène, pas sur le cadre :
     incrusté tel quel, il assombrirait les coins de la SCÈNE et non ceux de l'image.
     Son atténuation en diaphragmes reste chiffrée au panneau (§9.2).
  2. PROJECTION DE LA SCÈNE ≠ PROJECTION DE L'OBJECTIF. La scène est stéréographique
     (§3.3) ; l'objectif déclaré produit du gnomonique ou de l'équidistant. Le contenu
     du cadre est donc à la bonne place dans le ciel, mais déformé autrement que sur le
     capteur. Un geste « voir comme l'objectif » recadre la scène sur le champ du cadre
     et lève l'écart.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `vue`, `matrice_ciel` | — | — | §3.1, §3.3 | CELLES DE LA SCÈNE |
| `cadre` | polylignes | — | §3.5 | borne la sélection |
| `duree_s` | float | s | §7.2 ou §9.3 | pose unitaire, ou durée accumulée |
| `image_apercu` | image | — | sortie | hors écran, redéposée telle quelle |
| `mention_vignettage` | string | — | sortie | obligatoire |
| `mention_projection` | string ou nul | — | sortie | nul si les modes coïncident |

### Critères d'acceptation

```gherkin
Étant donné un filé d'une heure et un cadre posé sur la scène
Quand l'aperçu est incrusté dans le cadre
Alors chaque arc part de la position réelle de son étoile sur la scène
Et les frontières, figures et labels du planétarium sont visibles par-dessus l'aperçu

Étant donné le même filé
Quand l'aperçu est peint sur toute la scène
Alors ni la bande de la Voie lactée, ni les frontières, figures et astérismes, ni
  aucun marqueur d'objet, aucun corps et aucun nom n'est peint
Et le sol, l'horizon avec ses points cardinaux, le contour du cadre et le trait du
  plan galactique le sont
Et les cibles cliquables sont les mêmes qu'à repères allumés
Et le survol nomme toujours l'élément qu'il désigne

Étant donné un aperçu incrusté et une animation du curseur temporel
Quand la scène est rendue
Alors l'aperçu n'est pas recalculé à chaque image
Et la fréquence ne descend pas sous le plancher de §3.1

Étant donné une scène en projection stéréographique et un objectif rectilinéaire
Quand l'aperçu est incrusté
Alors l'app énonce que la déformation du cadre n'est pas celle du capteur
Et propose de recadrer la scène sur le champ du cadre

Étant donné le vignettage chiffré à un diaphragme dans les coins    # cas limite
Quand l'aperçu est incrusté
Alors aucun assombrissement n'est peint sur la scène
Et la valeur en diaphragmes reste affichée au panneau
```

### Dépendances données

Agrège §3.3, §3.5, §9.1, §9.2, §9.3. Aucune source nouvelle. Fallback : total.

---

# 10 — Couche pédagogique intégrée

Cette section n'est pas un contenu parallèle mais une **couche transversale attachée aux sorties des moteurs**. Un guide séparé dériverait des calculs quand le registre §2.1 évolue, et deviendrait faux en silence.

## 10.1 Feature — Glossaire contextuel

**Feature** — Chaque terme technique affiché dans l'interface porte sa définition, consultable sur place, sans quitter l'écran. Persona : débutant, et confirmé sur les termes qu'il croit connaître.

### Règle métier

```
PRINCIPE — le glossaire est indexé sur l'interface, pas sur un lexique
  Un terme n'entre au glossaire que s'il APPARAÎT dans une sortie de moteur.
  Inversement, aucun terme affiché ne peut être absent du glossaire.
  → règle vérifiable automatiquement en compilation : l'ensemble des libellés de
    l'interface doit être inclus dans l'ensemble des clés du glossaire. Un terme
    ajouté sans définition casse le build. C'est ce qui empêche la dérive documentaire.

STRUCTURE D'UNE ENTRÉE — quatre champs, dans cet ordre
  1. GLOSE COURTE       cinq mots, affichée en survol
                        « masse d'air » → épaisseur d'atmosphère traversée
  2. EXPLICATION        deux à quatre phrases, au clic
  3. VALEUR EN CONTEXTE la valeur courante de l'utilisateur, pas un exemple abstrait
                        « ta masse d'air sur cette cible : 1,28 »
  4. CONSÉQUENCE        ce que ça change pour lui, en une phrase actionnable

  Le champ 3 distingue cette couche d'une encyclopédie. Le glossaire ne définit pas
  « échantillonnage » dans l'abstrait : il dit que le sien vaut 8,80 "/px et ce que
  ce nombre implique pour ses cibles.

TERMES OBLIGATOIRES — dérivés des sorties des moteurs, non exhaustif
  §5 échantillonnage · pitch · pouvoir séparateur · recadrage capteur · plein format
  §6 magnitude intégrée · magnitude surfacique · Bortle · SQM · fond de ciel ·
     nébuleuse en émission / réflexion / obscure · nébuleuse planétaire
  §7 bruit de lecture · double gain de conversion · SNR · intégration totale ·
     darks · flats · offsets · dithering · saturation
  §8 nuit astronomique · crépuscule nautique · culmination · méridien · masse d'air ·
     circumpolaire · déclinaison · ascension droite · angle horaire
  §9 NPF · filé · latitude galactique · projection rectilinéaire
  §3 temps sidéral · précession · astérisme · frontière IAU · indice B−V

DENSITÉ D'EXPLICATION — une seule, pour tous
  La glose sort au survol du terme, l'explication complète au clic. Aucun réglage de
  verbosité : il faisait choisir à l'utilisateur ce que le survol donne déjà, et un
  débutant n'a aucun moyen de savoir lequel des deux niveaux lui convient.
  → corollaire : aucune information critique ne dépend du seul survol (§11.2).
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `cle_terme` | string | — | — | identifiant stable |
| `contexte_valeur` | float ou string | variable | — | valeur courante de l'utilisateur |
| `glose`, `explication`, `consequence` | string | — | — | sortie |
| `sections_source` | array | — | — | traçabilité |

### Critères d'acceptation

```gherkin
Étant donné le terme « magnitude surfacique » affiché sur une fiche de cible
Quand je le survole
Alors une glose de cinq mots apparaît
Et le clic révèle l'explication, la valeur calculée pour cette cible et sa conséquence

Étant donné un libellé technique ajouté à l'interface sans entrée de glossaire  # cas limite
Quand le projet est compilé
Alors la compilation échoue en nommant le terme manquant

Étant donné un terme technique affiché n'importe où dans l'interface
Quand je le survole puis que je le clique
Alors son aide est atteignable par les deux gestes
Et aucune information critique ne dépend du seul survol

Étant donné un terme dont la valeur en contexte n'est pas encore calculée  # cas limite
Quand je l'ouvre
Alors la glose et l'explication s'affichent
Et le champ de valeur indique ce qu'il faut renseigner pour l'obtenir,
    sans valeur inventée
```

### Dépendances données

Glossaire embarqué, versionné avec le registre §2.1. Valeurs en contexte : sorties des moteurs. Fallback : total.

---

## 10.2 Feature — Explication de verdict

**Feature** — Tout verdict produit par un moteur est dépliable en la chaîne de calcul qui l'a produit, avec le facteur dominant nommé et le levier qui le déplacerait. Persona : tous. **C'est la feature qui remplace le guide.**

### Règle métier

```
PRINCIPE — un verdict sans chaîne de calcul est un oracle, et un oracle n'enseigne
rien et ne se conteste pas. Toute sortie des §6, §7, §8, §9 est dépliable.

TROIS NIVEAUX DE PROFONDEUR
  N1 VERDICT           une ligne, le résultat
     « photo seulement, environ 1 h pour un résultat correct »
  N2 FACTEUR DOMINANT  la variable qui décide, chiffrée, plus le levier
     « sa brillance de surface (23,0) est sous ton fond de ciel (20,95) : le signal
        est 7 fois plus faible que le ciel. Levier principal : un site plus sombre,
        pas plus de temps. »
  N3 CHAÎNE COMPLÈTE   toutes les étapes, chaque formule, chaque constante avec sa source
     SB_obj  = 5,7 + 8,63 + 2,5·log₁₀(71 × 42)          = 23,02
     SB_ciel = table Bortle §2.2, interpolation 4 → 5    = 20,95
     ΔSB     = −2,07                                     → verdict PHOTO_SEULE
     puis E_obj, E_ciel, t_opt, T_requis, N_poses, chacun avec sa formule

IDENTIFICATION DU FACTEUR DOMINANT — calculée, pas rédigée
  Pour chaque variable d'entrée, dérivée logarithmique de la sortie :
     sensibilite[v] = | ∂ln(sortie) / ∂ln(v) |
  La variable de plus forte sensibilité est le facteur dominant.
  → l'explication est GÉNÉRÉE DEPUIS LE CALCUL : elle ne peut pas divenger de lui.
    C'est la garantie structurelle qu'un guide rédigé ne peut pas offrir.

LEVIERS — hiérarchisés par coût croissant, jamais l'achat en premier
  changer de cible              gain immédiat, coût nul
  attendre un meilleur créneau  gain modéré, coût = report
  site plus sombre              gain fort en large bande, coût = déplacement
  plus de temps                 gain en √T : quadrupler le temps double le SNR
  filtre dual-band              gain fort mais UNIQUEMENT en émission (§7.5)
  focale différente             gain sur le cadrage, coût = achat
```

**Le point produit qui compte** : `PHOTO_SEULE` n'est pas un refus, c'est une durée. Le débutant qui lit « invisible » abandonne ; celui qui lit « 1 h d'intégration » sort son intervallomètre. Même physique, deux comportements.

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `verdict_id` | string | — | — | référence la sortie de moteur |
| `niveau_deploie` | enum | — | N1 / N2 / N3 | |
| `facteur_dominant` | string | — | sortie | nom de variable |
| `sensibilites` | objet | — | sortie | par variable d'entrée |
| `chaine_calcul` | array | — | sortie | étape, formule, valeur, source |
| `leviers` | array | — | sortie | ordonnés par coût croissant |

### Critères d'acceptation

```gherkin
Étant donné un verdict PHOTO_SEULE sur une galaxie depuis un site Bortle 4,5
Quand je déplie au niveau N2
Alors le facteur dominant nommé est la brillance de surface de l'objet
Et le levier de premier rang est le changement de site, pas l'achat de matériel

Étant donné le même verdict déplié au niveau N3
Quand je lis la chaîne
Alors chaque étape porte sa formule et sa valeur
Et chaque constante utilisée renvoie à son entrée de registre §2.1

Étant donné une cible exclue pour cause de relief local            # cas limite
Quand je déplie l'explication
Alors le masque d'horizon est nommé comme cause, avec l'azimut et l'altitude d'obstruction
Et l'app distingue cette cause d'une exclusion par hauteur de culmination

Étant donné deux variables de sensibilité très proche              # cas limite
Quand le facteur dominant est identifié
Alors les deux sont présentées conjointement
Et l'app n'en désigne pas une arbitrairement

Étant donné un verdict favorable
Quand je le déplie
Alors la chaîne de calcul est disponible au même titre qu'un verdict défavorable
```

### Dépendances données

Sorties de tous les moteurs, registre §2.1. Aucune source nouvelle. Fallback : total.

---

## 10.3 Feature — Recommandation d'équipement contextuelle

**Feature** — Généralise le conseil filtre de §7.5 : l'application ne recommande un achat que lorsque l'absence de cet équipement est le facteur dominant d'un verdict défavorable, après épuisement des leviers gratuits.

### Règle métier

```
CONDITIONS CUMULATIVES DE DÉCLENCHEMENT — les quatre, sans exception
  1. un verdict est défavorable
  2. l'équipement absent est le facteur dominant identifié en §10.2
  3. les leviers de coût inférieur ont été présentés d'abord
  4. l'utilisateur a déplié l'explication — JAMAIS en affichage spontané

INTERDIT
  aucun bandeau, aucune notification, aucune suggestion en liste de cibles,
  aucun lien commercial, aucune marque nommée, aucun prix.
  L'app nomme une CATÉGORIE d'équipement et chiffre le gain. Elle ne vend rien.

FORME — toujours un différentiel calculé par les moteurs existants
  « sans : T_requis = X — avec : T_requis = Y — rapport : Z »
  Jamais un gain annoncé qualitativement.

CATALOGUE DE CATÉGORIES ET DE LEURS CONDITIONS
  filtre dual-band       si type = EMISSION et (Lune levée ou Bortle ≥ 5)
                         → recalcul de E_ciel avec la bande passante transmise
                         JAMAIS sur galaxie, réflexion, amas, nébuleuse obscure :
                         ces objets émettent en continu, le filtre coupe leur signal
  focale plus longue     si verdict_cadrage = CADRAGE_PERDU ou HORS_DOMAINE
                         → focale nécessaire calculée pour un remplissage de 42 %
  focale plus courte     si MOSAIQUE_REQUISE et n_tuiles > 4
  monture de suivi       si absence de suivi et t_opt >> NPF (régime LIMITE_SUIVI)
                         → gain chiffré en pose unitaire et en cibles débloquées
  autoguidage            si régime LIMITE_SUIVI persistant malgré mise en station
                         soignée et t_max_suivi au plafond C-07

JAMAIS RECOMMANDÉ
  Un équipement dont le gain n'est pas calculable par les moteurs existants.
  Pas de « un meilleur capteur donnerait de plus belles images » : non chiffrable,
  donc hors périmètre. Même contrainte que celle du socle sur les éphémérides :
  pas de nombre sans formule ni source.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `equipement_possede` | set | — | — | profil §5, filtres inclus |
| `facteur_dominant` | string | — | §10.2 | condition 2 |
| `leviers_presentes` | array | — | §10.2 | condition 3 |
| `categorie_recommandee` | enum | — | 6 valeurs | sortie |
| `gain_sans`, `gain_avec` | float | variable | sortie | recalcul par les moteurs |
| `rapport_gain` | float | — | sortie | |

### Critères d'acceptation

```gherkin
Étant donné une nébuleuse en émission, Lune gibbeuse levée, aucun filtre possédé
Quand je déplie l'explication du verdict
Alors les leviers gratuits sont présentés avant toute recommandation d'achat
Et le filtre dual-band apparaît avec les deux durées d'intégration calculées

Étant donné une galaxie et aucun filtre possédé                     # cas limite
Quand je déplie l'explication
Alors aucun filtre n'est recommandé
Et l'app indique que seuls un site plus sombre ou plus de temps aideront

Étant donné un verdict défavorable non déplié
Quand je consulte la liste de cibles
Alors aucune recommandation d'équipement n'apparaît

Étant donné une recommandation affichée
Quand je la lis
Alors aucune marque, aucun modèle et aucun prix n'y figurent
Et le gain est exprimé par un différentiel calculé

Étant donné un équipement déjà déclaré au profil
Quand un verdict défavorable est déplié
Alors cet équipement n'est plus recommandé et est intégré au calcul
```

### Dépendances données

Table de transmission par famille de filtres (bande passante en nm), quelques dizaines de lignes, embarquée. Aucune donnée commerciale, aucun réseau. Fallback : total.

---

# 11 — Mode nuit et ergonomie terrain

## 11.1 Feature — Mode nuit

**Feature** — Rendu monochrome rouge profond préservant l'adaptation à l'obscurité. Persona : usage sous le ciel.

### Règle métier

```
POURQUOI LE ROUGE — la physiologie décide, pas l'esthétique
  Les bâtonnets rétiniens assurent la vision nocturne. Leur sensibilité culmine
  vers 498 nm et s'effondre au-delà de ~640 nm.
  → une lumière rouge profond (> 620 nm) est vue par les cônes sans blanchir
    les bâtonnets.
  Adaptation à l'obscurité : 20 à 30 min pour être complète.
  Elle est détruite en QUELQUES SECONDES par une lumière blanche.
  → une seule fenêtre blanche annule une demi-heure d'attente. C'est pourquoi le
    mode nuit doit être GLOBAL ET SANS EXCEPTION, pas un thème sombre.

IMPLÉMENTATION — extinction de canaux, pas filtre de teinte
  sortie = (R, 0, 0)   canaux vert et bleu STRICTEMENT nuls
  luminance_rouge = luminance_source × facteur_global
  facteur_global réglable jusqu'à un plancher de ≈ 2 % de la luminance nominale

  Un filtre de teinte appliqué par-dessus une interface claire ÉCHOUE : la luminance
  globale reste trop élevée.
  → l'ensemble de la palette est CONÇUE en rouge sur noir, pas teintée.

DALLES — limite matérielle à annoncer une fois
  OLED : le noir est un pixel éteint, extinction réelle des canaux V et B.
  LCD  : le rétroéclairage traverse toujours ; un noir affiché reste émissif et une
         fuite de bleu subsiste. Le mode nuit est efficace mais imparfait.

RÈGLES ABSOLUES
  - Aucune surface blanche, aucun flash de transition, aucune modale claire.
  - Prévisualisations §9.2 et §9.3 elles aussi composées en rouge monochrome.
  - Le rouge ne porte JAMAIS seul une information : sur fond rouge, une alerte se
    distingue par la forme, l'icône ou la luminance.
  - Passage en mode nuit : transition progressive, jamais un basculement brutal.
  - Persistance : le mode reste actif au redémarrage et entre les vues.

ARBITRAGE AVEC `prefers-reduced-motion` — les deux règles sont tenables
  La préférence système demande qu'aucun mouvement ne s'impose ; la règle ci-dessus
  interdit le basculement brutal et le flash. Elles ne s'opposent pas, parce que la
  transition du mode nuit NE DÉPLACE RIEN : c'est un fondu de luminance.
  → ce qui est coupé sous la préférence est la DURÉE du fondu, pas son existence :
    assez court pour ne plus se lire comme une animation, jamais nul, car zéro
    redeviendrait le flash proscrit.
  → le cas qui justifie la règle est l'auto-activation au crépuscule : là, le
    basculement n'est pas demandé au moment où il se produit.
  Cette règle vaut pour toute l'interface, pas seulement le mode nuit : aucune
  animation non sollicitée ne s'impose sous la préférence (§11.2).
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `mode_nuit_actif` | bool | — | — | persistant |
| `luminance_facteur` | float | — | 0,02 – 1,0 | plancher à 2 % |
| `type_dalle` | enum | — | OLED / LCD / INCONNU | déclaratif, informatif |
| `auto_activation` | enum | — | JAMAIS / AU_CREPUSCULE / MANUEL | lié à §8.1 |

### Critères d'acceptation

```gherkin
Étant donné le mode nuit activé
Quand je parcours toutes les vues de l'application
Alors aucun pixel ne présente de composante verte ou bleue non nulle
Et aucune surface blanche n'apparaît, y compris dans les modales et les transitions

Étant donné une prévisualisation de filé affichée en mode nuit
Quand elle est rendue
Alors elle est composée en rouge monochrome
Et son étoile la plus brillante ne dépasse pas la luminance plafond du mode

Étant donné une alerte à afficher en mode nuit                      # cas limite
Quand elle est composée
Alors elle se distingue par la forme ou l'icône, pas uniquement par la couleur

Étant donné auto_activation = AU_CREPUSCULE et le crépuscule nautique atteint
Quand l'instant est franchi
Alors le mode nuit s'active par transition progressive
Et aucun flash n'est produit pendant le basculement

Étant donné une dalle LCD déclarée
Quand j'active le mode nuit
Alors l'app indique UNE FOIS que l'extinction ne peut être totale sur cette technologie

Étant donné la préférence système « mouvement réduit » active           # cas limite
Quand le mode nuit s'active au crépuscule
Alors le fondu est raccourci sans être supprimé
Et aucun flash n'est produit
```

### Dépendances données

Instants de crépuscule : §8.1. Aucune source externe. Fallback : total.

---

## 11.2 Feature — Ergonomie de consultation nocturne

**Feature** — Contraintes d'interface applicables quand l'application est consultée sous le ciel plutôt qu'en préparation. Persona : terrain.

### Règle métier

```
Le MVP est un outil de PRÉPARATION sur poste de bureau (§12.1). Les contraintes
ci-dessous s'appliquent néanmoins, parce qu'un plan de session est consulté sur
place, y compris sur un écran d'ordinateur portable dans une voiture.

  - Aucune information critique dépendant du survol : tout est accessible au clic.
  - Cibles de clic ≥ 44 px, compatibles avec un usage ganté sur écran tactile.
  - Le plan de session §8.3 est imprimable et exportable en texte : un plan qui
    exige un écran allumé pendant trois heures est un plan qui vide la batterie.
  - Aucune animation décorative : ni image clé, ni défilement lissé, ni transition
    de position. Le mode nuit ne change QUE les couleurs — il ne retire aucune
    commande et n'interrompt pas le curseur temporel §3.2, qu'on règle sous le ciel
    comme en préparation.
  - Toute valeur affichée sur le terrain porte son unité. Un « 13 » sans unité est
    une source d'erreur de manipulation.
```

### Critères d'acceptation

```gherkin
Étant donné un plan de session produit
Quand je demande l'export
Alors un document texte imprimable contient les cibles, créneaux, poses, nombres
    d'images et consignes de calibration

Étant donné le mode nuit activé pendant une avance rapide du curseur temporel
Quand la bascule s'opère
Alors seules les couleurs changent, le curseur temporel continue d'avancer
    et aucune commande ne disparaît

Étant donné une valeur de pose affichée n'importe où dans l'interface  # cas limite
Quand je la lis
Alors son unité est présente
```

### Dépendances données

Aucune. Fallback : total.

---

## 11.3 Feature — Coque : la scène occupe l'écran, le mode commande le reste

**Feature** — Disposition d'ensemble de l'application : une scène qui prend toute la surface, les réglages posés dessus en cartes déplaçables, un panneau latéral toujours ouvert dont le contenu suit le mode courant, et les gestes de terrain dans les deux barres. Persona : tous. C'est ce qui rend l'effet d'un réglage immédiatement visible.

### Règle métier

```
PRINCIPE — l'application est un planétarium, elle doit se lire comme un planétarium
  Une pile de sections dans une colonne unique oblige à faire défiler pour voir l'effet
  d'un changement de focale sur un cadre. Le geste et sa conséquence doivent tenir dans
  le même écran, sans défilement — sinon l'utilisateur ne relie pas les deux.
  Trois colonnes ne tenaient la promesse qu'à moitié : deux panneaux latéraux laissaient
  à la scène la moitié de la fenêtre, et un cadre de 0,8° se jugeait dans ce qui restait.
  La scène prend donc TOUTE la surface, et ce qui la commande se pose dessus.

LE MODE EST L'ÉTAT DE PREMIER RANG — et il est le seul de ce rang
  CIEL PROFOND (défaut)  planétarium complet, temps libre
  PANORAMA               l'aperçu de §9.5 peint sur toute la scène, temps figé, repérage
                         réduit à ses quatre survivants
  Le mode commande DEUX choses à la fois : ce que la scène peint (§9.5) et ce que le
  panneau latéral porte. Un état de cette portée ne se règle pas dans une case à cocher
  de troisième niveau — il se bascule depuis la barre haute, d'un seul geste.
  Il n'existe aucun autre commutateur de ce rang, et aucun choix de panneau à faire.

CINQ RÉGIONS, ET LA COQUE N'EN CONNAÎT AUCUN CONTENU
  BARRE HAUTE  identité, lecture du matériel, bascule de mode, gestes de terrain
  SCÈNE        toute la surface. ELLE NE DÉFILE PAS, et sa taille ne dépend pas de la
               longueur des lectures affichées ailleurs.
  CARTES       posées SUR la scène : ce qui se règle ou se consulte en la regardant
  PANNEAU      à droite, à demeure : ce qui se lit en longueur, selon le mode
  BARRE BASSE  le lieu, la visée, le transport du temps
  L'ordre du DOM est l'ordre de tabulation, et il suit la lecture, pas la position à
  l'écran : barre haute, scène, cartes, panneau, barre basse.

LE PANNEAU LATÉRAL EST TOUJOURS OUVERT — dans les deux modes
  Il ne se ferme pas : ce qu'il porte est ce que le mode courant demande de lire, et une
  région dont le mode décide le rôle n'a pas à être ouverte à la main.
  EN CIEL PROFOND, deux états : la LISTE des cibles, et la FICHE de la cible désignée qui
  prend sa place. Un geste de retour rend la liste. Un clic sur un objet de la scène ouvre
  la fiche : le contrat de §3.4 est tenu par le panneau, plus par une carte — la fiche est
  une lecture longue, elle ne tient pas dans un conteneur étroit posé sur le ciel qu'on
  vient justement de désigner.
  EN PANORAMA, un seul état : les réglages du panorama.

LES CARTES — Matériel, Vue, Plan de nuit
  Déplaçables, repliables, non persistées : leur position est un confort de séance, pas un
  réglage. Elles portent ce qui se règle en regardant la scène — matériel, vue — et ce qui
  se consulte en la regardant : on vérifie l'heure du prochain créneau sans quitter le ciel
  des yeux. Repliée, une carte ne monte pas son corps — c'est ce qui garantit que rien
  d'invisible ne se recalcule.

ORDRE DES GESTES DANS LA BARRE HAUTE — c'est un contrat, pas une mise en page
  1. mode nuit       : il se cherche dans le noir, il vient donc en premier
  2. bascule de mode : l'état le plus lourd de l'écran ne se cherche pas dans un coin —
                       elle occupe le centre de la barre, et son centrage ne dépend pas
                       de la longueur de ce qui la précède
  3. un seul menu    : vérification (§12.1, §12.3) puis réglages — ce qui sort du chemin
                       principal, dernier élément, donc le plus à droite, et SANS HAUTEUR
                       tant qu'il est fermé
  Un menu fermé qui porte une alerte le signale sur lui-même : sinon l'information
  n'existe que pour qui pense à ouvrir le menu.

UNE SEULE LECTURE PERMANENTE — au centre de la barre basse
  L'instant, la visée en AD/δ, l'azimut, la hauteur, le champ. C'est ce qui DATE
  l'image : on la consulte en visant, elle ne peut donc pas être derrière un clic.
  Sa place est entre le lieu (à gauche) et le transport du temps (à droite) — les
  trois repères qui situent la séance, sur la même ligne.
  Elle est composée UNE FOIS et sert aussi de description accessible du canevas :
  deux rédactions divergeraient au premier `toFixed` retouché.
  Elle est la seule chose de cette barre qui se rogne sur une fenêtre étroite : une
  commande amputée ne se rattrape pas, une phrase tronquée se relit en élargissant.
  Le reste — magnitude limite, époque de précession, cadrage de la cible dominante,
  diagnostic de rendu — n'est PAS affiché : ce sont des lectures d'atelier, et aucune
  des personas de §1 ne mesure le rendu.

LE PLAN DE SESSION EST RENDU EN PERMANENCE
  Il reste la SEULE région imprimable (§11.2), y compris carte repliée et y compris en mode
  Panorama. Un plan démonté sortirait une page blanche ; un second exemplaire monté ailleurs
  doublerait son export et son étiquette accessible. Il y en a donc UN seul, toujours dans
  le document, masqué et non démonté quand sa carte est repliée — c'est l'exception explicite
  à la règle de démontage ci-dessus, et la seule.

REPLI EN UNE COLONNE — sous une largeur seuil
  Les cartes et le panneau quittent la scène et se dépilent sous elle dans le flux vertical ;
  la scène redevient une image en 16/9. Un écran étroit n'a pas la place d'une carte
  déplaçable, et le déplacement n'ouvre l'accès à aucune fonction : il n'y a rien à remplacer.
  Le repli est porté par la seule feuille de style — aucune détection de largeur en
  JavaScript, donc aucun écart entre la mise en page et l'état réel des régions.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `mode` | enum | — | CIEL_PROFOND / PANORAMA | état de premier rang, partagé avec la scène |
| `panneau_etat` | enum | — | LISTE / FICHE | Ciel profond seulement ; le retour rend LISTE |
| `cartes_repliees` | set | — | matériel / vue / plan | non persisté |
| `menu_ouvert` | bool | — | — | menu unique de la barre haute |
| `alerte_menu` | bool | — | — | signalée sur le menu fermé |

### Critères d'acceptation

```gherkin
Étant donné l'application ouverte au-dessus de la largeur seuil
Quand je change la focale à la carte Matériel
Alors le cadre de la scène change sans aucun défilement
Et la scène n'a pas changé de taille

Étant donné l'application au premier démarrage
Quand elle s'affiche
Alors le mode est Ciel profond et le panneau latéral porte la liste des cibles

Étant donné l'application ouverte
Quand je regarde la barre basse
Alors elle porte en son centre l'instant, la visée en AD/δ, l'azimut, la hauteur et le champ
Et cette phrase est mot pour mot la description accessible du canevas

Étant donné une fenêtre trop étroite pour la barre basse entière      # cas limite
Quand je la regarde
Alors c'est la phrase de visée qui se rogne, pas le transport du temps

Étant donné un clic sur un objet du ciel profond dans la scène
Quand la fiche s'ouvre
Alors elle prend la place de la liste dans le panneau latéral, garnie de cet objet
Et un geste de retour rend la liste

Étant donné le mode Panorama
Quand je regarde le panneau latéral
Alors il est ouvert et porte les réglages du panorama
Et aucun geste ne permet de le fermer

Étant donné le mode Panorama, un plan de session produit et sa carte repliée  # cas limite
Quand je lance l'impression
Alors le plan de session est imprimé, pas une page blanche

Étant donné une largeur d'écran sous le seuil de repli              # cas limite
Quand j'affiche l'application
Alors les cartes et le panneau se dépilent sous la scène dans le flux vertical
Et la scène reste au-dessus d'eux

Étant donné une alerte de vérification et le menu de la barre haute fermé  # cas limite
Quand je regarde la barre haute
Alors le menu fermé porte le signalement
```

### Dépendances données

Aucune. Fallback : total.

---

# 12 — Données et architecture offline

## 12.1 Feature — Application web installable

**Feature** — Application web progressive fonctionnant hors réseau après première visite, sans installation d'exécutable. Persona : préparation depuis un poste de travail.

### Règle métier

```
STACK MVP
  Rendu        CANVAS 2D. La rédaction initiale imposait WebGL 2 ; la contrainte de
               §3.1 — « ajouter des étoiles ne dégrade pas mesurablement la fréquence »
               — est tenue en 2D, parce que ce qui la tient n'est pas le GPU mais
               l'indexation spatiale et l'arrêt par magnitude de §3.3 : le nombre
               d'étoiles EXAMINÉES par image ne dépend pas de la taille du catalogue.
               → WebGL 2 n'est donc PAS un prérequis, et rien ne le sonde : une
                 capacité qui ne conditionne aucune fonction n'a pas à être mesurée
                 ni affichée (§10.1). Le démarrage ne vérifie que ce qui porte une
                 conduite à tenir — catalogues et stockage (§12.2, §12.3).
               → WebGPU et WebGL 2 restent ouverts si un profil de rendu le justifie,
                 mesure à l'appui. Aucun des deux n'est une dette.
  Coquille     Service Worker + Cache API → code, styles, polices
  Données      IndexedDB → catalogues binaires, masques d'horizon, profils
  Calcul lourd sur le thread de rendu tant qu'aucun blocage n'est MESURÉ ; en Web
               Worker dès qu'il l'est (voir la règle ci-dessous)
  Rendu hors   OffscreenCanvas pour les aperçus de §9.2 et §9.3, incrustés dans le
    du canevas   cadre (§9.5) : une image par changement de réglage, redéposée telle
                 quelle à chaque image de la boucle
  HTTPS obligatoire (prérequis Service Worker et stockage persistant)

  Aucun WebAssembly : le décodeur RAW a disparu avec la calibration (Annexe C, 9).

RÈGLE D'ARCHITECTURE — LA MESURE TRANCHE, PAS LE PRINCIPE
  §3.1 exige 60 Hz soutenus, et §12.1 exige qu'une planification de séance ne fasse
  pas tomber le rendu sous 50 Hz. Ce sont les critères ; le Worker est un moyen.
  La rédaction initiale posait « tout calcul non lié à l'image courante part en
  Worker, sans exception » — une règle d'implémentation déguisée en exigence, et le
  découplage de cadence de §9.5 obtient le même résultat sans thread supplémentaire.
  → EXIGENCE : aucune interaction ne fait tomber la fréquence sous le plancher, et
    un calcul dépassant ce budget affiche une progression au lieu de figer l'écran.
  → MOYEN : Worker dès qu'un profil de rendu montre un blocage au-delà du budget.
    Le déporter avant la mesure ajoute un protocole de messages et une copie de
    données pour un gain non constaté.

INSTALLABILITÉ — deux fois utile
  1. usage en fenêtre dédiée, sans barre d'adresse, cohérent avec le mode nuit §11
  2. l'installation est un critère d'octroi du stockage persistant (§12.3)
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `sw_enregistre` | bool | — | — | |
| `app_installee` | bool | — | — | influe sur §12.3 |
| `mode_reseau` | enum | — | EN_LIGNE / HORS_LIGNE / DEGRADE | sortie |
| `version_donnees` | string | — | semver | pilote les migrations |

### Critères d'acceptation

```gherkin
Étant donné une première visite sur un poste de bureau
Quand l'application se charge
Alors la coquille et les catalogues sont mis en cache
Et l'app annonce sa disponibilité hors réseau, en précisant les fonctions qui en dépendent

Étant donné un navigateur sans WebGL 2                              # cas limite
Quand l'application démarre
Alors le planétarium §3 et les prévisualisations §9 restent disponibles :
    aucune fonction ne dépend de WebGL 2
Et le tiroir de vérification ne mentionne pas WebGL 2 : rien ne le sonde

Étant donné une planification de session lancée pendant une animation à ×600
Quand le calcul s'exécute
Alors la fréquence d'images ne descend pas sous 50 Hz
Et une progression est affichée sans figer le curseur temporel
Et le moyen employé — thread de rendu ou Worker — est indifférent au critère

Étant donné le catalogue complet et le planétarium animé
Quand je mesure la fréquence d'images
Alors elle reste au-dessus de 50 Hz sans WebGL 2
Et ajouter des étoiles au catalogue ne la dégrade pas mesurablement (§3.1, §3.3)

Étant donné une perte de réseau en cours de session de travail
Quand je poursuis mon travail
Alors mode_reseau passe à HORS_LIGNE
Et seules les fonctions listées en §12.5 sont dégradées, les autres inchangées

Étant donné l'application servie en HTTPS
Quand le navigateur évalue l'installabilité
Alors le manifeste, le service worker et les icônes exigées sont présents et servis
Et l'installation en fenêtre dédiée aboutit, condition d'octroi du stockage de §12.3
```

### Dépendances données

Aucune. L'application est elle-même le fallback.

---

## 12.2 Feature — Budget de données embarquées

**Feature** — Ensemble minimal de données packagées avec l'application, dimensionné par calcul et non par estimation.

### Règle métier

```
ENCODAGE BINAIRE PAR ÉTOILE — jamais du CSV, jamais du JSON
  AD     float32  4 octets    précision 0,13" : suffisante
  δ      float32  4 octets
  mag V  int16    2 octets    échelle ×100, plage −3 à +16
  B−V    int16    2 octets    échelle ×1000
                 ─────────
                 12 octets par étoile

  HYG v4.1, coupure stricte à mag ≤ 9 : 83 479 × 12 = 1,00 Mo, comptage MESURÉ
    + désignations et noms propres, dans le paquet des tracés de repérage
    → contre ~30 Mo pour le CSV source : le facteur 30 vient de l'encodage seul.
```

La colonne « mesuré » porte la taille du paquet réellement construit par `pnpm data:build`, relevée sur le manifeste. Elle prévaut sur l'estimation : c'est le volume que le navigateur télécharge.

| Jeu de données | Volume calculé | Mesuré | Base du calcul |
|---|---|---|---|
| HYG v4.1 (mag ≤ 9) | 1,7 Mo | **0,96 Mo** | 83 479 × 12 o, comptage mesuré |
| OpenNGC + addendum | 1,2 Mo | **0,43 Mo** | 12 518 × 28 o + bloc de chaînes |
| Sharpless (271 après filtrage NGC/IC) + Barnard (343) | < 0,1 Mo | **0,02 Mo** | 614 objets Stellarium DSO v3.23, Caldwell hors périmètre |
| Frontières IAU B1875 + figures + astérismes + étoiles nommées | < 0,25 Mo | **0,26 Mo** | un seul paquet, JSON en UTF-8 |
| Masque Voie lactée procédural | ≈ 0,5 Mo | **0 Mo** | calculé à l'exécution, aucune donnée |
| Base matériel (boîtiers, capteurs, filtres) | ≈ 0,2 Mo | **dans le code** | `src/data/boitiers.md`, table markdown lue telle quelle |
| Glossaire §10.1 | ≈ 0,1 Mo | **dans le code** | clés typées, pas un fichier |
| Code applicatif (aucun WASM) | 3 – 5 Mo | **0,56 Mo** | un fragment JS + une feuille CSS |
| **Paquet de base — total** | ≈ 7 – 9 Mo | **≈ 2,4 Mo** | tout `dist/`, icônes comprises |
| Paquet Gaia DR3 (mag ≤ 11) | ≈ 12 Mo | **hors MVP** | reporté, voir ci-dessous |

Trois écarts à l'estimation initiale, tous dans le même sens : le masque de Voie lactée est procédural donc pesant zéro, la base matériel et le glossaire vivent dans le code plutôt qu'en données, et le décodeur RAW en WebAssembly a disparu avec la calibration (Annexe C, décision 9). Le budget de 10 Mo de §12.2 n'est donc pas la contrainte : c'est l'éviction de §12.3.

**Le volume n'est pas une contrainte du choix web** : sept à neuf mégaoctets est l'ordre de grandeur d'une page d'actualité chargée d'images.

```
LE PAQUET GAIA EST REPORTÉ HORS MVP
  Le raisonnement ci-dessous reste valide : 12 Mo et une passe de dessin rendent le
  zoom à 5° techniquement atteignable en web, et le volume n'est pas la contrainte.
  Il est reporté pour une autre raison — le PLANCHER DE ZOOM N'EST PAS UNE PROMESSE
  DU PRODUIT. Aucune décision de capture ne se prend à 5° de champ avec un matériel
  dont le domaine est 3,79° à 5,69° de fenêtre de cadrage : le persona primaire vit
  entre 15° et 130° de champ. Multiplier par six le volume téléchargé pour un zoom
  que le cas d'usage n'atteint pas est le mauvais arbitrage.
  → l'application plafonne à 15° de champ, le déclare, et complète par le semis
    génératif de §9.2 en le déclarant lui aussi (§3.3). C'est le comportement livré.
  → le paquet Gaia rejoint la liste post-MVP de §14, avec l'imagerie HiPS : les deux
    achètent du réalisme visuel contre du volume, et aucun des deux ne change une
    décision d'observation.

CONSÉQUENCE SUR LE ZOOM — le plafond de 15° n'était pas nécessaire
  Comptage stellaire intégré : facteur ≈ 3 par magnitude dans la plage 6–12.
     mag ≤ 9  : 83 479 (HYG v4.1, mesuré) → 2,02 étoiles/deg²
     mag ≤ 11 : ordre de 1e6          → 24,2 étoiles/deg²   [À VÉRIFIER]
  Un champ de 5° × 3,3° = 16,5 deg² contient ≈ 48 étoiles avec HYG seul (le ciel
  paraît vide) et ≈ 400 avec Gaia (rendu crédible).
  Coût GPU : 1e6 points en un seul tampon de sommets, une passe de dessin.
  → 12 Mo et une passe de dessin. Le sous-ensemble Gaia est TECHNIQUEMENT faisable en
    web, et la conclusion tient sur toute la fourchette d'incertitude du comptage.
    Ce n'est pas la technique qui l'a écarté du MVP, c'est l'usage : voir ci-dessus.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `paquets_donnees` | array | — | — | nom, version, volume, obligatoire |
| `volume_total_mo` | float | Mo | sortie | |
| `gaia_charge` | bool | — | — | hors MVP : toujours faux, plancher de zoom à 15° |
| `progression_chargement` | float | % | sortie | |

### Critères d'acceptation

```gherkin
Étant donné une première visite
Quand le paquet obligatoire est téléchargé
Alors son volume ne dépasse pas 10 Mo
Et chaque paquet est vérifié par sa somme de contrôle avant d'alimenter un verdict

Étant donné un zoom au plancher de champ du catalogue chargé
Quand le rendu est produit
Alors l'app affiche le rendu réel complété par le semis, en le déclarant
Et nomme le catalogue qui abaisserait le plancher, sans le télécharger d'office

Étant donné un catalogue décodé depuis son format binaire
Quand je compare 100 positions à la source de référence
Alors l'écart maximal reste inférieur à 1 seconde d'arc

Étant donné une nouvelle version de catalogue publiée               # cas limite
Quand l'application démarre en ligne
Alors la migration s'effectue sans perte des profils
Et l'ancienne version reste utilisable si la migration échoue
```

### Dépendances données

HYG v4.1, OpenNGC, Sharpless, Barnard, Caldwell, frontières Delporte (1930), figures Stellarium. Gaia DR3 : hors MVP. Fraîcheur : statique, versionnée. Fallback : intégral — c'est l'objet de la feature.

---

## 12.3 Feature — Persistance du stockage et résistance à l'éviction

**Feature** — Garantit que les catalogues et les données produites par l'utilisateur survivent à la pression disque. **C'est la vraie contrainte du choix web, et elle n'est pas le volume.**

### Règle métier

```
LE PROBLÈME
  Par défaut, le stockage navigateur est en mode « meilleur effort » (best-effort) :
  le navigateur peut l'effacer sans avertissement sous pression disque.
  → 9 Mo de catalogues effacés silencieusement = application vide au prochain
    démarrage hors réseau, sur le terrain, sans moyen de la recharger.
  LE VOLUME N'EST PAS LE RISQUE. L'ÉVICTION EST LE RISQUE.

LA PARADE
  navigator.storage.persist()   demande le mode persistant
  navigator.storage.persisted() vérifie l'état accordé
  navigator.storage.estimate()  quota et usage courants

  L'octroi n'est PAS garanti et dépend du navigateur : selon les moteurs, il repose
  sur l'installation de l'app, la mise en favori, un score d'engagement, ou une
  invite explicite. [À VÉRIFIER : les politiques varient et changent entre versions.]

STRATÉGIE À TROIS ÉTAGES
  1. Demander persist() dès la première visite, APRÈS la première action utile.
     Une demande non motivée au chargement est refusée par réflexe.
  2. Vérifier persisted() à CHAQUE démarrage. Si faux, avertir explicitement :
     « données susceptibles d'être effacées, installe l'application pour les protéger ».
  3. Vérifier l'intégrité des catalogues au démarrage (somme de contrôle).
     Absents ou corrompus + hors réseau → mode dégradé documenté, jamais un écran
     blanc ni une erreur technique brute.

QUOTA — non contraignant ici
  Les quotas par origine s'expriment en fraction de l'espace disque disponible, de
  l'ordre de plusieurs gigaoctets sur un poste de bureau courant. [À VÉRIFIER : les
  fractions diffèrent par navigateur.] Nos ~21 Mo sont deux à trois ordres de
  grandeur en dessous. → ne pas concevoir contre le quota.

CE QUI DOIT ÊTRE SAUVEGARDABLE PAR L'UTILISATEUR
  Les catalogues sont retéléchargeables ; les profils matériel, les sites, les masques
  d'horizon édités à la main et les plans de session enregistrés ne le sont pas.
  → export JSON manuel OBLIGATOIRE au MVP. Une éviction ne doit jamais détruire
    une donnée que l'utilisateur a produite.
```

### Entrées / Sorties

| Champ | Type | Unité | Plage valide | Note |
|---|---|---|---|---|
| `stockage_persistant` | bool | — | — | résultat de `persisted()` |
| `quota_mo`, `usage_mo` | float | Mo | `estimate()` | |
| `integrite_catalogues` | enum | — | OK / PARTIEL / ABSENT | somme de contrôle |
| `derniere_sauvegarde` | datetime | — | — | export utilisateur |
| `donnees_utilisateur` | objet | — | — | profils, sites, masques, plans |

### Critères d'acceptation

```gherkin
Étant donné une première visite et une première action utile accomplie
Quand la persistance est demandée
Alors l'app affiche le résultat obtenu
Et si elle est refusée, elle explique le risque et propose l'installation

Étant donné un stockage vidé par le navigateur entre deux sessions   # cas limite majeur
Quand l'application démarre hors réseau
Alors elle détecte l'absence de catalogues et l'annonce clairement
Et propose de recharger dès le retour du réseau
Et ne présente ni écran blanc, ni erreur technique brute

Étant donné des profils matériel et des sites enregistrés
Quand je déclenche l'export
Alors un fichier JSON unique contient l'intégralité des données que j'ai produites
Et son réimport les restaure sans perte

Étant donné un catalogue partiellement écrit après interruption      # cas limite
Quand l'intégrité est vérifiée au démarrage
Alors le paquet est marqué invalide et retéléchargé
Et l'app ne sert jamais un catalogue tronqué comme complet
```

### Dépendances données

API StorageManager du navigateur. Fallback : avertissement explicite plus export manuel.

---

## 12.4 Feature — Éphémérides côté client

**Feature** — Calcul de toutes les positions astronomiques dans le navigateur, sans appel réseau. Persona : moteur interne, consommé par §3, §8, §9.

### Règle métier

```
CHOIX D'IMPLÉMENTATION — trois options, une retenue
  A. APPEL SERVEUR (bibliothèque Python derrière une API)
     → casse l'offline, ajoute une latence à chaque image du curseur temporel §3.2.
       Incompatible avec l'animation continue. ÉCARTÉE.
  B. NOYAUX JPL (DE440s ≈ 32 Mo, DE421 ≈ 17 Mo) lus en JS
     → volume acceptable, mais impose un parseur SPK et une interpolation Chebyshev
       à écrire. Précision très supérieure au besoin. SURDIMENSIONNÉE.
  C. SÉRIES ANALYTIQUES PORTÉES EN JS                          ← RETENUE
     VSOP87 (planètes) + ELP2000 (Lune), tronquées, en JavaScript.
     AUCUN fichier de données : la précision vient du code, pas d'un téléchargement.
     Bibliothèques existantes sous licence permissive.
     Précision de l'ordre de la minute d'arc sur plusieurs millénaires
     [À VÉRIFIER dans la documentation de la bibliothèque retenue].

ADÉQUATION DE LA PRÉCISION AU BESOIN
  Position planétaire dans le planétarium (32 px/°)   tolérance ≈ 2'    suffisant
  Instants de crépuscule §8.1                        ± 1 min ≈ 15'     largement suffisant
  Créneau et culmination §8.2                        ± 1 min           suffisant
  Séparation Lune–cible §8.1                         ≈ 1°              largement suffisant
  Occultation, transit, passage satellite            ≈ 1"              INSUFFISANT → hors MVP

CALCULÉ EN JS, SANS AUCUNE DONNÉE TÉLÉCHARGÉE
  Temps sidéral local            formule de Meeus
  Précession                     matrice IAU 2006, J2000 → époque ; B1875 → époque (§3.4)
  Soleil, Lune, planètes         VSOP87 / ELP tronqués
  Crépuscules, lever, coucher    résolution numérique sur la hauteur du corps
  Culmination, angle horaire     trigonométrie sphérique
  Réfraction atmosphérique       modèle de Bennett, INDISPENSABLE près de l'horizon
                                 (≈ 34' à l'horizon vrai : sans elle, les instants de
                                  lever et coucher sont faux de plusieurs minutes)
  Masse d'air, transformations az/alt ↔ AD/δ

EXIGE UNE DONNÉE EXTERNE — hors ligne bloqué
  Satellites et ISS   TLE CelesTrak, périmés en quelques jours → SGP4 en JS possible,
                      mais TLE à rafraîchir en ligne
  Comètes             éléments orbitaux, même logique
  → au MVP, satellites et comètes sont explicitement EN LIGNE SEULEMENT.

BUDGET DE CALCUL
  Une évaluation complète pour 10 corps : de l'ordre de la milliseconde.
  À 10 Hz (§3.1), ≈ 1 % d'un cœur. Compatible avec 60 Hz de rendu, déportable
  en Worker si besoin.
```

### Critères d'acceptation

```gherkin
Étant donné une date et un lieu quelconques
Quand les crépuscules sont calculés
Alors aucun appel réseau n'est émis
Et la réfraction atmosphérique est appliquée aux instants de lever et de coucher

Étant donné un instant de lever calculé pour le site de référence
Quand je le compare à une éphéméride de référence
Alors l'écart reste inférieur à 2 minutes de temps

Étant donné un TLE d'ISS vieux de 12 jours                          # cas limite
Quand j'ouvre la vue satellites
Alors l'app affiche l'âge du TLE et refuse de prédire un passage
Et n'affiche pas une trajectoire dont l'erreur atteindrait plusieurs dizaines de kilomètres

Étant donné une date hors du domaine de validité des séries          # cas limite
Quand le ciel est rendu
Alors l'app signale la sortie du domaine de validité
Et masque les corps du système solaire plutôt que d'extrapoler silencieusement
```

### Dépendances données

Aucune pour Soleil, Lune, planètes, étoiles. TLE CelesTrak pour les satellites, fraîcheur de quelques jours, en ligne seulement.

---

## 12.5 Feature — Matrice de dégradation hors-ligne

**Feature** — Contrat explicite de ce qui fonctionne sans réseau, avec la dégradation nommée. Affiché dans l'interface.

| Fonction | Section | Hors réseau | Dégradation |
|---|---|---|---|
| Planétarium, curseur temporel, constellations | §3 | **complet** | aucune |
| Profil matériel, champ, échantillonnage | §5 | **complet** | aucune |
| Verdict de domaine, cadrage, détectabilité | §6.1–6.3 | **complet** | aucune |
| Prévisualisation du cadre sur imagerie de fond | §6.2 | **tombe** | cadre schématique sur positions d'étoiles réelles |
| Image de l'objet dans la liste et la fiche | §6.4 | **tombe** | cible déjà consultée : image du cache ; cible neuve : désignation et type, sans image |
| Flux, pose unitaire, N poses, calibration | §7 | **complet** | aucune |
| Fenêtre nocturne, Lune, créneaux, plan | §8.1–8.3 | **complet** | aucune |
| Masque d'horizon | §4, §8.1 | **complet si en cache** | site inconnu → masque plat marqué `[HYP]` |
| Météo, couverture nuageuse, seeing, température | §4 | **tombe** | planification sans filtre météo, signalée |
| Cheminement et carte de pointage | §8.4 | **complet** | aucune |
| Prévisualisation fixe et filé | §9.2–9.3 | **complet** | Voie lactée procédurale, pas HiPS |
| Glossaire et explications de verdict | §10 | **complet** | aucune |
| Mode nuit | §11 | **complet** | aucune |
| Satellites, ISS, comètes | §12.4 | **tombe** | bloqué, âge du TLE affiché |

```
RÈGLE PRODUIT
  Le noyau — planétarium, cadrage, pose, planification, filé, pédagogie — est
  intégralement hors-ligne. Ce qui tombe est de l'agrément visuel (HiPS) ou du
  probabiliste (météo), jamais du déterministe.
  → conforme au principe §1.2 : le physique est calculable donc offline, le
    probabiliste dépend d'un service donc en ligne. La frontière technique coïncide
    avec la frontière épistémique. Ce n'est pas un hasard, c'est l'argument de conception.
```

### Critères d'acceptation

```gherkin
Étant donné le mode hors réseau
Quand j'ouvre la matrice de dégradation
Alors chaque fonction indisponible est listée avec sa dégradation exacte
Et les fonctions du noyau sont indiquées comme intégralement disponibles

Étant donné une prévisualisation de cadre demandée hors réseau
Quand elle est générée
Alors le cadre schématique est affiché avec les positions d'étoiles réelles
Et l'absence d'imagerie de fond est signalée sans être présentée comme une erreur

Étant donné un plan de session demandé hors réseau                  # cas limite
Quand il est produit
Alors il est complet, et l'absence de filtre météo est explicitement mentionnée
Et l'app ne prétend pas que la nuit sera dégagée

Étant donné un site jamais visité, consulté hors réseau             # cas limite
Quand j'y calcule un créneau
Alors un masque plat est appliqué et marqué [HYP]
Et l'app indique que le relief local n'a pas été pris en compte

Étant donné une cible consultée en ligne, puis le mode hors réseau
Quand je l'ouvre à nouveau
Alors son image est servie depuis le cache local
Et une cible jamais consultée n'affiche ni image ni erreur
```

### Dépendances données

Récapitule toutes les sections. Fraîcheur et fallback consolidés dans le tableau ci-dessus.

---

# 13 — Métriques produit

## 13.1 Périmètre

```
EXCLU  journal de session réinjecté dans les moteurs
EXCLU  ajustement de constantes par retour utilisateur
EXCLU  toute agrégation multi-utilisateurs, donc tout serveur applicatif
       → l'architecture intégralement hors-ligne de §12 est confirmée sans réserve

CONSERVÉ  métriques produit anonymes et agrégées, sans lien avec une prédiction :
          profondeur d'usage des moteurs, fonctions atteintes, taux d'abandon sur le
          parcours de profil matériel.
          Consentement explicite, désactivable, JAMAIS requis pour utiliser l'application.
          En cas de refus, aucune fonctionnalité n'est dégradée.
```

```
TIERS CONTACTÉS — et ce qui leur est transmis
  L'application n'a pas de serveur, mais elle n'est plus sans trafic. Deux services
  publics sont interrogés, uniquement pour l'image d'objet de §6.4 :

  wikipedia.org, wikimedia.org    la désignation de la cible consultée
  service HiPS du CDS, Strasbourg les coordonnées de la cible consultée

  Dans les deux cas s'ajoute ce qu'une requête HTTP transmet toujours : l'adresse IP du
  navigateur. Ne sont transmis ni profil matériel, ni site, ni masque d'horizon, ni plan
  de séance, ni saisie — le critère de §13.3 reste vrai.
  Mais il cesse d'être vrai PAR ABSENCE DE TRAFIC, et c'est la raison de ce bloc : la
  garantie ne se lit plus dans l'architecture, elle se lit dans cette liste. Toute
  origine ajoutée à cette liste est un amendement du présent document, pas un choix
  d'implémentation. La politique de sécurité de contenu de l'application énumère
  exactement ces origines, et rien d'autre.

  Hors réseau, ou sur une cible sans image à résoudre, aucune requête n'est émise.
```

## 13.2 Vérification par tests, non par mesure d'usage

Les constantes du registre §2.1 n'étant pas ajustables, la qualité se vérifie par tests automatisés plutôt que par télémétrie :

| Vérification | Méthode |
|---|---|
| Justesse des éphémérides | Comparaison à une éphéméride de référence sur un jeu de dates et de lieux, écart maximal 2 min de temps (§12.4) |
| Justesse des formules optiques | Jeu de cas de référence à valeurs attendues, dont les trois cas de §6.3 |
| Atténuation par masse d'air | Facteurs attendus sur T_requis : 1,37 au zénith, 1,88 à 30°, à k = 0,172 (§7.6) |
| Cohérence des projections | Superposition MODE_PLANETARIUM / MODE_CADRE (§3.3) |
| Intégrité des catalogues | Somme de contrôle plus échantillonnage de 100 positions (§12.2) |
| Complétude du glossaire | Vérification en compilation : tout libellé d'interface a une entrée (§10.1) |
| Absence de fuite en mode nuit | Analyse des canaux V et B sur captures de toutes les vues (§11.1) |
| Performance de rendu | 50 Hz minimum avec catalogue complet et planification concurrente (§12.1) |
| Confinement des origines réseau | La liste d'origines de la politique de sécurité de contenu est celle de §13.1, vérifiée en compilation ; une origine ajoutée d'un côté sans l'autre fait échouer la suite (§13.1) |

## 13.3 Critères d'acceptation

```gherkin
Étant donné un utilisateur refusant les métriques
Quand il utilise l'application
Alors aucune fonctionnalité n'est dégradée
Et aucune requête de télémétrie n'est émise

Étant donné une session de travail complète
Quand j'inspecte le trafic réseau
Alors aucune donnée de profil, de site ou de plan de session n'est transmise

Étant donné le jeu de cas de référence des formules optiques
Quand la suite de tests s'exécute
Alors chaque valeur calculée correspond à la valeur attendue dans sa tolérance

Étant donné une session de travail complète
Quand j'inspecte le trafic réseau
Alors les seules origines contactées sont celles énumérées en §13.1
Et chaque requête ne porte qu'une désignation de cible ou un couple de coordonnées
```

---

# 14 — Roadmap et lots de livraison

Le découpage suit les dépendances entre moteurs, pas la valeur perçue. Un lot ne peut être livré avant ceux dont il consomme les sorties.

## Lot 0 — Socle technique

**Contenu** §2.1 registre · §2.2 table Bortle · §2.3 point zéro système · §12.1 coquille web progressive · §12.2 encodage et paquet de données de base · §12.3 persistance et export · §12.4 éphémérides en JS

**Livrable vérifiable** l'application démarre hors réseau, calcule un crépuscule juste à 2 min près, expose son registre de constantes.

**Ne dépend de rien.** Bloque tout le reste.

## Lot 1 — Contrat d'entrée

**Contenu** §4 profil Lieu avec masque d'horizon · §5.1 profil optique et capteur · §5.2 profil suivi · §10.1 glossaire contextuel

**Livrable** un lieu et un matériel saisis produisent champ, pose max NPF, seuils de déclinaison du site, et chaque terme est glosé. L'échantillonnage, la pupille et le pouvoir séparateur restent calculés (§5.1) mais ne sont plus affichés sous « Optique » : ce panneau ne porte que ce qui pèse sur le cadrage et l'exposition.

**Dépend du lot 0.**

## Lot 2 — Cœur métier ciel profond

**Contenu** §6.1 verdict de domaine · §6.2 cadrage par cible · §6.3 détectabilité et quatre verdicts · §7.1 flux · §7.2 pose unitaire · §7.3 nombre de poses · §7.4 calibration · §10.2 explication de verdict

**Livrable** pour une cible et un setup, l'application produit un verdict dépliable jusqu'à sa formule, une pose avec sa plage utile, un nombre d'images et un plan de calibration.

**Dépend des lots 0 et 1.** C'est le lot qui porte la valeur de l'application : à livrer avant le planétarium.

## Lot 3 — Planification nocturne

**Contenu** §8.1 fenêtre nocturne et Lune · §8.2 créneaux et méridien · §8.3 plan de session ordonné · §8.4 cheminement et carte de pointage · §7.5 et §10.3 recommandations contextuelles · §11.1 mode nuit · §11.2 ergonomie et export imprimable

**Livrable** un plan de session complet, ordonné, budgété, exportable, consultable en mode nuit, avec l'aide au pointage sans GoTo.

**Dépend des lots 0 à 2.** À l'issue de ce lot, l'application est utilisable sur le terrain.

## Lot 4 — Rendu du ciel

**Contenu** §3.1 pipeline à deux horloges · §3.2 curseur temporel · §3.3 moteur de rendu unifié · §3.4 constellations, frontières, astérismes · §3.5 superposition du cadre matériel

**Livrable** planétarium animé en continu, constellations en trois couches, cadre matériel superposé cliquable vers les moteurs du lot 2.

**Dépend des lots 0 à 2** pour les fiches ouvertes au clic. Le lot 4 est spectaculaire mais n'apporte aucune décision de capture par lui-même : le placer avant le lot 3 produirait une belle application qui ne sert à rien sur le terrain.

## Lot 5 — Grand champ et filé

**Contenu** §9.1 pose max par déclinaison · §9.2 prévisualisation de champ · §9.3 prévisualisation de filé · §9.4 logistique de séquence

**Livrable** prévisualisation de cadrage Voie lactée et d'arcs de filé, avec pôle exact et logistique complète.

**Dépend du lot 4** — réutilise intégralement son moteur de projection et son catalogue. Le développer avant imposerait de coder deux fois la projection, ce que §3.3 interdit explicitement.

## Lot 6 — Coque planétarium

**Contenu** §11.3 coque à quatre régions et onglets d'intention · §3.6 gestes de navigation de la scène · §3.7 plan galactique repéré · §6.4 cibles visibles et recherche du catalogue · §9.5 aperçu incrusté dans le cadre

**Livrable** la scène occupe le centre en permanence ; un réglage et son effet tiennent dans le même écran ; l'utilisateur choisit sa cible dans ce que le ciel offre au lieu de la saisir, et voit l'aperçu de sa capture à l'endroit du ciel où il regarde.

**Dépend des lots 0 à 5.** Ce lot n'ajoute aucun moteur : il rend atteignables ceux qui existent. Le placer avant le lot 5 aurait imposé d'incruster un aperçu que rien ne produisait encore.

## Lot 7 — L'objet devient reconnaissable

**Contenu** §6.4 image de l'objet dans la liste et la fiche · §12.5 ligne de dégradation correspondante · §13.1 énumération des tiers contactés

**Livrable** une cible cesse d'être une désignation : elle se voit avant d'être choisie, et l'application dit exactement à qui elle a parlé pour ça.

**Dépend du lot 6** — l'image se pose dans la liste de §6.4 et dans la fiche, que ce lot vient de rendre atteignables. C'est le premier lot qui fait sortir du trafic : il est le dernier justement pour que la promesse hors-ligne des lots 0 à 6 soit livrée et vérifiée avant d'être assouplie.

## Post-MVP — par ordre de valeur décroissante

| Sujet | Pourquoi différé |
|---|---|
| Imagerie de fond HiPS en tuiles — planétarium (§3.7) et prévisualisation du cadre (§6.2) | Casse l'offline sur toute la scène, pas sur un objet : le lot 7 sert une découpe par cible consultée, des tuiles se demandent par centaines et à chaque geste. Forte valeur visuelle, à traiter comme option en ligne |
| Paquet Gaia DR3 et zoom à 5° | Multiplie par six le volume téléchargé pour un champ où le persona primaire ne prend aucune décision de capture (§12.2) |
| Multi-sites et comparaison de deux sites | Chiffrerait le levier « site plus sombre » de §10.2 par un différentiel calculé. Exige d'abord qu'un site survive au rechargement (§12.3), puis une gestion de collection (§4.1) |
| Atlas de pollution lumineuse aux coordonnées | Écarté du MVP : exige le réseau et un cache par site pour remplacer une saisie exacte de deux secondes (§4.1) |
| Satellites, ISS, comètes | TLE périssables, exigent le réseau (§12.4) |
| Montures altazimutales et rotation de champ | Moteur distinct non spécifié |
| Occultations et transits | Exigent la précision de la seconde d'arc |
| Carnet de session personnel | Bloc-notes d'archivage, rien de réinjecté dans les moteurs |
| Mosaïques assistées | §6.2 détecte le besoin ; le séquencement des tuiles reste à spécifier |
| WebGPU | Gain réel sur le semis génératif, support à confirmer |
| Cultures de constellations non occidentales | Le jeu Stellarium en contient plusieurs, coût faible, valeur culturelle |

---

# Annexe A — Setup de référence chiffré

Toutes les valeurs des exemples du document proviennent de ce setup, par les formules de l'annexe B.

## Site

```
Latitude   46,391° N        Longitude  6,697° E
Bortle     4 à 5, valeur de travail 4,5
  → SB_ciel   = 20,95 mag/arcsec²   (table §2.2, interpolation 4 → 5)
  → m_lim_oeil = 6,05 mag
Décalage du midi solaire vrai : +26,8 min par rapport à UTC

Seuils site-dépendants
  circumpolaire            δ > +43,6°
  imagerie impossible      δ < −13,6°   (n'atteint jamais 30°)
  visuel impossible        δ < −23,6°   (n'atteint jamais 20°)

Nuit astronomique : 2 h 35 au solstice d'été, 11 h 43 au solstice d'hiver,
                    5 h 49 au 14 août. Jamais nulle, mais elle fond en juin.
```

## Boîtier

```
Capteur 35,9 × 23,9 mm, 7008 × 4672 px  →  pitch = 5,12 µm
Recadrage APS-C : 23,5 × 15,6 mm, pitch inchangé
Bruit de lecture, seuil de double gain, point zéro système, taille RAW :
base matériel, [À VÉRIFIER] (Photons to Photos)
Valeurs de travail : RN ≈ 1,5 e⁻ au-delà du seuil de double gain (≈ ISO 640),
                     ZP_sys ≈ 20,20 (générique C-14), RAW ≈ 33 Mo
```

## Configuration ciel profond — 120 mm f/2,8

| Grandeur | Valeur | Formule |
|---|---|---|
| Diamètre de pupille | 42,9 mm | 120 / 2,8 |
| Pouvoir séparateur (Dawes) | 2,70" | 116 / 42,9 |
| Champ plein format | 17,02° × 11,38° | 2·atan(d / 2f) |
| Champ recadrage APS-C | 11,18° × 7,44° | idem |
| Échantillonnage | 8,80 "/px | 206,265 × 5,12 / 120 |
| Diagnostic | grand champ assumé | > 4 "/px, non bloquant |
| Fenêtre de cadrage (plein format) | 3,79° – 5,69° | FOV_H / 3 à FOV_H / 2 |
| Domaine | TRES_GRAND_CHAMP | §6.1 |
| Pose max sans suivi (NPF, δ = 0) | 2,10 s | (35·N + 30·p) / f |
| Pose max avec suivi approximatif | 75 s | 45 × 200 / 120 |
| Pose max avec suivi soigné | 200 s | 120 × 200 / 120 |
| Flux de fond de ciel | 1,68 e⁻/s/px | §7.1 |
| Pose unitaire optimale | 13,4 s, retenue 13 s | 10 × 1,5² / 1,68 |
| Plage utile de pose | 6 à 26 s | [t/2 ; t×2] |
| Régime | NOMINAL | t_opt < t_max_suivi |

**Verdict de domaine** : excellent sur les grands complexes du plan galactique nord, hors domaine sur les galaxies. Un objet de 6,5' y occupe 0,95 % du champ, soit 44 px — il faudrait 5 300 mm de focale pour le cadrer au remplissage visé de 42 %, et de 4 230 à 6 340 mm aux deux bornes de C-05.

**Intégrations calculées** (SNR cible 10, pose 13,4 s) :

| Cible | SB_obj | E_obj | T requis | N poses | Volume |
|---|---|---|---|---|---|
| M31 | 22,17 | 0,545 e⁻/s/px | 13,4 min | 60 | 2,0 Go |
| M33 | 23,02 | 0,249 e⁻/s/px | 56,3 min | 252 | 8,3 Go |

## Configuration grand champ — 10 mm f/2,8

| Grandeur | Valeur |
|---|---|
| Champ plein format | 121,8° × 100,2°, diagonale 130,2° |
| Échantillonnage | 105,6 "/px (≈ 1,76 ' /px) |
| Échelle verticale | 46,6 px/° |
| NPF à δ = 0 (k = 1) | 25,2 s |
| NPF à δ = −25° | 27,8 s |
| NPF à δ = +50° | 39,1 s |
| Arc de filé, 20 min à δ = 0 | 5,01° ≈ 234 px, soit 5 % de la hauteur |
| Arc de filé, 1 h à δ = 0 | 15,04° ≈ 701 px |
| Séquence 2 h à 25 s + 1 s | 276 poses, ≈ 8,9 Go, arc 30,1° |

---

# Annexe B — Formulaire complet

## Optique et cadrage

```
FOV_deg      = 2 × atan( dimension_capteur_mm / (2 × focale_mm) )
D_mm         = focale_mm / ouverture_N
ech_apx      = 206,265 × pitch_um / focale_mm
dawes_as     = 116 / D_mm
remplissage  = taille_objet_deg / FOV_H_deg
diam_px      = taille_objet_arcsec / ech_apx
n_tuiles     = ceil( taille / FOV × 1,15 )²
```

## Détectabilité

```
aire_arcsec2 = 2827,4 × a'_arcmin × b'_arcmin
SB_obj       = m_int + 8,63 + 2,5 × log10( a'_arcmin × b'_arcmin )
ΔSB          = SB_ciel − SB_obj
SB_ciel      = table §2.2, interpolation autorisée, extrapolation interdite
gain_mag     = 5 × log10( D_mm / 6,5 )
m_lim_instr  = m_lim_oeil + gain_mag
```

## Pose et intégration

```
E_ciel   = 10^( −0,4 × (SB_ciel − ZP_sys) ) × (pitch_um / N)²
E_obj    = 10^( −0,4 × (SB_obj  − ZP_sys) ) × (pitch_um / N)²
X        = 1 / sin( alt )                                valide au-dessus de ~15°
atten    = 10^( −0,4 × k × X )                           extinction, §7.6
E_obj_r  = E_obj × atten                                 flux réellement collecté
t_opt    = C × RN² / E_ciel                              C = 10 (défaut) ou 3
t_reco   = min( t_opt, t_max_suivi )
SNR(T)   = E_obj × T / √( (E_obj + E_ciel) × T + (T / t_pose) × RN² )
T_requis = SNR_cible² × ( E_obj + E_ciel + RN² / t_pose ) / E_obj²
N_poses  = ceil( T_requis / t_pose )
perte_SNR = 1 − √( C / (C + 1) )
```

## Suivi et filé

```
t_max_suivi  = t_ref × (200 / focale_mm), plafonné à 240 s
                t_ref = 120 s (soigné) ou 45 s (approximatif)
trace_arcsec = 15,041 × t_s × cos(δ)
t_npf        = k × (35 × N + 30 × pitch_um) / ( focale_mm × cos(δ) )
arc_deg      = 15,041 × duree_h × cos(δ)
n_poses_file = floor( duree_s / (t_pose_s + intervalle_s) )
```

## Position et temps

```
alt_culmination = 90° − | latitude − δ |
masse_air       ≈ 1 / sin( alt )                          valide au-dessus de ~15°
circumpolaire   si δ > 90° − latitude
seuil 30°       si δ > latitude − 60°
seuil 20°       si δ > latitude − 70°
TSL             = TSG(t) + longitude_deg / 15
angle_rotation  = TSL × 15,041
cos H           = ( sin(h) − sin δ × sin φ ) / ( cos δ × cos φ )
duree_nuit_h    = 2 × (180° − H) / 15,041                 avec h = −18°
offset_midi_min = (longitude_deg / 15) × 60 − offset_fuseau_h × 60
precession_deg  = 50,29 × n_annees / 3600
```

## Rendu

```
mag_limite   = mag_base + 5 × log10( fov_ref / fov_courant )     mag_base 6,5 à 60°
rayon_px     = r0 × 10^( −0,15 × (mag − mag_ref) )
densite(b)   = d0 × exp( −|b| / 20° )                            latitude galactique
v_ecran      = 15,041 × facteur × px_par_degre / 3600            [px/s]
facteur_max  = 600 × 3600 / ( 15,041 × px_par_degre )
sensibilite  = | ∂ln(sortie) / ∂ln(variable) |                   facteur dominant §10.2
```

---

# Annexe C — Journal des décisions de périmètre

| # | Décision | Conséquence sur le PRD |
|---|---|---|
| 1 | Monture motorisée sans pointage automatique | Ajout de §8.4 (cheminement et carte de pointage) au MVP. Sans elle, l'utilisateur ne peut pas atteindre les cibles recommandées. |
| 2 | Toggle de suivi simple en interface | Résolu par un sélecteur à trois niveaux derrière un toggle unique (§5.2) : deux clics, aucune saisie technique. Un booléen seul aurait forcé le moteur à supposer le pire. |
| 3 | Boîtier plein format 33 MP, option de recadrage APS-C | Le recadrage est un mode, pas un capteur : il change le champ, jamais l'échantillonnage. Message anti-confusion obligatoire (§5.1). |
| 4 | Grand champ à 10 mm | A révélé que la formule de champ du socle (approximation linéaire) est fausse en grand angle. Remplacée par l'arctangente dans tous les moteurs. |
| 5 | Filé sur positions génériques acceptées | Arbitré à l'inverse : la §9.2 embarquant déjà le catalogue projeté, le coût marginal des positions réelles dans le filé est nul. Pôle et géométrie exacts sans exception. |
| 6 | Site au pied des Alpes | Masque d'horizon promu au MVP : sans lui, les recommandations sont fausses la moitié du temps sur ce type de site. |
| 7 | Animation temporelle continue | Coût réel différent de l'estimation initiale : la rotation du ciel est à coût constant, mais impose un plafond de vitesse dérivé de la perception et couplé au zoom (§3.2). |
| 8 | Application web | A imposé le remplacement de la bibliothèque d'éphémérides du socle par des séries analytiques en JavaScript. A aussi révélé que le volume de données n'est pas la contrainte du web — l'éviction du stockage l'est. |
| 9 | Pas de calibration, données classiques | A fermé les huit constantes que la calibration devait établir, par convention sourcée au registre §2.1. A supprimé le décodeur RAW en WebAssembly. Confirmé par le calcul de platitude de l'optimum (§2.3). |
| 10 | Pas de guide séparé | §10 transformée en couche pédagogique attachée aux sorties, avec facteur dominant calculé par sensibilité — structurellement incapable de dériver des moteurs. |
| 11 | Le planétarium est l'écran principal, pas une vue parmi d'autres | Ajout de §11.3 (coque à quatre régions) et §3.6 (gestes). Une pile de sections en colonne unique cassait le lien entre un réglage et son effet : il fallait défiler pour voir le cadre bouger. |
| 12 | Le ciel propose, l'utilisateur choisit | Ajout de §6.4. Tant que la cible se saisissait à la main, l'application demandait à l'utilisateur la réponse qu'il venait chercher. Le contrat d'entrée de §6.2 et §6.3 est inchangé ; c'est le sens de la question qui s'inverse. |
| 13 | L'aperçu se lit dans le cadre, sur la scène | Ajout de §9.5. Deux canevas côte à côte donnent une impression, un aperçu incrusté donne une décision de cadrage. Impose le découplage de cadence : une image par réglage, pas soixante par seconde. |
| 14 | Le plan galactique est un repère, pas une bande | Ajout de §3.7, distinct de la couche 3 de §9.2 : §3.7 pose un repère sur une carte, §9.2 module un contraste dans une image. Confondre les deux ferait d'un repère de pointage une promesse photométrique. |
| 15 | Volumes de données mesurés plutôt qu'estimés | §12.2 porte désormais une colonne « mesuré » : 2,4 Mo contre 7 à 9 Mo estimés. Masque de Voie lactée procédural, base matériel et glossaire ne pèsent rien en données ; le décodeur WASM avait déjà disparu avec la décision 9. Le budget de données n'est donc pas la contrainte — l'éviction de §12.3 l'est, comme l'annonçait la décision 8. |
| 16 | Canvas 2D retenu, WebGL 2 non prérequis | §12.1 réécrit. Ce qui tient le critère de §3.1 n'est pas le GPU mais l'indexation spatiale et l'arrêt par magnitude de §3.3 : le nombre d'étoiles examinées par image ne dépend pas de la taille du catalogue. La règle « tout calcul part en Worker, sans exception » devient une exigence de fréquence, et le Worker un moyen déclenché par la mesure. |
| 17 | Paquet Gaia et zoom à 5° reportés | §3.3 et §12.2. Le plancher de zoom n'est pas une promesse du produit : le persona primaire vit entre 15° et 130° de champ. Douze mégaoctets pour un champ où aucune décision de capture ne se prend est le mauvais arbitrage. L'application plafonne à 15° et nomme la cause. |
| 18 | Un seul site au MVP, atlas de pollution lumineuse écarté | §4.1. Le Bortle déclaré et le SQM mesuré sont exacts et hors ligne ; un atlas aux coordonnées franchirait la frontière de §1.2 pour une commodité de saisie. Le multi-sites part en post-MVP : il suppose d'abord qu'un site survive au rechargement. |
| 19 | Lecture EXIF de la température capteur retirée | §7.4. Sans décodeur RAW (décision 9), il ne restait qu'un chemin d'import pour renseigner un champ saisi en trois secondes. Le champ lui-même a suivi en décision 23. |
| 20 | L'extinction atmosphérique entre dans le moteur Pose | Ajout de §7.6. Une magnitude de catalogue est hors atmosphère, une brillance de ciel est mesurée au sol : atténuer l'objet seul est la seule combinaison cohérente des deux sources. L'effet est quadratique sur T_requis — près du double au seuil C-01 — et rend `S_hauteur` de §8.3 redondant avec `S_signal`, arbitrage ouvert. |
| 21 | La Voie lactée se montre, elle ne se déduit pas | §3.7 étendu à la bande modulée par le fond de ciel et au repère du centre galactique. La hauteur de culmination de 14,6° depuis le site de référence vivait dans un tableau du PRD ; sur la scène, elle se lit. |
| 22 | Le budget batterie retiré, remplacé par un rappel | §9.4, §8.3, C-16. L'autonomie CIPA se mesure en rafale au flash et la température prévue se saisit à la main : leur produit portait trois incertitudes multiplicatives et s'affichait à côté du volume de fichiers, réellement calculé. Ce que l'application connaît d'elle-même, c'est la durée de prise de vue — au-delà du seuil, elle rappelle le risque et ne chiffre rien. |
| 23 | La validation d'une bibliothèque de darks retirée | §7.4, C-10 supprimée. Personne n'alimentait `temp_capteur_c` ni `biblio_darks` : la validation ne s'exécutait jamais et son seul effet visible était un avertissement réclamant un champ qu'aucun écran n'offrait. La garder sans température aurait déclaré valide une bibliothèque prise vingt degrés plus haut — une erreur qui autorise à sauter les darks. Un lot par séance, en fin de séance capteur encore froid, est juste sans thermomètre. |
| 24 | Le multi-cadres retiré : la scène porte un seul profil | §3.5. La seule comparaison qu'on savait produire — plein format contre APS-C — se commandait par un interrupteur d'affichage posé au milieu d'un panneau qui décrit le matériel, et elle répondait à une question que la bascule de format répond déjà : le cadre se resserre sous les yeux, l'échantillonnage ne bouge pas. Comparer deux optiques distinctes reste le cas utile, et il suppose d'abord un stock de profils enregistrés — post-MVP, avec §12.3. |

## Corrections apportées au socle initial en cours de rédaction

| Élément du socle | Correction | Section |
|---|---|---|
| `FOV ≈ 57,3 × d / f` | Remplacé par `2 × atan(d / 2f)` partout | §5.1 |
| Interpolation linéaire du Bortle | Remplacée par une table : l'extrapolation donnait 23,4 mag/arcsec² à Bortle 1, valeur physiquement impossible | §2.2 |
| `m_lim_oeil = SB_ciel − 15` | Remplacé par la colonne de la table : une magnitude d'écart à Bortle 8 | §2.2 |
| Bibliothèque d'éphémérides Python | Remplacée par des séries analytiques portées en JavaScript | §12.4 |
| Frontières IAU sans précession | Précession B1875 → époque obligatoire : 2,11° d'erreur en 2026 | §3.4 |
| Constante de flux calibrable | Remplacée par un point zéro système livré par boîtier | §2.3 |
| `focale_ideale_mm` avec un facteur 2 surnuméraire | Formule corrigée, et sortie rendue avec sa plage aux deux bornes de C-05 : le remplissage est subjectif, une focale unique au millimètre le nierait | §6.1 |
| « HYG v3, 120 000 étoiles jusqu'à mag ≈ 9 » | Comptage mesuré à la construction du paquet : 83 479 étoiles à magnitude ≤ 9 sur HYG v4.1, soit 2,02 étoiles/deg² | §3.3, §12.2 |

---

*Fin du document.*