/**
 * §3.4 — la phrase qui date l'image : où pointe la scène, sur quel champ, à quel instant.
 *
 * T-0068 — le canevas doit dire à une technologie d'assistance ce qu'il montre en ce moment,
 * et le menu d'information affiche déjà exactement cela. Composée deux fois, la phrase
 * dériverait — un `toFixed` retouché d'un côté, et le nom accessible ne décrit plus la même
 * vue que la lecture affichée. Elle se compose donc ici, une fois, pour les deux.
 *
 * T-0163 — la barre basse ne lit plus cette phrase, elle la RÈGLE : chacun de ses cinq
 * nombres est un compteur glissant. La phrase se décrit donc en segments — le littéral qui
 * précède, la valeur, ce qu'elle règle — et `ligneVisee` n'en est plus que la concaténation.
 * C'est la seule façon de garder « une phrase, deux endroits » quand l'un des deux endroits
 * l'entrecoupe de balises.
 */

import type { Mat3 } from '../core/mat3.ts'
import { nombre } from '../registry/ecriture.ts'
import { applique, versSpherique, versVecteur } from '../core/mat3.ts'
import { projecteur } from '../core/projection.ts'
import { vuePlanetarium, type VueScene } from './scene-etat.ts'
import { dateHeure } from './horaire.ts'

/** §3.3 — la direction visée, ramenée en J2000 : le centre du canevas, projeté à l'envers. */
export function viseeJ2000(
  vue: VueScene,
  matriceCiel: Mat3,
): { readonly longitudeDeg: number; readonly latitudeDeg: number } {
  // T-0258 — le centre de visée, pas le milieu du canevas : la phrase doit nommer le point que
  // l'image met sous les yeux, sinon elle date une direction qui se trouve ailleurs à l'écran.
  const p = projecteur(vuePlanetarium(vue), matriceCiel)
  return versSpherique(p.inverse(p.centreXPx, p.centreYPx))
}

/**
 * La réciproque : où pointer la vue pour viser cette direction J2000, à cet instant.
 *
 * `matriceCiel` va de J2000 au repère horizontal du site, et le vecteur central de la matrice
 * de vue Y VAUT exactement `versVecteur(azimut, hauteur)` — la sphérique de la direction
 * tournée EST donc le pointage, sans passer par la projection ni par l'écran.
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

/** Ce que règle un segment de la phrase — l'ordre des cinq est celui de la lecture. */
export type ChampVisee = 'AD' | 'DEC' | 'AZIMUT' | 'HAUTEUR' | 'FOV' | 'ROTATION'

export interface SegmentVisee {
  readonly champ: ChampVisee
  /** Nom accessible du compteur : la phrase le porte en clair, le compteur seul non. */
  readonly libelle: string
  readonly valeurDeg: number
  /** La valeur telle qu'elle s'écrit, unité comprise. */
  readonly texte: string
  /** Le littéral qui la précède dans la phrase, ponctuation et espaces compris. */
  readonly avant: string
  /** Ce que le champ de la barre haute porte en tête : la phrase y cède la place aux champs. */
  readonly prefixe: string
  /** La valeur dans son champ, sans ce que le préfixe dit déjà. */
  readonly court: string
}

/** Décimales de chaque lecture : une visée se pointe au centième, un champ au dixième. */
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

/** La valeur d'un champ de la barre haute, telle qu'elle s'y écrit. */
export function courtVisee(champ: ChampVisee, valeurDeg: number): string {
  return `${nombre(valeurDeg, DECIMALES_COURT[champ])}°`
}

export function segmentsVisee(vue: VueScene, matriceCiel: Mat3): readonly SegmentVisee[] {
  const visee = viseeJ2000(vue, matriceCiel)
  return [
    {
      champ: 'AD',
      libelle: 'Ascension droite visée',
      valeurDeg: visee.longitudeDeg,
      texte: `${nombre(visee.longitudeDeg, DECIMALES_VISEE)}° AD`,
      avant: 'visée ',
      prefixe: 'AD',
      court: courtVisee('AD', visee.longitudeDeg),
    },
    {
      champ: 'DEC',
      libelle: 'Déclinaison visée',
      valeurDeg: visee.latitudeDeg,
      texte: `${nombre(visee.latitudeDeg, DECIMALES_VISEE)}° δ`,
      avant: ' / ',
      prefixe: 'δ',
      court: courtVisee('DEC', visee.latitudeDeg),
    },
    {
      champ: 'AZIMUT',
      libelle: 'Azimut',
      valeurDeg: vue.azimutDeg,
      texte: `${nombre(vue.azimutDeg, DECIMALES_POINTAGE)}°`,
      avant: ' · azimut ',
      prefixe: 'AZ',
      court: courtVisee('AZIMUT', vue.azimutDeg),
    },
    {
      champ: 'HAUTEUR',
      libelle: 'Hauteur',
      valeurDeg: vue.hauteurDeg,
      texte: `${nombre(vue.hauteurDeg, DECIMALES_POINTAGE)}°`,
      avant: ', hauteur ',
      prefixe: 'H',
      court: courtVisee('HAUTEUR', vue.hauteurDeg),
    },
    {
      champ: 'FOV',
      libelle: 'Champ de vision',
      valeurDeg: vue.fovDeg,
      texte: `${nombre(vue.fovDeg, DECIMALES_CHAMP)}°`,
      avant: ' · champ ',
      prefixe: 'CH',
      court: courtVisee('FOV', vue.fovDeg),
    },
    {
      champ: 'ROTATION',
      libelle: 'Rotation du cadre',
      valeurDeg: vue.rotationCadreDeg,
      texte: `${nombre(vue.rotationCadreDeg, DECIMALES_POINTAGE)}°`,
      avant: ' · rotation ',
      prefixe: 'ROT',
      court: courtVisee('ROTATION', vue.rotationCadreDeg),
    },
  ]
}

/**
 * Le séparateur appartient à l'ENCHAÎNEMENT, pas au premier segment : la barre basse n'affiche
 * plus l'instant — le transport le porte à deux centimètres de là — et la suite des segments
 * doit pouvoir s'y lire seule, sans un « · » orphelin en tête.
 */
const SEPARATEUR = ' · '

export function ligneVisee(vue: VueScene, matriceCiel: Mat3, date: Date): string {
  return segmentsVisee(vue, matriceCiel).reduce(
    (phrase, s) => phrase + s.avant + s.texte,
    dateHeure(date) + SEPARATEUR,
  )
}
