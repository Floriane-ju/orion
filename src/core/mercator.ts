/**
 * §4.1 — la projection Web Mercator (EPSG:3857) des tuiles, dans les deux sens.
 *
 * T-0363 — le relief allait du lieu au pixel ; la carte de choix du lieu revient du pixel au
 * lieu. Les deux sens vivent ensemble pour que l'aller-retour ne dépende pas de deux écritures
 * de la même formule. La projection est une définition, pas une grandeur : rien ne s'y règle.
 */

import { DEG } from './mat3.ts'
import { DEMI_TOUR_DEG, TOUR_DEG, encadre, ramene } from './unites.ts'

/** Au-delà, le carré Mercator s'arrête : y = 0 en haut du monde. */
export const LATITUDE_MAX_MERCATOR_DEG = Math.atan(Math.sinh(Math.PI)) / DEG

export interface PointMonde {
  readonly x: number
  readonly y: number
}

export interface Lieu {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
}

/** Côté du monde, en pixels, au zoom `z` pour des tuiles de `cote` pixels. */
export function cotePixelsMonde(z: number, cote: number): number {
  return cote * 2 ** z
}

/** Position en pixels mondiaux au zoom `z` : la tuile est ce nombre divisé par `cote`. */
export function pixelMonde(latDeg: number, lonDeg: number, z: number, cote: number): PointMonde {
  const monde = cotePixelsMonde(z, cote)
  const phi = latDeg * DEG
  return {
    x: ((lonDeg + DEMI_TOUR_DEG) / TOUR_DEG) * monde,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * monde,
  }
}

/**
 * Le lieu sous un pixel mondial. La longitude se referme à l'antiméridien — la carte se
 * répète en largeur — ; la latitude, elle, s'arrête au bord du carré Mercator.
 */
export function lieuDePixel(x: number, y: number, z: number, cote: number): Lieu {
  const monde = cotePixelsMonde(z, cote)
  const lon = ramene((x / monde) * TOUR_DEG, TOUR_DEG) - DEMI_TOUR_DEG
  const n = Math.PI * (1 - (2 * encadre(y, 0, monde)) / monde)
  return { latitudeDeg: Math.atan(Math.sinh(n)) / DEG, longitudeDeg: lon }
}
