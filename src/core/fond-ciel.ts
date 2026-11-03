/**
 * §2.2, §4.1 — site fond de ciel. Sources by priority: 1. sqm_mesure (user) always wins;
 * 2. bortle_declare (manual, 1-9).
 * Light-pollution atlas rejected (PRD 1.2 Annexe C, décision 18): needs network, §4.1 = offline.
 */

import {
  SB_PLANCHER_NATUREL,
  interpoleBortle,
  mLimOeilDepuisSb,
} from '../registry/bortle.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'

export type SourceSb = 'TABLE_BORTLE' | 'SQM_MESURE'

export interface EntreeFondDeCiel {
  /** SQM reading, mag/arcsec²; overrides all. */
  readonly sqmMesure?: number | undefined
  /** Manual Bortle. */
  readonly bortleDeclare?: number | undefined
  /** User confirmed SQM darker than natural sky. */
  readonly sqmConfirme?: boolean | undefined
}

export interface FondDeCiel {
  readonly sbCiel: Traced<number>
  /** `null` = measure outside table domain; never extrapolated. */
  readonly mLimOeil: Traced<number | null>
  readonly sourceSb: SourceSb
  /** Needs confirmation first: SQM darker than darkest natural sky (§2.2). */
  readonly confirmationRequise?: string
}

export class FondDeCielIndeterminableError extends Error {
  constructor() {
    super(
      'Indiquez un Bortle ou une mesure SQM pour estimer le fond de ciel.',
    )
    this.name = 'FondDeCielIndeterminableError'
  }
}

function depuisBortle(bortle: number): FondDeCiel {
  const ligne = interpoleBortle(bortle)
  return {
    sourceSb: 'TABLE_BORTLE',
    sbCiel: trace({
      value: ligne.sb,
      formula: 'INTERPOLATION_BORTLE',
      inputs: { bortle },
    }),
    mLimOeil: trace({
      value: ligne.mLimOeil,
      formula: 'INTERPOLATION_BORTLE',
      inputs: { bortle },
    }),
  }
}

/** Throws `BortleHorsTableError` for Bortle ∉ [1 ; 9]; no extrapolation. */
export function fondDeCiel(entree: EntreeFondDeCiel): FondDeCiel {
  const { sqmMesure, bortleDeclare, sqmConfirme } = entree

  if (sqmMesure !== undefined) {
    const mLim = mLimOeilDepuisSb(sqmMesure)
    const horsTable = mLim === null
    const result: FondDeCiel = {
      sourceSb: 'SQM_MESURE',
      sbCiel: trace({
        value: sqmMesure,
        formula: 'MESURE_SQM',
        inputs: { sqm_mesure: sqmMesure },
        note: 'Mesure SQM utilisée à la place du Bortle.',
      }),
      mLimOeil: trace({
        value: mLim,
        formula: 'INVERSION_BORTLE',
        inputs: { sb_ciel: sqmMesure },
        ...(horsTable
          ? {
              flags: ['DONNEE_MANQUANTE' as const],
              note:
                'Ciel hors de l’échelle de Bortle : non calculée.',
            }
          : {}),
      }),
    }
    if (sqmMesure > SB_PLANCHER_NATUREL && sqmConfirme !== true) {
      return {
        ...result,
        confirmationRequise:
          `SQM ${sqmMesure} : plus noir que le ciel le plus noir connu ` +
          `(${SB_PLANCHER_NATUREL}). Confirmez ou corrigez.`,
      }
    }
    return result
  }

  if (bortleDeclare !== undefined) return depuisBortle(bortleDeclare)

  throw new FondDeCielIndeterminableError()
}
