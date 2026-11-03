/**
 * §4.1 — site relief, requested once coordinates settle, + resulting masque.
 * No "validate site" gesture: latitude typed digit by digit, every intermediate state is a lieu.
 * Request waits for input rest, except at mount (reloaded site; cache answers offline).
 */

import { useEffect, useRef, useState } from 'react'
import { masqueDepuisRelief, masquePlat, type MasqueHorizon } from '../core/site.ts'
import { resoudRelief, type ReliefSite } from '../data/relief.ts'
import { R } from '../registry/relief.ts'
import { nombre, nombreLibre } from '../registry/ecriture.ts'
import { DOMAINES } from '../registry/domains.ts'

/**
 * Last resolved relief, null before the first. During new site load, old relief stays the one
 * computed with (<1 s swap). `enCharge` = no longer typed lieu's → planétarium flattens (T-0369).
 */
export function useReliefSite(
  latDeg: number,
  lonDeg: number,
): { readonly relief: ReliefSite | null; readonly enCharge: boolean } {
  const [resolu, surResolu] = useState<{
    readonly lieu: string
    readonly relief: ReliefSite
  } | null>(null)
  const lieu = `${latDeg},${lonDeg}`
  const monte = useRef(false)
  // Relief refused offline / by mute service: re-requested when network returns.
  const [retours, surRetours] = useState(0)
  useEffect(() => {
    const relance = () => surRetours((n) => n + 1)
    window.addEventListener('online', relance)
    return () => window.removeEventListener('online', relance)
  }, [])

  useEffect(() => {
    let actif = true
    const delai = monte.current ? R('DELAI_RELIEF_MS') : 0
    monte.current = true
    const attente = setTimeout(() => {
      void resoudRelief(latDeg, lonDeg).then((relief) => {
        if (actif) surResolu({ lieu: `${latDeg},${lonDeg}`, relief })
      })
    }, delai)
    return () => {
      actif = false
      clearTimeout(attente)
    }
  }, [latDeg, lonDeg, retours])

  return { relief: resolu?.relief ?? null, enCharge: resolu !== null && resolu.lieu !== lieu }
}

/**
 * Masque from relief: real, or flat fallback [HYP] with cause. Before first relief, flat
 * fallback has no note: loading ≠ unavailable.
 */
export function masqueDuRelief(relief: ReliefSite | null): MasqueHorizon {
  if (relief === null) {
    const { note: _chargement, ...plat } = masquePlat()
    return Object.freeze(plat)
  }
  if (relief.etat === 'INDISPONIBLE') return masquePlat(relief.cause)
  const masque = masqueDepuisRelief(
    relief.altitudesDeg,
    `Relief du terrain sur ${nombreLibre(R('RAYON_RELIEF_KM'))} km (Terrain Tiles).`,
  )
  return relief.courbesDeg === undefined
    ? masque
    : Object.freeze({
        ...masque,
        courbesDeg: relief.courbesDeg,
        ...(relief.silhouettesDeg === undefined ? {} : { silhouettesDeg: relief.silhouettesDeg }),
        ...(relief.creteDeg === undefined ? {} : { creteDeg: relief.creteDeg }),
      })
}

/**
 * T-0365 — altitude to write in field after map click: model ground, to the metre. Null without
 * relief or outside saisie domain (mer Morte, summits): clamped value lies, true one refused →
 * field keeps its own.
 */
export function altitudeDuRelief(relief: ReliefSite): string | null {
  if (relief.etat !== 'RELIEF') return null
  const { min, max } = DOMAINES.altitude_m
  const solM = Math.round(relief.solM)
  return solM < min || solM > max ? null : nombre(solM)
}
