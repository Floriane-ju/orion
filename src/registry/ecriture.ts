/**
 * §10 — number formatting, screen + export.
 * T-0276: `toFixed` gave "17.01 °" vs registre/glossaire comma; reader-facing numbers go here,
 * `toFixed` only for machine-read values (CSS, colour, attribute).
 * In registre (not core/ui): moteur writes sentences too; convention, not calcul.
 */

import { MIN_PAR_H, POURCENT, S_PAR_MIN } from '../core/unites.ts'

/** UI locale: one value, else two screens date differently. */
export const LOCALE = 'fr-FR'

const FORMATS = new Map<number, Intl.NumberFormat>()

/** No grouping <5 digits (French usage); "6 000" placeholder invites typing a space. */
const GROUPEMENT = 'min2'

/**
 * `n` to `decimales` digits, thousands sep. `signDisplay: 'negative'`: no phantom "−0,00".
 */
export function nombre(n: number, decimales = 0): string {
  let format = FORMATS.get(decimales)
  if (format === undefined) {
    format = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
      signDisplay: 'negative',
      useGrouping: GROUPEMENT,
    })
    FORMATS.set(decimales, format)
  }
  return format.format(n)
}

/** Angle: degree glued to number ("39,5°"), never "39,5 °". */
export function degres(n: number, decimales = 0): string {
  return `${nombre(n, decimales)}°`
}

/** Fraction as percent, space before sign ("42 %"). */
export function pourcentage(fraction: number, decimales = 0): string {
  return `${nombre(fraction * POURCENT, decimales)} %`
}

/** 6 significant digits: truncates no registre constant. */
const CHIFFRES_SIGNIFICATIFS_LIBRES = 6
const FORMAT_LIBRE = new Intl.NumberFormat(LOCALE, {
  maximumSignificantDigits: CHIFFRES_SIGNIFICATIFS_LIBRES,
  signDisplay: 'negative',
  useGrouping: GROUPEMENT,
})

/** Number whose precision the screen doesn't decide (constant, saisie, unfolded formula input). */
export function nombreLibre(n: number): string {
  return FORMAT_LIBRE.format(n)
}

/** <10 s a pose reads to the tenth; integer rounding would flatten it. */
const POSE_AU_DIXIEME_SOUS_S = 10

/** Pose duration without unit: "2,5", "13". */
export function formatePose(tS: number): string {
  return nombre(tS, tS < POSE_AU_DIXIEME_SOUS_S ? 1 : 0)
}

/** Saisie re-read as-is: "2.8" typed reads "2,8". */
export function saisieLue(saisie: string): string {
  return saisie.replace('.', ',')
}

/**
 * T-0276 — sole duration writing: "45 min" <1 h, "6 h 50" above; no decimal hours.
 * Round on total minutes, else 59,6 min → "0 h 60".
 */
export function dureeLisible(secondes: number): string {
  const totalMin = Math.round(secondes / S_PAR_MIN)
  if (totalMin < MIN_PAR_H) return `${totalMin} min`
  const heures = Math.floor(totalMin / MIN_PAR_H)
  const minutes = totalMin - heures * MIN_PAR_H
  return `${heures} h ${minutes.toString().padStart(2, '0')}`
}

/** Duration in minutes, written like all others. */
export function dureeMinLisible(minutes: number): string {
  return dureeLisible(minutes * S_PAR_MIN)
}
