/**
 * §4.1 — Web Mercator tile (EPSG:3857), both directions.
 * T-0363 — relief went place → pixel; location-picker map goes pixel → place. Same module so
 * round trip never depends on two writings of one formula. Definition, nothing tunable.
 */

import { DEG } from './mat3.ts'
import { DEMI_TOUR_DEG, TOUR_DEG, encadre, ramene } from './unites.ts'

/** Beyond: Mercator square ends, y = 0 at top of world. */
export const LATITUDE_MAX_MERCATOR_DEG = Math.atan(Math.sinh(Math.PI)) / DEG

export interface PointMonde {
  readonly x: number
  readonly y: number
}

export interface Lieu {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
}

/** World side, pixels, at zoom `z` for `cote`-pixel tiles. */
export function cotePixelsMonde(z: number, cote: number): number {
  return cote * 2 ** z
}

/** World-pixel position at zoom `z`; tile = this / `cote`. */
export function pixelMonde(latDeg: number, lonDeg: number, z: number, cote: number): PointMonde {
  const monde = cotePixelsMonde(z, cote)
  const phi = latDeg * DEG
  return {
    x: ((lonDeg + DEMI_TOUR_DEG) / TOUR_DEG) * monde,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * monde,
  }
}

/** Place under a world pixel: longitude wraps at antimeridian, latitude stops at square edge. */
export function lieuDePixel(x: number, y: number, z: number, cote: number): Lieu {
  const monde = cotePixelsMonde(z, cote)
  const lon = ramene((x / monde) * TOUR_DEG, TOUR_DEG) - DEMI_TOUR_DEG
  const n = Math.PI * (1 - (2 * encadre(y, 0, monde)) / monde)
  return { latitudeDeg: Math.atan(Math.sinh(n)) / DEG, longitudeDeg: lon }
}
