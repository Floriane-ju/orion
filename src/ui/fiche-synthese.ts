/**
 * T-0282, §6.4 — what one comes to a fiche for, gathered at top: pose time, image count, when.
 * Were scattered in « Détectabilité », « Pose », « Combien de photos », never on screen together.
 * Cible in the plan takes ITS étape's values: plan may allot only part of integration, or a
 * créneau shorter than fenêtre; else two answers to one question. Outside plan, fiche answers with
 * own calc — same engine, same night (T-0268).
 */

import type { Intervalle } from '../core/creneaux.ts'
import type { EtapePlan } from '../core/session-types.ts'
import type { CreneauFiche } from './fiche-cible-creneau.ts'

export interface SyntheseFiche {
  readonly poseS: number | null
  readonly nPoses: number | null
  readonly creneau: Intervalle | null
  /** True when the three values are the plan étape's. */
  readonly auPlan: boolean
}

export interface CalculFiche {
  readonly pose: { readonly tAfficheeS: number } | null
  readonly integration: { readonly nPoses: { readonly value: number } } | null
}

export function syntheseFiche(
  calcul: CalculFiche,
  creneau: CreneauFiche,
  etape: Pick<EtapePlan, 'tPoseS' | 'nPoses' | 'creneauAlloue'> | null,
): SyntheseFiche {
  if (etape !== null) {
    return { poseS: etape.tPoseS, nPoses: etape.nPoses, creneau: etape.creneauAlloue, auPlan: true }
  }
  return {
    poseS: calcul.pose?.tAfficheeS ?? null,
    nPoses: calcul.integration?.nPoses.value ?? null,
    creneau: enveloppe(creneau),
    auPlan: false,
  }
}

/** A GEM créneau cut at meridian is summarized by start and end: detail stays below. */
function enveloppe(creneau: CreneauFiche): Intervalle | null {
  if (!creneau.chiffre || creneau.creneau.causeExclusion !== undefined) return null
  const sous = creneau.creneau.creneaux
  const premier = sous[0]
  const dernier = sous[sous.length - 1]
  return premier === undefined || dernier === undefined
    ? null
    : { debut: premier.debut, fin: dernier.fin }
}
