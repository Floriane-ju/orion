/**
 * §4.1, §13.1 — le relief du terrain qui trace l'horizon du site.
 *
 * Source retenue (T-0359) : les tuiles d'altitude « Terrarium » du jeu Terrain Tiles d'AWS
 * Open Data. Sans clé, servies avec CORS, et lisibles sans dépendance : ce sont des PNG que le
 * navigateur décode lui-même. Un service d'élévation point par point a été écarté — 360
 * azimuts × 300 pas font cent mille altitudes, soit un millier d'appels à un service qui en
 * limite le débit. Les GeoTIFF Copernicus aussi : ils demandent un décodeur tiers.
 *
 * Ce qu'une requête transmet : le numéro de la tuile, donc la zone du site à une maille de
 * quelques dizaines de kilomètres. C'est ce que §13.1 énumère, et c'est pourquoi l'origine
 * s'ajoute à la liste d'où la politique de sécurité est tirée.
 */

import type { OrigineTiers } from './origines.ts'

export const HOTE_RELIEF = 'https://elevation-tiles-prod.s3.amazonaws.com'

export const ORIGINES_RELIEF: readonly OrigineTiers[] = Object.freeze(
  [
    {
      origine: HOTE_RELIEF,
      transmis:
        'la zone du site (tuiles de relief couvrant 30 km autour), une fois par site grâce au cache',
    },
  ].map(Object.freeze) as OrigineTiers[],
)

/** L'adresse d'une tuile Terrarium au zoom `z`. */
export function urlTuileRelief(z: number, x: number, y: number): string {
  return `${HOTE_RELIEF}/terrarium/${z}/${x}/${y}.png`
}

/** Crédit exigé par le jeu Terrain Tiles : l'agrégateur et les modèles qu'il assemble. */
export const CREDIT_RELIEF = Object.freeze({
  auteur:
    'Terrain Tiles (Mapzen, AWS Open Data) — SRTM (NASA), EU-DEM (Copernicus), GMTED2010 (USGS), ' +
    'ETOPO1 (NOAA) et autres',
  licence: 'attribution requise, voir les sources du jeu',
  lien: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
})

export interface ValeurRelief {
  readonly valeur: number
  readonly unite: string
  readonly source: string
  readonly tolerance: string
}

function valeur(v: ValeurRelief): ValeurRelief {
  return Object.freeze(v)
}

const RELIEF = Object.freeze({
  RAYON_RELIEF_KM: valeur({
    valeur: 30,
    unite: 'km',
    source: '§4.1 — « profil d’altitude terrain aux coordonnées, rayon 30 km »',
    tolerance: 'convention PRD — au-delà, une crête de 1 000 m ne monte plus qu’à ≈ 1,6°',
  }),

  /**
   * Le pas le long de chaque azimut : un pixel de tuile au zoom retenu (≈ 107 m à 45° de
   * latitude). Plus fin, on relirait le même pixel ; plus lâche, on sauterait des crêtes.
   */
  PAS_RADIAL_RELIEF_M: valeur({
    valeur: 100,
    unite: 'm',
    source: 'taille d’un pixel Terrarium au zoom 10 : 2π × 6 378 137 m × cos φ / 2¹⁸',
    tolerance: 'ordre de grandeur — suit la résolution de la tuile',
  }),

  /**
   * En deçà, le terrain n'est pas lu. Un pixel de 100 m porte une erreur verticale de l'ordre
   * de 10 m : à 100 m de l'œil, c'est 6° d'horizon inventé sur tout un secteur ; à 500 m, 1°.
   * Ce qui est plus près — arbres, bâtiments, la butte d'à côté — relève du relevé à la main,
   * que §4.1 pose justement « par-dessus ».
   */
  DISTANCE_MIN_RELIEF_M: valeur({
    valeur: 500,
    unite: 'm',
    source:
      'erreur verticale des MNT globaux ≈ 10 m (SRTM, EU-DEM rééchantillonné) — atan(10 / 500) ≈ 1,1°',
    tolerance: 'ordre de grandeur — suit la qualité du modèle sur la zone',
  }),

  /**
   * Le zoom des tuiles : 30 km de rayon tiennent en 3 × 3 à 4 × 4 tuiles, ≈ 1,5 Mo par site.
   * Le zoom 11 doublerait la résolution pour quatre fois plus de téléchargement, sur des
   * modèles (SRTM 30 m, EU-DEM 25 m) déjà rééchantillonnés.
   */
  ZOOM_TUILE_RELIEF: valeur({
    valeur: 10,
    unite: '—',
    source: 'Terrain Tiles — pyramide Web Mercator, tuiles de 256 px',
    tolerance: 'sans objet — compromis poids / résolution',
  }),

  /**
   * Réfraction terrestre : le rayon lumineux rasant se courbe vers le sol, ce qui revient à
   * voir sur une Terre de rayon R / (1 − k). Les hauteurs des cibles sont déjà réfractées
   * (`Horizon(..., 'normal')`) : un masque géométrique leur serait comparé à tort.
   */
  COEF_REFRACTION_TERRESTRE: valeur({
    valeur: 0.13,
    unite: '—',
    source: 'coefficient de Gauss, valeur de référence en géodésie et en calcul de visibilité',
    tolerance: 'ordre de grandeur — 0,07 à 0,20 selon le gradient thermique près du sol',
  }),

  /**
   * T-0395 — écart d'altitude entre deux courbes de niveau dessinées sur le sol. Celui des
   * cartes au 1:25 000 est de 10 m ; vu en perspective, à 30 km, il ferait une hachure. Cinq
   * fois plus lâche, un versant alpin garde des dizaines de lignes et une colline en garde
   * deux ou trois.
   */
  EQUIDISTANCE_COURBES_M: valeur({
    valeur: 50,
    unite: 'm',
    source: 'convention de dessin — direction visuelle T-0395 ; carte IGN 1:25 000 à 10 m',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0395 — pas d'azimut de la table qui décide si un point de courbe est caché : 260 m à
   * 30 km, l'ordre du pas radial. Au degré, une courbe lointaine se masquait par plaques.
   */
  PAS_AZIMUT_COURBES_DEG: valeur({
    valeur: 0.5,
    unite: '°',
    source: 'convention de dessin — de l’ordre de PAS_RADIAL_RELIEF_M au rayon de §4.1',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0397 — l'écart angulaire qu'une courbe simplifiée peut prendre avec son tracé d'origine.
   * Sous le pixel jusqu'à 30° de champ sur 1 920 px ; il retire des milliers de points presque
   * alignés que chaque image projetait et traçait pour rien.
   */
  TOLERANCE_COURBES_DEG: valeur({
    valeur: 0.01,
    unite: '°',
    source: 'convention de dessin — 0,64 px à 30° de champ sur 1 920 px',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0397 — la plus longue corde qu'une courbe simplifiée garde entre deux points. Une courbe
   * de niveau droite est un grand cercle : sans borne, la simplification n'en laisserait que les
   * deux bouts, et le trait droit tiré entre leurs projections couperait l'arc que la
   * projection courbe.
   */
  CORDE_MAX_COURBES_DEG: valeur({
    valeur: 1,
    unite: '°',
    source: 'convention de dessin — flèche de corde sous le pixel en projection stéréographique',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /** L'œil — ou l'objectif sur trépied — au-dessus du sol que le modèle de terrain décrit. */
  HAUTEUR_OEIL_M: valeur({
    valeur: 1.6,
    unite: 'm',
    source: 'convention — hauteur d’œil d’un adulte debout, voisine d’un trépied déployé',
    tolerance: 'sans objet — sous le bruit altimétrique du modèle de terrain',
  }),

  /** Rayon équatorial de la projection Web Mercator des tuiles (EPSG:3857). */
  RAYON_WEB_MERCATOR_M: valeur({
    valeur: 6378137,
    unite: 'm',
    source: 'EPSG:3857 — sphère de rayon égal au demi-grand axe WGS 84',
    tolerance: 'sans objet — définition de la projection',
  }),

  /** Côté d'une tuile, en pixels — c'est aussi la base de l'encodage Terrarium. */
  COTE_TUILE_PX: valeur({
    valeur: 256,
    unite: 'px',
    source: 'Terrain Tiles — format Terrarium',
    tolerance: 'sans objet — format',
  }),

  /** Décalage de l'encodage Terrarium : h = R × 256 + V + B / 256 − 32 768. */
  DECALAGE_TERRARIUM_M: valeur({
    valeur: 32768,
    unite: 'm',
    source: 'Terrain Tiles — spécification de l’encodage Terrarium',
    tolerance: 'sans objet — format',
  }),

  /**
   * Plafond de tuiles par site. Aux latitudes moyennes, 30 km en demandent 9 à 16 ; près des
   * pôles la maille Mercator s'écrase et le même rayon en demanderait des centaines. Au-delà,
   * le relief est déclaré indisponible plutôt que de vider le forfait de l'utilisateur.
   */
  TUILES_RELIEF_MAX: valeur({
    valeur: 25,
    unite: '—',
    source: 'convention — 5 × 5 tuiles, ≈ 3 Mo, le double du cas courant',
    tolerance: 'sans objet — plafond de garde',
  }),

  /** Attente maximale d'une tuile : au-delà, le relief est déclaré indisponible. */
  DELAI_MAX_TUILE_MS: valeur({
    valeur: 15000,
    unite: 'ms',
    source: 'convention — une tuile de 150 ko passe en quelques secondes même en 3G',
    tolerance: 'sans objet — plafond de garde',
  }),

  /** Délai de repos avant de demander le relief : la latitude se saisit chiffre par chiffre. */
  DELAI_RELIEF_MS: valeur({
    valeur: 800,
    unite: 'ms',
    source: 'convention d’interaction — au-dessus de la cadence de frappe soutenue',
    tolerance: 'sans objet — temporisation d’interface',
  }),

  /**
   * T-0369 — durée du passage d'un horizon dessiné à l'autre : l'ancien relief qui s'aplatit
   * au changement de lieu, puis le nouveau qui monte. Assez longue pour se suivre des yeux,
   * assez courte pour qu'un relief en cache ne fasse pas attendre.
   */
  DUREE_TRANSITION_RELIEF_MS: valeur({
    valeur: 600,
    unite: 'ms',
    source: 'convention d’interaction — transition d’interface perceptible sans retarder',
    tolerance: 'sans objet — animation d’affichage, aucun calcul n’en dépend',
  }),
} satisfies Record<string, ValeurRelief>)

export type IdRelief = keyof typeof RELIEF

/** Lecture d'une valeur, sur le modèle de `K()` du registre §2.1. */
export function R(id: IdRelief): number {
  return RELIEF[id].valeur
}
