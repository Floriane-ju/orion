/**
 * §9.2 — Ce qui distingue une prévisualisation d'une carte.
 *
 * Trois choses sont calculées ici, et aucune n'est décorative :
 *
 *   1. LA LATITUDE GALACTIQUE, parce que la densité d'étoiles du fond génératif en dépend.
 *      Sans cette modulation, la bande de la Voie lactée n'apparaît pas et la prévisualisation
 *      devient inutile pour le cas d'usage principal du grand champ.
 *   2. LE CONTRASTE DE LA VOIE LACTÉE, modulé par le fond de ciel du site : l'application
 *      montre ce que L'UTILISATEUR verra, pas une carte de référence idéale.
 *   3. LA PROFONDEUR RÉELLEMENT ATTEINTE par la capture, qui pilote le nombre d'étoiles
 *      affichées. Le PRD la marque `[À CALCULER]` : elle est dérivée ici du point zéro
 *      système, seule voie qui la fasse dépendre de la pose, de l'ouverture et du ciel.
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
import { DEMI_TOUR_DEG, encadre } from './unites.ts'

const QUART_TOUR = 90
const UM_PAR_MM = 1000

/**
 * Rotation J2000 → galactique. Trois rotations, dans cet ordre : amener le pôle galactique
 * sur le méridien origine, le basculer sur l'axe z, puis caler la longitude sur le centre
 * galactique — ce dernier calage se lit sur la longitude galactique du pôle céleste.
 */
const MATRICE_GALACTIQUE: Mat3 = multiplie(
  rotationZ(K('LONGITUDE_GALACTIQUE_POLE_CELESTE_DEG') - DEMI_TOUR_DEG),
  multiplie(
    rotationY(QUART_TOUR - K('POLE_GALACTIQUE_DEC_DEG')),
    rotationZ(-K('POLE_GALACTIQUE_AD_DEG')),
  ),
)

const MATRICE_DEPUIS_GALACTIQUE = transpose(MATRICE_GALACTIQUE)

/** Latitude galactique d'une direction J2000, en degrés. */
export function latitudeGalactiqueDeg(v: Vec3): number {
  const g = applique(MATRICE_GALACTIQUE, v)
  return angleDeSinDeg(g.z)
}

/** Direction J2000 d'une position galactique — support du tracé de la bande. */
export function depuisGalactique(lDeg: number, bDeg: number): Vec3 {
  return applique(MATRICE_DEPUIS_GALACTIQUE, versVecteur(lDeg, bDeg))
}

/**
 * §9.2 — densité relative du semis génératif : 1 dans le plan galactique, décroissante hors.
 * Sans trace : le semis l'évalue à chaque tirage, et une trace par tirage allouerait pour rien.
 */
export function densite(
  bDeg: number,
  echelleDeg: number = K('ECHELLE_LATITUDE_GALACTIQUE_DEG'),
): number {
  return Math.exp(-Math.abs(bDeg) / echelleDeg)
}

/** La même densité, tracée jusqu'à sa formule. */
export function densiteRelative(bDeg: number): Traced<number> {
  return trace({
    value: densite(bDeg),
    formula: 'DENSITE_GALACTIQUE',
    inputs: { b_deg: bDeg },
    constants: ['ECHELLE_LATITUDE_GALACTIQUE_DEG'],
  })
}

/**
 * §9.2 — magnitude sous laquelle la fraction `u` du semis génératif est tirée, selon le
 * comptage euclidien N(<m) ∝ 10^(PENTE × m) entre le seuil catalographié et la borne du semis.
 *
 * Le tirage du semis (couche 2) et le plafond du filé (§9.3, T-0118) lisent la MÊME loi : deux
 * écritures dériveraient l'une de l'autre, et le plafond ne bornerait plus ce que le tirage
 * produit.
 */
export function magnitudeSemis(u: number): number {
  const seuil = K('SEUIL_MAG_ETOILES_REELLES')
  const pente = K('PENTE_COMPTAGE_ETOILES')
  const etendue = K('SEMIS_MAG_MAX') - seuil
  // La base est celle de l'échelle des magnitudes : la loi de comptage et l'échelle des
  // brillances ne peuvent pas reposer sur deux bases différentes.
  return seuil + Math.log10(1 + u * (K('BASE_MAGNITUDE') ** (pente * etendue) - 1)) / pente
}

/** §9.2 — assombrissement des coins, en diaphragmes, pour un rayon relatif au coin du cadre. */
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
 * §9.2 — opacité de rendu d'une étoile.
 *
 * Le rapport signal sur bruit de l'étoile se déduit de sa magnitude et de la profondeur
 * atteinte : au seuil, il vaut celui de la détection ; deux magnitudes plus brillante, dix
 * fois plus. L'affichage l'étire ensuite en racine carrée, comme toute image astronomique —
 * une échelle linéaire écraserait tout le ciel dans le premier pour cent de la dynamique.
 *
 * C'est ce qui fait qu'un filé de deux heures ne montre que les étoiles brillantes, alors
 * que la même durée en poses fixes empilées en montrerait des milliers.
 */
export function opaciteEtoile(magV: number, magLimite: number): number {
  const snr = K('SNR_DETECTION_PREVISU') * K('BASE_MAGNITUDE') ** (-(magV - magLimite) / K('POGSON'))
  return Math.min(1, Math.sqrt(snr / K('SNR_RENDU_SATURATION')))
}

export interface EntreeTableProfondeur {
  readonly profondeur: EntreeProfondeur
  /** Durée d'accumulation, en secondes. */
  readonly dureeS: number
  /** Échantillonnage du capteur, en secondes d'arc par pixel. */
  readonly echApx: number
  /** Suivi actif : le pixel reçoit toute la pose, la déclinaison n'y change rien. */
  readonly suiviActif: boolean
}

/**
 * §9.3 — T-0119 : profondeur atteinte PAR PIXEL, tabulée par sinus de déclinaison.
 *
 * La pose vue par un pixel ne dépend que de la déclinaison (`poseParPixelS`), donc la profondeur
 * atteinte aussi. La recalculer par étoile était le premier poste de la passe — 134 ms pour deux
 * cent mille étoiles, contre 2 ms par lecture de table. Et l'index est le SINUS de la déclinaison,
 * pas la déclinaison : c'est la composante polaire de la direction, déjà lue par la sélection, ce
 * qui retire aussi un arc sinus par étoile.
 *
 * Table plate quand le suivi est actif : le pixel reçoit toute la pose, où que pointe l'instrument.
 */
export function tableProfondeurParPixel(entree: EntreeTableProfondeur): Float64Array {
  const cases = K('CASES_TABLE_PROFONDEUR_TRACE')
  const table = new Float64Array(cases)
  for (let i = 0; i < cases; i++) {
    const z = -1 + (2 * (i + 1 / 2)) / cases
    const decDeg = (Math.asin(z) * DEMI_TOUR_DEG) / Math.PI
    table[i] = magnitudeLimitePrevisu({
      ...entree.profondeur,
      tPoseS: entree.suiviActif
        ? entree.dureeS
        : poseParPixelS(entree.dureeS, entree.echApx, decDeg),
    }).value
  }
  return table
}

/** Lecture de la table : `z` est la composante polaire de la direction, dans [−1, 1]. */
export function profondeurPourZ(table: Float64Array, z: number): number {
  const indice = ((z + 1) * table.length) / 2
  return table[encadre(indice | 0, 0, table.length - 1)]!
}

export interface EntreeProfondeur {
  readonly tPoseS: number
  /** Diamètre de pupille, en millimètres : c'est lui qui fixe le flux d'une source ponctuelle. */
  readonly dMm: number
  readonly zpSys: number
  /** Flux du fond de ciel, e⁻/s/px (§7.1). */
  readonly eCielPxS: number
  readonly readNoiseE: number
  readonly zpEstime?: boolean
}

/**
 * Profondeur atteinte par une pose unitaire, en magnitude.
 *
 * Une source ponctuelle de magnitude m produit le même flux qu'une arcseconde carrée de
 * brillance m : le point zéro système suffit donc à la chiffrer, et la dépendance au seul
 * diamètre de pupille tombe de l'algèbre, elle n'est pas posée.
 */
export function magnitudeLimitePrevisu(entree: EntreeProfondeur): Traced<number> {
  const snr = K('SNR_DETECTION_PREVISU')
  const nPx = K('PIXELS_PSF_ETOILE')
  const bruit = nPx * (entree.eCielPxS * entree.tPoseS + entree.readNoiseE ** 2)
  // Solution positive de x² − S² x − S² × bruit = 0, avec x le nombre d'électrons collectés.
  const demi = snr ** 2 / 2
  const electrons = demi + Math.sqrt(demi ** 2 + snr ** 2 * bruit)
  const fluxSeuil = electrons / entree.tPoseS
  const conversion = K('RADIAN_EN_ARCSEC') / (UM_PAR_MM * entree.dMm)
  return trace({
    value: entree.zpSys - K('POGSON') * Math.log10(fluxSeuil * conversion ** 2),
    formula: 'MAGNITUDE_LIMITE_PREVISU',
    inputs: {
      t_pose_s: entree.tPoseS,
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
