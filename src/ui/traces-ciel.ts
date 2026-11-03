/**
 * §3.3, §4.1 — planétarium trace primitives: celestial polylines, cadre, horizon.
 * T-0193 — split from `dessine-ciel.ts` (composes image); here nothing decided, only TRACED.
 * Shared trait: reject what misses champ first (T-0110), then break path at any unprojectable
 * point — polyline behind observer never closes across screen.
 */

import { angleDeCosDeg, applique, transpose, versVecteur, type Mat3, type Vec3 } from '../core/mat3.ts'
import { contourCadreJ2000, type Cadre } from '../core/cadre.ts'
import { pointEcran, type PointEcranMut, type Projecteur } from '../core/projection.ts'
import { horsDuChamp, type ChampVisible } from './champ-visible.ts'
import type { CoucheTraces } from '../core/constellations.ts'
import type { EntreeDessin } from './dessine-ciel.ts'
import { K } from '../registry/constants.ts'
import { RAYON_MIN_ETOILE_PX, rayonEtoileCielPx } from './apparence-objets.ts'


/**
 * T-0110 — bounding cap of a point set: mean direction + max angular gap to it. `null` when
 * mean direction meaningless (grand cercle, points cancel pairwise): no cap → never rejected.
 */
export function calotte(points: readonly Vec3[]): ChampVisible | null {
  let sx = 0
  let sy = 0
  let sz = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
    sz += p.z
  }
  const norme = Math.hypot(sx, sy, sz)
  if (norme === 0) return null
  const centre: Vec3 = { x: sx / norme, y: sy / norme, z: sz / norme }
  let cosMin = 1
  for (const p of points) {
    const cos = centre.x * p.x + centre.y * p.y + centre.z * p.z
    if (cos < cosMin) cosMin = cos
  }
  return {
    centre,
    rayonDeg: angleDeCosDeg(cosMin),
  }
}

/**
 * T-0110 — repérage layers' caps, computed once. Frontières, figures, astérismes = FIXED J2000
 * geometry: no move with zoom/scroll, nor its cap. Without this pre-reject, a 15° champ still
 * projected the 1 400 vertices of 88 frontières to keep a handful (same defect as §3.7 band).
 * Key = the array itself: layers built once at paquet load, never reallocated.
 */
const calottesMemo = new WeakMap<object, readonly (ChampVisible | null)[]>()

function calottesDe<T>(
  jeu: readonly T[],
  points: (element: T) => readonly Vec3[],
): readonly (ChampVisible | null)[] {
  const connu = calottesMemo.get(jeu)
  if (connu !== undefined) return connu
  const calculees = jeu.map((element) => calotte(points(element)))
  calottesMemo.set(jeu, calculees)
  return calculees
}

/** Composes path without painting: sky trace fills it, cadre clips with it. */
function cheminLignes(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  polylignes: readonly (readonly Vec3[])[],
  champ?: ChampVisible | null,
): void {
  const p = pointEcran()
  // Cap only if caller asks for gap: cadre outline rebuilt per frame, memoized cap would fill
  // table for nothing.
  const calottes = champ == null ? null : calottesDe(polylignes, (ligne) => ligne)
  ctx.beginPath()
  for (let i = 0; i < polylignes.length; i++) {
    const ligne = polylignes[i]!
    const englobe = calottes?.[i]
    if (champ != null && englobe != null && horsDuChamp(champ, englobe.centre, englobe.rayonDeg)) {
      continue
    }
    let enchaine = false
    for (const point of ligne) {
      if (!projecteur.projetteEn(point.x, point.y, point.z, p)) {
        enchaine = false
        continue
      }
      if (enchaine) ctx.lineTo(p.xPx, p.yPx)
      else ctx.moveTo(p.xPx, p.yPx)
      enchaine = true
    }
  }
}

export function traceLignes(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  polylignes: readonly (readonly Vec3[])[],
  champ?: ChampVisible | null,
): void {
  cheminLignes(ctx, projecteur, polylignes, champ)
  ctx.stroke()
}

/**
 * §3.5 — closed path of cadre matériel outline, composed NOT painted. Exported for filé pass
 * (§9.3): clips canvas on it before depositing render. Outline computed once here, with scène
 * projector — §3.3 forbids a 2nd projection code anywhere.
 */
export function cheminCadre(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  cadre: Cadre,
  matriceCiel: Mat3,
): void {
  const contour = contourCadreJ2000(cadre, matriceCiel)
  cheminLignes(ctx, projecteur, [[...contour, contour[0]!]])
}

/**
 * T-0373 — figure segment = 2 vertices, and portée projects some far behind observer. When the
 * joining arc passes behind visée, its image is the GREAT arc of a circle around screen;
 * straight chord crosses sky. Arc midpoint decides: small arc → inside disc whose diameter is
 * the chord; great arc → outside, or nowhere near antipode.
 */
function arcDevant(
  projecteur: Projecteur,
  va: Vec3,
  vb: Vec3,
  a: PointEcranMut,
  b: PointEcranMut,
  m: PointEcranMut,
): boolean {
  const sx = va.x + vb.x
  const sy = va.y + vb.y
  const sz = va.z + vb.z
  const norme = Math.sqrt(sx * sx + sy * sy + sz * sz)
  if (norme <= Number.EPSILON) return false
  if (!projecteur.projetteEn(sx / norme, sy / norme, sz / norme, m)) return false
  const dx = m.xPx - (a.xPx + b.xPx) / 2
  const dy = m.yPx - (a.yPx + b.yPx) / 2
  const demiCordeCarree = ((a.xPx - b.xPx) ** 2 + (a.yPx - b.yPx) ** 2) / 4
  return dx * dx + dy * dy <= demiCordeCarree
}

/** T-0376 — trait setback before the star it links, proportional to its disc. */
export function margeFigurePx(magV: number | null): number {
  const rayon = magV === null ? RAYON_MIN_ETOILE_PX : rayonEtoileCielPx(magV)
  return rayon * K('MARGE_FIGURE_RAYONS')
}

/**
 * Segment `a → b` shortened by `margeA` at `a`, `margeB` at `b`, as `[xa, ya, xb, yb]`; `null`
 * when both stars too close to leave a trait.
 */
export function retraitAuxEtoiles(
  a: PointEcranMut,
  b: PointEcranMut,
  margeA: number,
  margeB: number,
): readonly [number, number, number, number] | null {
  const dx = b.xPx - a.xPx
  const dy = b.yPx - a.yPx
  const longueur = Math.hypot(dx, dy)
  if (longueur <= margeA + margeB) return null
  const ux = dx / longueur
  const uy = dy / longueur
  return [a.xPx + ux * margeA, a.yPx + uy * margeA, b.xPx - ux * margeB, b.yPx - uy * margeB]
}

export function traceSegments(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  couches: readonly CoucheTraces[],
  champ: ChampVisible | null,
): void {
  const a = pointEcran()
  const b = pointEcran()
  const m = pointEcran()
  // Reject per CONSTELLATION, not segment: figure compact, its cap rejects its ~20 segments in
  // one dot product.
  const calottes =
    champ === null
      ? null
      : calottesDe(couches, (couche) =>
          couche.segments.flatMap((segment) => [segment.a, segment.b]),
        )
  ctx.beginPath()
  for (let i = 0; i < couches.length; i++) {
    const couche = couches[i]!
    const englobe = calottes?.[i]
    if (champ !== null && englobe != null && horsDuChamp(champ, englobe.centre, englobe.rayonDeg)) {
      continue
    }
    for (const segment of couche.segments) {
      if (!projecteur.projetteEn(segment.a.x, segment.a.y, segment.a.z, a)) continue
      if (!projecteur.projetteEn(segment.b.x, segment.b.y, segment.b.z, b)) continue
      if (!arcDevant(projecteur, segment.a, segment.b, a, b, m)) continue
      const bouts = retraitAuxEtoiles(a, b, margeFigurePx(segment.magA), margeFigurePx(segment.magB))
      if (bouts === null) continue
      ctx.moveTo(bouts[0], bouts[1])
      ctx.lineTo(bouts[2], bouts[3])
    }
  }
  ctx.stroke()
}

/**
 * Horizon cardinal points, site frame. Projector passed in = RAW projector: reading landmark,
 * not object on ground; filtered like the rest they'd vanish behind every relief hill (§4.1).
 * T-0395 — 0° circle no longer traced: it barred sol under relief, where courbes de niveau
 * already draw slopes. Letters suffice.
 */
export function traceHorizon(entree: EntreeDessin, couleur: string, projecteur: Projecteur): void {
  const { ctx } = entree
  const versJ2000 = transpose(entree.matriceCiel)
  ctx.fillStyle = couleur
  const cardinaux: readonly (readonly [number, string])[] = [
    [0, 'N'],
    [90, 'E'],
    [180, 'S'],
    [270, 'O'],
  ]
  const p = pointEcran()
  for (const [az, nom] of cardinaux) {
    const v = applique(versJ2000, versVecteur(az, 0))
    if (projecteur.projetteEn(v.x, v.y, v.z, p)) ctx.fillText(nom, p.xPx, p.yPx)
  }
}
