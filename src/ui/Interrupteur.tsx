/**
 * T-0215 — checkbox + sentence saying what it does.
 * Pattern was written 7× in 5 files (divergence; cf. T-0209 `ChampDomaine`).
 * Label = `ReactNode`, not string: two sites pass a glossary `<Etiquette>` + sentence.
 * Shape in `.interrupteur` (`styles.css`). One variant, `switch` (T-0406): a setting that
 * changes the shape of what follows (zoom vs fixed focal) reads as toggle; `role="switch"`
 * announces "activé", not "coché".
 */

import type { ReactNode } from 'react'

export interface InterrupteurProps {
  readonly actif: boolean
  readonly surChangement: (actif: boolean) => void
  /** Gloss a `<Bulle>` grafts when wrapping: DESCRIBES the box, label names it. On the `<input>`,
      not the `<label>`: the box is what is announced. */
  readonly 'aria-describedby'?: string | undefined
  /** Toggle instead of checkbox (default checkbox). */
  readonly switch?: boolean
  /** Sentence saying what the switch does, not a field name. */
  readonly children: ReactNode
}

export function Interrupteur({
  actif,
  surChangement,
  'aria-describedby': decritPar,
  switch: bascule = false,
  children,
}: InterrupteurProps) {
  return (
    <label className="interrupteur">
      <input
        type="checkbox"
        {...(bascule ? { role: 'switch', className: 'bascule' } : {})}
        checked={actif}
        aria-describedby={decritPar}
        onChange={(e) => surChangement(e.target.checked)}
      />
      {children}
    </label>
  )
}
