/**
 * §9.3, §8.1 — Moon veils the filé star by star (T-0400).
 * Lighten-stack keeps brightest pose per pixel → sky background = moment of max Moon light =
 * Moon at max altitude over séance (lowest extinction). Longer séance veils more only if Moon
 * has time to rise.
 * Nuisance follows Moon separation like the planétarium halo: KS91 B_lune (`brillanceLuneNl`) /
 * site background. Star and Moon turn together around pole → separation moves only by Moon
 * proper motion → one instant suffices.
 * `LuneFile` = plain data, crosses filé worker boundary.
 */
import { attenuationBrute } from './exposure.ts'
import { cielInstantane } from './horloges.ts'
import { applique, DEG, transpose, versVecteur, type Vec3 } from './mat3.ts'
import { diffusionKS, illuminanceLune, masseAirKS, nanolamberts } from './moon.ts'
import type { PositionCorps, Site } from './ephem.ts'
import type { EntreeTableProfondeur } from './galactique.ts'
import { K } from '../registry/constants.ts'
import { DEMI_TOUR_DEG, encadre, UM_PAR_MM } from './unites.ts'

export interface LuneFile {
  /** Moon J2000 direction, retained moment. */
  readonly direction: Vec3
  /** Site zenith J2000, same moment: `verticale · v` = sin(alt of v). */
  readonly verticale: Vec3
  readonly altitudeDeg: number
  readonly anglePhaseDeg: number
  /** Site background, mag/arcsec²; source of `eCielPxS` flux. */
  readonly sbSiteMag: number
}

/** Moon retained for séance: highest of its trajet; `null` if set throughout (§8.1). */
export function luneFile(
  site: Site,
  instantsMs: readonly number[],
  trajet: readonly PositionCorps[],
  anglePhaseDeg: number,
  sbSiteMag: number,
): LuneFile | null {
  let i = -1
  trajet.forEach((p, j) => {
    if (p.hauteurDeg > 0 && (i < 0 || p.hauteurDeg > trajet[i]!.hauteurDeg)) i = j
  })
  const instant = instantsMs[i]
  if (i < 0 || instant === undefined) return null
  const p = trajet[i]!
  const versJ2000 = transpose(cielInstantane(site, new Date(instant)).matrice)
  return {
    direction: applique(versJ2000, versVecteur(p.azimutDeg, p.hauteurDeg)),
    verticale: applique(versJ2000, { x: 0, y: 0, z: 1 }),
    altitudeDeg: p.hauteurDeg,
    anglePhaseDeg,
    sbSiteMag,
  }
}

/** Factor common to all stars: extinguished Moon light / site background. */
function eclatRelatif(lune: LuneFile): number {
  return (
    (illuminanceLune(lune.anglePhaseDeg) * attenuationBrute(masseAirKS(lune.altitudeDeg))) /
    nanolamberts(lune.sbSiteMag)
  )
}

function rapportAvecEclat(lune: LuneFile, eclat: number, x: number, y: number, z: number): number {
  const v = lune.verticale
  const sinH = v.x * x + v.y * y + v.z * z
  if (sinH <= 0) return 1
  const d = lune.direction
  const cosSep = Math.min(1, Math.max(-1, d.x * x + d.y * y + d.z * z))
  const separationDeg = (Math.acos(cosSep) * DEMI_TOUR_DEG) / Math.PI
  const hauteurDeg = Math.asin(Math.min(1, sinH)) / DEG
  return 1 + eclat * diffusionKS(separationDeg) * (1 - attenuationBrute(masseAirKS(hauteurDeg)))
}

/** Sky background toward v, × site background: 1 + B_lune / B_site. */
export function rapportFondLune(lune: LuneFile, v: Vec3): number {
  return rapportAvecEclat(lune, eclatRelatif(lune), v.x, v.y, v.z)
}

/**
 * Prepared once per frame for profondeur under the Moon.
 * Exact calc = 15 ms / 45 000 stars (registry reads + powers per star). Here diffusion tabulated
 * by separation, extinction by sin(altitude), `CASES_TABLE_PROFONDEUR_TRACE` cells each: smooth,
 * error vs exact tested. Pose par pixel stays exact: varies fast near pole, sin(dec) table off
 * by 1/3 mag.
 */
export interface FondLune {
  readonly lune: LuneFile
  /** eclat × KS diffusion per separation cell over [0°, 180°]. */
  readonly diffusion: Float64Array
  /** 1 − air-column extinction per sin(altitude) cell over [0, 1]. */
  readonly colonne: Float64Array
  /** Pose unitaire + spot crossing time at celestial equator: hoisted `poseParPixelS`. */
  readonly tPoseS: number
  readonly traverseeEquateurS: number | null
  /** Hoisted `magnitudeLimiteNue` factors. */
  readonly demi: number
  readonly snr2nPx: number
  readonly fondFixe: number
  readonly fondCielParRapport: number
  readonly zpMoinsConversion: number
  /** Pixels spanned by a star image: per-pixel trace signal. */
  readonly nPx: number
  /** ln(BASE_MAGNITUDE) / POGSON: magnitude gap → flux ratio via `exp`. */
  readonly lnFluxParMag: number
  readonly snrDetection: number
  readonly snrSaturation: number
  readonly pogson: number
}

function tabule(cases: number, min: number, max: number, f: (u: number) => number): Float64Array {
  const table = new Float64Array(cases)
  for (let i = 0; i < cases; i++) table[i] = f(min + ((max - min) * (i + 1 / 2)) / cases)
  return table
}

function lit(table: Float64Array, u: number, min: number, max: number): number {
  const i = ((u - min) * table.length) / (max - min)
  return table[encadre(i | 0, 0, table.length - 1)]!
}

export function fondLune(lune: LuneFile, entree: EntreeTableProfondeur): FondLune {
  const cases = K('CASES_TABLE_PROFONDEUR_TRACE')
  const eclat = eclatRelatif(lune)
  const { profondeur } = entree
  const snr = K('SNR_DETECTION_PREVISU')
  const nPx = K('PIXELS_PSF_ETOILE')
  const conversion = K('RADIAN_EN_ARCSEC') / (UM_PAR_MM * profondeur.dMm)
  return {
    lune,
    diffusion: tabule(cases, 0, DEMI_TOUR_DEG, (sep) => eclat * diffusionKS(sep)),
    colonne: tabule(cases, 0, 1, (s) => 1 - attenuationBrute(masseAirKS(Math.asin(s) / DEG))),
    tPoseS: profondeur.tPoseS,
    // With suivi star stays on its pixel: whole pose.
    traverseeEquateurS: entree.suiviActif ? null : entree.tacheArcsec / K('ROTATION_CIEL_DEG_H'),
    demi: snr ** 2 / 2,
    snr2nPx: snr ** 2 * nPx,
    fondFixe: profondeur.readNoiseE ** 2,
    fondCielParRapport: profondeur.eCielPxS * profondeur.tPoseS,
    zpMoinsConversion: profondeur.zpSys - K('POGSON') * Math.log10(conversion ** 2),
    nPx,
    lnFluxParMag: Math.log(K('BASE_MAGNITUDE')) / K('POGSON'),
    snrDetection: snr,
    snrSaturation: K('SNR_RENDU_SATURATION'),
    pogson: K('POGSON'),
  }
}

/**
 * Trace profondeur toward v, Moon background incl.: signal over one pixel crossing vs
 * Moon-brightened background over pose unitaire. = `magnitudeLimiteNue`; constants hoisted in
 * `fondLune`.
 */
export function profondeurSousLune(fond: FondLune, v: Vec3): number {
  return profondeurSousLuneXYZ(fond, v.x, v.y, v.z)
}

/** Same, no vector allocated: the per-star pass form. */
export function profondeurSousLuneXYZ(fond: FondLune, x: number, y: number, z: number): number {
  return profondeurLocale(fond, rapportLocal(fond, x, y, z), poseLocaleS(fond, z))
}

/**
 * T-0400 — trace opacity under the Moon: detection margin + background CONTRAST.
 * Detectable trace can still drown: stretch puts black on background; background × r flattens
 * what barely exceeds it. Relative to site background (Moonless scene): (S + B) / (S + r·B),
 * S = star signal/px, B = site background over pose unitaire: 1 if star dominates, 1/r for faint
 * trace, 1 without Moon. Headline effect.
 */
export function opaciteSousLune(fond: FondLune, magV: number, v: Vec3): number {
  return opaciteSousLuneXYZ(fond, magV, v.x, v.y, v.z)
}

export function opaciteSousLuneXYZ(
  fond: FondLune,
  magV: number,
  x: number,
  y: number,
  z: number,
): number {
  const rapport = rapportLocal(fond, x, y, z)
  const poseS = poseLocaleS(fond, z)
  // `opaciteEtoile`, `rapportDeFlux`; constants hoisted in `fondLune`.
  const snr = fond.snrDetection * Math.exp(-fond.lnFluxParMag * (magV - profondeurLocale(fond, rapport, poseS)))
  const detection = Math.min(1, Math.sqrt(snr / fond.snrSaturation))
  if (rapport === 1) return detection
  const signal = (Math.exp(-fond.lnFluxParMag * (magV - fond.zpMoinsConversion)) * poseS) / fond.nPx
  const fondSite = fond.fondCielParRapport
  return (detection * (signal + fondSite)) / (signal + rapport * fondSite)
}

/** Sky background at (x, y, z), × site's. */
function rapportLocal(fond: FondLune, x: number, y: number, z: number): number {
  const { verticale: h, direction: d } = fond.lune
  const sinH = h.x * x + h.y * y + h.z * z
  if (sinH <= 0) return 1
  const cosSep = Math.min(1, Math.max(-1, d.x * x + d.y * y + d.z * z))
  const separationDeg = (Math.acos(cosSep) * DEMI_TOUR_DEG) / Math.PI
  return 1 + lit(fond.diffusion, separationDeg, 0, DEMI_TOUR_DEG) * lit(fond.colonne, sinH, 0, 1)
}

/** `poseParPixelS` with cos δ read from z (polar component): no asin, no registry. */
function poseLocaleS(fond: FondLune, z: number): number {
  return fond.traverseeEquateurS === null
    ? fond.tPoseS
    : Math.min(fond.tPoseS, fond.traverseeEquateurS / Math.max(Math.sqrt(1 - z * z), Number.EPSILON))
}

function profondeurLocale(fond: FondLune, rapport: number, poseS: number): number {
  const bruit = fond.fondCielParRapport * rapport + fond.fondFixe
  const electrons = fond.demi + Math.sqrt(fond.demi ** 2 + fond.snr2nPx * bruit)
  return fond.zpMoinsConversion - fond.pogson * Math.log10(electrons / poseS)
}
