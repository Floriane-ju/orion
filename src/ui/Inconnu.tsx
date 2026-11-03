/**
 * T-0149 — quantity an incomplete matériel cannot compute.
 * NOT §6.3 `[DONNÉE MANQUANTE]` (catalogue lacks data, no input helps): here the user must
 * input it. "?" says enter, bubble says what. Row stays, only value changes.
 * "?" focusable: bubble opens on `:focus-visible` (keyboard too).
 */

import { Bulle } from './Bulle.tsx'

/** §5.1 — the three quantities without which no champ, échantillonnage or pose exists. */
export const AIDE_MATERIEL_INCOMPLET =
  'À calculer : la résolution du capteur dans la carte Boîtier, la focale et l’ouverture ' +
  'dans la carte Optique.'

export function Inconnu() {
  return (
    <Bulle texte={AIDE_MATERIEL_INCOMPLET}>
      <span className="aide" tabIndex={0}>
        ?
      </span>
    </Bulle>
  )
}
