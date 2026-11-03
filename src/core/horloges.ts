/**
 * §3.1 — two-clock time pipeline: horloge_rendu 60 Hz (frame), horloge_ephemerides 10 Hz
 * (positions).
 * Decoupling is not premature optimization: else every frame = full planetary series evaluation
 * → few fps, jerky, worse than discrete mode.
 * Stars NEVER interpolated (fixed in equatorial frame; only rotation matrix changes).
 * Moving bodies linearly interpolated between two samples.
 */

import { K } from '../registry/constants.ts'
import {
  CORPS_MOBILES,
  dansLeDomaineDesSeries,
  positionCorps,
  tempsSideralLocal,
  type PositionCorps,
  type Site,
} from './ephem.ts'
import { DEG, multiplie, rotationX, rotationZ, type Mat3, type Vec3 } from './mat3.ts'
import { trace, type Traced } from './traced.ts'
import { ARCSEC_PAR_DEG, DEG_PAR_HEURE, ecartCourt, encadre, HEURES_PAR_TOUR, MS_PAR_MINUTE, MS_PAR_S, ramene, TOUR_DEG } from './unites.ts'

export const MS_PAR_JOUR = K('JOUR_SOLAIRE_S') * MS_PAR_S
/** J2000.0 = noon: half a day after 2000-01-01 start. */
const EPOQUE_J2000_MS = Date.UTC(K('EPOQUE_J2000_ANNEE'), 0, 1) + MS_PAR_JOUR / 2

/** Display epoch, fractional year; drives precession. */
export function epoqueAnnee(date: Date): number {
  return (
    K('EPOQUE_J2000_ANNEE') +
    (date.getTime() - EPOQUE_J2000_MS) / MS_PAR_JOUR / K('ANNEE_JULIENNE_J')
  )
}

/** Angular shift from general precession over `annees`, degrees (§3.1, §3.4). */
export function decalagePrecessionDeg(annees: number): number {
  return (K('PRECESSION_ARCSEC_AN') * annees) / ARCSEC_PAR_DEG
}

/**
 * General precession J2000 → epoch, rotation about ecliptic pole. Recomputed per whole year, never
 * per frame: 1 yr = 50.29", far below a pixel.
 */
export function matricePrecession(anneeEpoque: number): Mat3 {
  const psiDeg = decalagePrecessionDeg(anneeEpoque - K('EPOQUE_J2000_ANNEE'))
  const obliquite = K('OBLIQUITE_J2000_DEG')
  return multiplie(rotationX(-obliquite), multiplie(rotationZ(psiDeg), rotationX(obliquite)))
}

let precessionMemo: { annee: number; matrice: Mat3 } | null = null

/** Same matrix, memoized per whole year (§3.1). */
function matricePrecessionAnnee(anneeEpoque: number): Mat3 {
  const annee = Math.round(anneeEpoque)
  if (precessionMemo === null || precessionMemo.annee !== annee) {
    precessionMemo = { annee, matrice: matricePrecession(annee) }
  }
  return precessionMemo.matrice
}

/**
 * J2000 direction of NORTH CELESTIAL POLE OF DATE: real rotation axis → exact filé arc centre
 * (§9.3). Earth rotation follows precession → axis = 3rd row of precession matrix.
 */
export function axePoleDeDate(anneeEpoque: number): Vec3 {
  const [, , , , , , x, y, z] = matricePrecessionAnnee(anneeEpoque)
  return { x, y, z }
}

/**
 * Hour-angle frame → site horizontal frame: x north, y east, z zenith. Left-handed (azimuth
 * north→east); matrix stays orthogonal, inverse = transpose.
 */
export function matriceHorizon(latitudeDeg: number): Mat3 {
  const sin = Math.sin(latitudeDeg * DEG)
  const cos = Math.cos(latitudeDeg * DEG)
  return [-sin, 0, cos, 0, 1, 0, cos, 0, sin]
}

export interface CielInstantane {
  /** J2000 equatorial → site horizontal frame (x north, y east, z zenith). */
  readonly matrice: Mat3
  readonly tslH: Traced<number>
  /** §3.1 diagnostic output, uses PRD A-ROT rate. */
  readonly angleRotationDeg: Traced<number>
  readonly epoqueAnnee: number
  readonly precessionDeg: Traced<number>
  /** True when date outside series domain: moving bodies hidden. */
  readonly corpsMasques: boolean
  readonly cause?: string
}

/**
 * The frame's single matrix (§3.1): precession J2000 → epoch, Earth rotation by local sidereal
 * time, tilt to site latitude, in order.
 */
export function cielInstantane(site: Site, date: Date): CielInstantane {
  const tslH = tempsSideralLocal(date, site.longitudeDeg)
  const annee = epoqueAnnee(date)
  const anneesPrecession = Math.round(annee) - K('EPOQUE_J2000_ANNEE')

  // 24 sidereal h = exactly 1 turn: unit change, ≠ A-ROT (15.041 °/h SOLAR time, §3.2 readability).
  const rotationTerre = rotationZ(-tslH.value * DEG_PAR_HEURE)
  const matrice = multiplie(
    matriceHorizon(site.latitudeDeg),
    multiplie(rotationTerre, matricePrecessionAnnee(annee)),
  )

  const masques = !dansLeDomaineDesSeries(date)

  return {
    matrice,
    tslH,
    angleRotationDeg: trace({
      value: tslH.value * K('ROTATION_CIEL_DEG_H'),
      formula: 'ANGLE_ROTATION_CIEL',
      inputs: { tsl_h: tslH.value },
      constants: ['ROTATION_CIEL_DEG_H'],
    }),
    epoqueAnnee: annee,
    precessionDeg: trace({
      value: decalagePrecessionDeg(anneesPrecession),
      formula: 'PRECESSION',
      inputs: { n_annees: anneesPrecession },
      constants: ['PRECESSION_ARCSEC_AN'],
      note: 'Positions des étoiles corrigées pour la date affichée.',
    }),
    corpsMasques: masques,
    ...(masques
      ? {
          cause:
            `Année hors de ${K('ANNEE_MIN_SERIES')}–${K('ANNEE_MAX_SERIES')} : Soleil, Lune ` +
            'et planètes masqués.',
        }
      : {}),
  }
}

/** T-0336 — sky matrix at a WHOLE minute (minutes since Unix epoch): panels' scene-clock grain. */
export function matriceALaMinute(site: Site, minute: number): Mat3 {
  return cielInstantane(site, new Date(minute * MS_PAR_MINUTE)).matrice
}

// Ephemeris clock — moving bodies

/** Two samples bracketing displayed instant, slow-clock rate. */
export interface EtatEphemerides {
  readonly pasMs: number
  readonly t0Ms: number
  readonly p0: readonly PositionCorps[]
  readonly t1Ms: number
  readonly p1: readonly PositionCorps[]
}

function echantillonne(site: Site, dateMs: number): readonly PositionCorps[] {
  const date = new Date(dateMs)
  if (!dansLeDomaineDesSeries(date)) return []
  return CORPS_MOBILES.map((corps) => positionCorps(corps, date, site))
}

/**
 * Ephemeris clock step in DISPLAYED time. 10 Hz = real time (compute budget) → step stretches by
 * scroll factor. At ×3600, 0.1 s real = 6 min of sky; Moon (fastest, ≈ 0.55 °/h) moves 0.055° ≈
 * 1.8 px at 32 px/°: invisible.
 */
export function pasEphemeridesMs(
  facteurVitesse: number,
  freqHz: number = K('FREQ_EPHEMERIDES_HZ'),
): number {
  return (MS_PAR_S / freqHz) * Math.max(1, Math.abs(facteurVitesse))
}

/**
 * Advance slow clock until it brackets `dateMs`, reusing the sample in hand when it is the next
 * step. Recycling makes decoupling worthwhile: 60 Hz display / 10 Hz ephemerides → 5 frames in 6
 * evaluate no series.
 */
export function avanceEphemerides(
  precedent: EtatEphemerides | null,
  site: Site,
  dateMs: number,
  pasMs: number = pasEphemeridesMs(1),
): EtatEphemerides {
  const t0Ms = Math.floor(dateMs / pasMs) * pasMs
  const t1Ms = t0Ms + pasMs

  if (precedent !== null && precedent.pasMs === pasMs) {
    if (precedent.t0Ms === t0Ms) return precedent
    if (precedent.t1Ms === t0Ms) {
      return { pasMs, t0Ms, p0: precedent.p1, t1Ms, p1: echantillonne(site, t1Ms) }
    }
    if (precedent.t0Ms === t1Ms) {
      return { pasMs, t0Ms, p0: echantillonne(site, t0Ms), t1Ms, p1: precedent.p0 }
    }
  }
  return {
    pasMs,
    t0Ms,
    p0: echantillonne(site, t0Ms),
    t1Ms,
    p1: echantillonne(site, t1Ms),
  }
}

function interpoleAngle(a: number, b: number, f: number, tour: number): number {
  // RA wraps through zero: interpolate via shortest path.
  return ramene(a + ecartCourt(a, b, tour) * f, tour)
}

/**
 * Moving-body positions at displayed instant, interpolated between the two samples. Empty when
 * date outside series domain: bodies hidden, cause carried by `cielInstantane`.
 */
export function positionsInterpolees(
  etat: EtatEphemerides,
  dateMs: number,
): readonly PositionCorps[] {
  if (etat.p0.length === 0 || etat.p1.length === 0) return []
  const f = encadre((dateMs - etat.t0Ms) / (etat.t1Ms - etat.t0Ms), 0, 1)
  return etat.p0.map((a, i) => {
    const b = etat.p1[i] ?? a
    return {
      corps: a.corps,
      adH: interpoleAngle(a.adH, b.adH, f, HEURES_PAR_TOUR),
      decDeg: a.decDeg + (b.decDeg - a.decDeg) * f,
      azimutDeg: interpoleAngle(a.azimutDeg, b.azimutDeg, f, TOUR_DEG),
      hauteurDeg: a.hauteurDeg + (b.hauteurDeg - a.hauteurDeg) * f,
    }
  })
}

// Interpolation: no §10.2 trace (no screen shows factor f; a never-unfolded trace lies). Formula in
// Annexe B `INTERPOLATION_CORPS`; wire `trace()` when a screen shows it (T-0063).
