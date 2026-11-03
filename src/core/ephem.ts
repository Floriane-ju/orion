/**
 * §12.4 — client-side éphémérides.
 *
 * Thin facade over `astronomy-engine`: analytic JS series, no data file, no network. Option C
 * of §12.4; server call breaks offline, JPL kernels oversized.
 * Library refraction = Meeus — Bennett formula — lifting ≈34' at true horizon, matching
 * registry §2.1. Without it rise/set off by several minutes.
 */

import {
  Body,
  Equator,
  Horizon,
  Observer,
  SiderealTime,
  type AstroTime,
} from 'astronomy-engine'
import { K } from '../registry/constants.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { DEG_PAR_HEURE, HEURES_PAR_TOUR, ramene } from './unites.ts'

export interface Site {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
  readonly altitudeM: number
}

/** The 10 moving bodies of MVP: Soleil, Lune and 6 visible planets (§3.1). */
export const CORPS_MOBILES = Object.freeze([
  Body.Sun,
  Body.Moon,
  Body.Mercury,
  Body.Venus,
  Body.Mars,
  Body.Jupiter,
  Body.Saturn,
  Body.Uranus,
] as const)

export class HorsDomaineSeriesError extends Error {
  readonly annee: number

  constructor(annee: number) {
    super(
      `Année ${annee} hors de ${K('ANNEE_MIN_SERIES')}–${K('ANNEE_MAX_SERIES')} : ` +
        'Soleil, Lune et planètes masqués.',
    )
    this.name = 'HorsDomaineSeriesError'
    this.annee = annee
  }
}

/** §3.1, §12.4 — outside these bounds, solar-system bodies are hidden. */
export function dansLeDomaineDesSeries(date: Date): boolean {
  const annee = date.getUTCFullYear()
  return annee >= K('ANNEE_MIN_SERIES') && annee <= K('ANNEE_MAX_SERIES')
}

export function verifieDomaineDesSeries(date: Date): void {
  if (!dansLeDomaineDesSeries(date)) {
    throw new HorsDomaineSeriesError(date.getUTCFullYear())
  }
}

export function observateur(site: Site): Observer {
  return new Observer(site.latitudeDeg, site.longitudeDeg, site.altitudeM)
}

/** Local sidereal time, hours. */
export function tempsSideralLocal(date: Date, longitudeDeg: number): Traced<number> {
  const tsg = SiderealTime(date)
  const brut = tsg + longitudeDeg / DEG_PAR_HEURE
  const tsl = ramene(brut, HEURES_PAR_TOUR)
  return trace({
    value: tsl,
    formula: 'TEMPS_SIDERAL_LOCAL',
    inputs: { tsg_h: tsg, longitude_deg: longitudeDeg },
  })
}

export interface PositionCorps {
  readonly corps: Body
  /** Right ascension, hours. */
  readonly adH: number
  /** Déclinaison, degrees. */
  readonly decDeg: number
  readonly azimutDeg: number
  /** Hauteur corrected for atmospheric refraction. */
  readonly hauteurDeg: number
}

/** Body position at date: equatorial of date + refraction-corrected horizontal. */
export function positionCorps(corps: Body, date: Date, site: Site): PositionCorps {
  verifieDomaineDesSeries(date)
  const obs = observateur(site)
  const eq = Equator(corps, date, obs, true, true)
  const hz = Horizon(date, obs, eq.ra, eq.dec, 'normal')
  return {
    corps,
    adH: eq.ra,
    decDeg: eq.dec,
    azimutDeg: hz.azimuth,
    hauteurDeg: hz.altitude,
  }
}

export function versDate(t: AstroTime | null): Date | null {
  return t === null ? null : t.date
}

export { Body }
