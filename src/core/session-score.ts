/**
 * §8.3 — C-15 scoring, exposed not learned. Five independent criteria clamped to [0, 1], then a
 * weighted sum whose trace carries the five terms. None hidden: plan fiche shows them as is.
 */

import { K, type ConstantId } from '../registry/constants.ts'
import { trace } from './traced.ts'
import type { Traced } from './traced.ts'
import type { DetailScore, PoidsScoring } from './session-types.ts'
import type { ToleranceLune } from './detectability.ts'
import { encadre } from './unites.ts'

const borne = (valeur: number): number => encadre(valeur, 0, 1)

export function scoreCadrage(remplissage: number): number {
  const cible = K('REMPLISSAGE_CADRE_CIBLE')
  return borne(1 - Math.abs(remplissage - cible) / cible)
}

export function scoreHauteur(altCulminationDeg: number): number {
  return borne(
    (altCulminationDeg - K('SEUIL_HAUTEUR_IMAGERIE_DEG')) / K('ETENDUE_SCORE_HAUTEUR_DEG'),
  )
}

export function scoreSignal(dureeCreneauMin: number, tRequisMin: number): number {
  return tRequisMin <= 0 ? 0 : borne(dureeCreneauMin / tRequisMin)
}

export function scoreFenetre(dureeCreneauMin: number, dureeNuitMin: number): number {
  return dureeNuitMin <= 0 ? 0 : borne(dureeCreneauMin / dureeNuitMin)
}

/** §8.3 "tolérance selon type d'objet": same Moon costs a galaxy more than an Hα. */
const DIVISEUR_LUNE = Object.freeze({
  FORTE: 'TOLERANCE_LUNE_DELTA_SB_MAG',
  MOYENNE: 'TOLERANCE_LUNE_MOYENNE_DELTA_SB_MAG',
  FAIBLE: 'TOLERANCE_LUNE_FAIBLE_DELTA_SB_MAG',
} as const satisfies Record<ToleranceLune, ConstantId>)

export function scoreLune(deltaSb: number, tolerance: ToleranceLune): number {
  return borne(1 - deltaSb / K(DIVISEUR_LUNE[tolerance]))
}

export type DegradationLune = 'AUCUNE' | 'FAIBLE' | 'MOYENNE' | 'FORTE'

/** What Moon takes from THIS target: share of S_lune lost, classed. */
export function degradationLune(deltaSb: number, tolerance: ToleranceLune): DegradationLune {
  const perte = 1 - scoreLune(deltaSb, tolerance)
  if (perte < K('DEGRADATION_LUNE_AUCUNE_MAX')) return 'AUCUNE'
  if (perte < K('DEGRADATION_LUNE_FAIBLE_MAX')) return 'FAIBLE'
  if (perte < K('DEGRADATION_LUNE_MOYENNE_MAX')) return 'MOYENNE'
  return 'FORTE'
}

export function scoreGlobal(detail: DetailScore, poids: PoidsScoring): Traced<number> {
  const valeur =
    poids.cadrage * detail.cadrage +
    poids.hauteur * detail.hauteur +
    poids.signal * detail.signal +
    poids.fenetre * detail.fenetre +
    poids.lune * detail.lune
  return trace({
    value: valeur,
    formula: 'SCORE_CIBLE',
    // Weights enter the trace: once tuned they differ from registry's; a breakdown showing only
    // C-15 would lie about the calc it explains.
    inputs: {
      s_cadrage: detail.cadrage,
      s_hauteur: detail.hauteur,
      s_signal: detail.signal,
      s_fenetre: detail.fenetre,
      s_lune: detail.lune,
      w_cadrage: poids.cadrage,
      w_hauteur: poids.hauteur,
      w_signal: poids.signal,
      w_fenetre: poids.fenetre,
      w_lune: poids.lune,
    },
    constants: [
      'POIDS_SCORING_CADRAGE',
      'POIDS_SCORING_HAUTEUR',
      'POIDS_SCORING_SNR',
      'POIDS_SCORING_FENETRE',
      'POIDS_SCORING_LUNE',
    ],
  })
}
