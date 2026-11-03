/**
 * §3.1 — Lune painted in its phase, like frise de nuit disc (`CarteNuit`): lit part in text
 * teinte; dark part unpainted (it's sky).
 * Lit limb faces the Sun ON SCREEN, not fixed left/right by hemisphere as on frise: on a rotated,
 * flipped, rolled map, only valid orientation. Phase angle from `astronomy-engine` (`etatLune`),
 * same calc as frise lit fraction.
 */
import { K } from '../registry/constants.ts'
import { TOUR_RAD } from '../core/unites.ts'
import { DEG, type Vec3 } from '../core/mat3.ts'
import { pointEcran, type PointEcran, type Projecteur } from '../core/projection.ts'
import type { PaletteCiel } from './couleurs.ts'
import { perpendiculaire } from './dessine-fond-ciel.ts'
import { RAYON_LUNE_PX } from './libelles-cibles.ts'

/** Pas, radians, toward Sun along the sky: short enough to stay near the disc. */
const PAS_VERS_SOLEIL_RAD = 1e-3
const QUART_TOUR_RAD = TOUR_RAD / 4

/**
 * Screen direction, radians, of Sun seen from Lune: projected point = one pas toward Sun on the
 * great circle joining them. Sun itself may fall behind observer, outside projection domain; this
 * pas never does.
 */
export function angleLimbeEclaireRad(
  projecteur: Projecteur,
  lune: Vec3,
  soleil: Vec3,
  centre: PointEcran,
): number | null {
  const d = soleil.x * lune.x + soleil.y * lune.y + soleil.z * lune.z
  const tx = soleil.x - d * lune.x
  const ty = soleil.y - d * lune.y
  const tz = soleil.z - d * lune.z
  const norme = Math.hypot(tx, ty, tz)
  // Exact conjunction/opposition: neither side more lit.
  if (norme === 0) return null
  const s = PAS_VERS_SOLEIL_RAD / norme
  const q = pointEcran()
  if (!projecteur.projetteEn(lune.x + s * tx, lune.y + s * ty, lune.z + s * tz, q)) return null
  return Math.atan2(q.yPx - centre.yPx, q.xPx - centre.xPx)
}

/**
 * Painted radius: real disc size on sky once zoom makes it larger than `RAYON_LUNE_PX`, else that
 * floor (wide field: half a degree = a dot, phase unreadable). MEASURED by projecting a limb
 * point, like an object marker: projection scale varies across field.
 */
export function rayonLunePx(
  projecteur: Projecteur,
  lune: Vec3,
  centre: PointEcran,
  demiDiametreDeg: number | null,
): number {
  if (demiDiametreDeg === null) return RAYON_LUNE_PX
  const perp = perpendiculaire(lune)
  const cos = Math.cos(demiDiametreDeg * DEG)
  const sin = Math.sin(demiDiametreDeg * DEG)
  const q = pointEcran()
  const limbe = projecteur.projetteEn(
    lune.x * cos + perp.x * sin,
    lune.y * cos + perp.y * sin,
    lune.z * cos + perp.z * sin,
    q,
  )
  if (!limbe) return RAYON_LUNE_PX
  return Math.max(RAYON_LUNE_PX, Math.hypot(q.xPx - centre.xPx, q.yPx - centre.yPx))
}

/**
 * Adds to current path the lit part of a disc centred (x, y), lit limb toward `angleRad`. Absolute
 * coordinates, no context transform: several discs compose into one path, filled at once (T-0402).
 * Terminator = half-ellipse of half-width r·|cos φ|: dark side when gibbous (cos φ > 0), lit side
 * when crescent. No phase angle: full disc (phaseless Lune beats an invented phase).
 */
function cheminPhase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  angleRad: number | null,
  anglePhaseDeg: number | null,
): void {
  const a = angleRad ?? 0
  ctx.moveTo(x + r * Math.cos(a - QUART_TOUR_RAD), y + r * Math.sin(a - QUART_TOUR_RAD))
  if (anglePhaseDeg === null) {
    ctx.arc(x, y, r, a - QUART_TOUR_RAD, a - QUART_TOUR_RAD + TOUR_RAD)
    return
  }
  const rx = r * Math.abs(Math.cos(anglePhaseDeg * DEG))
  const croissant = Math.cos(anglePhaseDeg * DEG) < 0
  ctx.arc(x, y, r, a - QUART_TOUR_RAD, a + QUART_TOUR_RAD)
  ctx.ellipse(x, y, rx, r, a, QUART_TOUR_RAD, -QUART_TOUR_RAD, croissant)
  ctx.closePath()
}

/**
 * Paints disc of radius `r`, lit limb toward `angleRad`.
 * Only lit part painted. Dark part has colour of the sky IN FRONT of it (scattered light lies
 * between Lune and us), and `teintes.fond` is zenith's only: painted, it cut against sky raised by
 * halo/crépuscule, up to a dark rim at limb of a near-full Lune.
 */
export function dessineLune(
  ctx: CanvasRenderingContext2D,
  centre: PointEcran,
  r: number,
  angleRad: number | null,
  anglePhaseDeg: number | null,
  teintes: PaletteCiel,
): void {
  ctx.fillStyle = teintes.lune
  ctx.beginPath()
  cheminPhase(ctx, centre.xPx, centre.yPx, r, angleRad, anglePhaseDeg)
  ctx.fill()
}

/**
 * T-0399 — Lune trace on a pose with cut monture. Lune saturates sensor in a fraction of a second;
 * no pose dims it, unlike a star whose trace fades with per-pixel pose.
 * T-0402 — trace = phase disc SPREAD along path: Lune shape repeated every
 * `PAS_ETALEMENT_LUNE_RAYONS` rayons, one path. No threshold: full band only past the radius, and
 * at wide field 4 min of filé left a still Lune. Spread, it lengthens from first pixel, a crescent
 * leaves a crescent trace, not a disc-wide band.
 * Path breaks on any point projecteur refuses (under relief when sol-filtered, else behind
 * observer). Returns projected length, px.
 */
export function dessineTrajetLune(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  points: readonly Vec3[],
  r: number,
  soleil: Vec3 | null,
  anglePhaseDeg: number | null,
  teinte: string,
): number {
  const q = pointEcran()
  const pas = r * K('PAS_ETALEMENT_LUNE_RAYONS')
  ctx.beginPath()
  let longueur = 0
  let precedent: { readonly xPx: number; readonly yPx: number; readonly angle: number | null } | null =
    null
  for (const v of points) {
    if (!projecteur.projetteEn(v.x, v.y, v.z, q)) {
      precedent = null
      continue
    }
    const x = q.xPx
    const y = q.yPx
    // Limb orientation rotates on screen during a long filé: re-read at each path point, held on
    // the next segment.
    const angle = soleil === null ? null : angleLimbeEclaireRad(projecteur, v, soleil, { xPx: x, yPx: y })
    if (precedent === null) cheminPhase(ctx, x, y, r, angle, anglePhaseDeg)
    else {
      const dx = x - precedent.xPx
      const dy = y - precedent.yPx
      const segment = Math.hypot(dx, dy)
      const n = Math.ceil(segment / pas)
      for (let i = 1; i <= n; i++) {
        cheminPhase(ctx, precedent.xPx + (dx * i) / n, precedent.yPx + (dy * i) / n, r, precedent.angle, anglePhaseDeg)
      }
      longueur += segment
    }
    precedent = { xPx: x, yPx: y, angle }
  }
  ctx.fillStyle = teinte
  ctx.fill()
  return longueur
}
