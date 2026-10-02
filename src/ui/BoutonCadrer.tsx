/**
 * T-0046, T-0221, T-0283 — « Cadrer » centre la scène sur une cible ET règle le champ sur le
 * cadre du matériel. La liste et la fiche portent le même bouton ; deux dessins du même geste
 * finiraient par annoncer deux choses. Sans matériel chiffrable, pas de cadre : pas de bouton.
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
import { matriceALaMinute } from '../core/horloges.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { bornesZoom } from '../core/projection.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { champPourCadrer } from './planetarium-gestes.ts'
import { etatScene, majVue, minuteAffichee, useTrancheScene, vueScene } from './scene-etat.ts'

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
  const matrice = matriceALaMinute(site, minute)
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

export interface CadrerCibleProps {
  readonly objet: ObjetCielProfond
  readonly site: Site
  /** Le cadre du matériel déclaré ; absent tant que le matériel n'est pas chiffrable. */
  readonly profil: ProfilCadre | undefined
  readonly gaiaCharge: boolean
}

/** §6.4 — un geste montre la cible avec le cadre sur une part lisible de la scène. */
export function CadrerCible({ objet, site, profil, gaiaCharge }: CadrerCibleProps) {
  const minute = useTrancheScene(minuteAffichee)
  const { azimutDeg, hauteurDeg } = coordonneesHorizon(objet, matriceALaMinute(site, minute))
  return (
    <BoutonCadrer
      designation={objet.designation}
      azimutDeg={azimutDeg}
      hauteurDeg={hauteurDeg}
      profil={profil}
      gaiaCharge={gaiaCharge}
    />
  )
}

export interface BoutonCadrerProps {
  readonly designation: string
  readonly azimutDeg: number
  readonly hauteurDeg: number
  /** Le cadre du matériel déclaré ; absent tant que le matériel n'est pas chiffrable. */
  readonly profil: ProfilCadre | undefined
  readonly gaiaCharge: boolean
}

/**
 * La ligne de liste fournit déjà la direction. Le mode de vue n'est lu qu'au clic : s'y
 * abonner ferait redessiner chaque ligne à chaque glissé de la scène.
 */
export function BoutonCadrer({ designation, azimutDeg, hauteurDeg, profil, gaiaCharge }: BoutonCadrerProps) {
  if (profil === undefined) return null
  const aide = `Cadrer ${designation} avec le cadre du matériel`
  return (
    <BoutonGlyphe
      icone="center_focus_strong"
      aide={hauteurDeg > 0 ? aide : `${aide} — sous l’horizon`}
      place="gauche"
      onClick={() => {
        const fovDeg = champPourCadrer(profil.fovLDeg, bornesZoom(gaiaCharge, etatScene().vue.mode))
        majVue({ azimutDeg, hauteurDeg, fovDeg })
      }}
    />
  )
}
