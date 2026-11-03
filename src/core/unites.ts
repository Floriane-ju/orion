/**
 * Unit changes and angle reductions — definitions, not quantities.
 * T-0336 — values were redeclared in ~40 modules (seven copies of one 24: one ends wrong).
 * Not §2.1 registry: 24 h = 1 turn by definition, nothing tunable; filing there would suggest it.
 */

export const TOUR_DEG = 360
export const DEMI_TOUR_DEG = 180
export const QUART_TOUR_DEG = 90
export const TOUR_RAD = 2 * Math.PI
export const HEURES_PAR_TOUR = 24
/** Hour-angle hours → degrees: unit change, not the A-ROT rate (§3.1). */
export const DEG_PAR_HEURE = TOUR_DEG / HEURES_PAR_TOUR
export const ARCMIN_PAR_DEG = 60
export const ARCSEC_PAR_ARCMIN = 60
export const ARCSEC_PAR_DEG = ARCMIN_PAR_DEG * ARCSEC_PAR_ARCMIN

export const MS_PAR_S = 1000
export const S_PAR_MIN = 60
export const MIN_PAR_H = 60
export const S_PAR_H = S_PAR_MIN * MIN_PAR_H
export const MS_PAR_MINUTE = MS_PAR_S * S_PAR_MIN
export const MS_PAR_H = MS_PAR_MINUTE * MIN_PAR_H

export const UM_PAR_MM = 1000

export const POURCENT = 100

/** `v` clamped to [min ; max]; one implementation for all clamps. */
export function encadre(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** `x` reduced to [0 ; tour[ — JS `%` keeps the dividend's sign. */
export function ramene(x: number, tour: number): number {
  return ((x % tour) + tour) % tour
}

/** Signed shortest-path gap `a` → `b`, in ]−tour/2 ; tour/2]. */
export function ecartCourt(a: number, b: number, tour: number): number {
  const d = ramene(b - a, tour)
  return d > tour / 2 ? d - tour : d
}
