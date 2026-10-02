/**
 * T-0282, §6.4 — ce qu'on vient chercher dans une fiche, réuni en tête : combien de temps
 * poser, combien d'images, et quand. Ces trois réponses étaient éparses dans « Détectabilité »,
 * « Pose » et « Combien de photos », jamais à l'écran ensemble.
 *
 * Une cible inscrite au plan reprend les valeurs de SON étape : le plan peut ne lui allouer
 * qu'une part de l'intégration, ou un créneau plus court que sa fenêtre. Annoncer ici autre
 * chose que le plan ferait deux réponses à une seule question. Hors du plan, la fiche répond
 * avec son propre calcul — le même moteur, sur la même nuit (T-0268).
 */

import type { Intervalle } from '../core/creneaux.ts'
import type { EtapePlan } from '../core/session-types.ts'
import type { CreneauFiche } from './fiche-cible-creneau.ts'

export interface SyntheseFiche {
  readonly poseS: number | null
  readonly nPoses: number | null
  readonly creneau: Intervalle | null
  /** Vrai quand les trois valeurs sont celles de l'étape du plan. */
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

/** Un créneau GEM coupé au méridien se résume à son début et à sa fin : le détail reste plus bas. */
function enveloppe(creneau: CreneauFiche): Intervalle | null {
  if (!creneau.chiffre || creneau.creneau.causeExclusion !== undefined) return null
  const sous = creneau.creneau.creneaux
  const premier = sous[0]
  const dernier = sous[sous.length - 1]
  return premier === undefined || dernier === undefined
    ? null
    : { debut: premier.debut, fin: dernier.fin }
}
