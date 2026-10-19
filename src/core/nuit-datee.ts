/**
 * §8.1 et §4.1 — à quelle nuit appartient un instant, et comment cette nuit se nomme.
 *
 * T-0267 — dater la nuit par le jour civil de l'instant la fait changer de sujet à minuit :
 * à 00:30, l'application posée sur la table de camp basculait sur la nuit du lendemain, au
 * moment précis où elle sert le plus. Le jour d'observation court donc d'un midi au suivant :
 * une nuit garde le nom du soir où elle a commencé, du coucher du Soleil à son lever.
 *
 * Le midi retenu est le midi LÉGAL, et non le midi solaire vrai de §4.1. La bascule ne tombe
 * qu'entre le lever du Soleil et le début d'après-midi, quand aucune nuit ne court : l'y
 * décaler d'un quart d'heure ne déplacerait aucune séance. Et un pivot au lever du Soleil
 * demanderait le site pour dater une nuit, alors que c'est la nuit datée qui détermine le
 * site qu'on interroge.
 */

import { K } from '../registry/constants.ts'

const deuxChiffres = (n: number): string => String(n).padStart(2, '0')

/**
 * Le jour LOCAL au format ISO. `toISOString().slice(0, 10)` donnerait le jour UTC : après
 * minuit UTC en été, il désigne la nuit suivante — pas celle qu'on observe.
 */
export function jourLocalIso(date: Date): string {
  return `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-${deuxChiffres(date.getDate())}`
}

/** La nuit qui contient l'instant, nommée par le jour de son coucher de Soleil. */
export function nuitDeLInstant(instant: Date): string {
  const soir = new Date(instant)
  if (instant.getHours() < K('MIDI_JOUR_OBSERVATIONNEL_H')) {
    soir.setDate(soir.getDate() - 1)
  }
  return jourLocalIso(soir)
}

/**
 * Le midi qui ouvre le jour d'observation — d'où part la recherche du coucher du Soleil
 * (§8.1). Midi LOCAL, jamais midi UTC : à l'est du méridien, midi UTC tombe déjà après le
 * coucher et la recherche sauterait à la nuit suivante.
 */
export function midiDeLaNuit(nuitIso: string): Date {
  const midi = new Date(`${nuitIso}T00:00:00`)
  midi.setHours(K('MIDI_JOUR_OBSERVATIONNEL_H'))
  return midi
}

function lendemainIso(nuitIso: string): string {
  const matin = new Date(`${nuitIso}T00:00:00`)
  matin.setDate(matin.getDate() + 1)
  return jourLocalIso(matin)
}

/**
 * T-0431 — l'instant où ouvrir une nuit qu'on n'est pas en train de vivre : son minuit LOCAL,
 * au cœur de la nuit, quand le midi qui l'ouvre peindrait un ciel de jour.
 */
export function minuitDeLaNuit(nuitIso: string): Date {
  return new Date(`${lendemainIso(nuitIso)}T00:00:00`)
}

const enClair = (iso: string): string => iso.split('-').reverse().join('/')

/**
 * Une nuit porte deux dates : les dire toutes les deux est la seule façon de ne pas laisser
 * le lecteur deviner laquelle il tient — c'est ce que cette carte et cet export annoncent.
 */
export function nomDeLaNuit(nuitIso: string): string {
  return `nuit du ${enClair(nuitIso)} au ${enClair(lendemainIso(nuitIso))}`
}
