/**
 * §8.1 — la nuit d'un coup d'œil : ses phases, du coucher au lever du Soleil, et la Lune.
 *
 * Aucune grandeur neuve : les bornes des crépuscules sont celles de `fenetreNocturne`, la
 * Lune est cherchée par `astronomy-engine` comme partout ailleurs. Ce module ne fait que
 * découper l'intervalle, pour que la frise et le plan ne puissent pas désigner deux nuits.
 *
 * La frise déborde d'une demi-heure de jour à chaque bout (`FRISE_MARGE_JOUR_MIN`) : sans
 * elle, le coucher et le lever du Soleil tombaient sur les bords et ne se voyaient pas. Ce
 * jour-là n'entre dans aucun calcul — il situe la nuit, il ne la mesure pas.
 */

import { Body, Illumination, MoonPhase, SearchRiseSet } from 'astronomy-engine'
import { K } from '../registry/constants.ts'
import type { Site } from './ephem.ts'
import { observateur, positionCorps, versDate } from './ephem.ts'
import type { FenetreNocturne } from './nuit.ts'
import { MS_PAR_JOUR } from './horloges.ts'
import { eclatLuneRelatif } from './moon.ts'
import { MIN_PAR_H, MS_PAR_MINUTE } from './unites.ts'

const DESCENTE = -1
const MONTEE = +1
/** Élongation Lune − Soleil de la pleine Lune, convention d'`astronomy-engine`. */
const ELONGATION_PLEINE_LUNE_DEG = 180

export type PhaseCiel = 'JOUR' | 'CIVIL' | 'NAUTIQUE' | 'ASTRONOMIQUE' | 'NUIT_NOIRE'

export interface Intervalle {
  readonly debut: Date
  readonly fin: Date
}

export interface SegmentFrise extends Intervalle {
  readonly phase: PhaseCiel
}

export interface EvenementLune {
  readonly sens: 'LEVER' | 'COUCHER'
  readonly instant: Date
}

/** La Lune à une heure ronde de la nuit, quand elle est levée. */
export interface PositionLune {
  readonly instant: Date
  readonly hauteurDeg: number
  readonly illumination: number
  readonly croissante: boolean
  /** Éclat rapporté à une pleine Lune au zénith, de 0 à 1 (`eclatLuneRelatif`). */
  readonly eclat: number
}

export interface LuneDeLaNuit {
  /** Fraction éclairée du disque au milieu de la frise, de 0 à 1. */
  readonly illumination: number
  /** Vrai entre la nouvelle et la pleine Lune. */
  readonly croissante: boolean
  readonly levee: readonly Intervalle[]
  /** Une position par heure ronde de Lune levée : ce que la frise incruste. */
  readonly positions: readonly PositionLune[]
  readonly evenements: readonly EvenementLune[]
}

export interface FriseNuit extends Intervalle {
  readonly coucherSoleil: Date
  readonly leverSoleil: Date
  readonly segments: readonly SegmentFrise[]
  readonly lune: LuneDeLaNuit
}

interface Palier {
  readonly phase: PhaseCiel
  readonly debut: Date | null
  readonly fin: Date | null
}

/**
 * Chaque palier est emboîté dans le précédent : le Soleil passe −6°, puis −12°, puis −18°,
 * et remonte dans l'ordre inverse. Un palier absent — pas de nuit noire en juin à 60° N —
 * laisse le précédent couvrir tout son intervalle.
 */
function decoupe(
  debut: Date,
  fin: Date,
  phase: PhaseCiel,
  paliers: readonly Palier[],
): readonly SegmentFrise[] {
  const [suivant, ...reste] = paliers
  if (suivant === undefined || suivant.debut === null || suivant.fin === null) {
    return [{ phase, debut, fin }]
  }
  return [
    { phase, debut, fin: suivant.debut },
    ...decoupe(suivant.debut, suivant.fin, suivant.phase, reste),
    { phase, debut: suivant.fin, fin },
  ]
}

function luneLevee(site: Site, instant: Date): boolean {
  return positionCorps(Body.Moon, instant, site).hauteurDeg > 0
}

/** Levers et couchers de la Lune entre deux instants, dans l'ordre. */
function evenementsLune(site: Site, debut: Date, fin: Date): readonly EvenementLune[] {
  const obs = observateur(site)
  const evenements: EvenementLune[] = []
  let levee = luneLevee(site, debut)
  let depuis = debut
  for (;;) {
    const joursRestants = (fin.getTime() - depuis.getTime()) / MS_PAR_JOUR
    if (joursRestants <= 0) break
    const instant = versDate(
      SearchRiseSet(Body.Moon, obs, levee ? DESCENTE : MONTEE, depuis, joursRestants),
    )
    if (instant === null || instant.getTime() > fin.getTime()) break
    evenements.push({ sens: levee ? 'COUCHER' : 'LEVER', instant })
    levee = !levee
    depuis = instant
  }
  return evenements
}

function intervallesLevee(
  debut: Date,
  fin: Date,
  leveeAuDebut: boolean,
  evenements: readonly EvenementLune[],
): readonly Intervalle[] {
  const intervalles: Intervalle[] = []
  let ouverture: Date | null = leveeAuDebut ? debut : null
  for (const { sens, instant } of evenements) {
    if (sens === 'LEVER') ouverture = instant
    else if (ouverture !== null) {
      intervalles.push({ debut: ouverture, fin: instant })
      ouverture = null
    }
  }
  if (ouverture !== null) intervalles.push({ debut: ouverture, fin })
  return intervalles
}

const MS_PAR_H = MS_PAR_MINUTE * MIN_PAR_H

function positionsLune(site: Site, debut: Date, fin: Date): readonly PositionLune[] {
  const positions: PositionLune[] = []
  const premiere = Math.ceil(debut.getTime() / MS_PAR_H) * MS_PAR_H
  for (let t = premiere; t <= fin.getTime(); t += MS_PAR_H) {
    const instant = new Date(t)
    const hauteurDeg = positionCorps(Body.Moon, instant, site).hauteurDeg
    if (hauteurDeg <= 0) continue
    const eclairement = Illumination(Body.Moon, instant)
    positions.push(
      Object.freeze({
        instant,
        hauteurDeg,
        illumination: eclairement.phase_fraction,
        croissante: MoonPhase(instant) < ELONGATION_PLEINE_LUNE_DEG,
        eclat: eclatLuneRelatif(eclairement.phase_angle, hauteurDeg),
      }),
    )
  }
  return positions
}

/** `null` quand le Soleil ne se couche pas ou ne se lève pas : il n'y a pas de nuit à peindre. */
export function friseNuit(site: Site, nuit: FenetreNocturne): FriseNuit | null {
  const coucherSoleil = nuit.coucherSoleil
  const leverSoleil = nuit.leverSoleil
  if (coucherSoleil === null || leverSoleil === null) return null

  const marge = K('FRISE_MARGE_JOUR_MIN') * MS_PAR_MINUTE
  const debut = new Date(coucherSoleil.getTime() - marge)
  const fin = new Date(leverSoleil.getTime() + marge)
  const segments: readonly SegmentFrise[] = [
    { phase: 'JOUR', debut, fin: coucherSoleil },
    ...decoupe(coucherSoleil, leverSoleil, 'CIVIL', [
      { phase: 'NAUTIQUE', debut: nuit.debutCivil, fin: nuit.finCivil },
      { phase: 'ASTRONOMIQUE', debut: nuit.debutNautique, fin: nuit.finNautique },
      { phase: 'NUIT_NOIRE', debut: nuit.debutNuitAstronomique, fin: nuit.finNuitAstronomique },
    ]),
    { phase: 'JOUR', debut: leverSoleil, fin },
  ]

  const milieu = new Date((coucherSoleil.getTime() + leverSoleil.getTime()) / 2)
  const evenements = evenementsLune(site, debut, fin)
  return Object.freeze({
    debut,
    fin,
    coucherSoleil,
    leverSoleil,
    segments: Object.freeze(segments),
    lune: Object.freeze({
      illumination: Illumination(Body.Moon, milieu).phase_fraction,
      croissante: MoonPhase(milieu) < ELONGATION_PLEINE_LUNE_DEG,
      levee: Object.freeze(intervallesLevee(debut, fin, luneLevee(site, debut), evenements)),
      positions: Object.freeze(positionsLune(site, debut, fin)),
      evenements: Object.freeze(evenements),
    }),
  })
}

/** Ce que la frise dit d'un instant qu'on y pointe : la phase du ciel et la hauteur de la Lune. */
export interface LectureFrise {
  readonly instant: Date
  readonly phase: PhaseCiel
  readonly hauteurLuneDeg: number
  /** Fraction éclairée du disque à cet instant, de 0 à 1. */
  readonly illuminationLune: number
  readonly luneCroissante: boolean
}

/**
 * La lecture au point `fraction` de la frise (0 au début, 1 à la fin). La phase est celle du
 * segment peint à cet endroit : la bulle ne peut pas contredire le motif qu'elle commente.
 */
export function lectureFrise(site: Site, frise: FriseNuit, fraction: number): LectureFrise {
  const borne = Math.min(1, Math.max(0, fraction))
  const t = frise.debut.getTime() + borne * (frise.fin.getTime() - frise.debut.getTime())
  const instant = new Date(t)
  const segment =
    frise.segments.find((s) => t >= s.debut.getTime() && t < s.fin.getTime()) ??
    frise.segments[frise.segments.length - 1]!
  return {
    instant,
    phase: segment.phase,
    hauteurLuneDeg: positionCorps(Body.Moon, instant, site).hauteurDeg,
    illuminationLune: Illumination(Body.Moon, instant).phase_fraction,
    luneCroissante: MoonPhase(instant) < ELONGATION_PLEINE_LUNE_DEG,
  }
}
