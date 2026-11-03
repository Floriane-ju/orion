/**
 * T-0325 — collapsible section of info modal, closed on open.
 * 5 long sections (état du socle, matrice, registre, poids, sources): collapsed titles = modal
 * summary. `<details>` gives open/keyboard/announce without JS; not a `Tiroir` — Échap closes the
 * containing modal. One open at a time: same `name` = exclusive group, browser closes the previous
 * (all open = long page, lost the clicked title).
 */

/** Exclusive group of info modal sections. */
const GROUPE = 'page-info'

import type { ReactNode } from 'react'
import { Icone } from './Icone.tsx'

export interface AccordeonProps {
  readonly titre: string
  readonly children: ReactNode
  /**
   * T-0041 — a section carrying an alert opens itself: bar button announced it, modal mustn't hide
   * it behind one more click.
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
      {/* Two boxes: body collapses to zero (animation), content carries gap and rule; padding on a
          collapsing box would stop it reaching zero. */}
      <div className="accordeon-corps">
        <div className="accordeon-contenu">{children}</div>
      </div>
    </details>
  )
}
