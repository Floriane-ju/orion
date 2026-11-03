/**
 * T-0215 — sentence commenting a value: state, cause, error.
 * §11.1 — RED NEVER ALONE. Cause and error also differ by shape: frame, thick side bar, lead
 * SIGN. Sign was "⚠" as stylesheet `content` (TEXT font, escaping `.icone` = a 2nd way to
 * show an icon); now via `Icone`.
 * `ton` prop, not one component per class: 13 of 46 sites switch at runtime between alert and
 * plain state (`plan.budget.tient ? 'etat' : 'cause'`); alert-only would duplicate content on
 * both ternary sides. Four tons = four classes in API and DOM.
 * Glyph stays `aria-hidden` (Icone default): doubles a colour, text carries the meaning.
 */

import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { Icone } from './Icone.tsx'

/**
 * Stylesheet classes. T-0374 — `conseil`: gesture to do before leaving, framed like an alert
 * but grey, sign "info". Not a user fault; red would blame them.
 */
export type TonMention = 'etat' | 'cause' | 'erreur' | 'conseil' | 'tracee-source'

/** The two alerting tons → they take the §11.1 sign. */
const ALERTENT: readonly TonMention[] = ['cause', 'erreur']

/**
 * Other attributes pass through (`role`, `id`, `aria-live`, `aria-atomic`): component decides
 * CLASS and SIGN, a11y contract varies per site. `className` excluded: `ton` determines it,
 * two sources would diverge.
 */
export type MentionProps = Omit<ComponentPropsWithoutRef<'p'>, 'className'> & {
  readonly ton: TonMention
  readonly children: ReactNode
}

export function Mention({ ton, children, ...reste }: MentionProps) {
  return (
    <p className={ton} {...reste}>
      {ALERTENT.includes(ton) && <Icone nom="warning" classe="mention-signe" />}
      {ton === 'conseil' && <Icone nom="info" classe="mention-signe" />}
      {children}
    </p>
  )
}
