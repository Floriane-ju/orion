/**
 * §3.3, §6.2 — le marqueur d'un objet du ciel profond : la place qu'il occupe VRAIMENT dans le
 * ciel, à l'échelle de la vue.
 *
 * Un symbole de taille fixe ment sur la seule chose qu'on vient vérifier au planétarium : est-ce
 * que cet objet tient dans mon cadre ? M31 fait trois degrés, une planétaire vingt secondes
 * d'arc ; les peindre pareil, c'est renvoyer la question au panneau de cadrage (§6.2) alors que
 * la scène a de quoi y répondre — le catalogue porte grand axe, petit axe et angle de position.
 *
 * Les demi-axes se mesurent PAR PROJECTION, pas par une dérivée de la fonction radiale : deux
 * points décalés de l'objet, projetés par le même projecteur que tout le reste de la scène.
 * L'écart en pixels donne à la fois la longueur et l'orientation à l'écran, dans les trois modes
 * de §3.3 et pour n'importe quelle rotation de vue, sans réécrire R(θ) une seconde fois.
 */

import { DEG, versVecteur } from '../core/mat3.ts'
import { pointEcran, type Projecteur } from '../core/projection.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { EPAISSEUR_BORD_PX, type TeintesObjet } from './apparence-objets.ts'
import { MARQUEUR_OBJET_PX } from './libelles-cibles.ts'
import { ARCMIN_PAR_DEG, TOUR_RAD } from '../core/unites.ts'


export interface GeometrieMarqueur {
  readonly demiGrandPx: number
  readonly demiPetitPx: number
  /** Rotation du grand axe à l'écran, radians, sens du canevas. */
  readonly rotationRad: number
}

/**
 * Points de travail réutilisés d'un objet à l'autre : la boucle de rendu les traverse par image
 * et pour chaque objet visible, et deux allocations par objet et par image sont exactement ce
 * que T-0065 a retiré de la passe des étoiles.
 */
const decaleGrand = pointEcran()
const decalePetit = pointEcran()

/**
 * Les demi-axes et l'orientation du marqueur, en pixels de la vue courante.
 *
 * `null` quand le catalogue ne donne pas de grand axe — l'appelant peint alors la croix, aucune
 * taille n'est inventée — ou quand un des points décalés sort du domaine de projection, au
 * voisinage de la singularité.
 *
 * ponytail: les deux demi-axes sont mesurés dans les directions du grand et du petit axe du
 * ciel. En projection stéréographique, conforme, c'est exact. En gnomonique et en équidistante,
 * l'échelle radiale et l'échelle tangentielle diffèrent, et l'ellipse projetée d'un objet
 * n'a rigoureusement ni ces axes ni cette orientation. L'écart est du second ordre en taille
 * angulaire : sous le degré, il reste sous le pixel. Si un jour un objet de dix degrés doit
 * être juste au bord d'un fisheye, il faudra la vraie image de l'ellipse, pas ce raccourci.
 */
export function geometrieMarqueur(
  projecteur: Projecteur,
  objet: ObjetCielProfond,
  xPx: number,
  yPx: number,
): GeometrieMarqueur | null {
  const majAxArcmin = objet.majAxArcmin
  if (majAxArcmin === null || majAxArcmin <= 0) return null

  // Base tangente au point de l'objet : nord = δ croissant, est = α croissant.
  const lon = objet.adDeg * DEG
  const lat = objet.decDeg * DEG
  const cosLon = Math.cos(lon)
  const sinLon = Math.sin(lon)
  const cosLat = Math.cos(lat)
  const sinLat = Math.sin(lat)
  const nord = { x: -sinLat * cosLon, y: -sinLat * sinLon, z: cosLat }
  const est = { x: -sinLon, y: cosLon, z: 0 }

  // L'angle de position se compte du nord vers l'est. Absent, l'objet n'a pas d'orientation
  // connue : il est posé nord-sud, ce que fait déjà `ficheCadrage` (§6.2).
  const pa = (objet.posAngDeg ?? 0) * DEG
  const cosPa = Math.cos(pa)
  const sinPa = Math.sin(pa)
  const grand = {
    x: nord.x * cosPa + est.x * sinPa,
    y: nord.y * cosPa + est.y * sinPa,
    z: nord.z * cosPa + est.z * sinPa,
  }
  const petit = {
    x: -nord.x * sinPa + est.x * cosPa,
    y: -nord.y * sinPa + est.y * cosPa,
    z: -nord.z * sinPa + est.z * cosPa,
  }

  // Sans petit axe au catalogue, l'objet est supposé circulaire — même convention que §6.2.
  const minAxArcmin = objet.minAxArcmin ?? majAxArcmin
  const thetaGrand = (majAxArcmin / 2 / ARCMIN_PAR_DEG) * DEG
  const thetaPetit = (minAxArcmin / 2 / ARCMIN_PAR_DEG) * DEG

  const v = versVecteur(objet.adDeg, objet.decDeg)
  if (!projetteDecalage(projecteur, v, grand, thetaGrand, decaleGrand)) return null
  if (!projetteDecalage(projecteur, v, petit, thetaPetit, decalePetit)) return null

  const dxGrand = decaleGrand.xPx - xPx
  const dyGrand = decaleGrand.yPx - yPx
  const mesureGrandPx = Math.hypot(dxGrand, dyGrand)
  const mesurePetitPx = Math.hypot(decalePetit.xPx - xPx, decalePetit.yPx - yPx)
  if (mesureGrandPx <= 0) return null

  // Plancher de lisibilité : sous quelques pixels, une ellipse n'a plus de forme et l'objet
  // deviendrait invisible avant d'être petit. Les deux demi-axes montent du MÊME facteur —
  // c'est l'aplatissement qui porte l'information, et lui reste celui du ciel.
  const facteur = Math.max(1, MARQUEUR_OBJET_PX / mesureGrandPx)
  return {
    demiGrandPx: mesureGrandPx * facteur,
    demiPetitPx: mesurePetitPx * facteur,
    rotationRad: Math.atan2(dyGrand, dxGrand),
  }
}

/** Le point à `theta` de `v` dans la direction `d`, projeté. Unitaire par construction : v ⊥ d. */
function projetteDecalage(
  projecteur: Projecteur,
  v: { x: number; y: number; z: number },
  d: { x: number; y: number; z: number },
  theta: number,
  out: { xPx: number; yPx: number },
): boolean {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return projecteur.projetteEn(v.x * c + d.x * s, v.y * c + d.y * s, v.z * c + d.z * s, out)
}

/**
 * L'objet peint : un dégradé radial dans son ellipse, puis son contour.
 *
 * Le dégradé passe par une transformation du contexte — c'est le seul moyen d'obtenir un
 * dégradé ELLIPTIQUE, `createRadialGradient` ne sachant faire que des cercles. Le contour, lui,
 * est tracé hors transformation : la mise à l'échelle anisotrope étirerait son épaisseur, et un
 * objet aplati porterait un trait deux fois plus épais sur ses flancs que sur ses pointes.
 */
export function peintEllipse(
  ctx: CanvasRenderingContext2D,
  xPx: number,
  yPx: number,
  geo: GeometrieMarqueur,
  teintes: TeintesObjet,
): void {
  ctx.save()
  ctx.translate(xPx, yPx)
  ctx.rotate(geo.rotationRad)
  ctx.scale(1, geo.demiPetitPx / geo.demiGrandPx)
  const degrade = ctx.createRadialGradient(0, 0, 0, 0, 0, geo.demiGrandPx)
  degrade.addColorStop(0, teintes.coeur)
  degrade.addColorStop(1, teintes.halo)
  ctx.fillStyle = degrade
  ctx.beginPath()
  ctx.arc(0, 0, geo.demiGrandPx, 0, TOUR_RAD)
  ctx.fill()
  ctx.restore()

  ctx.beginPath()
  ctx.ellipse(xPx, yPx, geo.demiGrandPx, geo.demiPetitPx, geo.rotationRad, 0, TOUR_RAD)
  ctx.lineWidth = EPAISSEUR_BORD_PX
  ctx.strokeStyle = teintes.bord
  ctx.stroke()
}

/** L'objet dont le catalogue ignore les dimensions : une croix, à la couleur de son type. */
export function peintCroix(
  ctx: CanvasRenderingContext2D,
  xPx: number,
  yPx: number,
  couleur: string,
): void {
  ctx.beginPath()
  ctx.moveTo(xPx - MARQUEUR_OBJET_PX, yPx - MARQUEUR_OBJET_PX)
  ctx.lineTo(xPx + MARQUEUR_OBJET_PX, yPx + MARQUEUR_OBJET_PX)
  ctx.moveTo(xPx + MARQUEUR_OBJET_PX, yPx - MARQUEUR_OBJET_PX)
  ctx.lineTo(xPx - MARQUEUR_OBJET_PX, yPx + MARQUEUR_OBJET_PX)
  ctx.lineWidth = 1
  ctx.strokeStyle = couleur
  ctx.stroke()
}
