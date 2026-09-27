/**
 * T-0113 — le panneau latéral : ce qui se lit en longueur, à côté de la scène.
 *
 * T-0181 — il n'est plus un tiroir qu'on ouvre, c'est une colonne à demeure : le mode décide
 * de ce qu'elle porte, et il n'y a donc plus de choix à faire ni d'état fermé.
 *
 * T-0182 — en Ciel profond elle porte deux lectures successives, la liste puis la fiche. La
 * fiche a son en-tête : il nomme la cible, porte le retour et le rappel de facilité. Le retour
 * N'EXISTE PAS sur la liste — un bouton inerte resterait dans l'ordre de tabulation et
 * annoncerait une issue qui n'en est pas une.
 *
 * T-0183 — le plan de session n'est plus ici : il se consulte pendant qu'on regarde le ciel,
 * pas en le parcourant pour choisir, et c'est ce qui en fait une carte.
 *
 * T-0246 — la bascule de mode quitte la barre haute et devient les onglets du panneau. Le mode
 * décide de ce que le panneau porte : sa commande se pose donc sur le panneau, et le titre qui
 * répétait le mode (« Toutes les cibles », « Panorama ») disparaît. Les onglets restent au-dessus
 * de la fiche — on en sort vers Panorama sans repasser par la liste.
 */

import type { ReactNode, RefObject } from 'react'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { poseMode, useSeance, type ModeInterface } from './seance-etat.ts'

/**
 * Les deux positions, dans l'ordre de la rangée. L'ordre est un contrat : le défaut d'abord, à
 * gauche — la position dit laquelle est active autant que le fond.
 */
const MODES: readonly (readonly [ModeInterface, string])[] = [
  ['CIEL_PROFOND', 'Ciel profond'],
  ['PANORAMA', 'Panorama'],
]

/** L'en-tête de la fiche ouverte. */
export interface EnteteFiche {
  readonly titre: string
  readonly retour: () => void
  /** §6.4 — la note de facilité de la cible ouverte, annoncée avec son libellé. */
  readonly rappel: ReactNode
}

export interface PanneauLateralProps {
  /** `null` sur la liste et en Panorama : il n'y a rien derrière, donc ni titre ni retour. */
  readonly fiche: EnteteFiche | null
  readonly children: ReactNode
  /** T-0188 — ref au titre pour la gestion du focus quand on ouvre une fiche. */
  readonly titreRef?: RefObject<HTMLHeadingElement | null>
}

export function PanneauLateral(props: PanneauLateralProps) {
  const { mode } = useSeance()
  return (
    <aside className="coque-lateral" id="panneau-lateral" aria-label="Panneau de séance">
      {/* §11.3 — le commutateur de premier rang. `aria-pressed` plutôt qu'`aria-expanded` :
          ces deux boutons ne déplient rien, ils choisissent lequel des deux états l'écran
          tient — et l'un des deux est toujours vrai. */}
      <div className="onglets" role="group" aria-label="Mode d’interface">
        {MODES.map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            className={mode === cle ? 'onglet actif' : 'onglet'}
            aria-pressed={mode === cle}
            onClick={() => poseMode(cle)}
          >
            {libelle}
          </button>
        ))}
      </div>
      {props.fiche !== null && (
        <div className="lateral-entete">
          <BoutonGlyphe
            icone="arrow_back"
            aide="Revenir à la liste des cibles"
            place="bas"
            variante="nu"
            classe="lateral-retour"
            onClick={props.fiche.retour}
          />
          {/* T-0188 — le titre est focalisable pour la gestion du focus au clavier. */}
          <h2 ref={props.titreRef} tabIndex={-1}>
            {props.fiche.titre}
          </h2>
          {props.fiche.rappel}
        </div>
      )}
      <div className="lateral-corps">{props.children}</div>
    </aside>
  )
}
