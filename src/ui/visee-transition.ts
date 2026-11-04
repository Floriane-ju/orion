/**
 * §6.4, T-0447 — « Cadrer » glides the displayed visée to the cible, no jump.
 * Display only: store holds the arrival at once, panels and persistence never read a mid-way aim.
 */

import { ecartCourt, ramene, TOUR_DEG } from '../core/unites.ts'
import { adoucit } from './horizon-transition.ts'

export interface DirectionVisee {
  readonly azimutDeg: number
  readonly hauteurDeg: number
}

export interface TransitionVisee {
  readonly depart: DirectionVisee
  readonly debutMs: number
}

/**
 * Aim at `ms`; `cible` itself (identity) once finished.
 * `cible` passed per frame, not frozen at start: sky keeps turning during the glide.
 * Azimut by shortest arc: 350° → 10° must not sweep the whole horizon.
 */
export function viseeA(
  transition: TransitionVisee,
  cible: DirectionVisee,
  ms: number,
  dureeMs: number,
): DirectionVisee {
  const t = dureeMs <= 0 ? 1 : (ms - transition.debutMs) / dureeMs
  if (t >= 1) return cible
  const f = adoucit(Math.max(0, t))
  const { depart } = transition
  const ecartAzimutDeg = ecartCourt(depart.azimutDeg, cible.azimutDeg, TOUR_DEG)
  return {
    azimutDeg: ramene(depart.azimutDeg + ecartAzimutDeg * f, TOUR_DEG),
    hauteurDeg: depart.hauteurDeg + (cible.hauteurDeg - depart.hauteurDeg) * f,
  }
}
