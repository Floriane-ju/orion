/**
 * T-0162 — horizontal-drag speed law, isolated from applying component.
 * ABSOLUTE not incremental: value recomputed from click-time value each move → reversible
 * (pointer back to start x = start value; summed deltas drift on rounding).
 * Exponent ≠ rail (`range` maps finite course to finite range; compteur has no course). Linear
 * forces fine vs full-range choice; power 3/2: first px = cran, distance = course, no mode switch.
 */

import { encadre } from '../core/unites.ts'
import { nombre } from '../registry/ecriture.ts'

/** Px of first cran. Below: changes nothing (click). */
const PX_PAR_CRAN = 6
/** Distance power. 3/2 hand-tuned: 60 px ≈ 30 crans (an hour or a month), 6 px = 1. */
const EXPOSANT = 1.5

/** Crans per horizontal CSS px move. Odd: left removes what right adds. */
export function cransGlisse(dxPx: number): number {
  const crans = Math.trunc((Math.abs(dxPx) / PX_PAR_CRAN) ** EXPOSANT)
  // Sign applied after: `Math.sign(-1) * 0` = -0, would reach displayed value.
  return crans === 0 ? 0 : Math.sign(dxPx) * crans
}

/** Decimals of a pas: « 0.01 » → 2, « 10 » → 0. */
function decimalesDuPas(pas: number): number {
  return (String(pas).split('.')[1] ?? '').length
}

/** Text dragged `dxPx` from `depart`: clamped to domain, pas-rounded (else 0.1+0.2 → 17 digits). */
export function texteGlisse(
  depart: number,
  dxPx: number,
  d: { readonly min: number; readonly max: number; readonly pas: number },
): string {
  const valeur = encadre(depart + cransGlisse(dxPx) * d.pas, d.min, d.max)
  return nombre(valeur, decimalesDuPas(d.pas))
}
