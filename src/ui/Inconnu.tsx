/**
 * T-0149 — la grandeur qu'un matériel incomplet ne permet pas de calculer.
 *
 * Ce n'est PAS `[DONNÉE MANQUANTE]` de §6.3 : cette formulation-là dit qu'un catalogue ne
 * porte pas la donnée, et qu'aucune saisie n'y changera rien. Ici la donnée s'attend de
 * l'utilisateur — « ? » dit qu'elle est à saisir, et la bulle dit quoi saisir. Une lecture
 * qui disparaît, elle, ne dit rien du tout : la ligne reste, seule sa valeur change.
 *
 * Le « ? » est focalisable : la bulle s'ouvre au `:focus-visible`, donc au clavier aussi.
 */

import { Bulle } from './Bulle.tsx'

/** §5.1 — les trois grandeurs sans lesquelles ni champ, ni échantillonnage, ni pose n'existent. */
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
