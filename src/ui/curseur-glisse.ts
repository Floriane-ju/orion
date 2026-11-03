/**
 * T-0169 — rail law, isolated from component. Rail maps finite course to finite range; unlike
 * compteur (`compteur-glisse.ts`) no speed: value = what pointer x designates. Here: course ↔
 * valeur + accroche.
 * ACCROCHE in rail px, never business units (seconds tolerance imperceptible on 240 s rail,
 * uncrossable on 1 s one): detente same width everywhere.
 */

import { encadre, S_PAR_H, S_PAR_MIN } from '../core/unites.ts'

/** Detente half-width, CSS rail px. Gesture law, not business threshold: not in registre §2.1. */
const ACCROCHE_PX = 7

export interface Rail {
  readonly min: number
  readonly max: number
  /** Cran. Function if it varies along course (T-0374: pose time per s < 1 min, per min > 1 h). */
  readonly pas: number | ((valeur: number) => number)
  /**
   * T-0374 — log course: each decade same rail length (linear 1 s → 8 h put pose max, ~30 s, in
   * first thousandth). `min` must be > 0.
   */
  readonly echelle?: 'log'
  /** Value that magnets the gesture, if rail has one. */
  readonly accroche?: number
}

/** Value aligned on pas from `min`, clamped to course. */
export function valeurQuantifiee(valeur: number, rail: Rail): number {
  const brut = typeof rail.pas === 'function' ? rail.pas(valeur) : rail.pas
  const pas = brut > 0 ? brut : rail.max - rail.min
  // Variable pas aligns on zero: « 10 min » must land on a cran, not 10 min + 1 s.
  const origine = typeof rail.pas === 'function' ? 0 : rail.min
  const crans = Math.round((valeur - origine) / pas)
  // Non-integer pas (hundredths, luminance floor): float sum dust (0.30000000000000004) would
  // reach displayed text.
  const cranee = Number((origine + crans * pas).toPrecision(12))
  return encadre(cranee, rail.min, rail.max)
}

/** Accroche if inside course; outside: ignored, not clamped (rail-end marker would lie). */
export function accrocheDansLaCourse(rail: Rail): number | null {
  const a = rail.accroche
  if (a === undefined || !Number.isFinite(a) || a < rail.min || a > rail.max) return null
  return a
}

/** Course fraction [0, 1] of a value: thumb and marker position. */
export function fractionDuRail(valeur: number, rail: Rail): number {
  const course = rail.max - rail.min
  if (course <= 0) return 0
  if (rail.echelle === 'log') {
    return encadre(Math.log(valeur / rail.min) / Math.log(rail.max / rail.min), 0, 1)
  }
  return encadre((valeur - rail.min) / course, 0, 1)
}

/** Value of a course fraction, quantized then snapped. */
export function valeurDuRail(fraction: number, rail: Rail, largeurPx: number): number {
  const brut =
    rail.echelle === 'log'
      ? rail.min * (rail.max / rail.min) ** fraction
      : rail.min + fraction * (rail.max - rail.min)
  const valeur = valeurQuantifiee(brut, rail)
  const accroche = accrocheDansLaCourse(rail)
  if (accroche === null || largeurPx <= 0) return valeur
  // Measured in course not value: detente keeps width whatever the échelle.
  const ecartPx = Math.abs(fraction - fractionDuRail(accroche, rail)) * largeurPx
  return ecartPx <= ACCROCHE_PX ? accroche : valeur
}

/**
 * T-0374 — cran of duration rail: 1 s < 1 min, 1 min < 1 h, 5 min beyond. Gesture law: on log
 * course fixed pas is too fine at top, too coarse at bottom. Each cran written without remainder
 * by `dureeLisible` (counts in minutes).
 */
const CRAN_HEURE_MIN = 5

export function cranDeDuree(secondes: number): number {
  if (secondes < S_PAR_MIN) return 1
  if (secondes < S_PAR_H) return S_PAR_MIN
  return CRAN_HEURE_MIN * S_PAR_MIN
}
