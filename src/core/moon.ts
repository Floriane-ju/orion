/**
 * §8.1 — Moon: phase, position, fond de ciel degradation, fenêtre utile. PRD rules:
 *   1. Moon below horizon degrades nothing, any phase; altitude decides, never phase alone.
 *   2. A Moon night is not "lost": higher fond de ciel → shorter poses, longer integration;
 *      engine quantifies, doesn't strike the night.
 * Degradation = Krisciunas & Schaefer (1991) model, local: no network, no external table.
 */

import { Body, Equator, Illumination, KM_PER_AU, SearchRiseSet } from 'astronomy-engine'
import { dureeMinLisible, nombre } from '../registry/ecriture.ts'
import { K } from '../registry/constants.ts'
import type { Site } from './ephem.ts'
import { observateur, positionCorps, verifieDomaineDesSeries, versDate } from './ephem.ts'
import type { FenetreNocturne } from './nuit.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { attenuationBrute, rapportDeFlux } from './exposure.ts'
import { DEG, separationEquatorialeDeg } from './mat3.ts'
import { MIN_PAR_H, MS_PAR_MINUTE, QUART_TOUR_DEG as ANGLE_DROIT_DEG } from './unites.ts'

const JOURS_DE_RECHERCHE = 2
const DESCENTE = -1
const MONTEE = 1

// Position et phase

export interface EtatLuneInstant {
  readonly altitudeDeg: number
  readonly azimutDeg: number
  readonly adH: number
  readonly decDeg: number
  /** Lit disc fraction, 0 (new) → 1 (full). */
  readonly illumination: number
  /** Phase angle, degrees: 0 at full Moon, 180 at new. */
  readonly anglePhaseDeg: number
  /** Apparent half-diameter, degrees, topocentric (Moon 1-2 % larger at zenith than geocentric). */
  readonly demiDiametreDeg: number
  readonly lever: Date | null
  readonly coucher: Date | null
  /** True when Moon below horizon: enters no calculation. */
  readonly sousHorizon: boolean
}

export function etatLune(site: Site, date: Date): EtatLuneInstant {
  verifieDomaineDesSeries(date)
  const obs = observateur(site)
  const position = positionCorps(Body.Moon, date, site)
  const eclairement = Illumination(Body.Moon, date)
  return {
    altitudeDeg: position.hauteurDeg,
    azimutDeg: position.azimutDeg,
    adH: position.adH,
    decDeg: position.decDeg,
    illumination: eclairement.phase_fraction,
    anglePhaseDeg: eclairement.phase_angle,
    demiDiametreDeg: demiDiametreLuneDeg(date, site),
    lever: versDate(SearchRiseSet(Body.Moon, obs, MONTEE, date, JOURS_DE_RECHERCHE)),
    coucher: versDate(SearchRiseSet(Body.Moon, obs, DESCENTE, date, JOURS_DE_RECHERCHE)),
    sousHorizon: position.hauteurDeg <= 0,
  }
}


function demiDiametreLuneDeg(date: Date, site: Site): number {
  const distanceKm = Equator(Body.Moon, date, observateur(site), true, true).dist * KM_PER_AU
  return Math.asin(K('RAYON_MOYEN_LUNE_KM') / distanceKm) / DEG
}

/** Moon equatorial coordinates of date; no horizontal calculation. */
function positionEquatorialeLune(date: Date, site: Site): {
  readonly adH: number
  readonly decDeg: number
} {
  const eq = Equator(Body.Moon, date, observateur(site), true, true)
  return { adH: eq.ra, decDeg: eq.dec }
}

// §8.1 — dégradation lunaire, KS91 (Krisciunas & Schaefer 1991)

/** KS91 masse d'air, valid down to horizon unlike 1 / sin(alt). */
export function masseAirKS(hauteurDeg: number): number {
  const zenithal = (ANGLE_DROIT_DEG - hauteurDeg) * DEG
  const sin = Math.sin(zenithal)
  return 1 / Math.sqrt(1 - K('KS_MASSE_AIR_COEF') * sin * sin)
}

/** Surface brightness in nanolamberts: unit in which the model sums. */
export function nanolamberts(sbMagArcsec2: number): number {
  return (
    K('NANOLAMBERT_ECHELLE') *
    Math.exp(K('NANOLAMBERT_OFFSET') - K('NANOLAMBERT_PENTE') * sbMagArcsec2)
  )
}

/** Moon illuminance outside atmosphere at given phase angle. */
export function illuminanceLune(anglePhaseDeg: number): number {
  const a = Math.abs(anglePhaseDeg)
  const magnitude =
    K('KS_MAGNITUDE_LUNE_PLEINE') + K('KS_COEF_PHASE') * a + K('KS_COEF_PHASE_4') * (a * a) ** 2
  return rapportDeFlux(magnitude)
}

/** KS91 Rayleigh scattering term: broad, blue. */
export function diffusionRayleighKS(separation: number): number {
  const cos = Math.cos(separation * DEG)
  return K('BASE_MAGNITUDE') ** K('KS_RAYLEIGH_LOG') * (K('KS_RAYLEIGH_CONSTANTE') + cos * cos)
}

/** KS91 Mie scattering term: tight around the body, neutral. */
export function diffusionMieKS(separation: number): number {
  return K('BASE_MAGNITUDE') ** (K('KS_MIE_LOG') - separation / K('KS_MIE_ECHELLE_DEG'))
}

/** Scattering function: Rayleigh near Moon, Mie beyond. */
export function diffusionKS(separation: number): number {
  return diffusionRayleighKS(separation) + diffusionMieKS(separation)
}

export interface GeometrieLune {
  readonly altitudeLuneDeg: number
  readonly altitudeCibleDeg: number
  readonly separationDeg: number
  readonly anglePhaseDeg: number
}

export interface EntreeDeltaSbLune extends GeometrieLune {
  readonly sbCielNoirMag: number
}

/**
 * Brightness added by Moon toward this direction, nanolamberts: KS91 B_lune term before magnitude
 * conversion. Separate export: planétarium render (T-0100) ADDS it to site + twilight brightness
 * (summing magnitudes is meaningless); redoing it elsewhere = two Moon halos for one model.
 */
export function brillanceLuneNl(entree: GeometrieLune): number {
  // Module rule 1: Moon below horizon adds nothing.
  if (entree.altitudeLuneDeg <= 0 || entree.altitudeCibleDeg <= 0) return 0
  return (
    diffusionKS(entree.separationDeg) *
    illuminanceLune(entree.anglePhaseDeg) *
    attenuationBrute(masseAirKS(entree.altitudeLuneDeg)) *
    (1 - attenuationBrute(masseAirKS(entree.altitudeCibleDeg)))
  )
}

/** Moon fond de ciel degradation, mag/arcsec²: positive = brighter sky; 0 once Moon is down. */
export function deltaSbLune(entree: EntreeDeltaSbLune): Traced<number> {
  const inputs = {
    sb_ciel_noir: entree.sbCielNoirMag,
    alt_lune_deg: entree.altitudeLuneDeg,
    alt_cible_deg: entree.altitudeCibleDeg,
    separation_deg: entree.separationDeg,
    angle_phase_deg: entree.anglePhaseDeg,
  }
  const constants = [
    'KS_MAGNITUDE_LUNE_PLEINE',
    'KS_COEF_PHASE',
    'KS_COEF_PHASE_4',
    'KS_RAYLEIGH_LOG',
    'KS_RAYLEIGH_CONSTANTE',
    'KS_MIE_LOG',
    'KS_MIE_ECHELLE_DEG',
    'KS_MASSE_AIR_COEF',
    'EXTINCTION_V_MAG_PAR_MASSE_AIR',
    'NANOLAMBERT_ECHELLE',
    'NANOLAMBERT_OFFSET',
    'NANOLAMBERT_PENTE',
  ] as const

  if (entree.altitudeLuneDeg <= 0 || entree.altitudeCibleDeg <= 0) {
    return trace({
      value: 0,
      formula: 'DELTA_SB_LUNE',
      inputs,
      note: 'Lune couchée ou cible non levée : aucune gêne.',
    })
  }

  const bLune = brillanceLuneNl(entree)

  const bCiel = nanolamberts(entree.sbCielNoirMag)
  const delta = K('POGSON') * Math.log10((bCiel + bLune) / bCiel)

  return trace({
    value: delta,
    formula: 'DELTA_SB_LUNE',
    inputs,
    constants,
    note:
      `La Lune éclaircit le ciel de ${nombre(delta, 2)} mag/arcsec² sur cette cible : ` +
      'poses plus courtes, temps total plus long.',
  })
}

/** Effective fond de ciel under Moon. */
export function sbCielAvecLune(sbCielNoirMag: number, deltaSb: number): number {
  return sbCielNoirMag - deltaSb
}

export interface EntreeCielSousLaLune {
  readonly site: Site
  /** Instant of Moon evaluation; caller chooses and announces it. */
  readonly instant: Date
  /** Target coordinates: right ascension hours, declination degrees. */
  readonly adH: number
  readonly decDeg: number
  /**
   * Target altitude for extinction along its path. Plan uses culmination (§8.1); fiche must too,
   * else two screens dose one night differently.
   */
  readonly altitudeCibleDeg: number
  readonly sbCielNoirMag: number
}

export interface CielSousLaLune {
  readonly delta: Traced<number>
  readonly sbCielEffectif: number
  readonly altLuneDeg: number
  readonly separationDeg: number
  /**
   * Extinction altitude, returned as given. §7.6 extinguishes object flux at the same altitude:
   * two conventions for one quantity = two poses on one screen.
   */
  readonly altitudeCibleDeg: number
  /** Lit fraction: what screen reads (named phase isn't a number). */
  readonly illumination: number
}

/**
 * §8.1 — fond de ciel a target sees under the Moon at an instant.
 * Shared by plan de séance and fiche cible (T-0089): same target, same night → same engine, else
 * two poses announced.
 */
export function cielSousLaLune(entree: EntreeCielSousLaLune): CielSousLaLune {
  const lune = etatLune(entree.site, entree.instant)
  const posLune = positionEquatorialeLune(entree.instant, entree.site)
  const separation = separationEquatorialeDeg(entree.adH, entree.decDeg, posLune.adH, posLune.decDeg)
  const delta = deltaSbLune({
    sbCielNoirMag: entree.sbCielNoirMag,
    altitudeLuneDeg: lune.altitudeDeg,
    altitudeCibleDeg: entree.altitudeCibleDeg,
    separationDeg: separation,
    anglePhaseDeg: lune.anglePhaseDeg,
  })
  return {
    delta,
    sbCielEffectif: sbCielAvecLune(entree.sbCielNoirMag, delta.value),
    altLuneDeg: lune.altitudeDeg,
    separationDeg: separation,
    altitudeCibleDeg: entree.altitudeCibleDeg,
    illumination: lune.illumination,
  }
}

// §8.1 — fenêtre utile

export interface FenetreUtile {
  /** Night sub-interval with Moon below horizon. */
  readonly debut: Date | null
  readonly fin: Date | null
  readonly dureeH: number
  /** Reference night duration, shown apart from fenêtre utile (§8.1). */
  readonly dureeNuitH: number
  readonly luneInterfere: boolean
  readonly note: string
}

function heuresEntre(debut: Date, fin: Date): number {
  return (fin.getTime() - debut.getTime()) / (MS_PAR_MINUTE * MIN_PAR_H)
}

/**
 * Fenêtre utile: part of night with Moon set. Both durations returned separately, else user can't
 * see what Moon costs.
 * Moon-tolerant object (§6.3) stays plannable all night: caller arbitrates with `deltaSbLune`.
 */
export function fenetreUtile(site: Site, nuit: FenetreNocturne): FenetreUtile {
  const debut = nuit.debutReference
  const fin = nuit.finReference
  if (debut === null || fin === null) {
    return {
      debut: null,
      fin: null,
      dureeH: 0,
      dureeNuitH: 0,
      luneInterfere: false,
      note: 'Pas de nuit noire à cette date.',
    }
  }

  const dureeNuitH = heuresEntre(debut, fin)
  const pas = MS_PAR_MINUTE
  let meilleurDebut: Date | null = null
  let meilleureFin: Date | null = null
  let courantDebut: Date | null = null

  for (let t = debut.getTime(); t <= fin.getTime(); t += pas) {
    const instant = new Date(t)
    const sousHorizon = positionCorps(Body.Moon, instant, site).hauteurDeg <= 0
    if (sousHorizon && courantDebut === null) courantDebut = instant
    if ((!sousHorizon || t + pas > fin.getTime()) && courantDebut !== null) {
      const finCourante = new Date(sousHorizon ? t : t - pas)
      if (
        meilleurDebut === null ||
        meilleureFin === null ||
        finCourante.getTime() - courantDebut.getTime() >
          meilleureFin.getTime() - meilleurDebut.getTime()
      ) {
        meilleurDebut = courantDebut
        meilleureFin = finCourante
      }
      courantDebut = null
    }
  }

  if (meilleurDebut === null || meilleureFin === null) {
    return {
      debut: null,
      fin: null,
      dureeH: 0,
      dureeNuitH,
      luneInterfere: true,
      note:
        'Lune levée toute la nuit : préférez les nébuleuses en émission.',
    }
  }

  const dureeH = heuresEntre(meilleurDebut, meilleureFin)
  const luneInterfere = dureeH < dureeNuitH - pas / (MS_PAR_MINUTE * MIN_PAR_H)
  return {
    debut: meilleurDebut,
    fin: meilleureFin,
    dureeH,
    dureeNuitH,
    luneInterfere,
    note: luneInterfere
      ? `${dureeMinLisible(dureeH * MIN_PAR_H)} sans Lune sur ${dureeMinLisible(dureeNuitH * MIN_PAR_H)} de nuit.`
      : 'La Lune ne gêne pas cette nuit.',
  }
}
