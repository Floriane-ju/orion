/** §9 — ce que la scène doit savoir du filé pour l'incruster dans le cadre. */

import type { EntreeProfondeur } from '../core/galactique.ts'
import type { OptiquePose } from './dessine-pose-cadre.ts'
import type { ModeInterface } from './seance-etat.ts'

export interface MaterielFile {
  /** §9.1 / T-0142 — ce dont la carte de pose a besoin quand elle se peint dans le cadre. */
  readonly optique: OptiquePose
  readonly profondeur: EntreeProfondeur
  readonly echApx: number
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
