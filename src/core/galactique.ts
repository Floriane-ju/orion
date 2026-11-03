/**
 * §9.2 — what makes a preview more than a map. Computed here:
 *   1. Galactic latitude → generative-background star density; without it no Voie lactée band,
 *      preview useless for main grand champ use.
 *   2. Voie lactée contrast modulated by site fond de ciel: what THE USER will see.
 *   3. Depth reached by the capture → displayed star count. PRD: `[À CALCULER]`; derived from
 *      point zéro système, only path making it depend on pose, aperture, sky.
 */

import { K } from '../registry/constants.ts'
import {
  angleDeSinDeg,
  applique,
  type Mat3,
  multiplie,
  rotationY,
  rotationZ,
  transpose,
  type Vec3,
  versVecteur,
} from './mat3.ts'
import { poseParPixelS } from './file-etoiles.ts'
import { trace, type Traced } from './traced.ts'
import { rapportDeFlux } from './exposure.ts'
import { DEMI_TOUR_DEG, encadre, QUART_TOUR_DEG as QUART_TOUR, UM_PAR_MM } from './unites.ts'

/**
 * J2000 → galactic rotation, 3 steps in order: galactic pole onto origin meridian, tip onto z,
 * then longitude fixed on galactic centre (read from celestial pole galactic longitude).
 */
const MATRICE_GALACTIQUE: Mat3 = multiplie(
  rotationZ(K('LONGITUDE_GALACTIQUE_POLE_CELESTE_DEG') - DEMI_TOUR_DEG),
  multiplie(
    rotationY(QUART_TOUR - K('POLE_GALACTIQUE_DEC_DEG')),
    rotationZ(-K('POLE_GALACTIQUE_AD_DEG')),
  ),
)

const MATRICE_DEPUIS_GALACTIQUE = transpose(MATRICE_GALACTIQUE)

/** Galactic latitude of a J2000 direction, degrees. */
export function latitudeGalactiqueDeg(v: Vec3): number {
  const g = applique(MATRICE_GALACTIQUE, v)
  return angleDeSinDeg(g.z)
}

/** J2000 direction of a galactic position; backs the band drawing. */
export function depuisGalactique(lDeg: number, bDeg: number): Vec3 {
  return applique(MATRICE_DEPUIS_GALACTIQUE, versVecteur(lDeg, bDeg))
}

/**
 * §9.2 — relative generative-seed density: 1 in galactic plane, falling outside.
 * No trace: evaluated per draw, a trace each = useless allocation.
 */
export function densite(
  bDeg: number,
  echelleDeg: number = K('ECHELLE_LATITUDE_GALACTIQUE_DEG'),
): number {
  return Math.exp(-Math.abs(bDeg) / echelleDeg)
}

/**
 * §9.2 — magnitude below which fraction `u` of generative seed is drawn: Euclidean count
 * N(<m) ∝ 10^(PENTE × m) between cataloged threshold and seed bound.
 * Seed draw (layer 2) and filé cap (§9.3, T-0118) must read this SAME law, else cap stops
 * bounding the draw.
 */
export function magnitudeSemis(u: number): number {
  const seuil = K('SEUIL_MAG_ETOILES_REELLES')
  const pente = K('PENTE_COMPTAGE_ETOILES')
  const etendue = K('SEMIS_MAG_MAX') - seuil
  // Magnitude-scale base: count law and brightness scale share one base.
  return seuil + Math.log10(1 + u * (K('BASE_MAGNITUDE') ** (pente * etendue) - 1)) / pente
}

/** §9.2 — corner darkening in stops, radius relative to frame corner. */
export function vignettageDiaph(rayonRelatif: number): Traced<number> {
  const borne = encadre(rayonRelatif, 0, 1)
  return trace({
    value: K('VIGNETTAGE_COINS_DIAPH') * borne * borne,
    formula: 'VIGNETTAGE',
    inputs: { rayon_relatif: borne },
    constants: ['VIGNETTAGE_COINS_DIAPH'],
  })
}

/**
 * §9.2 — star render opacity. SNR from magnitude and depth reached: at threshold = detection SNR;
 * 2 mag brighter = 10x. Display stretches by square root like any astro image (linear crushes the
 * sky into the first 1 % of dynamic range).
 * Explains why a 2 h filé shows only bright stars, stacked fixed poses of same duration thousands.
 */
export function opaciteEtoile(magV: number, magLimite: number): number {
  const snr = K('SNR_DETECTION_PREVISU') * rapportDeFlux(magV - magLimite)
  return Math.min(1, Math.sqrt(snr / K('SNR_RENDU_SATURATION')))
}

export interface EntreeTableProfondeur {
  /** Its `tPoseS` = séquence pose unitaire: what a pixel sees (T-0400). */
  readonly profondeur: EntreeProfondeur
  /** Star spot extent, arcsec (`tacheNpfArcsec`). */
  readonly tacheArcsec: number
  /** Suivi active: pixel gets whole pose, declination irrelevant. */
  readonly suiviActif: boolean
}

/**
 * §9.3 — T-0119: depth reached PER PIXEL, tabulated by sin(declination).
 * Pose per pixel depends only on declination (`poseParPixelS`) → so does depth. Per-star recompute
 * was the pass's top cost (134 ms / 200 000 stars vs 2 ms via table). Index = sin(dec) = polar
 * component, already read by selection → also drops an asin per star.
 * Suivi active: flat table, pixel gets whole pose wherever instrument points.
 */
export function tableProfondeurParPixel(entree: EntreeTableProfondeur): Float64Array {
  const cases = K('CASES_TABLE_PROFONDEUR_TRACE')
  const table = new Float64Array(cases)
  for (let i = 0; i < cases; i++) {
    const z = -1 + (2 * (i + 1 / 2)) / cases
    const decDeg = (Math.asin(z) * DEMI_TOUR_DEG) / Math.PI
    table[i] = magnitudeLimitePrevisu({
      ...entree.profondeur,
      tPoseS: poseParPixel(entree, decDeg),
      tFondS: entree.profondeur.tPoseS,
    }).value
  }
  return table
}

/**
 * T-0400 — pose seen by a pixel within ONE pose unitaire. Filé = lighten-stacked séquence: image
 * keeps max of poses, signal not summed. Star near pole staying on its pixel gets one pose
 * unitaire, not eight hours. Background accumulates over whole pose unitaire, star passed or not.
 */
export function poseParPixel(entree: EntreeTableProfondeur, decDeg: number): number {
  const tPoseS = entree.profondeur.tPoseS
  return entree.suiviActif ? tPoseS : poseParPixelS(tPoseS, entree.tacheArcsec, decDeg)
}

/** Table lookup: `z` = polar component of direction, in [−1, 1]. */
export function profondeurPourZ(table: Float64Array, z: number): number {
  const indice = ((z + 1) * table.length) / 2
  return table[encadre(indice | 0, 0, table.length - 1)]!
}

export interface EntreeProfondeur {
  /** Seconds the source lights the pixel. */
  readonly tPoseS: number
  /**
   * T-0400 — seconds the BACKGROUND accumulates in the pixel. Absent: source's (point star).
   * A trace stays on a pixel for a fraction of the pose; sky, the whole pose.
   */
  readonly tFondS?: number
  /** Pupil diameter, mm: sets point-source flux. */
  readonly dMm: number
  readonly zpSys: number
  /** fond de ciel flux, e⁻/s/px (§7.1). */
  readonly eCielPxS: number
  readonly readNoiseE: number
  readonly zpEstime?: boolean
}

/**
 * Depth reached by a pose unitaire, magnitude. Point source of mag m = same flux as 1 arcsec² of
 * brightness m: point zéro système suffices; pupil diameter falls out of algebra, not assumed.
 * Bare-number form for filé pass evaluating star by star under the Moon (T-0400): no trace
 * object, no per-star input literal. `magnitudeLimitePrevisu` = only other caller → formula lives
 * only here.
 */
export function magnitudeLimiteNue(
  profondeur: EntreeProfondeur,
  tSourceS: number,
  tFondS: number,
  eCielPxS: number,
): number {
  const snr = K('SNR_DETECTION_PREVISU')
  const bruit = K('PIXELS_PSF_ETOILE') * (eCielPxS * tFondS + profondeur.readNoiseE ** 2)
  // Positive root of x² − S² x − S² × bruit = 0, x = collected electrons.
  const demi = snr ** 2 / 2
  const electrons = demi + Math.sqrt(demi ** 2 + snr ** 2 * bruit)
  const fluxSeuil = electrons / tSourceS
  const conversion = K('RADIAN_EN_ARCSEC') / (UM_PAR_MM * profondeur.dMm)
  return profondeur.zpSys - K('POGSON') * Math.log10(fluxSeuil * conversion ** 2)
}

export function magnitudeLimitePrevisu(entree: EntreeProfondeur): Traced<number> {
  return trace({
    value: magnitudeLimiteNue(entree, entree.tPoseS, entree.tFondS ?? entree.tPoseS, entree.eCielPxS),
    formula: 'MAGNITUDE_LIMITE_PREVISU',
    inputs: {
      t_pose_s: entree.tPoseS,
      t_fond_s: entree.tFondS ?? entree.tPoseS,
      d_mm: entree.dMm,
      zp_sys: entree.zpSys,
      e_ciel_px_s: entree.eCielPxS,
      read_noise_e: entree.readNoiseE,
    },
    constants: ['SNR_DETECTION_PREVISU', 'PIXELS_PSF_ETOILE', 'POGSON', 'RADIAN_EN_ARCSEC'],
    flags: entree.zpEstime === true ? ['ESTIME'] : [],
    note: 'Pour une seule photo, avant empilement.',
  })
}
