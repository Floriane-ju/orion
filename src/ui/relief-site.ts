/**
 * §4.1 — le relief du site, demandé quand les coordonnées se posent, et le masque qu'il donne.
 *
 * Il n'y a pas de geste « valider le site » : la latitude se tape chiffre par chiffre, et
 * chaque état intermédiaire est un lieu. La demande attend donc le repos de la saisie, sauf au
 * montage, où le site vient du rechargement et où le cache répond sans réseau.
 */

import { useEffect, useRef, useState } from 'react'
import { masqueDepuisRelief, masquePlat, type MasqueHorizon } from '../core/site.ts'
import { resoudRelief, type ReliefSite } from '../data/relief.ts'
import { R } from '../registry/relief.ts'
import { nombreLibre } from '../registry/ecriture.ts'

interface ReliefResolu {
  readonly cle: string
  readonly relief: ReliefSite
}

/** Le relief du site, ou null tant qu'il n'est pas résolu pour CES coordonnées. */
export function useReliefSite(latDeg: number, lonDeg: number): ReliefSite | null {
  const cle = `${latDeg},${lonDeg}`
  const [resolu, surResolu] = useState<ReliefResolu | null>(null)
  const monte = useRef(false)
  // Un relief refusé hors réseau, ou par un service muet, se redemande au retour du réseau.
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
        if (actif) surResolu({ cle, relief })
      })
    }, delai)
    return () => {
      actif = false
      clearTimeout(attente)
    }
  }, [cle, latDeg, lonDeg, retours])

  // Le relief d'un autre site ne vaut pas pour celui-ci, même le temps d'un chargement.
  return resolu?.cle === cle ? resolu.relief : null
}

const CAUSE_EN_COURS = 'Relief du terrain en cours de chargement.'

/** Le masque que le relief donne : réel, ou le repli plat [HYP] avec sa cause. */
export function masqueDuRelief(relief: ReliefSite | null): MasqueHorizon {
  if (relief === null) return masquePlat(CAUSE_EN_COURS)
  if (relief.etat === 'INDISPONIBLE') return masquePlat(relief.cause)
  return masqueDepuisRelief(
    relief.altitudesDeg,
    `Relief du terrain sur ${nombreLibre(R('RAYON_RELIEF_KM'))} km (Terrain Tiles).`,
  )
}
