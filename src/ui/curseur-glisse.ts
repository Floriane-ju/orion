/**
 * T-0169 — la loi d'un rail, isolée du composant qui l'applique.
 *
 * Un rail mappe une course finie sur une plage finie : contrairement au compteur
 * (`compteur-glisse.ts`), le geste n'a pas de vitesse — la valeur est celle que désigne
 * l'abscisse du pointeur, et rien d'autre. Ce qui se calcule ici est donc la conversion
 * course ↔ valeur, et l'accroche.
 *
 * L'ACCROCHE se mesure en pixels de rail, jamais en unités métier : une tolérance exprimée en
 * secondes serait imperceptible sur un rail de 240 s et infranchissable sur un rail de 1. Sous
 * le doigt, la détente doit avoir la même largeur partout.
 */

import { encadre } from '../core/unites.ts'

/**
 * Demi-largeur de la détente, en pixels CSS de rail. Assez large pour se sentir au doigt,
 * assez étroite pour que la valeur voisine reste atteignable — c'est une loi de geste, pas un
 * seuil métier : le registre §2.1 n'a pas à la porter.
 */
const ACCROCHE_PX = 7

export interface Rail {
  readonly min: number
  readonly max: number
  readonly pas: number
  /** Valeur qui aimante le geste, quand le rail en porte une. */
  readonly accroche?: number
}

/** La valeur alignée sur le pas depuis `min`, bornée à la course. */
export function valeurQuantifiee(valeur: number, rail: Rail): number {
  const pas = rail.pas > 0 ? rail.pas : rail.max - rail.min
  const crans = Math.round((valeur - rail.min) / pas)
  // Le pas n'est pas toujours entier — centièmes de poids, plancher de luminance — et la somme
  // flottante laisse une poussière (0,30000000000000004) qui remonterait jusqu'au texte affiché.
  const cranee = Number((rail.min + crans * pas).toPrecision(12))
  return encadre(cranee, rail.min, rail.max)
}

/**
 * L'accroche, si elle tombe dans la course. Hors course, elle est ignorée plutôt que ramenée à
 * la borne : un repère collé au bout du rail mentirait sur l'emplacement du seuil.
 */
export function accrocheDansLaCourse(rail: Rail): number | null {
  const a = rail.accroche
  if (a === undefined || !Number.isFinite(a) || a < rail.min || a > rail.max) return null
  return a
}

/** La fraction [0, 1] de course qu'occupe une valeur : position du pouce et du repère. */
export function fractionDuRail(valeur: number, rail: Rail): number {
  const course = rail.max - rail.min
  if (course <= 0) return 0
  return encadre((valeur - rail.min) / course, 0, 1)
}

/** La valeur que désigne une fraction de course, crantée puis accrochée. */
export function valeurDuRail(fraction: number, rail: Rail, largeurPx: number): number {
  const brut = rail.min + fraction * (rail.max - rail.min)
  const valeur = valeurQuantifiee(brut, rail)
  const accroche = accrocheDansLaCourse(rail)
  if (accroche === null || largeurPx <= 0) return valeur
  const tolerance = (ACCROCHE_PX / largeurPx) * (rail.max - rail.min)
  return Math.abs(valeur - accroche) <= tolerance ? accroche : valeur
}
