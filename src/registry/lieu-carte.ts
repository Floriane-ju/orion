/**
 * §4.1, §13.1 — map where site is set by click (T-0363).
 * Tiles: OpenStreetMap server (no key, CORS, PNG), read by `fetch`, painted on canvas: `img-src`
 * needs no third-party host, only `connect-src` opens.
 * Request sends tile number = DISPLAYED zone at chosen zoom (§13.1). Referer goes with app
 * origin, unlike relief: OSM policy requires valid Referer, anonymous clients get blocked.
 * Offline, embedded Natural Earth background stays: map loses detail, not function (§12.5).
 */

import type { OrigineTiers } from './origines.ts'

export const HOTE_CARTE = 'https://tile.openstreetmap.org'

export const ORIGINES_CARTE: readonly OrigineTiers[] = Object.freeze(
  [
    {
      origine: HOTE_CARTE,
      transmis:
        'la zone affichée sur la carte du site (numéros des tuiles au zoom choisi), tant que la carte est ouverte',
    },
  ].map(Object.freeze) as OrigineTiers[],
)

/** URL of OSM tile at zoom `z`. */
export function urlTuileCarte(z: number, x: number, y: number): string {
  return `${HOTE_CARTE}/${z}/${x}/${y}.png`
}

/** Credit required by ODbL licence, shown once a tile is painted. */
export const CREDIT_CARTE = Object.freeze({
  auteur: '© les contributeurs d’OpenStreetMap',
  licence: 'ODbL',
  lien: 'https://www.openstreetmap.org/copyright',
})

export interface ValeurCarte {
  readonly valeur: number
  readonly unite: string
  readonly source: string
  readonly tolerance: string
}

function valeur(v: ValeurCarte): ValeurCarte {
  return Object.freeze(v)
}

const CARTE = Object.freeze({
  /** OSM tile side, px. */
  COTE_TUILE_CARTE_PX: valeur({
    valeur: 256,
    unite: 'px',
    source: 'OSM — schéma de tuiles « slippy map »',
    tolerance: 'sans objet — format',
  }),

  /** Whole world fits the map: at zoom 1, 512 px wide. */
  ZOOM_CARTE_MIN: valeur({
    valeur: 1,
    unite: '—',
    source: 'convention — la plus petite vue qui remplit la largeur de la carte « Site »',
    tolerance: 'sans objet — borne d’interface',
  }),

  /**
   * ≈ 1 m/px at 45° latitude (path vs field). Finer changes nothing for sky: 1″ latitude = 30 m.
   */
  ZOOM_CARTE_MAX: valeur({
    valeur: 17,
    unite: '—',
    source: 'OSM — 2π × 6 378 137 m × cos 45° / 2²⁵ ≈ 0,84 m/px',
    tolerance: 'sans objet — borne d’interface',
  }),

  /** Region of a few hundred km around the site: enough to orient. */
  ZOOM_CARTE_INITIAL: valeur({
    valeur: 8,
    unite: '—',
    source: 'convention — ≈ 400 m/px à 45°, une carte de 300 px couvre ≈ 120 km',
    tolerance: 'sans objet — vue d’ouverture',
  }),

  /**
   * One wheel notch or `+`/`-` key. Scene notch (×1,1 on field) = 0,14 level: 100 notches
   * world→street.
   */
  CRAN_ZOOM_CARTE: valeur({
    valeur: 0.5,
    unite: 'niveau',
    source: 'convention d’interaction — deux crans doublent l’échelle, 32 crans du monde à la rue',
    tolerance: 'sans objet — réglage d’interface',
  }),

  /** Below: release is a click; above: a drag. */
  SEUIL_GLISSER_PX: valeur({
    valeur: 4,
    unite: 'px',
    source: 'convention d’interaction — tremblement d’un clic à la souris ou au doigt',
    tolerance: 'sans objet — seuil d’interface',
  }),

  /** Arrow-key step, fraction of map side. */
  PAS_CLAVIER_FRACTION: valeur({
    valeur: 0.1,
    unite: '—',
    source: 'convention d’interaction — dix pas traversent la carte',
    tolerance: 'sans objet — réglage d’interface',
  }),

  /** Max wait per tile; beyond, embedded background stays alone there. */
  DELAI_MAX_TUILE_CARTE_MS: valeur({
    valeur: 10000,
    unite: 'ms',
    source: 'convention — une tuile de 20 ko passe en quelques secondes même en 3G',
    tolerance: 'sans objet — plafond de garde',
  }),

  /** Tiles kept in memory: 300 × 200 px map shows ~12; cap covers ~20 views w/o refetch. */
  TUILES_CARTE_CACHE_MAX: valeur({
    valeur: 256,
    unite: '—',
    source: 'convention — 256 tuiles × 256² px × 4 octets ≈ 64 Mo au pire décodées',
    tolerance: 'sans objet — plafond de garde',
  }),
} satisfies Record<string, ValeurCarte>)

export type IdCarte = keyof typeof CARTE

/** Value read, like `K()` of registre §2.1. */
export function C(id: IdCarte): number {
  return CARTE[id].valeur
}
