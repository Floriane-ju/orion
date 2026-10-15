/** §9 — ce que la scène doit savoir du filé pour l'incruster dans le cadre. */

import type { EntreeProfondeur } from '../core/galactique.ts'
import type { OptiquePose } from './dessine-pose-cadre.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { ModeInterface, VueCibles } from './seance-etat.ts'

/** §9.2 — la profondeur d'une pose, sans la pose : elle se joint là où la séance se lit. */
export type ProfondeurSansPose = Omit<EntreeProfondeur, 'tPoseS'>

export interface MaterielFile {
  /** §9.1 / T-0142 — ce dont la carte de pose a besoin quand elle se peint dans le cadre. */
  readonly optique: OptiquePose
  readonly profondeur: ProfondeurSansPose
  readonly sbCiel: number
}

/**
 * T-0377 — la carte de pose par déclinaison sert le grand champ : en ciel profond la pose est
 * guidée par la cible. Le mode masque la carte sans toucher à la préférence, qui revient avec
 * le Panorama. T-0142 : sans matériel, pas de NPF, donc rien à peindre.
 */
export function poseCadreAffichee(
  mode: ModeInterface,
  poseDansCadre: boolean,
  materiel: MaterielFile | undefined,
): OptiquePose | null {
  return mode === 'PANORAMA' && poseDansCadre && materiel !== undefined ? materiel.optique : null
}

/**
 * T-0283 — la scène marque la cible tant que sa fiche est ouverte, et seulement alors : au
 * retour à la liste, la séance garde la cible pour y revenir, mais la scène n'a plus rien
 * à désigner. En Panorama, il n'y a pas de fiche.
 *
 * Sur « Mon plan », le même repère se pose sur CHAQUE cible photographiée cette nuit : le plan
 * se lit alors dans le ciel comme la fiche y lit sa cible. `null` : plan pas encore calculé.
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
 * §6.4 — ce que la scène garde en pleine lumière. Sur « Mon plan », la question n'est plus
 * celle des filtres du catalogue mais celle du plan : tout objet qu'il ne photographie pas
 * s'estompe — estompé, jamais retiré, pour la même raison que sous les filtres
 * (`cibles-en-avant.ts`). Plan pas encore calculé : les filtres restent la réponse.
 */
export function enAvantScene(
  mode: ModeInterface,
  enAvant: ReadonlySet<string> | null,
  ciblesPlan: readonly ObjetCielProfond[] | null,
): ReadonlySet<string> | null {
  if (mode !== 'PLAN' || ciblesPlan === null) return enAvant
  return new Set(ciblesPlan.map((o) => o.designation))
}
