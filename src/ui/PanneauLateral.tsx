/**
 * T-0113 — side panel: what reads lengthwise, beside the scène.
 * T-0181 — permanent column, not an openable drawer: mode decides content, no closed state.
 * T-0182 — Ciel profond = two successive readings, list then fiche. Fiche header names the
 * target, holds back button + facilité reminder. Back DOES NOT EXIST on the list (an inert
 * button would stay in tab order announcing a non-exit).
 * T-0183 — plan de session not here: consulted while watching the sky (hence a card).
 * T-0246 — mode toggle left the top bar, became panel tabs (mode decides content; title
 * repeating the mode gone). Tabs stay above the fiche — leave to Panorama without the list.
 * Night plan → third tab "Mon plan": reads top-down like the list whose choices it orders.
 */

import type { ReactNode, RefObject } from 'react'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { modeSeance, poseMode, useTrancheSeance, type ModeInterface } from './seance-etat.ts'

/**
 * The three positions, row order. Order = contract: default first, left — position says which
 * is active as much as background.
 */
const MODES: readonly (readonly [ModeInterface, string])[] = [
  ['CIEL_PROFOND', 'Ciel profond'],
  ['PANORAMA', 'Panorama'],
  ['PLAN', 'Mon plan'],
]

/** Header of the open fiche. */
export interface EnteteFiche {
  readonly titre: string
  readonly retour: () => void
  /** §6.4 — facilité note of the open target, announced with its label. */
  readonly rappel: ReactNode
}

export interface PanneauLateralProps {
  /** `null` on list, Panorama and plan: nothing behind, so no title or back. */
  readonly fiche: EnteteFiche | null
  readonly children: ReactNode
  /** T-0188 — ref to the title for focus management when a fiche opens. */
  readonly titreRef?: RefObject<HTMLHeadingElement | null>
}

export function PanneauLateral(props: PanneauLateralProps) {
  const mode = useTrancheSeance(modeSeance)
  return (
    <aside className="coque-lateral" id="panneau-lateral" aria-label="Panneau de séance">
      {/* §11.3 — first-rank switch. `aria-pressed` not `aria-expanded`: buttons unfold nothing,
          they choose the screen's state — one always true. */}
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
          {/* T-0188 — title focusable for keyboard focus management. */}
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
