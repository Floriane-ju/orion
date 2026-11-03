/** §4.1 — site-dependent consequences at site validation: austral sky out of reach. */

import { K } from '../registry/constants.ts'
import { DOMAINES, SaisieRefuseeError, valide } from '../registry/domains.ts'
import type { Flag, Traced } from './traced.ts'
import { trace } from './traced.ts'
import { DEG } from './mat3.ts'
import { QUART_TOUR_DEG as ANGLE_DROIT_DEG, ramene, TOUR_DEG } from './unites.ts'

export interface SeuilsSite {
  /** Dec above which target is circumpolar. */
  readonly decCircumpolaire: Traced<number>
  /** Dec below which target never reaches imaging height threshold. */
  readonly decMinImagerie: Traced<number>
  /** Dec below which target never reaches visual height threshold. */
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

/** One obstruction value per azimuth degree, 0..359 (§4.1). */
export const NB_AZIMUTS = 360

export interface MasqueHorizon {
  /** Obstruction deg, by integer azimuth. */
  readonly altitudesDeg: readonly number[]
  /** True = flat fallback (no relief data). */
  readonly estHypothese: boolean
  readonly flags?: readonly Flag[]
  readonly note?: string
  /**
   * T-0395 — terrain contour polylines `[az, h, az, h, …]`, NaN pair (T-0397) as separator.
   * Drawing only; mask stays `altitudesDeg`.
   */
  readonly courbesDeg?: Float32Array
  /** T-0438 — relief silhouettes, same format; drawing only. */
  readonly silhouettesDeg?: Float32Array
  /**
   * T-0438 — ridge at `PAS_AZIMUT_CRETE_DEG`, drawing only (1° drew distant relief as triangles,
   * contours overflowed ground). Créneaux stay on `altitudesDeg`.
   */
  readonly creteDeg?: Float32Array
}

/**
 * Fallback without relief data: flat 0° horizon, [HYP] (§4.1).
 * Announced: a flat horizon at the foot of the Alps would skew recommendations.
 */
export function masquePlat(cause?: string): MasqueHorizon {
  const invitation = 'Horizon supposé plat.'
  return Object.freeze({
    altitudesDeg: Object.freeze(Array.from({ length: NB_AZIMUTS }, () => 0)),
    estHypothese: true,
    flags: Object.freeze(['HYP' as const]),
    note: cause === undefined ? invitation : `${cause} ${invitation}`,
  })
}

/** Mask from a real altitude profile: not [HYP] (§4.1). */
export function masqueDepuisRelief(altitudesDeg: readonly number[], note?: string): MasqueHorizon {
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
    ...(note === undefined ? {} : { note }),
  })
}

/** Hand-entered azimuth → height pair (§4.1). */
export interface PointMasque {
  readonly azimutDeg: number
  readonly altitudeDeg: number
}

/**
 * Hand-edited mask (§4.1 « édition manuelle par-dessus »): few ridges entered, other azimuths
 * interpolate linearly, circle closes last→first. Same azimuth twice → keep higher (relief hides).
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
    // Single reading: span = full circle.
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


/**
 * Obstruction at any azimuth (wraps).
 * T-0359 — linear between integer degrees, not nearest (360-step staircase); never lowers a peak.
 */
export function obstructionDeg(masque: MasqueHorizon, azimutDeg: number): number {
  const a = ramene(azimutDeg, NB_AZIMUTS)
  const i = Math.floor(a)
  const avant = masque.altitudesDeg[i % NB_AZIMUTS] ?? 0
  const apres = masque.altitudesDeg[(i + 1) % NB_AZIMUTS] ?? 0
  return avant + (apres - avant) * (a - i)
}

/** T-0438 — DRAWN obstruction: fine ridge if any, else mask. */
export function obstructionDessinDeg(masque: MasqueHorizon, azimutDeg: number): number {
  const crete = masque.creteDeg
  if (crete === undefined || crete.length === 0) return obstructionDeg(masque, azimutDeg)
  const n = crete.length
  const a = ramene(azimutDeg, TOUR_DEG) * (n / TOUR_DEG)
  const i = Math.floor(a)
  const avant = crete[i % n]!
  const apres = crete[(i + 1) % n]!
  return avant + (apres - avant) * (a - i)
}

/** Culmination height from this site. */
export function altitudeCulmination(latitudeDeg: number, decDeg: number): Traced<number> {
  return trace({
    value: ANGLE_DROIT_DEG - Math.abs(latitudeDeg - decDeg),
    formula: 'ALTITUDE_CULMINATION',
    inputs: { latitude_deg: latitudeDeg, dec_deg: decDeg },
  })
}

/**
 * Latitude below which a declination reaches the height threshold.
 * Reached iff |latitude − δ| < 90° − seuil; only the upper bound matters to northern observers;
 * §8.2, §3.7 announce it when a southern target stays out of reach.
 */
export function latitudeAccessibleDeg(decDeg: number, seuilHauteurDeg: number): number {
  return decDeg + (ANGLE_DROIT_DEG - seuilHauteurDeg)
}

/** Untraced masse d'air for per-sample use over a créneau: traced per minute adds only cost. */
export function masseAirBrute(hauteurDeg: number): number {
  return 1 / Math.sin(hauteurDeg * DEG)
}

/**
 * Masse d'air. Formula invalid below ~15° height.
 * `null` input = evaluation instant outside series domain (no height): says so, not zenith (§7.6).
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
