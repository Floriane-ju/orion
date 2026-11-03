/**
 * §3.2, T-0394 — drive a trajet through time on scène.
 * Writes instant per frame, publishes on TWO channels. Scène reads its own per frame
 * (`useInstantTrajet`): magnitude limite, fond de ciel, repère appearance follow the minute; a
 * 1.2 s trajet would show 2–3 steps otherwise (revue DA §4.2, "stars appear, magnitude by
 * magnitude"). Scène store gets arrival instant only; render loop suspends its publish
 * (`enTrajet`): each publish wakes cible list, replacing its 14 000 rows → even 2×/s the trajet
 * jerked in ciel profond.
 * Time FROZEN during trajet, as after `vaA`: render loop leaves instant to its writer. Any other
 * time gesture (transport, counter, frise) rewrites instant/mode → trajet yields, no contest.
 */

import { courbeTrajet, ecartMontre, planTrajet, type PlanTrajet } from '../core/trajet-temps.ts'
import { pxParDegre } from '../core/curseur-temps.ts'
import { useSyncExternalStore } from 'react'
import { afficheInstant, borneInstant, etatScene, instant, majTemps, vaA } from './scene-etat.ts'
import { creeAbonnes } from './abonnes.ts'

/** Current trajet token: launching another voids the previous. */
let courant = 0
/** Current trajet destination, `null` outside trajet. */
let destination: number | null = null

/**
 * Current trajet destination, `null` outside trajet. Instant counters display it during trajet:
 * reads what was asked, sky catches up; two chained notches add up, 2nd doesn't start from the
 * hour the 1st was crossing.
 */
export function destinationTrajet(): number | null {
  return destination
}

/** Instant the trajet crosses, per frame; `null` outside trajet. */
let passage: number | null = null
const { abonne, notifie } = creeAbonnes()

function posePassage(ms: number | null): void {
  if (ms === passage) return
  passage = ms
  notifie()
}

/** Trajet running? Render loop then suspends its publish. */
export function enTrajet(): boolean {
  return passage !== null
}

/**
 * Current trajet instant, frame-accurate, `null` outside trajet. For what must follow per frame
 * and is cheap: scène, frise cursor.
 */
export function useInstantTrajet(): number | null {
  return useSyncExternalStore(abonne, () => passage, () => null)
}

function mouvementReduit(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Goes to `arriveeMs` crossing time, or jumping when plan requires. `surArrivee` only on
 * effective arrival, never for interrupted trajet. Returns plan: caller announces a jump imposed
 * by readability. `force` ignores §3.2 cap (see `planTrajet`).
 */
export function traverse(
  arriveeMs: number,
  surArrivee?: () => void,
  options: { readonly force?: boolean } = {},
): PlanTrajet {
  const jeton = ++courant
  destination = null
  const arrivee = borneInstant(arriveeMs)
  const { largeurPx, fovDeg } = etatScene().vue
  const plan = planTrajet({
    departMs: instant.ms,
    arriveeMs: arrivee,
    pxParDegre: pxParDegre(largeurPx, fovDeg),
    mouvementReduit: mouvementReduit(),
    ...options,
  })
  if (plan.saut) {
    vaA(arrivee)
    surArrivee?.()
    return plan
  }

  // Forced trajet: excess days skipped first, only the last crossed.
  if (options.force === true) {
    const ecart = arrivee - instant.ms
    const montre = ecartMontre(ecart)
    if (montre !== ecart) vaA(arrivee - montre)
  }
  const depart = instant.ms
  majTemps({ modeTemps: 'FIGE' })
  destination = arrivee
  let debut: number | null = null
  let ecrit = depart
  const image = (ts: number): void => {
    // Interrupted: another trajet, or a gesture that rewrote instant or restarted time.
    if (jeton !== courant) return
    if (instant.ms !== ecrit || etatScene().temps.modeTemps !== 'FIGE') {
      destination = null
      posePassage(null)
      return
    }
    debut ??= ts
    const t = Math.min(1, (ts - debut) / plan.dureeMs)
    ecrit = depart + (arrivee - depart) * courbeTrajet(t)
    instant.ms = ecrit
    if (t < 1) {
      posePassage(ecrit)
      return void requestAnimationFrame(image)
    }
    destination = null
    posePassage(null)
    afficheInstant(ecrit)
    surArrivee?.()
  }
  requestAnimationFrame(image)
  return plan
}
