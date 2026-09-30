/**
 * §10 — l'écriture des nombres à l'écran et dans l'export.
 *
 * T-0276 — 143 `toFixed` rendaient un point décimal (« 17.01 ° ») pendant que le registre et
 * le glossaire écrivaient la virgule (« 35,9 × 23,9 mm ») : les deux se croisaient sur une même
 * ligne. Un nombre destiné à être LU passe par ici ; `toFixed` ne reste que pour ce qu'une
 * machine relit — une valeur CSS, une couleur, un attribut.
 *
 * Le moteur écrit lui aussi des phrases (messages, export texte) : le formateur vit donc dans
 * le registre, que moteur et interface lisent tous deux — c'est une convention d'écriture,
 * comme `libelles.ts`, pas un calcul.
 */

import { MIN_PAR_H, POURCENT, S_PAR_MIN } from '../core/unites.ts'

/** La langue de l'interface : une seule écriture, sans quoi deux écrans dateraient différemment. */
export const LOCALE = 'fr-FR'

const FORMATS = new Map<number, Intl.NumberFormat>()

/**
 * Pas d'espace dans « 6000 » ni « 2026 » : l'usage français ne groupe qu'à partir de cinq
 * chiffres, et un placeholder « 6 000 » inviterait à taper une espace.
 */
const GROUPEMENT = 'min2'

/**
 * `n` à `decimales` chiffres après la virgule, séparateur de milliers compris.
 * `signDisplay: 'negative'` : un −0,00 annoncerait un écart qui n'existe pas.
 */
export function nombre(n: number, decimales = 0): string {
  let format = FORMATS.get(decimales)
  if (format === undefined) {
    format = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
      signDisplay: 'negative',
      useGrouping: GROUPEMENT,
    })
    FORMATS.set(decimales, format)
  }
  return format.format(n)
}

/** Un angle : le degré se colle au nombre, partout (« 39,5° »), jamais « 39,5 ° ». */
export function degres(n: number, decimales = 0): string {
  return `${nombre(n, decimales)}°`
}

/** Une fraction lue en pour cent, l'espace avant le signe (« 42 % »). */
export function pourcentage(fraction: number, decimales = 0): string {
  return `${nombre(fraction * POURCENT, decimales)} %`
}

/** Six chiffres significatifs : assez pour ne rien tronquer d'une constante du registre. */
const CHIFFRES_SIGNIFICATIFS_LIBRES = 6
const FORMAT_LIBRE = new Intl.NumberFormat(LOCALE, {
  maximumSignificantDigits: CHIFFRES_SIGNIFICATIFS_LIBRES,
  signDisplay: 'negative',
  useGrouping: GROUPEMENT,
})

/**
 * Un nombre dont la précision n'est pas décidée par l'écran — une constante, une saisie, une
 * entrée de formule dépliée : « 20,2 » et « 2200 » s'écrivent tels qu'ils sont, à la virgule.
 */
export function nombreLibre(n: number): string {
  return FORMAT_LIBRE.format(n)
}

/** Sous dix secondes, une pose se lit au dixième : l'arrondi à l'unité l'écraserait. */
const POSE_AU_DIXIEME_SOUS_S = 10

/** Une durée de pose, sans son unité : « 2,5 », « 13 ». */
export function formatePose(tS: number): string {
  return nombre(tS, tS < POSE_AU_DIXIEME_SOUS_S ? 1 : 0)
}

/** Une saisie relue telle quelle — « 2.8 » tapé dans un champ numérique se lit « 2,8 ». */
export function saisieLue(saisie: string): string {
  return saisie.replace('.', ',')
}

/**
 * T-0276 — la seule écriture d'une durée : « 45 min » sous l'heure, « 6 h 50 » au-delà. Une
 * même carte lisait « 8.14 h », « 6 h 50 » et « 488 min » ; aucune heure décimale ne s'affiche.
 * L'arrondi se fait sur le total de minutes, sans quoi 59,6 min donnaient « 0 h 60 ».
 */
export function dureeLisible(secondes: number): string {
  const totalMin = Math.round(secondes / S_PAR_MIN)
  if (totalMin < MIN_PAR_H) return `${totalMin} min`
  const heures = Math.floor(totalMin / MIN_PAR_H)
  const minutes = totalMin - heures * MIN_PAR_H
  return `${heures} h ${minutes.toString().padStart(2, '0')}`
}

/** Une durée comptée en minutes, écrite comme toutes les autres. */
export function dureeMinLisible(minutes: number): string {
  return dureeLisible(minutes * S_PAR_MIN)
}
