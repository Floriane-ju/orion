/**
 * §4.1, §13.1 — terrain relief tracing the site horizon.
 * Source (T-0359): AWS Open Data Terrain Tiles "Terrarium" (no key, CORS, PNG decoded by browser,
 * no dependency). Rejected: point elevation service (360 azimuts × 300 steps = 100k altitudes,
 * ~1000 calls to a rate-limited service); Copernicus GeoTIFF (needs third-party decoder).
 * Request sends tile number = site zone at a few tens of km mesh (§13.1); origin joins the list
 * the CSP derives from.
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

/** Terrarium tile URL at zoom `z`. */
export function urlTuileRelief(z: number, x: number, y: number): string {
  return `${HOTE_RELIEF}/terrarium/${z}/${x}/${y}.png`
}

/** Credit required by Terrain Tiles: aggregator + models it assembles. */
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
   * Azimut ray step: 1 tile pixel at chosen zoom (≈ 107 m at 45°). Finer rereads a pixel; looser
   * skips ridges.
   */
  PAS_RADIAL_RELIEF_M: valeur({
    valeur: 100,
    unite: 'm',
    source: 'taille d’un pixel Terrarium au zoom 10 : 2π × 6 378 137 m × cos φ / 2¹⁸',
    tolerance: 'ordre de grandeur — suit la résolution de la tuile',
  }),

  /**
   * Below, terrain unread. 100 m pixel has ~10 m vertical error: 6° fake horizon at 100 m, 1° at
   * 500 m. Closer (trees, buildings, next hill) = manual survey, which §4.1 puts "par-dessus".
   */
  DISTANCE_MIN_RELIEF_M: valeur({
    valeur: 500,
    unite: 'm',
    source:
      'erreur verticale des MNT globaux ≈ 10 m (SRTM, EU-DEM rééchantillonné) — atan(10 / 500) ≈ 1,1°',
    tolerance: 'ordre de grandeur — suit la qualité du modèle sur la zone',
  }),

  /**
   * Tile zoom: 30 km radius = 3×3–4×4 tiles, ≈ 1,5 Mo/site. Zoom 11: 2× resolution, 4× download,
   * on models already resampled (SRTM 30 m, EU-DEM 25 m).
   */
  ZOOM_TUILE_RELIEF: valeur({
    valeur: 10,
    unite: '—',
    source: 'Terrain Tiles — pyramide Web Mercator, tuiles de 256 px',
    tolerance: 'sans objet — compromis poids / résolution',
  }),

  /**
   * Terrestrial refraction: grazing ray bends to ground = Earth of radius R / (1 − k). Target
   * heights already refracted (`Horizon(..., 'normal')`): a geometric mask compared to them is
   * wrong.
   */
  COEF_REFRACTION_TERRESTRE: valeur({
    valeur: 0.13,
    unite: '—',
    source: 'coefficient de Gauss, valeur de référence en géodésie et en calcul de visibilité',
    tolerance: 'ordre de grandeur — 0,07 à 0,20 selon le gradient thermique près du sol',
  }),

  /**
   * T-0395 — altitude gap between drawn contour lines. 1:25 000 maps use 10 m (hatching at 30 km
   * in perspective); 5× looser: tens of lines on alpine slope, 2-3 on a hill.
   */
  EQUIDISTANCE_COURBES_M: valeur({
    valeur: 50,
    unite: 'm',
    source: 'convention de dessin — direction visuelle T-0395 ; carte IGN 1:25 000 à 10 m',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0395 — azimut step of table deciding if a contour point is hidden: 260 m at 30 km (≈ radial
   * step). At 1°, far contours hid in patches.
   */
  PAS_AZIMUT_COURBES_DEG: valeur({
    valeur: 0.5,
    unite: '°',
    source: 'convention de dessin — de l’ordre de PAS_RADIAL_RELIEF_M au rayon de §4.1',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0445 — radial step of table deciding if a contour point is hidden. Lookup skips the step
   * under the point (its own slope): at PAS_RADIAL_RELIEF_M a ridge ≤ 200 m ahead hid nothing,
   * contours crossed behind near spurs. Half step: ≤ 100 m skipped, < 1 grid cell.
   */
  PAS_RADIAL_MASQUE_COURBES_M: valeur({
    valeur: 50,
    unite: 'm',
    source: 'convention de dessin — moitié de PAS_RADIAL_RELIEF_M, maille des courbes',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0397 — max angular deviation of simplified contour. Sub-pixel up to 30° field over 1 920 px;
   * drops thousands of near-collinear points drawn each frame.
   */
  TOLERANCE_COURBES_DEG: valeur({
    valeur: 0.01,
    unite: '°',
    source: 'convention de dessin — 0,64 px à 30° de champ sur 1 920 px',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0397 — longest chord of simplified contour. Level contour = great circle: unbounded, only
   * endpoints would stay and their projected straight line would cut the arc.
   */
  CORDE_MAX_COURBES_DEG: valeur({
    valeur: 1,
    unite: '°',
    source: 'convention de dessin — flèche de corde sous le pixel en projection stéréographique',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0438 — silhouette line (near relief edge over terrain it hides) drawn only if hidden part is
   * deep enough. <1 km = slope undulation / model noise: every fold would draw.
   */
  PROFONDEUR_MIN_SILHOUETTE_M: valeur({
    valeur: 1000,
    unite: 'm',
    source: 'convention de dessin — dix pas radiaux, au-delà du bruit d’un pixel de tuile',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0438 — neighbouring-azimut silhouette points share a ridge if distances differ by < this
   * fraction. Beyond = stacked reliefs: joining would draw a line across the void.
   */
  ECART_RACCORD_SILHOUETTE: valeur({
    valeur: 0.1,
    unite: '—',
    source: 'convention de dessin — 1 km d’écart toléré à 10 km',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0438 — azimut step of the DRAWN ridge. At mask's 1°, a 20 km summit under 23° field = 90 px
   * base triangle; at 0,1° edges < ~10 px. Mask calcul stays 1° (§4.1).
   */
  PAS_AZIMUT_CRETE_DEG: valeur({
    valeur: 0.1,
    unite: '°',
    source: 'convention de dessin — 35 m à 20 km, sous le pas radial des tuiles',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0445 — radial step re-reading DRAWN ridge around its top. At PAS_RADIAL_RELIEF_M a top
   * between two samples is missed: crest up to 0.39° low (flat steps), contours rose above sol.
   */
  PAS_FIN_CRETE_M: valeur({
    valeur: 10,
    unite: 'm',
    source: 'convention de dessin — écart à un pas de 5 m ≤ 0,05° (Chablais, Chamonix, T-0445)',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0445 — sampled local maxima this far below the ray's highest are re-read finely: the true
   * top may hide under any of them. Max gap measured at 100 m step: 0.39°.
   */
  MARGE_SOMMET_CRETE_DEG: valeur({
    valeur: 0.5,
    unite: '°',
    source: 'convention de dessin — écart max mesuré pas 100 m / 5 m : 0,39° (Chablais, T-0445)',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /**
   * T-0438 — azimut extent below which a silhouette isn't drawn: shorter = edge fragment linked to
   * nothing, isolated dash on slope.
   */
  ETENDUE_MIN_SILHOUETTE_DEG: valeur({
    valeur: 2,
    unite: '°',
    source: 'convention de dessin — quatre pas de PAS_AZIMUT_COURBES_DEG',
    tolerance: 'sans objet — aucun calcul de visibilité n’en dépend',
  }),

  /** Eye (or tripod lens) above the ground the terrain model describes. */
  HAUTEUR_OEIL_M: valeur({
    valeur: 1.6,
    unite: 'm',
    source: 'convention — hauteur d’œil d’un adulte debout, voisine d’un trépied déployé',
    tolerance: 'sans objet — sous le bruit altimétrique du modèle de terrain',
  }),

  /** Equatorial radius of tile Web Mercator (EPSG:3857). */
  RAYON_WEB_MERCATOR_M: valeur({
    valeur: 6378137,
    unite: 'm',
    source: 'EPSG:3857 — sphère de rayon égal au demi-grand axe WGS 84',
    tolerance: 'sans objet — définition de la projection',
  }),

  /** Tile side, px; also the Terrarium encoding base. */
  COTE_TUILE_PX: valeur({
    valeur: 256,
    unite: 'px',
    source: 'Terrain Tiles — format Terrarium',
    tolerance: 'sans objet — format',
  }),

  /** Terrarium encoding offset: h = R × 256 + V + B / 256 − 32 768. */
  DECALAGE_TERRARIUM_M: valeur({
    valeur: 32768,
    unite: 'm',
    source: 'Terrain Tiles — spécification de l’encodage Terrarium',
    tolerance: 'sans objet — format',
  }),

  /**
   * Tile cap per site. Mid latitudes: 30 km = 9-16 tiles; near poles Mercator squashes, same radius
   * = hundreds. Beyond: relief unavailable rather than drain user's data plan.
   */
  TUILES_RELIEF_MAX: valeur({
    valeur: 25,
    unite: '—',
    source: 'convention — 5 × 5 tuiles, ≈ 3 Mo, le double du cas courant',
    tolerance: 'sans objet — plafond de garde',
  }),

  /** Max wait per tile; beyond, relief declared unavailable. */
  DELAI_MAX_TUILE_MS: valeur({
    valeur: 15000,
    unite: 'ms',
    source: 'convention — une tuile de 150 ko passe en quelques secondes même en 3G',
    tolerance: 'sans objet — plafond de garde',
  }),

  /** Rest before requesting relief: latitude typed digit by digit. */
  DELAI_RELIEF_MS: valeur({
    valeur: 800,
    unite: 'ms',
    source: 'convention d’interaction — au-dessus de la cadence de frappe soutenue',
    tolerance: 'sans objet — temporisation d’interface',
  }),

  /**
   * T-0369 — duration of one horizon morphing to the next (old relief flattens on site change, new
   * rises). Long enough to follow, short enough that cached relief doesn't wait.
   */
  DUREE_TRANSITION_RELIEF_MS: valeur({
    valeur: 600,
    unite: 'ms',
    source: 'convention d’interaction — transition d’interface perceptible sans retarder',
    tolerance: 'sans objet — animation d’affichage, aucun calcul n’en dépend',
  }),
} satisfies Record<string, ValeurRelief>)

export type IdRelief = keyof typeof RELIEF

/** Value read, like `K()` of registre §2.1. */
export function R(id: IdRelief): number {
  return RELIEF[id].valeur
}
