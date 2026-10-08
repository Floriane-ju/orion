/**
 * §9.3 — les deux index que la passe de filé parcourt : le catalogue réel jusqu'au seuil
 * catalographié, le semis génératif au-delà.
 *
 * T-0398 — ils se construisent là où la passe PEINT, plus dans un rendu React : dans le worker
 * quand il existe, sur le fil principal sinon. Les construire dans `useParametresFile` coûtait
 * le semis entier au fil principal même quand le worker en tenait déjà un.
 */

import { K } from '../registry/constants.ts'
import { semisGeneratif } from '../data/semis.ts'
import { construitIndex, type IndexCiel } from '../core/index-ciel.ts'
import type { Etoile } from '../data/catalog.ts'

export interface IndexFile {
  readonly indexReel: IndexCiel
  readonly indexSemis: IndexCiel
}

/** Les étoiles que la couche 1 retient : c'est tout ce que le worker a besoin de recevoir. */
export function etoilesReelles(etoiles: readonly Etoile[]): Etoile[] {
  return etoiles.filter((e) => e.magV <= K('SEUIL_MAG_ETOILES_REELLES'))
}

let semis: IndexCiel | null = null
const reels = new WeakMap<readonly Etoile[], IndexCiel>()

/**
 * Les index d'un catalogue, construits une fois. La clé est le tableau reçu : un catalogue
 * rechargé est un autre tableau, et le semis, tiré une fois pour toutes, se partage.
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
