/**
 * T-0215 — bar tiroir: clickable summary + content that unfolds.
 * T-0189 contract: NO JavaScript in tiroir. Échap via the single document listener
 * (`gere-echap.ts`), shared by all tiroirs, returns focus to `<summary>`; `<details>` carries
 * opening, keyboard, announcement. Component only stops copying this in 4 places.
 * `resume` = `ReactNode`, not title: the 4 tiroirs put different things (coordinates pastille,
 * conditional icon + word, icon + label changing on persistence failure, one word).
 * `alerte` ABSENT by default, not `false`: 3 of 4 tiroirs have no `data-alerte` attribute;
 * setting one everywhere would change markup `coque.test.tsx` reads.
 */

import type { ReactNode } from 'react'

export interface TiroirProps {
  /** Modifier class suffix: `site`, `nuit`, `outils`, `legende`. */
  readonly modificateur: string
  /** `<summary>` content — what shows with tiroir closed. */
  readonly resume: ReactNode
  readonly children: ReactNode
  /**
   * T-0041 — tiroir flags a section carrying an alerte. Red never announces alone (§11.1):
   * `resume` must say it in words too.
   */
  readonly alerte?: boolean | undefined
}

export function Tiroir({ modificateur, resume, children, alerte }: TiroirProps) {
  return (
    <details
      className={`tiroir tiroir-${modificateur}`}
      {...(alerte === undefined ? {} : { 'data-alerte': alerte })}
    >
      <summary>{resume}</summary>
      <div className="tiroir-contenu">{children}</div>
    </details>
  )
}
