/**
 * T-0113 — une carte posée sur la scène : un en-tête qui la nomme, un corps qui se replie.
 *
 * Deux raisons de poser les réglages SUR le ciel plutôt qu'à côté :
 *
 *   1. la scène récupère toute la largeur — un cadre de 0,8° dans une colonne de 900 px se
 *      lisait mal, il se lit ici ;
 *   2. une carte se replie à son en-tête, donc ce qui ne sert pas à cet instant ne prend que
 *      la hauteur de son titre.
 *
 * L'en-tête est un vrai `<button aria-expanded>` : le repli reste au clavier et l'état reste
 * annoncé.
 *
 * T-0238 — la carte ne se déplace plus. Chacune a une place d'où rien ne se cache, et le
 * repli suffit à dégager le ciel ; un geste de glisser sur l'en-tête faisait d'un bouton une
 * poignée, et une carte lâchée ailleurs n'était plus là où l'œil la cherchait.
 */

import type { ReactNode } from 'react'
import { basculeCarte, useCoque, type CleCarte } from './coque-etat.ts'

export interface CarteProps {
  readonly cle: CleCarte
  readonly titre: string
  /**
   * T-0238 — ce que la carte repliée dit encore, à droite de son titre. Du texte seul : il
   * vit dans le bouton d'en-tête, où rien d'interactif ne peut se poser.
   */
  readonly resume?: string
  readonly children: ReactNode
}

export function Carte(props: CarteProps) {
  const { cartes } = useCoque()
  const etat = cartes[props.cle]

  return (
    <section
      className={`carte carte-${props.cle.toLowerCase()}`}
      data-ouverte={etat.ouverte}
      // T-0238 — la carte n'a pas de titre de section : son nom en fait une région, comme
      // l'`aria-label` de la colonne matériel qu'elle remplace.
      role="region"
      aria-label={props.titre}
    >
      <button
        type="button"
        className="carte-entete"
        aria-expanded={etat.ouverte}
        onClick={() => basculeCarte(props.cle)}
      >
        <span className="carte-titre">{props.titre}</span>
        {/* Dépliée, la carte montre le détail : le résumé n'y répéterait que ses champs. */}
        {!etat.ouverte && props.resume !== undefined && (
          <span className="carte-resume">{props.resume}</span>
        )}
        {/* Le signe dit l'action à venir, pas l'état courant : replier, ou déplier. */}
        <span className="carte-marque" aria-hidden="true">
          {etat.ouverte ? '—' : '+'}
        </span>
      </button>
      {etat.ouverte && <div className="carte-corps">{props.children}</div>}
    </section>
  )
}
