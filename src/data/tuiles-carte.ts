/**
 * §4.1, §12.5, §13.1 — les tuiles OSM de la carte du site (T-0363).
 *
 * Un échec ne lève jamais et ne s'affiche pas : sous une tuile manquante, le fond embarqué
 * reste. Hors réseau, aucune requête n'est émise — c'est la ligne « Carte de choix du lieu »
 * de la matrice §12.5, et la dernière phrase du bloc des tiers de §13.1.
 *
 * Les tuiles vivent en mémoire, pas en IndexedDB : on ne les revoit que le temps de choisir
 * un lieu, et OSM interdit le pré-téléchargement.
 * ponytail: cache mémoire seul, IndexedDB si revenir sur la carte après rechargement le justifie.
 */

import { ramene } from '../core/unites.ts'
import { C, urlTuileCarte } from '../registry/lieu-carte.ts'
import { modeReseauCourant } from './degradation.ts'

export type ChargeTuileCarte<T> = (z: number, x: number, y: number) => Promise<T>

export interface CacheTuiles<T> {
  /**
   * La tuile si elle est chargée, sinon `null` — et la demande part, une seule fois, avec
   * `surPrete` appelé à son arrivée pour redessiner.
   */
  demande(z: number, x: number, y: number, surPrete: () => void): T | null
  taille(): number
}

export function cleTuile(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`
}

/** La tuile qui se peint à cette place : la colonne se referme, la rangée s'arrête au monde. */
export function tuileVisible(z: number, x: number, y: number): { x: number; y: number } | null {
  const nb = 2 ** z
  if (y < 0 || y >= nb) return null
  return { x: ramene(x, nb), y }
}

export function cacheTuiles<T>(charge: ChargeTuileCarte<T>, plafond: number): CacheTuiles<T> {
  // Une `Map` garde l'ordre d'insertion : réinsérer à la lecture en fait un LRU.
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
          // Le fond embarqué reste sous la tuile manquante ; elle se redemandera au prochain rendu.
        })
        .finally(() => enVol.delete(cle))
      return null
    },
    taille: () => pretes.size,
  }
}

/** Une tuile téléchargée et décodée par le navigateur lui-même, peinte ensuite par `drawImage`. */
export const chargeTuileOsm: ChargeTuileCarte<ImageBitmap> = async (z, x, y) => {
  const reponse = await fetch(urlTuileCarte(z, x, y), {
    signal: AbortSignal.timeout(C('DELAI_MAX_TUILE_CARTE_MS')),
  })
  if (!reponse.ok) throw new Error(`tuile ${cleTuile(z, x, y)} : ${reponse.status}`)
  const corps = await reponse.blob()
  if (!corps.type.startsWith('image/')) throw new Error(`tuile ${cleTuile(z, x, y)} : pas une image`)
  return createImageBitmap(corps)
}

/** Le cache partagé de l'application : il survit au repli de la carte « Site ». */
export const TUILES_OSM = cacheTuiles(chargeTuileOsm, C('TUILES_CARTE_CACHE_MAX'))
