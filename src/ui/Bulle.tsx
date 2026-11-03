/**
 * T-0147 — textual hover of the UI, drawn by the stylesheet.
 * Native `title` is the one surface the palette cannot reach (browser paints it light and rounded;
 * §11.1 has no hold: white lamp in a dark-adapted UI) and has no width (2-line gloss spreads on
 * one, off screen). Bulle is DOM, not an attribute.
 * NO JAVASCRIPT HERE. T-0189 — Échap dismisses (1.4.13) via one document listener
 * (`gere-echap.ts`): on hover alone no bulle node has focus, an anchor listener misses the key.
 * Opens on `:hover` / `:has(:focus-visible)` on anchor: keyboard works without code, nothing
 * recomputed on hover. Not `:focus-within`: focus left on button after a click would keep it open
 * once the mouse leaves (T-0240). Overflow not measured here: `place` = PREFERRED side, CSS
 * anchoring (`position-try-fallbacks`, `styles.css`) flips it when it doesn't fit.
 * Component's only role in placement: unique name per anchor; `anchor-name` can't be shared (two
 * same-name anchors → all bulles attach to the last).
 * NAME OR DESCRIBE. Glyph-only control: bulle IS the accessible name (`nomme`): drop the button's
 * `aria-label`, else announced twice. Elsewhere (glossaire term already named by its label) it
 * describes.
 */

import { cloneElement, useId, type CSSProperties, type ReactElement, type ReactNode } from 'react'

/** Side where the bulle unfolds, relative to its control. */
export type PlaceBulle = 'haut' | 'bas' | 'gauche' | 'droite'

/** What the bulle grafts onto the child: one or the other, never both. */
interface LienAria {
  readonly 'aria-labelledby'?: string | undefined
  readonly 'aria-describedby'?: string | undefined
}

interface BulleProps {
  /** Usually one sentence; else full detail of a traced value (TracedValue). */
  readonly texte: ReactNode
  readonly place?: PlaceBulle
  /** Bulle carries the control's accessible name instead of describing it. */
  readonly nomme?: boolean
  readonly children: ReactElement<LienAria>
}

export function Bulle({ texte, place = 'haut', nomme = false, children }: BulleProps) {
  const id = useId()
  // Custom property, not `anchorName`: only form React writes as-is; stylesheet keeps the rest of
  // placement. `useId` isn't promised to be a CSS identifier: non-identifier chars → dash, else
  // anchor name invalid, placement falls back silently.
  const ancre = {
    '--bulle-ancre-nom': `--bulle-${id.replace(/[^a-zA-Z0-9-]/g, '-')}`,
  } as CSSProperties
  return (
    <span className="bulle-ancre" style={ancre}>
      {cloneElement(children, nomme ? { 'aria-labelledby': id } : { 'aria-describedby': id })}
      <span className="bulle" id={id} role="tooltip" data-place={place}>
        {texte}
      </span>
    </span>
  )
}
