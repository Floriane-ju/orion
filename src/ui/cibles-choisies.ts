/**
 * §6.4 → §8.3 — cibles user wants tonight. Sole INPUT of plan de séance: ciel proposes (§6.4),
 * user chooses, engine orders; absent → plan falls back to unasked palmarès.
 * Module store like [[seance-etat]], [[catalogue-etat]]: the two add gestures (fiche header, list
 * row) share no ancestor but app; list unmounts while fiche read.
 * Store a désignation, not the object (catalogue key everywhere; copy goes stale on update).
 */

import { useSyncExternalStore } from 'react'
import { ecritCiblesChoisies } from '../data/db.ts'
import { creeAbonnes } from './abonnes.ts'

let etat: ReadonlySet<string> = Object.freeze(new Set<string>())
const { abonne, notifie } = creeAbonnes()

/**
 * §12.3 — no write until startup re-read succeeded. Else (1) write overwrites saved selection
 * with first-render empty one; (2) on re-read FAILURE screen already promises « plus rien ne
 * s'enregistre » (`app-donnees.ts`): same as lieu, matériel.
 */
let hydrate = false

export function ciblesChoisies(): ReadonlySet<string> {
  return etat
}

function pose(suivant: ReadonlySet<string>): void {
  etat = Object.freeze(suivant)
  notifie()
}

/**
 * §12.3 — selection re-read from DB, set before first render; opens writes.
 * T-0431 — failed re-read: writes stay closed, URL-carried selection still shows
 * (`ouvreEcritures` false).
 */
export function poseCiblesChoisies(designations: readonly string[], ouvreEcritures = true): void {
  if (ouvreEcritures) hydrate = true
  pose(new Set(designations))
}

/** Toggle cible in plan. One verb: two functions force caller to read state outside render. */
export function basculeChoixCible(designation: string): void {
  const suivant = new Set(etat)
  if (!suivant.delete(designation)) suivant.add(designation)
  pose(suivant)
  if (!hydrate) return
  // Write failure unsurfaced: plan stays right, only reload survival lost. Usual cause (DB won't
  // open) already announced at startup (`demarre`, §12.5).
  void ecritCiblesChoisies([...suivant]).catch(() => undefined)
}

/** Reset selection incl. hydrate. Tests only. */
export function reinitialiseCiblesChoisies(): void {
  hydrate = false
  pose(new Set())
}

export function useCiblesChoisies(): ReadonlySet<string> {
  return useSyncExternalStore(abonne, ciblesChoisies, ciblesChoisies)
}
