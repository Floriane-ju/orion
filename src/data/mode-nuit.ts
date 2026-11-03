/**
 * §11.1 — night mode survives restart: state persists in local storage.
 * T-0338 — persistence lives in `src/data/`: `ModeNuit` component decides/applies, never touches
 * storage. UI state → `stockage-local.ts`: must be known BEFORE first render, else the screen
 * lights white during an async read — what the mode protects against.
 */

import { K } from '../registry/constants.ts'
import { booleen, ecritLocal, fini, litLocal } from './stockage-local.ts'

export interface EtatModeNuit {
  readonly actif: boolean
  readonly luminance: number
}

const CLE_STOCKAGE = 'orion.mode-nuit'
/** Pre-Orion key: reread one last time, never rewritten. */
const CLE_STOCKAGE_ANCIENNE = 'astrofort.mode-nuit'
export const LUMINANCE_NOMINALE = 1

export const ETAT_INITIAL: EtatModeNuit = Object.freeze({
  actif: false,
  luminance: LUMINANCE_NOMINALE,
})

/**
 * Mode stays active across restart and views (§11.1).
 * Local storage is outside the trust perimeter: tampered or earlier-version keys must not
 * propagate. Each field of unexpected shape falls back to `ETAT_INITIAL`; intruder fields
 * ignored, incl. `typeDalle` and `autoActivation` (pre-T-0140 versions).
 */
export function litEtatPersiste(): EtatModeNuit {
  const lu = litLocal(CLE_STOCKAGE, CLE_STOCKAGE_ANCIENNE)
  if (lu === null) return ETAT_INITIAL
  const plancher = K('LUMINANCE_PLANCHER_MODE_NUIT')
  const luminance = lu.luminance as number
  return {
    actif: booleen(lu.actif) ? (lu.actif as boolean) : ETAT_INITIAL.actif,
    luminance:
      fini(luminance) && luminance >= plancher && luminance <= LUMINANCE_NOMINALE
        ? luminance
        : ETAT_INITIAL.luminance,
  }
}

/**
 * Written at each toggle, not page exit (`gardeAuDepart`): state held by React, changes rarely,
 * least affordable to lose.
 */
export function ecritEtatPersiste(etat: EtatModeNuit): void {
  ecritLocal(CLE_STOCKAGE, etat)
}
