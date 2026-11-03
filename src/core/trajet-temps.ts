/**
 * §3.2, T-0394 — time travel: « aller à » an instant by traversing it (Revue DA §4.2
 * « La tombée de la nuit »). A jump hides when each magnitude becomes visible; trajet = §3.2
 * scroll triggered by gesture, same legibility cap.
 * Curve ≠ `--courbe`: smoothstep is symmetric, arrival (last magnitudes) must settle slower than
 * departure. PEAK speed < `facteur_max`; an average under cap would let mid-trip fold.
 */

import { K } from '../registry/constants.ts'
import { facteurMax } from './curseur-temps.ts'
import { MS_PAR_JOUR } from './horloges.ts'

/**
 * Trip curve: A·(t/p)^m up to switch p, then 1 − (1 − A)·((1 − t)/(1 − p))^n.
 * A equalises slopes at p: no speed jump; peak there.
 */
function formeCourbe(): { readonly p: number; readonly m: number; readonly n: number; readonly a: number } {
  const p = K('COURBE_TRAJET_BASCULE')
  const m = K('COURBE_TRAJET_ENTREE')
  const n = K('COURBE_TRAJET_SORTIE')
  const a = n / (1 - p) / (m / p + n / (1 - p))
  return { p, m, n, a }
}

/** Trip fraction covered at duration fraction `t` ∈ [0, 1]. */
export function courbeTrajet(t: number): number {
  const { p, m, n, a } = formeCourbe()
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t < p ? a * (t / p) ** m : 1 - (1 - a) * ((1 - t) / (1 - p)) ** n
}

/** Peak/mean speed = curve slope at p. */
export function penteMaxTrajet(): number {
  const { p, m, a } = formeCourbe()
  return (a * m) / p
}

export type PlanTrajet =
  | { readonly saut: false; readonly dureeMs: number }
  | { readonly saut: true; readonly raison: 'MOUVEMENT_REDUIT' | 'ILLISIBLE' | 'SUR_PLACE' }

/**
 * Trip duration `departMs` → `arriveeMs`, or the jump replacing it. Nominal if peak fits under
 * cap; else stretched just enough; jump if stretch > `DUREE_TRAJET_MAX_MS` (announced, like any
 * §3.2 clipping). Under `prefers-reduced-motion`: always a jump (§11.1).
 */
export function planTrajet(entree: {
  readonly departMs: number
  readonly arriveeMs: number
  readonly pxParDegre: number
  readonly mouvementReduit: boolean
  /**
   * Ignore the cap: duration follows days crossed (`dureeForcee`), not legibility. Product
   * choice for panneau de temps: a day change must be SEEN even when sky scrolls faster than
   * readable (§3.2). Frise click too (T-0420).
   */
  readonly force?: boolean
}): PlanTrajet {
  const ecartMs = Math.abs(entree.arriveeMs - entree.departMs)
  if (ecartMs === 0) return { saut: true, raison: 'SUR_PLACE' }
  if (entree.mouvementReduit) return { saut: true, raison: 'MOUVEMENT_REDUIT' }
  if (entree.force === true) return { saut: false, dureeMs: dureeForcee(ecartMs) }
  const plafond = facteurMax(entree.pxParDegre).value
  const dureeMs = Math.max(K('DUREE_TRAJET_MS'), (penteMaxTrajet() * ecartMs) / plafond)
  return dureeMs > K('DUREE_TRAJET_MAX_MS')
    ? { saut: true, raison: 'ILLISIBLE' }
    : { saut: false, dureeMs }
}


/**
 * Forced-trip duration: nominal + `DUREE_TRAJET_PAR_DOUBLEMENT_MS` per doubling of days crossed,
 * capped at `DUREE_TRAJET_FORCE_MAX_MS`. 1-2 h stay nominal; a week looks longer than a day.
 */
export function dureeForcee(ecartMs: number): number {
  const jours = Math.abs(ecartMs) / MS_PAR_JOUR
  const duree = K('DUREE_TRAJET_MS') + K('DUREE_TRAJET_PAR_DOUBLEMENT_MS') * Math.log2(1 + jours)
  return Math.min(duree, K('DUREE_TRAJET_FORCE_MAX_MS'))
}

/**
 * Share of a gap a forced trip SHOWS: whole gap up to `JOURS_TRAJET_FORCE_MAX` days, else last
 * days + day fraction; rest (whole solar days) skipped at start. Sun returns to its place: jump
 * only visible on stars, Moon, planets, not fond de ciel. Duration follows the real gap
 * (`dureeForcee`): a year lasts longer than a week even showing 3 days.
 */
export function ecartMontre(ecartMs: number): number {
  const max = K('JOURS_TRAJET_FORCE_MAX') * MS_PAR_JOUR
  const absolu = Math.abs(ecartMs)
  if (absolu <= max) return ecartMs
  return Math.sign(ecartMs) * (max + (absolu % MS_PAR_JOUR))
}
