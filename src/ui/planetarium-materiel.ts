/** §9 — what the scène must know of the filé to inlay it in the cadre. */

import type { EntreeProfondeur } from '../core/galactique.ts'
import type { OptiquePose } from './dessine-pose-cadre.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { ModeInterface, VueCibles } from './seance-etat.ts'

/** §9.2 — depth of a pose, minus the pose: joined where the séance is read. */
export type ProfondeurSansPose = Omit<EntreeProfondeur, 'tPoseS'>

export interface MaterielFile {
  /** §9.1 / T-0142 — what the pose map needs when painted in the cadre. */
  readonly optique: OptiquePose
  readonly profondeur: ProfondeurSansPose
  readonly sbCiel: number
}

/**
 * T-0377 — declination pose map serves grand champ; in ciel profond the target guides the pose.
 * Mode hides the map without touching the preference (returns with Panorama).
 * T-0142: no matériel → no NPF → nothing to paint.
 */
export function poseCadreAffichee(
  mode: ModeInterface,
  poseDansCadre: boolean,
  materiel: MaterielFile | undefined,
): OptiquePose | null {
  return mode === 'PANORAMA' && poseDansCadre && materiel !== undefined ? materiel.optique : null
}

/**
 * T-0283 — scène marks the target only while its fiche is open: back on the list the séance
 * keeps the target, the scène has nothing to designate. Panorama: no fiche.
 * "Mon plan": same marker on EACH target photographed that night. `null` = plan not computed.
 */
export function ciblesMarquees(
  mode: ModeInterface,
  vueCibles: VueCibles,
  cible: ObjetCielProfond | null,
  ciblesPlan: readonly ObjetCielProfond[] | null,
): readonly ObjetCielProfond[] {
  if (mode === 'PLAN') return ciblesPlan ?? []
  return mode === 'CIEL_PROFOND' && vueCibles === 'FICHE' && cible !== null ? [cible] : []
}

/**
 * §6.4 — what the scène keeps in full light. "Mon plan": the question is the plan's, not the
 * catalogue filters': any object it does not photograph dims (never removed, as under filters,
 * `cibles-en-avant.ts`). Plan not computed yet: filters stay the answer.
 */
export function enAvantScene(
  mode: ModeInterface,
  enAvant: ReadonlySet<string> | null,
  ciblesPlan: readonly ObjetCielProfond[] | null,
): ReadonlySet<string> | null {
  if (mode !== 'PLAN' || ciblesPlan === null) return enAvant
  return new Set(ciblesPlan.map((o) => o.designation))
}
