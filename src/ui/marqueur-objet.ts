/**
 * §3.3, §6.2 — ciel profond object marker: the room it REALLY takes in the sky, at view scale.
 * A fixed-size symbol lies on what the planetarium is checked for (does it fit my cadre?):
 * M31 is 3°, a planetary 20″. Painting alike defers to the cadrage panel (§6.2) though the
 * scene can answer (catalogue has grand axe, petit axe, position angle).
 * Semi-axes measured BY PROJECTION, not by radial-function derivative: two offset points of
 * the object, projected like the rest of the scène. Pixel gap gives length + screen
 * orientation in the three §3.3 modes and any view rotation, without rewriting R(θ).
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
  /** Screen rotation of the grand axe, radians, canvas direction. */
  readonly rotationRad: number
}

/**
 * Scratch points reused across objects: the render loop crosses them per frame per visible
 * object; 2 allocations/object/frame is what T-0065 removed from the star pass.
 */
const decaleGrand = pointEcran()
const decalePetit = pointEcran()

/**
 * Marker semi-axes and orientation, current-view pixels.
 * `null` when catalogue has no grand axe (caller paints the cross, no size invented) or an
 * offset point leaves the projection domain (near the singularity).
 *
 * ponytail: semi-axes measured along sky grand/petit axis directions. Exact in stereographic
 * (conformal). Gnomonic/equidistant: radial ≠ tangential scale → projected ellipse has
 * strictly neither these axes nor this orientation. Error 2nd order in angular size: < 1°
 * → < 1 px. Upgrade to the true ellipse image for a 10° object at a fisheye edge.
 */
export function geometrieMarqueur(
  projecteur: Projecteur,
  objet: ObjetCielProfond,
  xPx: number,
  yPx: number,
): GeometrieMarqueur | null {
  const majAxArcmin = objet.majAxArcmin
  if (majAxArcmin === null || majAxArcmin <= 0) return null

  // Tangent basis at the object's point: nord = δ increasing, est = α increasing.
  const lon = objet.adDeg * DEG
  const lat = objet.decDeg * DEG
  const cosLon = Math.cos(lon)
  const sinLon = Math.sin(lon)
  const cosLat = Math.cos(lat)
  const sinLat = Math.sin(lat)
  const nord = { x: -sinLat * cosLon, y: -sinLat * sinLon, z: cosLat }
  const est = { x: -sinLon, y: cosLon, z: 0 }

  // Position angle counts nord → est. Absent: no known orientation, nord-sud like
  // `ficheCadrage` (§6.2).
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

  // No petit axe in catalogue: assumed circular, as §6.2.
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

  // Legibility floor: under a few px an ellipse has no shape, the object would vanish before
  // being small. Both semi-axes scale by the SAME factor: flattening (the sky's) is kept.
  const facteur = Math.max(1, MARQUEUR_OBJET_PX / mesureGrandPx)
  return {
    demiGrandPx: mesureGrandPx * facteur,
    demiPetitPx: mesurePetitPx * facteur,
    rotationRad: Math.atan2(dyGrand, dxGrand),
  }
}

/** Point at `theta` from `v` toward `d`, projected. Unit by construction: v ⊥ d. */
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
 * Object painted: radial gradient in its ellipse, then outline.
 * Gradient via a context transform: only way to get an ELLIPTICAL gradient
 * (`createRadialGradient` = circles). Outline stroked outside the transform: anisotropic
 * scaling would stretch it (flat object: stroke 2× thicker on flanks than tips).
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

/** Object lacking catalogue dimensions: a cross, in its type's colour. */
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
