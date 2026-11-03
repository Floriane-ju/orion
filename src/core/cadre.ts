/**
 * §3.5 — matériel cadre overlay.
 *
 * Cadre = SCENE OBJECT projected by the §3.3 engine: at grand champ edges aren't straight.
 * A straight rectangle would lie about what the objectif captures (10 mm = 130° diagonal;
 * curvature dominates grand-champ cadrage). Dimensions from §5.1 = arctangent, never linear
 * approximation: seam between planétarium and all engines.
 *
 * T-0219 — cadre inverted by the OBJECTIF's projection: gnomonique for rectilinéaire,
 * équidistante for fisheye. Fisheye inverted as gnomonique drew another objectif's cadre,
 * diverged at 180° champ.
 */

import { K } from '../registry/constants.ts'
import { degres } from '../registry/ecriture.ts'
import { RAPPORT_AXES_ORIENTATION } from '../registry/verdicts.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { directionDuPlan, matriceVue, rayonProjete, type ModeProjection } from './projection.ts'
import {
  DEG,
  applique,
  transpose,
  versVecteur,
  type Mat3,
  type Vec3,
} from './mat3.ts'
import { ARCMIN_PAR_DEG, DEMI_TOUR_DEG, ramene } from './unites.ts'

export interface ProfilCadre {
  readonly libelle: string
  /** Champ of sensor long side (§5.1). */
  readonly fovLDeg: number
  readonly fovHDeg: number
  /** Objectif physical projection: `MODE_CADRE` (rectilinéaire) or `MODE_FISHEYE`. */
  readonly modeObjectif: ModeProjection
  readonly echApx: number
  /** Sensor short side: gives a cible's ideal focale (§6.1). */
  readonly capteurHMm: number
  /** Pose shown on cadre: optimale with suivi, NPF without (§7.2, §9.1). */
  readonly tPoseS: number | null
}

/** Cadre half-dimensions in its objectif's projection plane, in R units. */
function demiPlan(profil: ProfilCadre): { readonly uMax: number; readonly vMax: number } {
  return {
    uMax: rayonProjete(profil.modeObjectif, (profil.fovLDeg / 2) * DEG),
    vMax: rayonProjete(profil.modeObjectif, (profil.fovHDeg / 2) * DEG),
  }
}

export interface Cadre {
  readonly profil: ProfilCadre
  readonly azimutDeg: number
  readonly hauteurDeg: number
  readonly rotationDeg: number
}

/**
 * Cadre outline as J2000 directions for the projector. Edges = polylines: curvature visible in
 * stereographic projection.
 */
export function contourCadreJ2000(cadre: Cadre, matriceCiel: Mat3): readonly Vec3[] {
  const { uMax, vMax } = demiPlan(cadre.profil)
  const pas = Math.max(1, Math.round(K('SUBDIVISION_CADRE')))

  // Local cadre frame, roulis included; then back to J2000 equatorial frame.
  const versHorizon = transpose(
    matriceVue(cadre.azimutDeg, cadre.hauteurDeg, cadre.rotationDeg),
  )
  const versJ2000 = transpose(matriceCiel)

  const coins: readonly (readonly [number, number])[] = [
    [-uMax, -vMax],
    [uMax, -vMax],
    [uMax, vMax],
    [-uMax, vMax],
  ]

  const points: Vec3[] = []
  for (let c = 0; c < coins.length; c++) {
    const [u0, v0] = coins[c]!
    const [u1, v1] = coins[(c + 1) % coins.length]!
    for (let i = 0; i < pas; i++) {
      const f = i / pas
      const u = u0 + (u1 - u0) * f
      const v = v0 + (v1 - v0) * f
      const local = directionDuPlan(cadre.profil.modeObjectif, u, v)
      points.push(applique(versJ2000, applique(versHorizon, local)))
    }
  }
  return points
}

export interface CelluleCadre {
  /** Cell centre position in cadre, −1 (left, bottom) to +1 (right, top). */
  readonly uFrac: number
  readonly vFrac: number
  /** J2000 direction of cell centre: its déclinaison is `asin(dir.z)`. */
  readonly dir: Vec3
}

/**
 * §9.1 — pose-map cell centres, in the geometry of the cadre ACTUALLY drawn (T-0142).
 * `cartePoseMax` samples the same grid in equatorial frame from visée + roulis; here it starts
 * from the scène cadre (azimut, hauteur, boîtier roulis) so each value lands on its pixel. Same
 * inverse as outline above: one objectif, not two. CENTRES, not edges: a number in a cell
 * stands for what it covers.
 */
export function cellulesCadreJ2000(
  cadre: Cadre,
  matriceCiel: Mat3,
  cote: number,
): readonly CelluleCadre[] {
  const { uMax, vMax } = demiPlan(cadre.profil)
  const versHorizon = transpose(
    matriceVue(cadre.azimutDeg, cadre.hauteurDeg, cadre.rotationDeg),
  )
  const versJ2000 = transpose(matriceCiel)

  const cellules: CelluleCadre[] = []
  for (let ligne = 0; ligne < cote; ligne++) {
    // Row 0 at cadre top, like the §9.1 map: v decreases as row increases.
    const vFrac = 1 - (2 * ligne + 1) / cote
    for (let colonne = 0; colonne < cote; colonne++) {
      const uFrac = (2 * colonne + 1) / cote - 1
      const u = uFrac * uMax
      const v = vFrac * vMax
      const local = directionDuPlan(cadre.profil.modeObjectif, u, v)
      cellules.push({ uFrac, vFrac, dir: applique(versJ2000, applique(versHorizon, local)) })
    }
  }
  return cellules
}

// ---------------------------------------------------------------------------
// Dominant cible and suggested rotation
// ---------------------------------------------------------------------------

export interface CibleDansCadre {
  readonly objet: ObjetCielProfond
  /** Major-axis angular size, degrees. */
  readonly tailleDeg: number
}


/**
 * Dominant cadre object: the most extended of those inside. Carries fill rate and suggested
 * rotation (§6.2).
 */
export function cibleDominante(
  objets: readonly ObjetCielProfond[],
  cadre: Cadre,
  matriceCiel: Mat3,
): CibleDansCadre | null {
  const versCadre = matriceVue(cadre.azimutDeg, cadre.hauteurDeg, cadre.rotationDeg)
  const mode = cadre.profil.modeObjectif
  const { uMax, vMax } = demiPlan(cadre.profil)

  let meilleure: CibleDansCadre | null = null
  for (const objet of objets) {
    if (objet.majAxArcmin === null) continue
    const local = applique(versCadre, applique(matriceCiel, versVecteur(objet.adDeg, objet.decDeg)))
    if (mode === 'MODE_CADRE' && local.z <= 0) continue
    const s = Math.hypot(local.x, local.y)
    const facteur = s <= Number.EPSILON ? 0 : rayonProjete(mode, Math.atan2(s, local.z)) / s
    if (Math.abs(local.x * facteur) > uMax || Math.abs(local.y * facteur) > vMax) continue
    const tailleDeg = objet.majAxArcmin / ARCMIN_PAR_DEG
    if (meilleure === null || tailleDeg > meilleure.tailleDeg) {
      meilleure = { objet, tailleDeg }
    }
  }
  return meilleure
}

export interface RotationSuggeree {
  /** Boîtier angle to apply, degrees. `null` = none suggestable; message says WHY (§6.2). */
  readonly angleDeg: number | null
  readonly message: string
}


/** Major / minor axis ratio. `null` when catalogue gives no minor axis. */
function rapportAxes(objet: ObjetCielProfond): number | null {
  if (objet.majAxArcmin === null) return null
  if (objet.minAxArcmin === null || objet.minAxArcmin === 0) return null
  return objet.majAxArcmin / objet.minAxArcmin
}

/**
 * Cible major-axis direction in sensor axes from cadre LONG side, boîtier roulis included.
 * `null` without catalogue position angle. Catalogue angle is equatorial, cadre lives in
 * observer frame: convert via tangent vectors, never angle subtraction (ignores field rotation).
 */
export function angleGrandAxeDansCadre(
  cible: CibleDansCadre,
  cadre: Cadre,
  matriceCiel: Mat3,
): number | null {
  const posAng = cible.objet.posAngDeg
  return posAng === null ? null : angleAxeDansCadre(posAng, cible, cadre, matriceCiel)
}

function angleAxeDansCadre(
  posAng: number,
  cible: CibleDansCadre,
  cadre: Cadre,
  matriceCiel: Mat3,
): number {
  const ad = cible.objet.adDeg * DEG
  const dec = cible.objet.decDeg * DEG
  // North and east tangent vectors at object position, J2000.
  const nord: Vec3 = {
    x: -Math.sin(dec) * Math.cos(ad),
    y: -Math.sin(dec) * Math.sin(ad),
    z: Math.cos(dec),
  }
  const est: Vec3 = { x: -Math.sin(ad), y: Math.cos(ad), z: 0 }
  const pa = posAng * DEG
  const axe: Vec3 = {
    x: Math.cos(pa) * nord.x + Math.sin(pa) * est.x,
    y: Math.cos(pa) * nord.y + Math.sin(pa) * est.y,
    z: Math.cos(pa) * nord.z + Math.sin(pa) * est.z,
  }

  const versCadre = matriceVue(cadre.azimutDeg, cadre.hauteurDeg, cadre.rotationDeg)
  const local = applique(versCadre, applique(matriceCiel, axe))
  // An axis has no sense: two opposite directions = same orientation.
  const brut = Math.atan2(local.y, local.x) / DEG
  return ramene(brut, DEMI_TOUR_DEG)
}

/**
 * §3.5, §6.2 — angle aligning cible major axis with sensor long side. 3 stated outcomes: angle,
 * cible too round for orientation to matter, position angle missing. Silent `null` would suggest
 * computation in progress or already optimal cadrage.
 */
export function rotationSuggeree(
  cible: CibleDansCadre,
  cadre: Cadre,
  matriceCiel: Mat3,
): RotationSuggeree {
  const rapport = rapportAxes(cible.objet)
  if (rapport === null) {
    return {
      angleDeg: null,
      message:
        `Forme de ${cible.objet.designation} inconnue : pas d’orientation conseillée.`,
    }
  }
  if (rapport <= RAPPORT_AXES_ORIENTATION) {
    return {
      angleDeg: null,
      message:
        `${cible.objet.designation} est presque ronde : l’orientation du boîtier ne change rien.`,
    }
  }
  const posAng = cible.objet.posAngDeg
  if (posAng === null) {
    return {
      angleDeg: null,
      message:
        `${cible.objet.designation} est allongée, mais son orientation est inconnue : pas ` +
        'd’angle conseillé.',
    }
  }

  // Angle measured in cadre WITHOUT roulis = the roulis to apply to bring major axis onto long
  // side.
  const angleAxe = angleAxeDansCadre(posAng, cible, { ...cadre, rotationDeg: 0 }, matriceCiel)

  const paysage = cadre.profil.fovLDeg >= cadre.profil.fovHDeg
  const brut = paysage ? angleAxe : angleAxe - 90
  const angleDeg = ramene(brut, DEMI_TOUR_DEG)

  return {
    angleDeg,
    message:
      `Tournez de ${degres(angleDeg, 0)} pour aligner ${cible.objet.designation} sur la ` +
      'longueur du capteur. Valable à cette heure seulement.',
  }
}
