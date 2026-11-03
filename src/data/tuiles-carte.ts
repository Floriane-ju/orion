/**
 * §4.1, §12.5, §13.1 — OSM tiles of the site map (T-0363).
 * Failure never throws nor shows: embedded background stays under a missing tile. Offline: no
 * request — §12.5 line « Carte de choix du lieu », last sentence of §13.1's third-party block.
 * Tiles in memory, not IndexedDB: seen only while choosing a place, OSM forbids prefetching.
 * ponytail: memory cache only; upgrade to IndexedDB if returning to map after reload justifies.
 */

import { ramene } from '../core/unites.ts'
import { C, urlTuileCarte } from '../registry/lieu-carte.ts'
import { modeReseauCourant } from './degradation.ts'

export type ChargeTuileCarte<T> = (z: number, x: number, y: number) => Promise<T>

export interface CacheTuiles<T> {
  /** Tile if loaded, else `null` + one request; `surPrete` called on arrival to redraw. */
  demande(z: number, x: number, y: number, surPrete: () => void): T | null
  taille(): number
}

export function cleTuile(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`
}

/** Tile at this place: column wraps, row stops at world edge. */
export function tuileVisible(z: number, x: number, y: number): { x: number; y: number } | null {
  const nb = 2 ** z
  if (y < 0 || y >= nb) return null
  return { x: ramene(x, nb), y }
}

export function cacheTuiles<T>(charge: ChargeTuileCarte<T>, plafond: number): CacheTuiles<T> {
  // `Map` keeps insertion order: reinserting on read = LRU.
  const pretes = new Map<string, T>()
  const enVol = new Set<string>()
  return {
    demande(z, x, y, surPrete) {
      const cle = cleTuile(z, x, y)
      const tuile = pretes.get(cle)
      if (tuile !== undefined) {
        pretes.delete(cle)
        pretes.set(cle, tuile)
        return tuile
      }
      if (enVol.has(cle) || modeReseauCourant() === 'HORS_LIGNE') return null
      enVol.add(cle)
      charge(z, x, y)
        .then((chargee) => {
          pretes.set(cle, chargee)
          const plusAncienne = pretes.keys().next().value
          if (pretes.size > plafond && plusAncienne !== undefined) pretes.delete(plusAncienne)
          surPrete()
        })
        .catch(() => {
          // Embedded background stays under missing tile; re-requested at next render.
        })
        .finally(() => enVol.delete(cle))
      return null
    },
    taille: () => pretes.size,
  }
}

/** Tile downloaded + decoded by browser, painted by `drawImage`. */
export const chargeTuileOsm: ChargeTuileCarte<ImageBitmap> = async (z, x, y) => {
  const reponse = await fetch(urlTuileCarte(z, x, y), {
    signal: AbortSignal.timeout(C('DELAI_MAX_TUILE_CARTE_MS')),
  })
  if (!reponse.ok) throw new Error(`tuile ${cleTuile(z, x, y)} : ${reponse.status}`)
  const corps = await reponse.blob()
  if (!corps.type.startsWith('image/')) throw new Error(`tuile ${cleTuile(z, x, y)} : pas une image`)
  return createImageBitmap(corps)
}

/** App-shared cache: survives collapse of the « Site » map. */
export const TUILES_OSM = cacheTuiles(chargeTuileOsm, C('TUILES_CARTE_CACHE_MAX'))
