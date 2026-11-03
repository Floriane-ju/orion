/**
 * §3.4 — sentence dating the image: where scène points, which champ, which instant.
 * T-0068 — canvas must tell assistive tech what it shows; info menu shows the same. Composed
 * twice → drift (`toFixed` edited on one side → accessible name describes another vue); composed
 * once here.
 * T-0163 — bottom bar SETS the sentence (5 numbers = sliding counters), no longer reads it.
 * Sentence = segments (preceding literal, value, what it sets); `ligneVisee` = their
 * concatenation: only way to keep "one sentence, two places" when one interleaves tags.
 */

import type { Mat3 } from '../core/mat3.ts'
import { degres } from '../registry/ecriture.ts'
import { applique, versSpherique, versVecteur } from '../core/mat3.ts'
import { projecteur } from '../core/projection.ts'
import { vuePlanetarium, type VueScene } from './scene-etat.ts'
import { dateHeure } from './horaire.ts'

/** §3.3 — aimed direction back in J2000: canvas centre, projected in reverse. */
export function viseeJ2000(
  vue: VueScene,
  matriceCiel: Mat3,
): { readonly longitudeDeg: number; readonly latitudeDeg: number } {
  // T-0258 — visée centre, not canvas middle: sentence must name the point the image puts in
  // front of the eyes, else it dates a direction elsewhere on screen.
  const p = projecteur(vuePlanetarium(vue), matriceCiel)
  return versSpherique(p.inverse(p.centreXPx, p.centreYPx))
}

/**
 * Reciprocal: where to point vue to aim at this J2000 direction at this instant. `matriceCiel`
 * J2000 → site horizontal frame; central vector of vue matrix Y EQUALS
 * `versVecteur(azimut, hauteur)` — spherical of rotated direction IS the pointage, no
 * projection, no screen.
 */
export function viseeVersVue(
  longitudeDeg: number,
  latitudeDeg: number,
  matriceCiel: Mat3,
): { readonly azimutDeg: number; readonly hauteurDeg: number } {
  const horizontal = versSpherique(
    applique(matriceCiel, versVecteur(longitudeDeg, latitudeDeg)),
  )
  return { azimutDeg: horizontal.longitudeDeg, hauteurDeg: horizontal.latitudeDeg }
}

/** What a sentence segment sets — order of the 5 is reading order. */
export type ChampVisee = 'AD' | 'DEC' | 'AZIMUT' | 'HAUTEUR' | 'FOV' | 'ROTATION'

export interface SegmentVisee {
  readonly champ: ChampVisee
  /** Counter accessible name: the sentence carries it in clear, a counter alone doesn't. */
  readonly libelle: string
  readonly valeurDeg: number
  /** Value as written, unit included. */
  readonly texte: string
  /** Literal preceding it in the sentence, punctuation and spaces included. */
  readonly avant: string
  /** First thing the top-bar field carries: sentence yields to fields there. */
  readonly prefixe: string
  /** Value in its field, minus what the prefix already says. */
  readonly court: string
}

/** Decimals per reading: visée to 0.01, champ to 0.1. */
const DECIMALES_VISEE = 2
const DECIMALES_CHAMP = 1
const DECIMALES_POINTAGE = 0

const DECIMALES_COURT: Readonly<Record<ChampVisee, number>> = Object.freeze({
  AD: DECIMALES_VISEE,
  DEC: DECIMALES_VISEE,
  AZIMUT: DECIMALES_POINTAGE,
  HAUTEUR: DECIMALES_POINTAGE,
  FOV: DECIMALES_CHAMP,
  ROTATION: DECIMALES_POINTAGE,
})

/** Top-bar field value, as written there. */
export function courtVisee(champ: ChampVisee, valeurDeg: number): string {
  return `${degres(valeurDeg, DECIMALES_COURT[champ])}`
}

export function segmentsVisee(vue: VueScene, matriceCiel: Mat3): readonly SegmentVisee[] {
  const visee = viseeJ2000(vue, matriceCiel)
  return [
    {
      champ: 'AD',
      libelle: 'Ascension droite visée',
      valeurDeg: visee.longitudeDeg,
      texte: `${degres(visee.longitudeDeg, DECIMALES_VISEE)} AD`,
      avant: 'visée ',
      prefixe: 'AD',
      court: courtVisee('AD', visee.longitudeDeg),
    },
    {
      champ: 'DEC',
      libelle: 'Déclinaison visée',
      valeurDeg: visee.latitudeDeg,
      texte: `${degres(visee.latitudeDeg, DECIMALES_VISEE)} δ`,
      avant: ' / ',
      prefixe: 'δ',
      court: courtVisee('DEC', visee.latitudeDeg),
    },
    {
      champ: 'AZIMUT',
      libelle: 'Azimut',
      valeurDeg: vue.azimutDeg,
      texte: `${degres(vue.azimutDeg, DECIMALES_POINTAGE)}`,
      avant: ' · azimut ',
      prefixe: 'AZ',
      court: courtVisee('AZIMUT', vue.azimutDeg),
    },
    {
      champ: 'HAUTEUR',
      libelle: 'Hauteur',
      valeurDeg: vue.hauteurDeg,
      texte: `${degres(vue.hauteurDeg, DECIMALES_POINTAGE)}`,
      avant: ', hauteur ',
      prefixe: 'H',
      court: courtVisee('HAUTEUR', vue.hauteurDeg),
    },
    {
      champ: 'FOV',
      libelle: 'Champ de vision',
      valeurDeg: vue.fovDeg,
      texte: `${degres(vue.fovDeg, DECIMALES_CHAMP)}`,
      avant: ' · champ ',
      prefixe: 'CH',
      court: courtVisee('FOV', vue.fovDeg),
    },
    {
      champ: 'ROTATION',
      libelle: 'Rotation du cadre',
      valeurDeg: vue.rotationCadreDeg,
      texte: `${degres(vue.rotationCadreDeg, DECIMALES_POINTAGE)}`,
      avant: ' · rotation ',
      prefixe: 'ROT',
      court: courtVisee('ROTATION', vue.rotationCadreDeg),
    },
  ]
}

/**
 * Separator belongs to CHAINING, not the first segment: bottom bar no longer shows the instant
 * (transport carries it 2 cm away); segments must read alone, no orphan "·" first.
 */
const SEPARATEUR = ' · '

export function ligneVisee(vue: VueScene, matriceCiel: Mat3, date: Date): string {
  return segmentsVisee(vue, matriceCiel).reduce(
    (phrase, s) => phrase + s.avant + s.texte,
    dateHeure(date) + SEPARATEUR,
  )
}
