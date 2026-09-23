/**
 * T-0153 — la phrase qui dit où pointe la scène : la visée, le cap, le champ.
 *
 * Elle tenait le centre d'une barre basse qui portait aussi le lieu et la légende. La barre
 * est démontée : la phrase et la légende montent dans la barre haute, le lieu devient la carte
 * « Site » posée sur la scène. La phrase se lit toujours sans un clic.
 *
 * T-0163 — elle ne date plus l'image : le panneau du temps porte le même instant, réglable.
 * La phrase ne garde que ce qui lui appartient — la visée, le cap, le champ — et ses cinq
 * nombres se tirent à l'horizontale.
 */

import { Fragment, useMemo } from 'react'
import type { Site } from '../core/ephem.ts'
import { cielInstantane } from '../core/horloges.ts'
import { bornesZoom } from '../core/projection.ts'
import { Compteur } from './Compteur.tsx'
import { HAUTEUR_MAX_DEG, HAUTEUR_MIN_DEG, tourBorne } from './planetarium-gestes.ts'
import { majVue, useScene } from './scene-etat.ts'
import {
  segmentsVisee,
  viseeVersVue,
  type ChampVisee,
  type SegmentVisee,
} from './scene-lecture.ts'

/**
 * T-0163 — ce qu'un cran de glisser ajoute à chaque lecture. C'est le pas du GESTE, pas celui
 * du modèle : une visée se pointe au dixième de degré, un cap se prend au degré. Les deux
 * angles de visée gardent le pas le plus fin — ce sont eux qu'on règle sur une cible.
 */
const PAS_VISEE: Readonly<Record<ChampVisee, number>> = Object.freeze({
  AD: 0.1,
  DEC: 0.1,
  AZIMUT: 1,
  HAUTEUR: 0.5,
  FOV: 0.5,
  ROTATION: 1,
})

/**
 * T-0153 — un composant à part, et non une ligne de plus dans la barre : le magasin de scène
 * republie son instant deux fois par seconde, et s'y abonner depuis `BarreHaut` ferait rendre
 * ses tiroirs au même rythme (T-0056). Ici l'abonnement ne coûte que cette phrase.
 */
export function Visee(props: { readonly site: Site; readonly gaiaCharge: boolean }) {
  const { vue, msAffiche } = useScene()
  const date = useMemo(() => new Date(msAffiche), [msAffiche])
  const ciel = useMemo(() => cielInstantane(props.site, date), [props.site, date])
  const segments = segmentsVisee(vue, ciel.matrice)
  const bornes = bornesZoom(props.gaiaCharge, vue.mode)

  /**
   * Les cinq nombres de la phrase sont des ENTRÉES de la scène. Trois le sont directement ;
   * l'AD et la δ passent par la réciproque de la visée, qui rend le pointage horizontal de la
   * direction équatoriale demandée à l'instant affiché.
   */
  function regle(champ: ChampVisee, valeur: number): void {
    const [ad, dec] = [segments[0]!.valeurDeg, segments[1]!.valeurDeg]
    if (champ === 'AD') return majVue(viseeVersVue(valeur, dec, ciel.matrice))
    if (champ === 'DEC') return majVue(viseeVersVue(ad, valeur, ciel.matrice))
    if (champ === 'AZIMUT') return majVue({ azimutDeg: tourBorne(valeur) })
    if (champ === 'HAUTEUR') return majVue({ hauteurDeg: valeur })
    if (champ === 'ROTATION') return majVue({ rotationCadreDeg: valeur })
    // Le plafond est reposé par le magasin ; le plancher, lui, dépend du paquet chargé.
    majVue({ fovDeg: valeur })
  }

  /** L'azimut et l'AD se referment sur eux-mêmes : les borner arrêterait le geste au nord. */
  function encadrement(champ: ChampVisee): { readonly min?: number; readonly max?: number } {
    if (champ === 'DEC' || champ === 'HAUTEUR') {
      return { min: HAUTEUR_MIN_DEG, max: HAUTEUR_MAX_DEG }
    }
    if (champ === 'FOV') return { min: bornes.fovMinDeg, max: bornes.fovMaxDeg }
    if (champ === 'ROTATION') return { min: 0, max: 360 }
    return {}
  }

  const compteur = (segment: SegmentVisee) => (
    <Fragment key={segment.champ}>
      {segment.avant}
      <Compteur
        libelle={segment.libelle}
        valeur={segment.valeurDeg}
        texte={segment.texte}
        pas={PAS_VISEE[segment.champ]}
        {...encadrement(segment.champ)}
        sur={(valeur) => regle(segment.champ, valeur)}
      />
    </Fragment>
  )

  // T-0163 — la phrase ne date plus l'image : le panneau du temps porte le même instant, et
  // deux horloges à l'écran se contredisent à la seconde près.
  return <p className="etat barrehaut-visee">{segments.map(compteur)}</p>
}
