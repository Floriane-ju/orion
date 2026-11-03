/**
 * §7 — displayed time, to the minute, in interface language.
 * T-0110 — same function lived in `Verdicts.tsx` and `PlanSession.tsx`, the first commented
 * « comme partout ailleurs »: a promise two definitions can't keep. Plan de séance and the verdict
 * justifying it cite the same créneaux; same date format must not rely on hand upkeep.
 * T-0162 — time panel sets the instant field by field: format is locale's, `partiesJour` returns
 * its pieces without rewriting — splitting into compteurs must not change order or punctuation.
 */

import { LOCALE } from '../registry/ecriture.ts'

export { LOCALE }

/** Time alone, no date: a créneau's two bounds fall in the same night. */
export function heure(date: Date): string {
  return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
}

/**
 * Day in digits, two-digit: « 07/01/2026 ».
 * T-0314 had abbreviated month as letters; time block mock-up returns to digits: three fixed-width
 * compteurs aligned under the hour's two. Drag captures pointer, width never hindered the gesture.
 * T-0327 — weekday removed: not a settable field; as text before three boxed fields it read as a
 * fourth that didn't respond.
 */
const OPTIONS_JOUR: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}

/**
 * Time to the minute: accelerated transport gone, seconds showed nothing (clock dragged by hand,
 * frise targets minute).
 */
const OPTIONS_HEURE: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
}

/**
 * Full instant, date and time: night bounds fall on two days.
 * T-0276 — to the minute, like `heure`: « 19:40:53 » beside « 19:40 » was another writing.
 */
export function dateHeure(date: Date): string {
  return date.toLocaleString(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** A count, with interface-language thousands separator. */
export function compte(n: number): string {
  return n.toLocaleString(LOCALE)
}

/**
 * Day and time pieces, separators included — order and punctuation stay locale's, « 31/08/2026 »
 * or another language someday.
 */
export function partiesJour(date: Date): readonly Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat(LOCALE, OPTIONS_JOUR).formatToParts(date)
}

export function partiesHeure(date: Date): readonly Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat(LOCALE, OPTIONS_HEURE).formatToParts(date)
}

/**
 * Longest width of each instant piece, in chars: longest month, day, two-digit hour. MEASURED over
 * the twelve months of a year at day's end, in the locale itself, not written: « sept. » isn't
 * « mai »'s width in all languages.
 */
export const LARGEURS_INSTANT: Readonly<Partial<Record<Intl.DateTimeFormatPartTypes, number>>> =
  (() => {
    const largeurs: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {}
    const mois = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 28, 23, 59, 59))
    for (const date of mois) {
      for (const partie of [...partiesJour(date), ...partiesHeure(date)]) {
        largeurs[partie.type] = Math.max(largeurs[partie.type] ?? 0, partie.value.length)
      }
    }
    return Object.freeze(largeurs)
  })()

/** The six fields time panel sets separately. Month is human: 1 to 12. */
export type ChampInstant = 'annee' | 'mois' | 'jour' | 'heure' | 'minute' | 'seconde'

/**
 * T-0162 — same instant, one field rewritten.
 * Day clamped to the TARGET month's last day; hours, minutes, seconds overflow freely: dragging
 * months from a 31st gives 28 Feb not 3 Mar (gesture sets a month, not a duration), but dragging
 * hours past midnight must change day (an instant is being moved).
 */
export function dateAvec(date: Date, champ: ChampInstant, valeur: number): Date {
  const annee = champ === 'annee' ? valeur : date.getFullYear()
  const mois = (champ === 'mois' ? valeur : date.getMonth() + 1) - 1
  const heures = champ === 'heure' ? valeur : date.getHours()
  const minutes = champ === 'minute' ? valeur : date.getMinutes()
  const secondes = champ === 'seconde' ? valeur : date.getSeconds()
  // Day zero of next month IS the last of the target month.
  const dernierJour = new Date(annee, mois + 1, 0).getDate()
  const jour =
    champ === 'jour' ? valeur : Math.min(date.getDate(), dernierJour)
  return new Date(annee, mois, jour, heures, minutes, secondes)
}
