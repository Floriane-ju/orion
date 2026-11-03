/**
 * §13.1 — third parties the app contacts, and what is sent.
 * Single source: CSP (`vite.config.ts`) derives from it; `tests/csp.test.ts` rejects divergence.
 * New origin = PRD amendment.
 */

import { ORIGINES_IMAGERIE } from './imagerie.ts'
import { ORIGINES_RELIEF } from './relief.ts'
import { ORIGINES_CARTE } from './lieu-carte.ts'

export interface OrigineTiers {
  readonly origine: string
  /** Sent in clear to this third party; §13.1 enumerates it. */
  readonly transmis: string
}

export const ORIGINES_TIERS: readonly OrigineTiers[] = Object.freeze([
  ...ORIGINES_IMAGERIE,
  ...ORIGINES_RELIEF,
  ...ORIGINES_CARTE,
])
