/**
 * §6.4 puis §8.3 — « je veux photographier celle-là ». Le geste qui compose le plan de nuit.
 *
 * Un seul composant pour les deux endroits où la cible se rencontre — la ligne de la liste et
 * l'en-tête de la fiche —, pour la raison que `BoutonCadrer` énonce déjà : deux dessins du même
 * geste finiraient par annoncer deux choses.
 *
 * §11.1 — L'ÉTAT ACTIF NE SE SIGNALE PAS PAR LA SEULE COULEUR. En mode nuit la palette est
 * monochrome, et une teinte d'accent y disparaît. `aria-pressed` remplit donc le glyphe par
 * l'axe `FILL` de la police (`.bouton-glyphe[aria-pressed='true']`) : une forme, pas une teinte.
 *
 * Le bouton n'est monté que sur une cible photographiable (`photographiable`, §6.4) : proposer
 * d'ajouter au plan ce que la nuit ne permet pas ferait promettre une étape qui n'arriverait
 * jamais. La fiche, elle, dit déjà pourquoi — verdict de cadrage, créneau, cause d'écart.
 */

import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { Bulle } from './Bulle.tsx'
import { Icone } from './Icone.tsx'
import { basculeChoixCible, useCiblesChoisies } from './cibles-choisies.ts'

export interface BoutonChoixCibleProps {
  readonly designation: string
  /**
   * La carte de liste nomme le geste en toutes lettres : en pied de carte, il a la largeur
   * pour un mot, et c'est l'action que la carte propose. La fiche garde le glyphe seul.
   */
  readonly avecLibelle?: boolean
}

export function BoutonChoixCible({ designation, avecLibelle = false }: BoutonChoixCibleProps) {
  const choisie = useCiblesChoisies().has(designation)
  if (avecLibelle)
    return (
      // Le nom reste « Photographier » dans les deux états — c'est le contrat d'une bascule :
      // `aria-pressed` dit l'état, la bulle dit ce que le clic fera.
      <Bulle texte={libelleChoix(designation, choisie)} place="haut">
        <button
          type="button"
          className="cible-photographier"
          aria-pressed={choisie}
          onClick={() => basculeChoixCible(designation)}
        >
          <Icone nom="add_a_photo" />
          Photographier
        </button>
      </Bulle>
    )
  return (
    // `nomme` : la phrase de la bulle EST le nom accessible du bouton. Un `aria-label` en plus
    // la ferait annoncer deux fois — c'est le contrat de `Bulle`, et celui de `BoutonCadrer`.
    <BoutonGlyphe
      icone="photo_camera"
      aide={libelleChoix(designation, choisie)}
      place="gauche"
      presse={choisie}
      onClick={() => basculeChoixCible(designation)}
    />
  )
}

/** Le libellé dit ce que le clic FERA, jamais l'état courant : `aria-pressed` porte l'état. */
function libelleChoix(designation: string, choisie: boolean): string {
  return choisie
    ? `Retirer ${designation} du plan de nuit`
    : `Photographier ${designation} cette nuit`
}
