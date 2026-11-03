/**
 * §6.4 then §8.3 — "je veux photographier celle-là": gesture composing the night plan.
 * One component for both places the cible appears (list row, fiche header), as `BoutonCadrer`.
 * §11.1 — ACTIVE STATE NOT BY COLOUR ALONE: mode nuit is monochrome, accent hue vanishes.
 * `aria-pressed` fills the glyph via font `FILL` axis (`.bouton-glyphe[aria-pressed='true']`).
 * Mounted only on a `photographiable` cible (§6.4): offering a plan step the night forbids
 * promises nothing real. Fiche already says why (verdict de cadrage, créneau, cause d'écart).
 */

import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { Bulle } from './Bulle.tsx'
import { Icone } from './Icone.tsx'
import { basculeChoixCible, useCiblesChoisies } from './cibles-choisies.ts'

export interface BoutonChoixCibleProps {
  readonly designation: string
  /** List card spells the gesture out (card foot has room); fiche keeps glyph only. */
  readonly avecLibelle?: boolean
}

export function BoutonChoixCible({ designation, avecLibelle = false }: BoutonChoixCibleProps) {
  const choisie = useCiblesChoisies().has(designation)
  if (avecLibelle)
    return (
      // Name stays "Photographier" in both states (toggle contract): `aria-pressed` = state,
      // bulle = what the click will do.
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
    // `nomme`: bulle sentence IS the accessible name; an extra `aria-label` would be announced
    // twice (contract of `Bulle` and `BoutonCadrer`).
    <BoutonGlyphe
      icone="photo_camera"
      aide={libelleChoix(designation, choisie)}
      place="gauche"
      presse={choisie}
      onClick={() => basculeChoixCible(designation)}
    />
  )
}

/** Label says what the click WILL do, never current state: `aria-pressed` carries state. */
function libelleChoix(designation: string, choisie: boolean): string {
  return choisie
    ? `Retirer ${designation} du plan de nuit`
    : `Photographier ${designation} cette nuit`
}
