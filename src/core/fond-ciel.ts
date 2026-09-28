/**
 * §2.2, §4.1 — établissement du fond de ciel d'un site.
 *
 * Deux sources, par ordre de priorité décroissante :
 *   1. sqm_mesure      saisi par l'utilisateur → prévaut toujours
 *   2. bortle_declare  saisi à la main, échelle 1 à 9
 *
 * L'atlas de pollution lumineuse aux coordonnées est écarté par le PRD 1.2 (Annexe C,
 * décision 18) : il exigerait le réseau là où §4.1 veut une saisie exacte et hors ligne.
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
  /** Mesure au sky quality meter, mag/arcsec². Prioritaire sur tout le reste. */
  readonly sqmMesure?: number | undefined
  /** Bortle saisi à la main. */
  readonly bortleDeclare?: number | undefined
  /** L'utilisateur a confirmé un SQM plus sombre que le fond de ciel naturel. */
  readonly sqmConfirme?: boolean | undefined
}

export interface FondDeCiel {
  readonly sbCiel: Traced<number>
  /** `null` quand la mesure sort du domaine de la table : aucune valeur n'est extrapolée. */
  readonly mLimOeil: Traced<number | null>
  readonly sourceSb: SourceSb
  /**
   * Renseigné quand la saisie doit être confirmée avant d'être exploitée — un SQM plus
   * sombre que le fond de ciel naturel le plus sombre connu (§2.2).
   */
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

/**
 * Établit le fond de ciel du site. Lève `BortleHorsTableError` si un Bortle hors [1 ; 9]
 * est fourni : la saisie est refusée plutôt qu'extrapolée.
 */
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
