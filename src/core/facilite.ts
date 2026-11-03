/**
 * §6.4 — shooting facilité, read off the §8.3 score.
 *
 * Computes NOTHING new. C-15 score already aggregates 5 criteria — cadrage, hauteur, signal,
 * fenêtre, Lune — and `evalueCandidate` produces it for every catalogue cible. This file only
 * discretises it: a 6th criterion = one more judgment to defend, question settled. Sole
 * exception, T-0383: lunar degradation class caps the note (Lune weight in score too low for
 * a close Lune to lower it alone).
 *
 * Classes = EQUAL shares of the scale: `floor(score × max) + 1`. Threshold table = 5 arbitrary
 * numbers in an engine; real score range ≈ 0,1-0,9, misplaced thresholds would pile the whole
 * catalogue on one note, a reading deciding nothing.
 *
 * Note 0 never comes from a score: reserved for discard causes the engine names, as
 * `prd.md:83` forbids the other reading: « "impossible" n'existe presque jamais ; "combien de
 * temps" existe toujours ». Evaluated cible floors at 1.
 */

import { K } from '../registry/constants.ts'
import { TABLE_FACILITE } from '../registry/verdicts.ts'
import type { Candidate, CauseEcart, CibleEcartee } from './session-types.ts'
import { degradationLune, type DegradationLune } from './session-score.ts'

export interface Facilite {
  readonly note: number
  readonly libelle: string
}

/**
 * No magnitude nor dimensions in catalogue: object isn't difficult, it's undocumented. 0 would
 * assert an impossibility no computation established.
 */
const CODES_SANS_NOTE: readonly CauseEcart[] = Object.freeze(['DONNEE_MANQUANTE'])

/** Note of an evaluated cible: 1 to `FACILITE_NOTE_MAX`, never 0, never beyond. */
export function noteDepuisScore(score: number): number {
  const max = K('FACILITE_NOTE_MAX')
  return Math.min(max, Math.floor(Math.max(0, score) * max) + 1)
}

/**
 * Note of a discarded cible: 0, or no note. `CONFLIT_CRENEAU` and `BUDGET` = session-plan
 * ALLOCATION causes, not cible properties: `evalueCandidate` doesn't produce them. Counting
 * them as 0 has no effect today, stays right if a caller surfaces them.
 */
export function noteEcartee(code: CauseEcart): number | null {
  return CODES_SANS_NOTE.includes(code) ? null : 0
}

/** Scale label, or `null` if the table doesn't cover that note. */
export function libelleFacilite(note: number): string | null {
  return TABLE_FACILITE.find((ligne) => ligne.note === note)?.libelle ?? null
}

/**
 * T-0383 — cap a bothersome Lune imposes on the note. Score alone isn't enough: its lunar
 * weight (0,1) left "idéale" a cible whose fiche said strong degradation.
 */
export function plafondLune(degradation: DegradationLune): number {
  if (degradation === 'FORTE') return K('FACILITE_NOTE_MAX_LUNE_FORTE')
  if (degradation === 'MOYENNE') return K('FACILITE_NOTE_MAX_LUNE_MOYENNE')
  return K('FACILITE_NOTE_MAX')
}

/** Facilité of a cible as engine evaluated it, or `null` for lack of data. */
export function faciliteCible(r: Candidate | CibleEcartee): Facilite | null {
  const note =
    'objet' in r
      ? Math.min(
          noteDepuisScore(r.score.value),
          plafondLune(degradationLune(r.deltaSbLuneMag.value, r.detect.toleranceLune)),
        )
      : noteEcartee(r.code)
  if (note === null) return null
  const libelle = libelleFacilite(note)
  return libelle === null ? null : { note, libelle }
}
