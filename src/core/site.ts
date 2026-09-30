/**
 * §4.1 — Conséquences site-dépendantes, calculées à la validation du site.
 *
 * L'application annonce à la validation quelle part du ciel austral est hors de portée
 * depuis ce site. Information structurante que rien d'autre ne donne.
 */

import { K } from '../registry/constants.ts'
import { DOMAINES, SaisieRefuseeError, valide } from '../registry/domains.ts'
import type { Flag, Traced } from './traced.ts'
import { trace } from './traced.ts'
import { DEG } from './mat3.ts'
import { QUART_TOUR_DEG as ANGLE_DROIT_DEG, ramene, TOUR_DEG } from './unites.ts'

export interface SeuilsSite {
  /** Déclinaison au-delà de laquelle une cible est circumpolaire. */
  readonly decCircumpolaire: Traced<number>
  /** Déclinaison en dessous de laquelle une cible n'atteint jamais le seuil d'imagerie. */
  readonly decMinImagerie: Traced<number>
  /** Déclinaison en dessous de laquelle une cible n'atteint jamais le seuil visuel. */
  readonly decMinVisuel: Traced<number>
}

export function seuilsDeclinaison(latitudeDeg: number): SeuilsSite {
  return {
    decCircumpolaire: trace({
      value: ANGLE_DROIT_DEG - Math.abs(latitudeDeg),
      formula: 'DECLINAISON_CIRCUMPOLAIRE',
      inputs: { latitude_deg: latitudeDeg },
    }),
    decMinImagerie: trace({
      value: latitudeDeg - (ANGLE_DROIT_DEG - K('SEUIL_HAUTEUR_IMAGERIE_DEG')),
      formula: 'DECLINAISON_MIN_IMAGERIE',
      inputs: { latitude_deg: latitudeDeg },
      constants: ['SEUIL_HAUTEUR_IMAGERIE_DEG'],
    }),
    decMinVisuel: trace({
      value: latitudeDeg - (ANGLE_DROIT_DEG - K('SEUIL_HAUTEUR_VISUEL_DEG')),
      formula: 'DECLINAISON_MIN_VISUEL',
      inputs: { latitude_deg: latitudeDeg },
      constants: ['SEUIL_HAUTEUR_VISUEL_DEG'],
    }),
  }
}

/** Une valeur d'obstruction par degré d'azimut, de 0 à 359 (§4.1). */
export const NB_AZIMUTS = 360

export interface MasqueHorizon {
  /** Altitude d'obstruction en degrés, indexée par l'azimut entier. */
  readonly altitudesDeg: readonly number[]
  /** Vrai quand le masque est le repli plat, faute de donnée de relief. */
  readonly estHypothese: boolean
  readonly flags?: readonly Flag[]
  readonly note?: string
}

/**
 * Repli d'un site sans donnée de relief : horizon plat à 0°, marqué [HYP] (§4.1).
 * L'hypothèse est annoncée — un site au pied des Alpes n'a pas d'horizon plat, et une
 * recommandation calculée sur cette base serait fausse la moitié du temps.
 */
export function masquePlat(): MasqueHorizon {
  return Object.freeze({
    altitudesDeg: Object.freeze(Array.from({ length: NB_AZIMUTS }, () => 0)),
    estHypothese: true,
    flags: Object.freeze(['HYP' as const]),
    note:
      'Horizon supposé plat. Complétez-le si arbres, collines ou bâtiments cachent le ciel.',
  })
}

/** Masque construit sur un profil d'altitude réel : ce n'est plus une hypothèse (§4.1). */
export function masqueDepuisRelief(altitudesDeg: readonly number[]): MasqueHorizon {
  if (altitudesDeg.length !== NB_AZIMUTS) {
    throw new SaisieRefuseeError(
      'masque_horizon_deg',
      `Saisie refusée : ${DOMAINES.masque_horizon_deg.champ} demande ${NB_AZIMUTS} valeurs, une par degré ` +
        `d'azimut ; ${altitudesDeg.length} reçues. Les azimuts manquants ne sont pas comblés ` +
        'au hasard.',
    )
  }
  for (const altitude of altitudesDeg) {
    valide('masque_horizon_deg', altitude)
  }
  return Object.freeze({
    altitudesDeg: Object.freeze([...altitudesDeg]),
    estHypothese: false,
  })
}

/** Un couple saisi à la main : dans cet azimut, le relief monte jusqu'à cette hauteur (§4.1). */
export interface PointMasque {
  readonly azimutDeg: number
  readonly altitudeDeg: number
}

/**
 * Masque édité à la main, azimut par azimut (§4.1 — « édition manuelle par-dessus »).
 *
 * Personne ne saisit 360 valeurs : on relève quelques crêtes, et les azimuts intermédiaires
 * s'interpolent linéairement d'un point au suivant, en refermant le cercle entre le dernier
 * et le premier. Deux relevés dans le même azimut gardent le plus haut : c'est le relief qui
 * cache, pas la moyenne des deux.
 */
export function masqueDepuisPoints(points: readonly PointMasque[]): MasqueHorizon {
  if (points.length === 0) return masquePlat()

  const parAzimut = new Map<number, number>()
  for (const point of points) {
    const azimut = valide('azimut_masque_deg', point.azimutDeg)
    const altitude = valide('masque_horizon_deg', point.altitudeDeg)
    const index = Math.round(azimut) % NB_AZIMUTS
    parAzimut.set(index, Math.max(parAzimut.get(index) ?? 0, altitude))
  }
  const releves = [...parAzimut.entries()]
    .map(([azimut, altitude]) => ({ azimut, altitude }))
    .sort((a, b) => a.azimut - b.azimut)

  const altitudesDeg = Array.from({ length: NB_AZIMUTS }, (_, azimut) => {
    const rangApres = releves.findIndex((r) => r.azimut >= azimut)
    const apres = releves[rangApres === -1 ? 0 : rangApres]
    const avant = releves[((rangApres === -1 ? 0 : rangApres) - 1 + releves.length) % releves.length]
    if (apres === undefined || avant === undefined) return 0
    if (apres.azimut === azimut) return apres.altitude
    // Un relevé unique couvre tout le tour : la portée vaut alors le cercle entier.
    const portee = (apres.azimut - avant.azimut + NB_AZIMUTS) % NB_AZIMUTS || NB_AZIMUTS
    const ecart = (azimut - avant.azimut + NB_AZIMUTS) % NB_AZIMUTS
    return avant.altitude + ((apres.altitude - avant.altitude) * ecart) / portee
  })

  return Object.freeze({
    altitudesDeg: Object.freeze(altitudesDeg),
    estHypothese: false,
    note:
      `Relevé à la main : ${releves.length} direction${releves.length > 1 ? 's' : ''}.`,
  })
}

/** Obstruction à un azimut quelconque : l'azimut se referme sur lui-même. */
export function obstructionDeg(masque: MasqueHorizon, azimutDeg: number): number {
  const index = ramene(Math.round(azimutDeg), NB_AZIMUTS)
  return masque.altitudesDeg[index] ?? 0
}

/** Hauteur atteinte par une cible à sa culmination, depuis ce site. */
export function altitudeCulmination(latitudeDeg: number, decDeg: number): Traced<number> {
  return trace({
    value: ANGLE_DROIT_DEG - Math.abs(latitudeDeg - decDeg),
    formula: 'ALTITUDE_CULMINATION',
    inputs: { latitude_deg: latitudeDeg, dec_deg: decDeg },
  })
}

/**
 * Latitude au-dessous de laquelle une déclinaison atteint enfin le seuil de hauteur donné.
 *
 * Le seuil est atteint dès que | latitude − δ | < 90° − seuil : la borne haute de cet
 * intervalle est la seule qui intéresse un observateur de l'hémisphère nord, et c'est elle
 * qu'annoncent §8.2 et §3.7 quand une cible australe reste hors de portée.
 */
export function latitudeAccessibleDeg(decDeg: number, seuilHauteurDeg: number): number {
  return decDeg + (ANGLE_DROIT_DEG - seuilHauteurDeg)
}

/**
 * Masse d'air sans trace : appelée par échantillon sur un créneau entier, là où produire un
 * résultat tracé par minute d'observation n'apporterait rien et coûterait tout.
 */
export function masseAirBrute(hauteurDeg: number): number {
  return 1 / Math.sin(hauteurDeg * DEG)
}

/**
 * Masse d'air. La formule cesse d'être valide sous environ 15° de hauteur.
 *
 * `null` en entrée n'est pas une erreur : une cible dont l'instant d'évaluation sort du
 * domaine des séries n'a pas de hauteur, et la sortie le dit au lieu de supposer le
 * zénith (§7.6).
 */
export function masseAir(hauteurDeg: number | null): Traced<number | null> {
  if (hauteurDeg === null || hauteurDeg <= 0) {
    return trace({
      value: null,
      formula: 'MASSE_AIR',
      ...(hauteurDeg === null ? {} : { inputs: { alt_deg: hauteurDeg } }),
      flags: ['DONNEE_MANQUANTE'],
      note:
        hauteurDeg === null
          ? 'Hauteur de la cible inconnue.'
          : 'Cible sous l’horizon.',
    })
  }
  const valeur = masseAirBrute(hauteurDeg)
  const sousLeDomaine = hauteurDeg < K('HAUTEUR_MIN_MASSE_AIR_DEG')
  return trace({
    value: valeur,
    formula: 'MASSE_AIR',
    inputs: { alt_deg: hauteurDeg },
    ...(sousLeDomaine
      ? {
          flags: ['HORS_DOMAINE' as const],
          note:
            `Sous ${K('HAUTEUR_MIN_MASSE_AIR_DEG')}°, la valeur réelle est plus forte.`,
        }
      : {}),
  })
}

/** L'azimut est compté depuis le nord, dans le sens des aiguilles d'une montre. */
const CARDINAUX = Object.freeze(['N', 'E', 'S', 'O'] as const)

/** Point cardinal le plus proche d'un azimut, pour se repérer sans convertir de tête. */
export function repereCardinal(azimutDeg: number): string {
  const quart = ramene(Math.round(azimutDeg / (TOUR_DEG / CARDINAUX.length)), CARDINAUX.length)
  return CARDINAUX[quart] ?? CARDINAUX[0]
}
