/**
 * T-0215 — closed-choice field: label from glossaire, options from call site.
 * Factors the CAST, not the markup: each site wrote `e.target.value as CapteurMode`, an unchecked
 * assertion ×5 in a `strict` repo; written once it's reviewable, ×5 type and `<option>` drift
 * silently.
 * OPTIONS STAY `children`, no `options` prop: two sites group in `<optgroup>`; a flat array would
 * exclude them and a prop able to describe them = second data schema duplicating markup.
 * ONE FIELD BYPASSES ON PURPOSE: `Verdicts` RSB choice carries a NUMERIC value (`<select>` yields
 * strings); its conversion is its particularity. Stays explicit; inventory says so.
 * (`PanneauCibles` "Type" filter is multi-choice, no longer a `<select>`.)
 */

import type { ReactNode } from 'react'
import type { TermeGlossaire } from '../registry/glossaire.ts'
import { Etiquette } from './Terme.tsx'

export interface ChampChoixProps<T extends string> {
  /** Glossaire term naming the field; never a hand-written string. */
  readonly cle: TermeGlossaire
  /** Precision computed at point of use, added to the term's bulle. */
  readonly precision?: string | undefined
  readonly valeur: T
  readonly surChangement: (valeur: T) => void
  /** `<option>`/`<optgroup>` written at the call site. */
  readonly children: ReactNode
}

export function ChampChoix<T extends string>({
  cle,
  precision,
  valeur,
  surChangement,
  children,
}: ChampChoixProps<T>) {
  return (
    <label>
      <span className="libelle">
        <Etiquette cle={cle} precision={precision} />
      </span>
      <select value={valeur} onChange={(e) => surChangement(e.target.value as T)}>
        {children}
      </select>
    </label>
  )
}
