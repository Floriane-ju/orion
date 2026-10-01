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

import { encadre, S_PAR_H, S_PAR_MIN } from '../core/unites.ts'

/**
 * Demi-largeur de la détente, en pixels CSS de rail. Assez large pour se sentir au doigt,
 * assez étroite pour que la valeur voisine reste atteignable — c'est une loi de geste, pas un
 * seuil métier : le registre §2.1 n'a pas à la porter.
 */
const ACCROCHE_PX = 7

export interface Rail {
  readonly min: number
  readonly max: number
  /**
   * Le cran. Une fonction quand il change le long de la course — T-0374, un temps de prise de
   * vue se règle à la seconde sous la minute et à quelques minutes au-delà de l'heure.
   */
  readonly pas: number | ((valeur: number) => number)
  /**
   * T-0374 — course logarithmique : chaque décade prend la même longueur de rail. Sur 1 s → 8 h
   * en linéaire, la pose max (une trentaine de secondes) tombait dans le premier millième.
   * `min` doit être strictement positif.
   */
  readonly echelle?: 'log'
  /** Valeur qui aimante le geste, quand le rail en porte une. */
  readonly accroche?: number
}

/** La valeur alignée sur le pas depuis `min`, bornée à la course. */
export function valeurQuantifiee(valeur: number, rail: Rail): number {
  const brut = typeof rail.pas === 'function' ? rail.pas(valeur) : rail.pas
  const pas = brut > 0 ? brut : rail.max - rail.min
  // Un pas variable s'aligne sur zéro : « 10 min » doit tomber sur un cran, pas sur 10 min + 1 s.
  const origine = typeof rail.pas === 'function' ? 0 : rail.min
  const crans = Math.round((valeur - origine) / pas)
  // Le pas n'est pas toujours entier — centièmes de poids, plancher de luminance — et la somme
  // flottante laisse une poussière (0,30000000000000004) qui remonterait jusqu'au texte affiché.
  const cranee = Number((origine + crans * pas).toPrecision(12))
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
  if (rail.echelle === 'log') {
    return encadre(Math.log(valeur / rail.min) / Math.log(rail.max / rail.min), 0, 1)
  }
  return encadre((valeur - rail.min) / course, 0, 1)
}

/** La valeur que désigne une fraction de course, crantée puis accrochée. */
export function valeurDuRail(fraction: number, rail: Rail, largeurPx: number): number {
  const brut =
    rail.echelle === 'log'
      ? rail.min * (rail.max / rail.min) ** fraction
      : rail.min + fraction * (rail.max - rail.min)
  const valeur = valeurQuantifiee(brut, rail)
  const accroche = accrocheDansLaCourse(rail)
  if (accroche === null || largeurPx <= 0) return valeur
  // Mesurée en course et non en valeur : la détente garde sa largeur quelle que soit l'échelle.
  const ecartPx = Math.abs(fraction - fractionDuRail(accroche, rail)) * largeurPx
  return ecartPx <= ACCROCHE_PX ? accroche : valeur
}

/**
 * T-0374 — le cran d'un rail de durée : la seconde sous la minute, la minute sous l'heure, cinq
 * minutes au-delà. Une loi de geste, comme la détente : sur une course logarithmique, un pas
 * fixe serait trop fin en haut et trop gros en bas. Chaque cran s'écrit sans reste par
 * `dureeLisible`, qui compte en minutes.
 */
const CRAN_HEURE_MIN = 5

export function cranDeDuree(secondes: number): number {
  if (secondes < S_PAR_MIN) return 1
  if (secondes < S_PAR_H) return S_PAR_MIN
  return CRAN_HEURE_MIN * S_PAR_MIN
}
