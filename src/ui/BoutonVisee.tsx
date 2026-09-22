/**
 * T-0046, T-0221 — « Voir » centre la scène sur une cible, et rien d'autre : ni le champ, ni
 * l'horloge ne bougent. La liste et la fiche portent le même bouton ; deux dessins du même
 * geste finiraient par annoncer deux choses.
 *
 * Sous l'horizon, la direction existe quand même — la vue descend jusqu'à −90° — et c'est elle
 * qu'on veut connaître pour savoir de quel côté attendre le lever. Le bouton reste donc offert ;
 * la couche Sol masque ce qu'elle recouvre, et la bulle dit pourquoi la cible n'apparaîtra pas.
 */

import { coordonneesHorizon } from '../core/cibles-liste.ts'
import type { Site } from '../core/ephem.ts'
import { cielInstantane } from '../core/horloges.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { Bulle } from './Bulle.tsx'
import { Icone } from './Icone.tsx'
import { majVue, minuteAffichee, useTrancheScene, MS_PAR_MINUTE } from './scene-etat.ts'

export interface BoutonViseeProps {
  readonly designation: string
  readonly azimutDeg: number
  readonly hauteurDeg: number
}

export function BoutonVisee({ designation, azimutDeg, hauteurDeg }: BoutonViseeProps) {
  return (
    <Bulle texte={libelleVisee(designation, hauteurDeg)} place="gauche" nomme>
      <button
        type="button"
        className="cible-action"
        onClick={() => majVue({ azimutDeg, hauteurDeg })}
      >
        <Icone nom="my_location" />
      </button>
    </Bulle>
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

/**
 * Viser sous l'horizon centre une direction sans objet à voir : le sol la recouvre. La bulle
 * l'annonce avant le clic, sinon le geste se lit comme un bouton cassé.
 */
function libelleVisee(designation: string, hauteurDeg: number): string {
  const cible = `Centrer la scène sur ${designation}`
  return hauteurDeg > 0 ? cible : `${cible} — sous l’horizon`
}
