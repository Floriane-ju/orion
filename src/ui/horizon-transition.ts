/**
 * §4.1, T-0369 — l'horizon dessiné passe d'un relief à l'autre au lieu de sauter.
 *
 * Au changement de lieu, l'ancien relief s'aplatit en attendant le nouveau, puis celui-ci
 * monte de la forme affichée. Affichage seul : le masque des calculs change d'un coup, une
 * recommandation ne dépend pas d'une interpolation d'écran.
 */

import { NB_AZIMUTS } from '../core/site.ts'

/** La cible d'un relief en attente. Une seule instance : la boucle compare les cibles par identité. */
export const HORIZON_PLAT: readonly number[] = Object.freeze(
  Array.from({ length: NB_AZIMUTS }, () => 0),
)

export interface TransitionHorizon {
  readonly depart: readonly number[]
  readonly cible: readonly number[]
  readonly debutMs: number
}

/** Smoothstep : la silhouette démarre et s'arrête sans à-coup. C'est `--courbe` de la feuille. */
export function adoucit(t: number): number {
  return t * t * (3 - 2 * t)
}

/** L'horizon à l'instant `ms` ; la cible elle-même, par identité, une fois la transition finie. */
export function horizonA(transition: TransitionHorizon, ms: number, dureeMs: number): readonly number[] {
  const t = dureeMs <= 0 ? 1 : (ms - transition.debutMs) / dureeMs
  if (t >= 1 || transition.depart === transition.cible) return transition.cible
  const f = adoucit(Math.max(0, t))
  return transition.depart.map((a, i) => a + ((transition.cible[i] ?? a) - a) * f)
}

/**
 * La transition vers `cible`. Au premier affichage il n'y a rien d'où partir : la cible se
 * pose telle quelle. Une cible neuve en cours de route repart de ce qui est à l'écran.
 */
export function versHorizon(
  transition: TransitionHorizon | null,
  cible: readonly number[],
  ms: number,
  dureeMs: number,
): TransitionHorizon {
  if (transition === null) return { depart: cible, cible, debutMs: ms }
  if (transition.cible === cible) return transition
  return { depart: horizonA(transition, ms, dureeMs), cible, debutMs: ms }
}
