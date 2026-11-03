/**
 * §9.3 — the two indexes the filé pass walks: real catalogue up to catalogued threshold, generative
 * semis beyond.
 * T-0398 — built where the pass PAINTS, not in a React render: worker when it exists, else main
 * thread. Building in `useParametresFile` cost whole semis on main thread even with a worker.
 */

import { K } from '../registry/constants.ts'
import { semisGeneratif } from '../data/semis.ts'
import { construitIndex, type IndexCiel } from '../core/index-ciel.ts'
import type { Etoile } from '../data/catalog.ts'

export interface IndexFile {
  readonly indexReel: IndexCiel
  readonly indexSemis: IndexCiel
}

/** Stars layer 1 retains: all the worker needs to receive. */
export function etoilesReelles(etoiles: readonly Etoile[]): Etoile[] {
  return etoiles.filter((e) => e.magV <= K('SEUIL_MAG_ETOILES_REELLES'))
}

let semis: IndexCiel | null = null
const reels = new WeakMap<readonly Etoile[], IndexCiel>()

/**
 * Indexes of a catalogue, built once. Key = received array: reloaded catalogue = another array;
 * semis, drawn once for all, is shared.
 */
export function indexFile(etoiles: readonly Etoile[]): IndexFile {
  let indexReel = reels.get(etoiles)
  if (indexReel === undefined) {
    indexReel = construitIndex(etoilesReelles(etoiles))
    reels.set(etoiles, indexReel)
  }
  semis ??= construitIndex(semisGeneratif())
  return { indexReel, indexSemis: semis }
}
