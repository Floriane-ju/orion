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
import { nombre, nombreLibre } from '../registry/ecriture.ts'
import { DOMAINES } from '../registry/domains.ts'

/**
 * Le dernier relief résolu, ou null avant le tout premier. Pendant qu'un nouveau site se
 * charge, celui de l'ancien reste celui des calculs : il se remplace en moins d'une seconde.
 * `enCharge` dit qu'il n'est plus celui du lieu saisi — le planétarium l'aplatit (T-0369).
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
 * Le masque que le relief donne : réel, ou le repli plat [HYP] avec sa cause. Avant le premier
 * relief résolu, le repli plat n'a pas de note : un chargement n'est pas une indisponibilité.
 */
export function masqueDuRelief(relief: ReliefSite | null): MasqueHorizon {
  if (relief === null) {
    const { note: _chargement, ...plat } = masquePlat()
    return Object.freeze(plat)
  }
  if (relief.etat === 'INDISPONIBLE') return masquePlat(relief.cause)
  return masqueDepuisRelief(
    relief.altitudesDeg,
    `Relief du terrain sur ${nombreLibre(R('RAYON_RELIEF_KM'))} km (Terrain Tiles).`,
  )
}

/**
 * T-0365 — l'altitude à écrire dans le champ après un clic sur la carte : le sol du modèle,
 * au mètre. Null sans relief, ou hors du domaine de saisie (mer Morte, sommets) : écrire une
 * valeur bornée mentirait, écrire la vraie ferait refuser la saisie — le champ garde la sienne.
 */
export function altitudeDuRelief(relief: ReliefSite): string | null {
  if (relief.etat !== 'RELIEF') return null
  const { min, max } = DOMAINES.altitude_m
  const solM = Math.round(relief.solM)
  return solM < min || solM > max ? null : nombre(solM)
}
