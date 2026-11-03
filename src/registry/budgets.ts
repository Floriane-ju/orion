/**
 * §3.2 and §1.5.1 — UI responsiveness budgets.
 * §3.2 quantifies animation (50 Hz), §1.5.1 the séance (plan < 2 min). Neither says what a
 * KEYSTROKE may cost, yet both are paid there: input recomputing the whole night in the key's
 * render makes them unreachable with no PRD criterion formally violated.
 * Not physical quantities: no formula depends on them, no verdict cites them. Live beside §2.1,
 * like `imagerie.ts`. Project rule kept: a threshold written in the bench measuring it is no
 * threshold, it is a finding.
 */

export interface ValeurBudget {
  readonly valeur: number
  readonly unite: string
  readonly source: string
  readonly tolerance: string
}

function valeur(v: ValeurBudget): ValeurBudget {
  return Object.freeze(v)
}

export const BUDGETS = Object.freeze({
  /**
   * What a typed character may cost, throttling included.
   * Reference = sustained typing cadence, not comfort: beyond it next key arrives before the
   * previous is painted, input stalls. T-0291 measured 486–692 ms/char in telescope config.
   */
  FRAPPE_MS: valeur({
    valeur: 50,
    unite: 'ms',
    source: 'convention d’interaction — sous l’intervalle d’une frappe soutenue (~7 car./s)',
    tolerance: 'sans objet — budget d’interface, pas une grandeur mesurée',
  }),

  /**
   * Throttling under which the budget holds. T-0255 measures at ×4: §11.2 target machine class
   * (field tablet, not dev workstation). Unthrottled bench divides its budget by this factor.
   */
  BRIDAGE_CPU: valeur({
    valeur: 4,
    unite: '—',
    source: 'classe de machine visée §11.2 — tablette, mesurée au bridage ×4 du navigateur',
    tolerance: 'sans objet — conversion entre machine de mesure et machine visée',
  }),

  /**
   * Main-thread task length beyond which it is a long task. Not a project convention: Long Tasks
   * API definition, as the measuring tool applies it. Holding the thread past it delays first
   * frame, typing, gesture alike.
   */
  TACHE_LONGUE_MS: valeur({
    valeur: 50,
    unite: 'ms',
    source: 'W3C Long Tasks API — seuil de signalement du navigateur',
    tolerance: 'sans objet — seuil de l’outil de mesure, pas une grandeur mesurée',
  }),

  /**
   * What a decode/index slice may hold the main thread.
   * Wall-clock on the computing machine: CPU throttling slows work per slice, not slice length →
   * right on tablet and workstation, no factor to tune. Under §3.2's 20 ms frame (50 Hz): sky
   * keeps turning while catalogues decode.
   */
  TRANCHE_MS: valeur({
    valeur: 8,
    unite: 'ms',
    source: '§3.2 — sous l’image de 20 ms à 50 Hz, marge laissée au rendu',
    tolerance: 'sans objet — budget d’interface, pas une grandeur mesurée',
  }),

  /**
   * Elements swept between two cut points. Slicing granularity = max slice overrun (budget
   * checked only at a cut point). Too fine: test costs more than work; too coarse: slice
   * overflows on slow machine. 4000 elements = ¼ ms workstation, few ms throttled phone.
   */
  PAS_TRANCHE: valeur({
    valeur: 4096,
    unite: 'éléments',
    source: 'granularité de découpage — compromis entre coût du test et dépassement',
    tolerance: 'sans objet — granularité, pas une grandeur mesurée',
  }),

  /**
   * T-0335 — planetarium frame-rate cap. Under §3.2's 50 Hz: heavy scene stays below unforced,
   * light one doesn't burn battery painting frames the eye can't tell.
   */
  IMAGES_PAR_S_MAX: valeur({
    valeur: 30,
    unite: 'im/s',
    source: '§3.2 — plafond de rendu, sous la cadence d’animation de 50 Hz',
    tolerance: 'sans objet — budget d’interface, pas une grandeur mesurée',
  }),

  /** T-0335 — rendered instant and filé counters republish at this rate: readable, no flicker. */
  PUBLICATION_MS: valeur({
    valeur: 500,
    unite: 'ms',
    source: 'convention d’interaction — deux lectures par seconde',
    tolerance: 'sans objet — budget d’interface, pas une grandeur mesurée',
  }),

  /**
   * T-0435 — duration of « copié » on the share button before reverting: readable, yet short
   * enough not to hunt for the button.
   */
  COMPTE_RENDU_COPIE_MS: valeur({
    valeur: 2000,
    unite: 'ms',
    source: 'convention d’interaction — durée de lecture d’un compte rendu bref',
    tolerance: 'sans objet — budget d’interface, pas une grandeur mesurée',
  }),
} satisfies Record<string, ValeurBudget>)

export type IdBudget = keyof typeof BUDGETS

/** Value read, modelled on `K()` (§2.1 registry). */
export function B(id: IdBudget): number {
  return BUDGETS[id].valeur
}
