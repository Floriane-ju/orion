/**
 * T-0046, T-0221 — « Voir » centre la scène sur une cible, et rien d'autre : ni le champ, ni
 * l'horloge ne bougent. La liste et la fiche portent le même bouton ; deux dessins du même
 * geste finiraient par annoncer deux choses.
 *
 * Sous l'horizon, la direction existe quand même — la vue descend jusqu'à −90° — et c'est elle
 * qu'on veut connaître pour savoir de quel côté attendre le lever. Le bouton reste donc offert ;
 * la couche Sol masque ce qu'elle recouvre, et la bulle dit pourquoi la cible n'apparaîtra pas.
 *
 * §3.5, T-0339 — « Aligner » est le second geste de la fiche : une fois la cible dans le cadre,
 * tourner le boîtier pour poser son grand axe sur la longueur du capteur. Il n'est offert que
 * si la cible est dans le cadre et que le moteur trouve un angle — une cible ronde ou sans
 * angle de position n'a rien à aligner, et un bouton qui ne ferait rien serait un mensonge.
 */

import { cibleDominante, rotationSuggeree, type ProfilCadre } from '../core/cadre.ts'
import { coordonneesHorizon } from '../core/cibles-liste.ts'
import type { Site } from '../core/ephem.ts'
import { cielInstantane } from '../core/horloges.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import {
  majVue,
  minuteAffichee,
  useTrancheScene,
  MS_PAR_MINUTE,
  vueScene,
} from './scene-etat.ts'

export interface BoutonViseeProps {
  readonly designation: string
  readonly azimutDeg: number
  readonly hauteurDeg: number
}

export function BoutonVisee({ designation, azimutDeg, hauteurDeg }: BoutonViseeProps) {
  return (
    <BoutonGlyphe
      icone="my_location"
      aide={libelleVisee(designation, hauteurDeg)}
      place="gauche"
      onClick={() => majVue({ azimutDeg, hauteurDeg })}
    />
  )
}

/** La fiche n'a pas de ligne de liste : elle tire la direction de la minute affichée. */
export function ViseeCible({ objet, site }: { readonly objet: ObjetCielProfond; readonly site: Site }) {
  const minute = useTrancheScene(minuteAffichee)
  const { azimutDeg, hauteurDeg } = coordonneesHorizon(
    objet,
    cielInstantane(site, new Date(minute * MS_PAR_MINUTE)).matrice,
  )
  return <BoutonVisee designation={objet.designation} azimutDeg={azimutDeg} hauteurDeg={hauteurDeg} />
}

export interface AlignementCibleProps {
  readonly objet: ObjetCielProfond
  readonly site: Site
  /** Le cadre du matériel déclaré ; absent tant que le matériel n'est pas chiffrable. */
  readonly profil: ProfilCadre | undefined
}

/** §3.5 — l'angle suggéré, appliqué d'un clic. Rien quand il n'y a rien à aligner. */
export function AlignementCible({ objet, site, profil }: AlignementCibleProps) {
  const minute = useTrancheScene(minuteAffichee)
  const vue = useTrancheScene(vueScene)
  if (profil === undefined) return null
  const matrice = cielInstantane(site, new Date(minute * MS_PAR_MINUTE)).matrice
  const cadre = {
    profil,
    azimutDeg: vue.azimutDeg,
    hauteurDeg: vue.hauteurDeg,
    rotationDeg: vue.rotationCadreDeg,
  }
  const dansCadre = cibleDominante([objet], cadre, matrice)
  if (dansCadre === null) return null
  const { angleDeg, message } = rotationSuggeree(dansCadre, cadre, matrice)
  if (angleDeg === null) return null
  return (
    <BoutonGlyphe
      icone="rotate_right"
      aide={message}
      place="gauche"
      onClick={() => majVue({ rotationCadreDeg: angleDeg })}
    />
  )
}

/**
 * Viser sous l'horizon centre une direction sans objet à voir : le sol la recouvre. La bulle
 * l'annonce avant le clic, sinon le geste se lit comme un bouton cassé.
 */
function libelleVisee(designation: string, hauteurDeg: number): string {
  const cible = `Centrer la scène sur ${designation}`
  return hauteurDeg > 0 ? cible : `${cible} — sous l’horizon`
}
