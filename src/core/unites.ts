/**
 * Changements d'unité et réductions d'angle — des définitions, pas des grandeurs.
 *
 * T-0336 — ces valeurs étaient redéclarées dans une quarantaine de modules. Aucune n'est
 * fausse, mais sept copies d'un même 24 finissent par en contenir un qui dit autre chose. Ce
 * ne sont pas des constantes du registre §2.1 : 24 heures font un tour par définition, rien
 * ne se règle ici, et les y ranger laisserait croire le contraire.
 */

export const TOUR_DEG = 360
export const DEMI_TOUR_DEG = 180
export const TOUR_RAD = 2 * Math.PI
export const HEURES_PAR_TOUR = 24
/** Heures d'angle horaire en degrés : un changement d'unité, pas le taux A-ROT (§3.1). */
export const DEG_PAR_HEURE = TOUR_DEG / HEURES_PAR_TOUR
export const ARCMIN_PAR_DEG = 60
export const ARCSEC_PAR_ARCMIN = 60

export const MS_PAR_S = 1000
export const S_PAR_MIN = 60
export const MIN_PAR_H = 60
export const S_PAR_H = S_PAR_MIN * MIN_PAR_H
export const MS_PAR_MINUTE = MS_PAR_S * S_PAR_MIN

export const POURCENT = 100

/** `v` ramené dans [min ; max]. Une seule écriture, pour que tous les bornages se lisent pareil. */
export function encadre(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** `x` ramené dans [0 ; tour[ — le `%` de JavaScript garde le signe du dividende. */
export function ramene(x: number, tour: number): number {
  return ((x % tour) + tour) % tour
}

/** L'écart signé de `a` à `b` par le plus court chemin, dans ]−tour/2 ; tour/2]. */
export function ecartCourt(a: number, b: number, tour: number): number {
  const d = ramene(b - a, tour)
  return d > tour / 2 ? d - tour : d
}
