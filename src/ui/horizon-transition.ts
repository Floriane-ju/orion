/**
 * §4.1, T-0369 — drawn horizon eases between reliefs, no jump.
 * Site change: old relief flattens until the new one arrives, then rises from the displayed shape.
 * Display only: calc mask switches at once (recommendations never depend on interpolation).
 */

import { NB_AZIMUTS } from '../core/site.ts'

/** Pending relief target. Single instance: the loop compares by identity. */
export const HORIZON_PLAT: readonly number[] = Object.freeze(
  Array.from({ length: NB_AZIMUTS }, () => 0),
)

export interface TransitionHorizon {
  readonly depart: readonly number[]
  readonly cible: readonly number[]
  readonly debutMs: number
}

/** Smoothstep; = `--courbe` of the stylesheet. */
export function adoucit(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Horizon at `ms`; `cible` itself (identity) once finished. */
export function horizonA(transition: TransitionHorizon, ms: number, dureeMs: number): readonly number[] {
  const t = dureeMs <= 0 ? 1 : (ms - transition.debutMs) / dureeMs
  if (t >= 1 || transition.depart === transition.cible) return transition.cible
  const f = adoucit(Math.max(0, t))
  return transition.depart.map((a, i) => a + ((transition.cible[i] ?? a) - a) * f)
}

/**
 * Transition toward `cible`. First display: `cible` as is. New `cible` mid-way restarts from
 * the displayed shape.
 */
export function versHorizon(
  transition: TransitionHorizon | null,
  cible: readonly number[],
  ms: number,
  dureeMs: number,
): TransitionHorizon {
  if (transition === null) return { depart: cible, cible, debutMs: ms }
  if (transition.cible === cible) return transition
  return { depart: horizonA(transition, ms, dureeMs), cible, debutMs: ms }
}
