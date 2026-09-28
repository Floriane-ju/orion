/**
 * §7 — l'heure affichée, à la minute, dans la langue de l'interface.
 *
 * T-0110 — la même fonction vivait dans `Verdicts.tsx` et dans `PlanSession.tsx`, la première
 * commentée « comme partout ailleurs » : une promesse que deux définitions ne peuvent pas
 * tenir. Un plan de séance et le verdict qui le justifie citent les mêmes créneaux ; qu'ils
 * les datent au même format n'est pas une coïncidence à entretenir à la main.
 *
 * T-0162 — le panneau du temps ne se contente plus d'écrire l'instant, il le règle champ par
 * champ : le format est celui de la locale, et `partiesJour` en rend les morceaux sans le
 * réécrire — découper l'instant en compteurs ne doit pas en changer l'ordre ni la ponctuation.
 */

/** La langue de l'interface : une seule écriture, sans quoi deux écrans dateraient différemment. */
export const LOCALE = 'fr-FR'

/** Sous dix secondes, une pose se lit au dixième : l'arrondi à l'unité l'écraserait. */
const POSE_AU_DIXIEME_SOUS_S = 10

/** Une durée de pose, sans son unité : « 2.5 », « 13 ». */
export function formatePose(tS: number): string {
  return tS < POSE_AU_DIXIEME_SOUS_S ? tS.toFixed(1) : tS.toFixed(0)
}

/** L'heure seule, sans la date : les deux bornes d'un créneau tombent dans la même nuit. */
export function heure(date: Date): string {
  return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
}

/**
 * T-0314 — le quantième, le mois abrégé, l'année.
 *
 * T-0164 avait mis ce jour tout en chiffres : « août » et « mai » n'ont pas la même largeur, et
 * la date se tire champ par champ. Le glisser capture le pointeur — le compteur tiré reste sous
 * le doigt quelle que soit sa largeur, et seuls ses voisins bougent, après coup.
 *
 * T-0327 — le jour de la semaine est retiré : ce n'est pas un champ réglable, et posé en texte
 * devant trois champs encadrés, il se lisait comme un quatrième qui ne répondait pas.
 */
const OPTIONS_JOUR: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
}

/** L'heure à la seconde. Le défilement §3.2 avance de 2,5 min par seconde : la minute seule
 * afficherait une horloge qui saute par paliers de soixante. */
const OPTIONS_HEURE: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}

/** L'instant complet, date et heure : les bornes de la nuit tombent sur deux jours. */
export function dateHeure(date: Date): string {
  return date.toLocaleString(LOCALE)
}

/** Un compte, avec le séparateur de milliers de la langue de l'interface. */
export function compte(n: number): string {
  return n.toLocaleString(LOCALE)
}

/**
 * Les morceaux du jour et de l'heure, séparateurs compris — l'ordre et la ponctuation restent
 * ceux de la locale, que ce soit « 31/08/2026 » ou une autre langue un jour.
 */
export function partiesJour(date: Date): readonly Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat(LOCALE, OPTIONS_JOUR).formatToParts(date)
}

export function partiesHeure(date: Date): readonly Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat(LOCALE, OPTIONS_HEURE).formatToParts(date)
}

/**
 * La largeur la plus longue que prend chaque morceau de l'instant, en caractères : le mois le
 * plus long de l'année, le quantième et l'heure à deux chiffres. Mesurée sur les douze mois
 * d'une année en fin de journée, dans la locale même — pas écrite : « sept. » n'a pas la
 * largeur de « mai » dans toutes les langues.
 */
export const LARGEURS_INSTANT: Readonly<Partial<Record<Intl.DateTimeFormatPartTypes, number>>> =
  (() => {
    const largeurs: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {}
    const mois = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 28, 23, 59, 59))
    for (const date of mois) {
      for (const partie of [...partiesJour(date), ...partiesHeure(date)]) {
        largeurs[partie.type] = Math.max(largeurs[partie.type] ?? 0, partie.value.length)
      }
    }
    return Object.freeze(largeurs)
  })()

/** Les six champs que le panneau du temps règle séparément. Le mois est humain : 1 à 12. */
export type ChampInstant = 'annee' | 'mois' | 'jour' | 'heure' | 'minute' | 'seconde'

/**
 * T-0162 — le même instant, un champ réécrit.
 *
 * Le jour est ramené au dernier jour du mois VISÉ, alors que les heures, les minutes et les
 * secondes débordent librement : glisser les mois depuis un 31 doit donner le 28 février et
 * non le 3 mars — le geste règle un mois, pas une durée —, tandis que glisser les heures
 * au-delà de minuit doit bel et bien changer de jour, puisque c'est un instant qu'on promène.
 */
export function dateAvec(date: Date, champ: ChampInstant, valeur: number): Date {
  const annee = champ === 'annee' ? valeur : date.getFullYear()
  const mois = (champ === 'mois' ? valeur : date.getMonth() + 1) - 1
  const heures = champ === 'heure' ? valeur : date.getHours()
  const minutes = champ === 'minute' ? valeur : date.getMinutes()
  const secondes = champ === 'seconde' ? valeur : date.getSeconds()
  // Le zéroième jour du mois suivant EST le dernier du mois visé.
  const dernierJour = new Date(annee, mois + 1, 0).getDate()
  const jour =
    champ === 'jour' ? valeur : Math.min(date.getDate(), dernierJour)
  return new Date(annee, mois, jour, heures, minutes, secondes)
}
