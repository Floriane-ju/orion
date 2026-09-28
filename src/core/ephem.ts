/**
 * §12.4 — Éphémérides côté client.
 *
 * Façade mince sur `astronomy-engine` : séries analytiques portées en JavaScript, aucun
 * fichier de données téléchargé, aucun appel réseau. C'est l'option C de §12.4 ; l'appel
 * serveur casserait l'offline et les noyaux JPL seraient surdimensionnés.
 *
 * La réfraction employée par la bibliothèque est celle de Meeus — la formule de Bennett —
 * avec un relèvement d'environ 34' à l'horizon vrai, conforme au registre §2.1. Sans elle,
 * les instants de lever et de coucher sont faux de plusieurs minutes.
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
import { HEURES_PAR_TOUR, ramene } from './unites.ts'

export interface Site {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
  readonly altitudeM: number
}

/** Les 10 corps mobiles du MVP : Soleil, Lune et 6 planètes visibles (§3.1). */
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

/** §3.1, §12.4 — hors de ces bornes, les corps du système solaire sont masqués. */
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

const DEG_PAR_HEURE_HORAIRE = 360 / HEURES_PAR_TOUR

/** Temps sidéral local, en heures. */
export function tempsSideralLocal(date: Date, longitudeDeg: number): Traced<number> {
  const tsg = SiderealTime(date)
  const brut = tsg + longitudeDeg / DEG_PAR_HEURE_HORAIRE
  const tsl = ramene(brut, HEURES_PAR_TOUR)
  return trace({
    value: tsl,
    formula: 'TEMPS_SIDERAL_LOCAL',
    inputs: { tsg_h: tsg, longitude_deg: longitudeDeg },
  })
}

/** Décalage angulaire dû à la précession générale, en degrés (§3.1, §3.4). */
export function precessionDeg(nombreAnnees: number): Traced<number> {
  const ARCSEC_PAR_DEGRE = 3600
  return trace({
    value: (K('PRECESSION_ARCSEC_AN') * nombreAnnees) / ARCSEC_PAR_DEGRE,
    formula: 'PRECESSION',
    inputs: { n_annees: nombreAnnees },
    constants: ['PRECESSION_ARCSEC_AN'],
  })
}

export interface PositionCorps {
  readonly corps: Body
  /** Ascension droite, en heures. */
  readonly adH: number
  /** Déclinaison, en degrés. */
  readonly decDeg: number
  readonly azimutDeg: number
  /** Hauteur corrigée de la réfraction atmosphérique. */
  readonly hauteurDeg: number
}

/**
 * Position d'un corps à la date donnée, en coordonnées équatoriales de la date et en
 * coordonnées horizontales corrigées de la réfraction.
 */
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
