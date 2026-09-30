/**
 * §13.1 — les tiers que l'application contacte, et ce qui leur est transmis.
 *
 * Source unique : la politique de sécurité du contenu (`vite.config.ts`) en est dérivée, et
 * `tests/csp.test.ts` refuse toute divergence. Ajouter une origine est un amendement du PRD.
 */

import { ORIGINES_IMAGERIE } from './imagerie.ts'
import { ORIGINES_RELIEF } from './relief.ts'

export interface OrigineTiers {
  readonly origine: string
  /** Ce qui est transmis à ce tiers, en clair. C'est ce que §13.1 énumère. */
  readonly transmis: string
}

export const ORIGINES_TIERS: readonly OrigineTiers[] = Object.freeze([
  ...ORIGINES_IMAGERIE,
  ...ORIGINES_RELIEF,
])
