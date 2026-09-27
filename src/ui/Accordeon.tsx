/**
 * T-0325 — une rubrique de la modale info qui se replie, fermée à l'ouverture.
 *
 * Cinq rubriques longues — état du socle, matrice, registre, poids, sources — ne se
 * parcourent pas d'un coup d'œil : repliées, leurs titres forment le sommaire de la modale.
 * `<details>` porte tout, ouverture, clavier et annonce, sans une ligne de JavaScript ; ce
 * n'est pas un `Tiroir` — Échap ne le vise pas, il ferme la modale qui le contient.
 *
 * Un seul ouvert à la fois : l'attribut `name` fait des accordéons d'un même nom un groupe
 * exclusif, et c'est le navigateur qui referme le précédent. Ouverts ensemble, la modale
 * redevenait une longue page où l'on cherchait le titre qu'on venait de cliquer.
 */

/** Le groupe exclusif des rubriques de la modale info. */
const GROUPE = 'page-info'

import type { ReactNode } from 'react'
import { Icone } from './Icone.tsx'

export interface AccordeonProps {
  readonly titre: string
  readonly children: ReactNode
  /**
   * T-0041 — une rubrique qui porte une alerte s'ouvre d'elle-même : le bouton de la barre
   * l'a annoncée, la modale ne doit pas la cacher derrière un clic de plus.
   */
  readonly ouvert?: boolean | undefined
}

export function Accordeon({ titre, children, ouvert }: AccordeonProps) {
  return (
    <details className="accordeon" name={GROUPE} open={ouvert === true}>
      <summary>
        <h2>{titre}</h2>
        <Icone nom="expand_more" />
      </summary>
      {/* Deux boîtes : le corps se replie à zéro (animation), le contenu porte le jour et le
          filet — un rembourrage sur la boîte qui se replie l'empêcherait d'atteindre zéro. */}
      <div className="accordeon-corps">
        <div className="accordeon-contenu">{children}</div>
      </div>
    </details>
  )
}
