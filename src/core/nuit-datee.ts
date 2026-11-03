/**
 * §8.1, §4.1 — which nuit an instant belongs to, and its name.
 * T-0267 — civil-day dating flipped to next night at midnight (00:30 at camp table, when app
 * matters most). Observation day = noon → noon: nuit keeps name of the evening it began.
 * Pivot = LEGAL noon, not §4.1 true solar noon: flip falls between sunrise and early afternoon,
 * no nuit running; 15 min shift moves no séance. Sunrise pivot would need the site to date a
 * nuit, while the dated nuit determines the site queried.
 */

import { K } from '../registry/constants.ts'

const deuxChiffres = (n: number): string => String(n).padStart(2, '0')

/**
 * LOCAL day in ISO. `toISOString().slice(0, 10)` = UTC day: after UTC midnight in summer it names
 * the next nuit.
 */
export function jourLocalIso(date: Date): string {
  return `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-${deuxChiffres(date.getDate())}`
}

/** Nuit containing the instant, named by its sunset day. */
export function nuitDeLInstant(instant: Date): string {
  const soir = new Date(instant)
  if (instant.getHours() < K('MIDI_JOUR_OBSERVATIONNEL_H')) {
    soir.setDate(soir.getDate() - 1)
  }
  return jourLocalIso(soir)
}

/**
 * Noon opening the observation day: sunset search starts here (§8.1). LOCAL noon, never UTC: east
 * of meridian UTC noon is past sunset → search skips to next nuit.
 */
export function midiDeLaNuit(nuitIso: string): Date {
  const midi = new Date(`${nuitIso}T00:00:00`)
  midi.setHours(K('MIDI_JOUR_OBSERVATIONNEL_H'))
  return midi
}

function lendemainIso(nuitIso: string): string {
  const matin = new Date(`${nuitIso}T00:00:00`)
  matin.setDate(matin.getDate() + 1)
  return jourLocalIso(matin)
}

/**
 * T-0431 — instant opening a nuit not being lived: its LOCAL midnight (opening noon = day sky).
 */
export function minuitDeLaNuit(nuitIso: string): Date {
  return new Date(`${lendemainIso(nuitIso)}T00:00:00`)
}

const enClair = (iso: string): string => iso.split('-').reverse().join('/')

/** A nuit has two dates: state both, no guessing (card and export announce this). */
export function nomDeLaNuit(nuitIso: string): string {
  return `nuit du ${enClair(nuitIso)} au ${enClair(lendemainIso(nuitIso))}`
}
