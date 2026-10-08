/**
 * §9.3, §8.1 — la Lune voile le filé, étoile par étoile (T-0400).
 *
 * Une séquence empilée en éclaircir garde, pour chaque pixel, la pose la plus claire : le fond
 * retenu est donc celui du moment où la Lune éclaire le plus. On le prend à sa plus grande
 * hauteur sur la séance — c'est là que son extinction est la plus faible. Allonger la séance
 * ne voile le ciel que si la Lune a le temps de monter : c'est ce qu'un filé réel montre.
 *
 * La gêne suit la séparation à la Lune, comme le halo du planétarium : B_lune de KS91
 * (`brillanceLuneNl`), rapporté au fond du site. Une étoile et la Lune tournent ensemble autour
 * du pôle, leur séparation ne bouge que du mouvement propre de la Lune — la prendre à un seul
 * instant suffit.
 *
 * Données seules dans `LuneFile` : elles traversent la frontière du worker de filé.
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
  /** Direction J2000 de la Lune au moment retenu. */
  readonly direction: Vec3
  /** Zénith du site au même moment, en J2000 : `verticale · v` est le sinus de la hauteur de v. */
  readonly verticale: Vec3
  readonly altitudeDeg: number
  readonly anglePhaseDeg: number
  /** Fond du site, en mag/arcsec² : celui dont le flux `eCielPxS` de la profondeur est tiré. */
  readonly sbSiteMag: number
}

/**
 * La Lune retenue pour la séance : la plus haute de son trajet. Couchée tout du long, aucune —
 * une Lune sous l'horizon ne gêne rien, quelle que soit sa phase (§8.1).
 */
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

/** Le facteur commun à toutes les étoiles : éclat de la Lune éteint, rapporté au fond du site. */
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

/** Fond du ciel dans la direction v, en multiple du fond du site : 1 + B_lune / B_site. */
export function rapportFondLune(lune: LuneFile, v: Vec3): number {
  return rapportAvecEclat(lune, eclatRelatif(lune), v.x, v.y, v.z)
}

/**
 * Ce que la passe prépare une fois par image pour évaluer la profondeur sous la Lune.
 *
 * Le calcul exact coûtait 15 ms pour 45 000 étoiles — lectures du registre et puissances à
 * chaque étoile. Ici, la diffusion se lit par séparation et l'extinction par sinus de hauteur,
 * chacune dans une table de `CASES_TABLE_PROFONDEUR_TRACE` cases : deux grandeurs lisses, dont
 * l'écart au calcul exact se teste. La pose par pixel, elle, reste exacte — elle varie vite près
 * du pôle, où une table en sinus de déclinaison se tromperait d'un tiers de magnitude.
 */
export interface FondLune {
  readonly lune: LuneFile
  /** eclat × diffusion KS, par case de séparation sur [0°, 180°]. */
  readonly diffusion: Float64Array
  /** 1 − extinction de la colonne d'air, par case de sinus de hauteur sur [0, 1]. */
  readonly colonne: Float64Array
  /** Pose unitaire, et traversée d'un pixel à l'équateur céleste : `poseParPixelS` hissée. */
  readonly tPoseS: number
  readonly traverseeEquateurS: number | null
  /** Facteurs de `magnitudeLimiteNue` hissés hors de la boucle. */
  readonly demi: number
  readonly snr2nPx: number
  readonly fondFixe: number
  readonly fondCielParRapport: number
  readonly zpMoinsConversion: number
  /** Pixels sur lesquels s'étale l'image d'une étoile : le signal d'une trace par pixel. */
  readonly nPx: number
  /** ln(BASE_MAGNITUDE) / POGSON : un écart de magnitude devient un rapport de flux par `exp`. */
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
    // Avec suivi, l'étoile ne quitte pas son pixel : il reçoit toute la pose.
    traverseeEquateurS: entree.suiviActif ? null : entree.echApx / K('ROTATION_CIEL_DEG_H'),
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
 * Profondeur atteinte par une trace dans la direction v, fond lunaire compris : le signal sur
 * la traversée d'un pixel, le fond — éclairci par la Lune — sur la pose unitaire. C'est
 * `magnitudeLimiteNue`, ses facteurs constants hissés dans `fondLune`.
 */
export function profondeurSousLune(fond: FondLune, v: Vec3): number {
  return profondeurSousLuneXYZ(fond, v.x, v.y, v.z)
}

/** La même, sans vecteur alloué : c'est la forme qu'appelle la passe, étoile par étoile. */
export function profondeurSousLuneXYZ(fond: FondLune, x: number, y: number, z: number): number {
  return profondeurLocale(fond, rapportLocal(fond, x, y, z), poseLocaleS(fond, z))
}

/**
 * T-0400 — opacité d'une trace sous la Lune : sa marge de détection, et son CONTRASTE au fond.
 *
 * Une trace détectable peut encore se noyer : l'étirement d'une image place le noir sur le fond,
 * et un fond que la Lune multiplie par r écrase d'autant ce qui le dépasse peu. Rapporté au fond
 * du site — celui que montre la scène sans Lune —, le facteur est (S + B) / (S + r·B), S le
 * signal de l'étoile par pixel et B le fond du site sur la pose unitaire : 1 pour une étoile qui
 * domine le fond, 1/r pour une trace faible, 1 partout sans Lune. C'est l'effet phare.
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
  // `opaciteEtoile` et `rapportDeFlux`, leurs constantes hissées dans `fondLune`.
  const snr = fond.snrDetection * Math.exp(-fond.lnFluxParMag * (magV - profondeurLocale(fond, rapport, poseS)))
  const detection = Math.min(1, Math.sqrt(snr / fond.snrSaturation))
  if (rapport === 1) return detection
  const signal = (Math.exp(-fond.lnFluxParMag * (magV - fond.zpMoinsConversion)) * poseS) / fond.nPx
  const fondSite = fond.fondCielParRapport
  return (detection * (signal + fondSite)) / (signal + rapport * fondSite)
}

/** Fond du ciel en (x, y, z), en multiple de celui du site. */
function rapportLocal(fond: FondLune, x: number, y: number, z: number): number {
  const { verticale: h, direction: d } = fond.lune
  const sinH = h.x * x + h.y * y + h.z * z
  if (sinH <= 0) return 1
  const cosSep = Math.min(1, Math.max(-1, d.x * x + d.y * y + d.z * z))
  const separationDeg = (Math.acos(cosSep) * DEMI_TOUR_DEG) / Math.PI
  return 1 + lit(fond.diffusion, separationDeg, 0, DEMI_TOUR_DEG) * lit(fond.colonne, sinH, 0, 1)
}

/** `poseParPixelS`, son cos δ lu dans z — la composante polaire — sans arc sinus ni registre. */
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
