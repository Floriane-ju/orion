/**
 * §8.1 — frise: sky phases (jour → nuit noire) + Moon.
 * 24 h window centered on scene instant (`FRISE_DEMI_FENETRE_H` each side): time scrolls under a
 * fixed cursor. Sliding window spans two nuits or none → split by Sun altitude crossings found
 * in window, not one `fenetreNocturne`.
 * Rise/set = `astronomy-engine` (upper limb, refraction incl.): frise day starts when theme
 * flips (`soleilLeve`).
 */

import { Body, Illumination, MoonPhase, SearchAltitude, SearchRiseSet } from 'astronomy-engine'
import { K } from '../registry/constants.ts'
import type { Site } from './ephem.ts'
import { observateur, positionCorps, versDate } from './ephem.ts'
import { soleilLeve } from './nuit.ts'
import { MS_PAR_JOUR } from './horloges.ts'
import { MS_PAR_H, MS_PAR_MINUTE } from './unites.ts'

const DESCENTE = -1
const MONTEE = +1
/** Moon − Sun elongation at full Moon, `astronomy-engine` convention. */
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

/** Body altitude at an instant: one frise curve point. */
export interface HauteurAstre {
  readonly instant: Date
  readonly hauteurDeg: number
}

export interface LuneDeLaNuit {
  /** Lit disc fraction at window middle, 0-1. */
  readonly illumination: number
  /** True between new and full Moon. */
  readonly croissante: boolean
  readonly levee: readonly Intervalle[]
  /** Altitude curve, risen or not (`courbeHauteur`). */
  readonly hauteurs: readonly HauteurAstre[]
  readonly evenements: readonly EvenementLune[]
}

export interface FriseNuit extends Intervalle {
  readonly segments: readonly SegmentFrise[]
  /** Sun altitude curve (`courbeHauteur`). */
  readonly soleil: readonly HauteurAstre[]
  readonly lune: LuneDeLaNuit
}

function luneLevee(site: Site, instant: Date): boolean {
  return positionCorps(Body.Moon, instant, site).hauteurDeg > 0
}

/** Moonrises and moonsets between two instants, ordered. */
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

/** Frise window: instant at center, half-window each side. */
export function fenetreFrise(centreMs: number): Intervalle {
  const demi = K('FRISE_DEMI_FENETRE_H') * MS_PAR_H
  return { debut: new Date(centreMs - demi), fin: new Date(centreMs + demi) }
}

/**
 * Compute window covering shown window for any instant in `centreMs`'s hour: frise scrolls each
 * trajet frame, ephemerides recompute hourly only.
 */
export function fenetreCalculFrise(centreMs: number): Intervalle {
  const heure = Math.floor(centreMs / MS_PAR_H) * MS_PAR_H
  const { debut, fin } = fenetreFrise(heure)
  return { debut, fin: new Date(fin.getTime() + MS_PAR_H) }
}

/** Sky phase at an instant, from Sun altitude. */
export function phaseSoleil(site: Site, instant: Date): PhaseCiel {
  const h = positionCorps(Body.Sun, instant, site).hauteurDeg
  if (h < K('HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG')) return 'NUIT_NOIRE'
  if (h < K('HAUTEUR_CREPUSCULE_NAUTIQUE_DEG')) return 'ASTRONOMIQUE'
  if (h < K('HAUTEUR_CREPUSCULE_CIVIL_DEG')) return 'NAUTIQUE'
  return soleilLeve(site, instant) ? 'JOUR' : 'CIVIL'
}

type Recherche = (sens: number, depuis: Date, jours: number) => Date | null

/** Instants where a search succeeds between two bounds, both directions. */
function franchissements(recherche: Recherche, debut: Date, fin: Date): readonly Date[] {
  const instants: Date[] = []
  for (const sens of [DESCENTE, MONTEE]) {
    let depuis = debut
    for (;;) {
      const jours = (fin.getTime() - depuis.getTime()) / MS_PAR_JOUR
      if (jours <= 0) break
      const instant = recherche(sens, depuis, jours)
      if (instant === null || instant.getTime() > fin.getTime()) break
      instants.push(instant)
      // Same-direction crossings a day apart: 1 min skips the same one.
      depuis = new Date(instant.getTime() + MS_PAR_MINUTE)
    }
  }
  return instants
}

/**
 * Phases between two instants. Bounds = twilight crossings + rise/set; phase read at each
 * interval's middle; adjacent same-phase intervals merge.
 */
function segmentsCiel(site: Site, debut: Date, fin: Date): readonly SegmentFrise[] {
  const obs = observateur(site)
  const recherches: readonly Recherche[] = [
    (sens, depuis, jours) => versDate(SearchRiseSet(Body.Sun, obs, sens, depuis, jours)),
    ...(
      [
        'HAUTEUR_CREPUSCULE_CIVIL_DEG',
        'HAUTEUR_CREPUSCULE_NAUTIQUE_DEG',
        'HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG',
      ] as const
    ).map(
      (cle): Recherche =>
        (sens, depuis, jours) =>
          versDate(SearchAltitude(Body.Sun, obs, sens, depuis, jours, K(cle))),
    ),
  ]
  const bornes = [
    debut,
    ...recherches
      .flatMap((r) => franchissements(r, debut, fin))
      .filter((t) => t > debut && t < fin)
      .sort((a, b) => a.getTime() - b.getTime()),
    fin,
  ]
  const segments: SegmentFrise[] = []
  for (let i = 1; i < bornes.length; i++) {
    const a = bornes[i - 1]!
    const b = bornes[i]!
    const phase = phaseSoleil(site, new Date((a.getTime() + b.getTime()) / 2))
    const precedent = segments.at(-1)
    if (precedent?.phase === phase) segments[segments.length - 1] = { phase, debut: precedent.debut, fin: b }
    else segments.push({ phase, debut: a, fin: b })
  }
  return segments
}

/** Body altitude every `PAS_COURBES_FRISE_MIN`, bounds incl., below horizon too. */
function courbeHauteur(site: Site, corps: Body, debut: Date, fin: Date): readonly HauteurAstre[] {
  const pas = K('PAS_COURBES_FRISE_MIN') * MS_PAR_MINUTE
  const points: HauteurAstre[] = []
  for (let t = debut.getTime(); t < fin.getTime() + pas; t += pas) {
    const instant = new Date(Math.min(t, fin.getTime()))
    points.push(Object.freeze({ instant, hauteurDeg: positionCorps(corps, instant, site).hauteurDeg }))
  }
  return points
}

export function friseCiel(site: Site, { debut, fin }: Intervalle): FriseNuit {
  const milieu = new Date((debut.getTime() + fin.getTime()) / 2)
  const evenements = evenementsLune(site, debut, fin)
  return Object.freeze({
    debut,
    fin,
    segments: Object.freeze(segmentsCiel(site, debut, fin)),
    soleil: Object.freeze(courbeHauteur(site, Body.Sun, debut, fin)),
    lune: Object.freeze({
      illumination: Illumination(Body.Moon, milieu).phase_fraction,
      croissante: MoonPhase(milieu) < ELONGATION_PLEINE_LUNE_DEG,
      levee: Object.freeze(intervallesLevee(debut, fin, luneLevee(site, debut), evenements)),
      hauteurs: Object.freeze(courbeHauteur(site, Body.Moon, debut, fin)),
      evenements: Object.freeze(evenements),
    }),
  })
}

/** Frise reading of a pointed instant: sky phase + Moon altitude. */
export interface LectureFrise {
  readonly instant: Date
  readonly phase: PhaseCiel
  readonly hauteurLuneDeg: number
  /** Lit disc fraction at this instant, 0-1. */
  readonly illuminationLune: number
  readonly luneCroissante: boolean
}

/**
 * Phase as PAINTED at instant: line and bubble must not contradict pattern. Outside frise:
 * computed.
 */
export function phaseFrise(site: Site, frise: FriseNuit, instant: Date): PhaseCiel {
  const t = instant.getTime()
  const segment = frise.segments.find((s) => t >= s.debut.getTime() && t < s.fin.getTime())
  return segment?.phase ?? phaseSoleil(site, instant)
}

export function lectureFrise(site: Site, frise: FriseNuit, instant: Date): LectureFrise {
  return {
    instant,
    phase: phaseFrise(site, frise, instant),
    hauteurLuneDeg: positionCorps(Body.Moon, instant, site).hauteurDeg,
    illuminationLune: Illumination(Body.Moon, instant).phase_fraction,
    luneCroissante: MoonPhase(instant) < ELONGATION_PLEINE_LUNE_DEG,
  }
}
