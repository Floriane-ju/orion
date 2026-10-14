/**
 * §11.3, T-0153 — la phrase qui dit où pointe la scène : la visée, le cap, le champ.
 *
 * Elle tenait le centre d'une barre basse qui portait aussi le lieu et la légende. La barre
 * est démontée : la phrase et la légende montent dans la barre haute, le lieu devient la carte
 * « Site » posée sur la scène. La phrase se lit toujours sans un clic.
 *
 * T-0163 — elle ne date plus l'image : le panneau du temps porte le même instant, réglable.
 * La phrase ne garde que ce qui lui appartient — la visée, le cap, le champ — et ses cinq
 * nombres se tirent à l'horizontale.
 *
 * T-0411 — la barre haute porte maintenant le temps : la phrase descend en bas à gauche de la
 * scène, à la place de la frise qui est montée dans la barre.
 *
 * T-0414 — le temps est descendu en bas au centre : la phrase remonte en haut à droite de la
 * scène, contre le panneau de séance.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { Site } from '../core/ephem.ts'
import { cielInstantane } from '../core/horloges.ts'
import { bornesZoom } from '../core/projection.ts'
import { Compteur } from './Compteur.tsx'
import { HAUTEUR_MAX_DEG, HAUTEUR_MIN_DEG } from './planetarium-gestes.ts'
import { majVue, useScene } from './scene-etat.ts'
import {
  courtVisee,
  segmentsVisee,
  viseeVersVue,
  type ChampVisee,
  type SegmentVisee,
} from './scene-lecture.ts'
import { TOUR_DEG, ramene } from '../core/unites.ts'


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
  const cadre = useHauteurPubliee()

  /**
   * Les cinq nombres de la phrase sont des ENTRÉES de la scène. Trois le sont directement ;
   * l'AD et la δ passent par la réciproque de la visée, qui rend le pointage horizontal de la
   * direction équatoriale demandée à l'instant affiché.
   */
  function regle(champ: ChampVisee, valeur: number): void {
    const [ad, dec] = [segments[0]!.valeurDeg, segments[1]!.valeurDeg]
    if (champ === 'AD') return majVue(viseeVersVue(valeur, dec, ciel.matrice))
    if (champ === 'DEC') return majVue(viseeVersVue(ad, valeur, ciel.matrice))
    if (champ === 'AZIMUT') return majVue({ azimutDeg: ramene(valeur, TOUR_DEG) })
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
    if (champ === 'ROTATION') return { min: 0, max: TOUR_DEG }
    return {}
  }

  /**
   * La largeur d'un champ est celle de sa valeur la plus longue, lue aux deux bouts de sa
   * course : un champ qui change de taille sous le doigt décale ses voisins pendant qu'on les
   * vise. L'AD et l'azimut n'ont pas de borne — ils font le tour —, leur course est le tour.
   */
  function largeur(champ: ChampVisee): number {
    const { min = 0, max = TOUR_DEG } = encadrement(champ)
    return Math.max(courtVisee(champ, min).length, courtVisee(champ, max).length)
  }

  // Six champs à préfixe plutôt qu'une phrase : chacun se tire ou se tape, et le préfixe dit
  // ce qu'il règle. La phrase complète reste celle du canevas (`ligneVisee`), qui l'annonce.
  const compteur = (segment: SegmentVisee) => (
    <Compteur
      key={segment.champ}
      libelle={segment.libelle}
      prefixe={segment.prefixe}
      valeur={segment.valeurDeg}
      texte={segment.court}
      largeur={largeur(segment.champ)}
      pas={PAS_VISEE[segment.champ]}
      {...encadrement(segment.champ)}
      sur={(valeur) => regle(segment.champ, valeur)}
    />
  )

  // T-0163 — la phrase ne date plus l'image : la barre porte le même instant, et deux
  // horloges à l'écran se contredisent à la seconde près.
  return (
    <div ref={cadre} className="coque-visee">
      {segments.map(compteur)}
    </div>
  )
}

/**
 * T-0414 — les cartes du matériel partent sous la visée : les deux partagent le haut droit de
 * la scène, et la visée a une hauteur que la feuille ne connaît pas — sous une fenêtre étroite,
 * ses champs passent à la ligne. Elle la publie donc sur la racine, où la colonne la lit ;
 * démontée, elle ne réserve plus rien.
 */
function useHauteurPubliee() {
  const cadre = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const element = cadre.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const racine = document.documentElement
    const observateur = new ResizeObserver(() => {
      racine.style.setProperty('--visee-haut', `${element.offsetHeight}px`)
    })
    observateur.observe(element)
    return () => {
      observateur.disconnect()
      racine.style.removeProperty('--visee-haut')
    }
  }, [])
  return cadre
}
