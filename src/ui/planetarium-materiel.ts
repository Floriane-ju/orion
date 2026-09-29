/** §9 — ce que la scène doit savoir du filé pour l'incruster dans le cadre. */

import type { EntreeProfondeur } from '../core/galactique.ts'
import type { OptiquePose } from './dessine-pose-cadre.ts'

export interface MaterielFile {
  /** §9.1 / T-0142 — ce dont la carte de pose a besoin quand elle se peint dans le cadre. */
  readonly optique: OptiquePose
  readonly profondeur: EntreeProfondeur
  readonly echApx: number
  readonly sbCiel: number
}
