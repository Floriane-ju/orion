/**
 * §6.4 puis §8.3 — « je veux photographier celle-là ». Le geste qui compose le plan de nuit.
 *
 * Un seul composant pour les deux endroits où la cible se rencontre — la ligne de la liste et
 * l'en-tête de la fiche —, pour la raison que `BoutonVisee` énonce déjà : deux dessins du même
 * geste finiraient par annoncer deux choses.
 *
 * §11.1 — L'ÉTAT ACTIF NE SE SIGNALE PAS PAR LA SEULE COULEUR. En mode nuit la palette est
 * monochrome, et une teinte d'accent y disparaît. `aria-pressed` remplit donc le glyphe par
 * l'axe `FILL` de la police (`.cible-action[aria-pressed='true']`) : une forme, pas une teinte.
 *
 * Le bouton n'est monté que sur une cible photographiable (`photographiable`, §6.4) : proposer
 * d'ajouter au plan ce que la nuit ne permet pas ferait promettre une étape qui n'arriverait
 * jamais. La fiche, elle, dit déjà pourquoi — verdict de cadrage, créneau, cause d'écart.
 */

import { Bulle } from './Bulle.tsx'
import { Icone } from './Icone.tsx'
import { basculeChoixCible, useCiblesChoisies } from './cibles-choisies.ts'

export interface BoutonChoixCibleProps {
  readonly designation: string
}

export function BoutonChoixCible({ designation }: BoutonChoixCibleProps) {
  const choisie = useCiblesChoisies().has(designation)
  return (
    // `nomme` : la phrase de la bulle EST le nom accessible du bouton. Un `aria-label` en plus
    // la ferait annoncer deux fois — c'est le contrat de `Bulle`, et celui de `BoutonVisee`.
    <Bulle texte={libelleChoix(designation, choisie)} place="gauche" nomme>
      <button
        type="button"
        className="cible-action"
        aria-pressed={choisie}
        onClick={() => basculeChoixCible(designation)}
      >
        <Icone nom="photo_camera" />
      </button>
    </Bulle>
  )
}

/** Le libellé dit ce que le clic FERA, jamais l'état courant : `aria-pressed` porte l'état. */
function libelleChoix(designation: string, choisie: boolean): string {
  return choisie
    ? `Retirer ${designation} du plan de nuit`
    : `Photographier ${designation} cette nuit`
}
