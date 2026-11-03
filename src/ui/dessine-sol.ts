/**
 * §4.1 — site sol, painted.
 * Dropping vertices under horizon isn't enough: Voie lactée band = THICK STROKE of a latitude
 * slice's width, spilling under horizon where its vertices were already dropped. A mask letting
 * half a stroke through isn't a mask. Sol painted, opaque, before repères.
 * Boundary searched in screen space — see `balayage-ecran.ts` (geometry, rationale). Horizon halo
 * (T-0098) sweeps the same way.
 */

import { versVecteur, type Mat3, type Vec3 } from '../core/mat3.ts'
import { pointEcran, type Projecteur } from '../core/projection.ts'
import type { MasqueHorizon } from '../core/site.ts'
import { sousLeSol } from '../core/sol.ts'
import { frontiereEcran, remplitRegion, type FrontiereEcran } from './balayage-ecran.ts'
import { champVisible, horsDuChamp, type ChampVisible } from './champ-visible.ts'
import { calotte } from './traces-ciel.ts'
import { TOUR_DEG } from '../core/unites.ts'

/**
 * Boundary key: the aim only. Sol is fixed in site frame (`inverse` goes to J2000 via sky matrix,
 * predicate returns same way), so time doesn't move it on screen. Recompute only on pan.
 */
export function cleVue(projecteur: Projecteur): string {
  const v = projecteur.vue
  return [
    v.mode,
    v.fovDeg,
    v.largeurPx,
    v.hauteurPx,
    v.azimutDeg,
    v.hauteurDeg,
    v.rotationDeg,
    v.decalageCentreXPx ?? 0,
  ].join('|')
}

let dernier: { cle: string; masque: MasqueHorizon; frontiere: FrontiereEcran } | null = null

/**
 * T-0397 — contour lines ready to project: points as site-frame vectors (north, east, zenith),
 * per polyline its extent and bounding cap. All fixed while mask is: trig and caps paid on first
 * frame; later frames drop an off-field polyline by one dot product — pan no longer projects the
 * whole horizon ring.
 */
interface CourbesPretes {
  /** Three numbers per point; a separator keeps its slot, as NaN. */
  readonly directions: Float32Array
  readonly lignes: readonly LignePrete[]
}

/** A polyline: its first point, the one after its last, and bounding cap. */
interface LignePrete {
  readonly debut: number
  readonly fin: number
  readonly englobe: ChampVisible | null
}

const pretesMemo = new WeakMap<Float32Array, CourbesPretes>()

function courbesPretes(courbes: Float32Array): CourbesPretes {
  const connues = pretesMemo.get(courbes)
  if (connues !== undefined) return connues
  const nbPoints = courbes.length / 2
  const directions = new Float32Array(nbPoints * 3)
  const lignes: LignePrete[] = []
  let debut = 0
  const ferme = (fin: number): void => {
    if (fin - debut < 2) return
    const points: Vec3[] = []
    for (let k = debut; k < fin; k++) {
      points.push({ x: directions[3 * k]!, y: directions[3 * k + 1]!, z: directions[3 * k + 2]! })
    }
    lignes.push({ debut, fin, englobe: calotte(points) })
  }
  for (let k = 0; k < nbPoints; k++) {
    const az = courbes[2 * k]!
    if (Number.isNaN(az)) {
      directions.fill(Number.NaN, 3 * k, 3 * k + 3)
      ferme(k)
      debut = k + 1
      continue
    }
    const v = versVecteur(az, courbes[2 * k + 1]!)
    directions[3 * k] = v.x
    directions[3 * k + 1] = v.y
    directions[3 * k + 2] = v.z
  }
  ferme(nbPoints)
  const pretes: CourbesPretes = Object.freeze({ directions, lignes: Object.freeze(lignes) })
  pretesMemo.set(courbes, pretes)
  return pretes
}

const point = pointEcran()

function traceCourbes(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  matriceCiel: Mat3,
  courbes: Float32Array,
  couleur: string,
  lisse = false,
): void {
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = matriceCiel
  const { directions, lignes } = courbesPretes(courbes)
  // Field brought from J2000 to site frame: one rotation per frame, not per cap.
  const champJ2000 = champVisible(projecteur)
  const c = champJ2000.centre
  const champ: ChampVisible = {
    centre: {
      x: m11 * c.x + m12 * c.y + m13 * c.z,
      y: m21 * c.x + m22 * c.y + m23 * c.z,
      z: m31 * c.x + m32 * c.y + m33 * c.z,
    },
    rayonDeg: champJ2000.rayonDeg,
  }
  ctx.strokeStyle = couleur
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const { debut, fin, englobe } of lignes) {
    if (englobe !== null && horsDuChamp(champ, englobe.centre, englobe.rayonDeg)) continue
    let enchaine = false
    // T-0441 — smoothed, each point becomes control point of an arc from one segment midpoint to
    // the next: elbows the 100 m grid leaves on close curves (a cell spans several degrees) round
    // off. Last point waits for the next.
    let attente = false
    let ax = 0
    let ay = 0
    const acheve = (): void => {
      if (attente) ctx.lineTo(ax, ay)
      attente = false
    }
    for (let j = 3 * debut; j < 3 * fin; j += 3) {
      const n = directions[j]!
      const e = directions[j + 1]!
      const u = directions[j + 2]!
      // Site frame → J2000: sky matrix transpose, in scalars.
      const projete = projecteur.projetteEn(
        m11 * n + m21 * e + m31 * u,
        m12 * n + m22 * e + m32 * u,
        m13 * n + m23 * e + m33 * u,
        point,
      )
      if (!projete) {
        acheve()
        enchaine = false
        continue
      }
      if (!enchaine) ctx.moveTo(point.xPx, point.yPx)
      else if (!lisse) ctx.lineTo(point.xPx, point.yPx)
      else {
        if (attente) ctx.quadraticCurveTo(ax, ay, (ax + point.xPx) / 2, (ay + point.yPx) / 2)
        ax = point.xPx
        ay = point.yPx
        attente = true
      }
      enchaine = true
    }
    acheve()
  }
  ctx.stroke()
}

const cretesMemo = new WeakMap<object, Float32Array>()

/** A crest polyline covers at most this sector: off-field it is dropped as a block. */
const SECTEUR_CRETE_DEG = 10

/**
 * T-0438 — crest as polylines, at the pas of the profile it follows: fine crest when relief
 * carries it, degree mask otherwise. Sol interpolates this profile linearly
 * (`obstructionDessinDeg`): stroke follows its edge exactly. Screen-sweep segments are a few px
 * each: stroked one by one, junctions antialias into beads (crest looked dotted). Cut into sectors
 * so the horizon ring isn't projected whole every frame.
 */
function crete(masque: MasqueHorizon): Float32Array {
  const fine = masque.creteDeg
  const profil: ArrayLike<number> =
    fine !== undefined && fine.length > 0 ? fine : masque.altitudesDeg
  const connue = cretesMemo.get(profil)
  if (connue !== undefined) return connue
  const n = profil.length
  const parSecteur = Math.max(1, Math.round((n * SECTEUR_CRETE_DEG) / TOUR_DEG))
  const points: number[] = []
  for (let k = 0; k <= n; k++) {
    // A cut point belongs to both sectors: joins them without gap.
    if (k > 0 && k % parSecteur === 0 && k < n) {
      points.push((k * TOUR_DEG) / n, profil[k % n]!, Number.NaN, Number.NaN)
    }
    points.push((k * TOUR_DEG) / n, profil[k % n]!)
  }
  const polylignes = Float32Array.from(points)
  cretesMemo.set(profil, polylignes)
  return polylignes
}

/**
 * Paints sol, then contour lines, silhouettes, crest.
 * T-0395 removed crest stroke (curves were to suffice); T-0438 restores it, with silhouettes: on
 * an alpine site pale curves blend from a slope into the one it hides, sol no longer detaches from
 * sky. Curves stroked without screen sweep: what a nearer relief hides is already removed in site
 * frame (`courbesNiveau`, `silhouettes`).
 */
export function dessineSol(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  matriceCiel: Mat3,
  masque: MasqueHorizon,
  couleurs: { readonly sol: string; readonly courbes: string; readonly bords: string },
): void {
  const cle = cleVue(projecteur)
  if (dernier === null || dernier.cle !== cle || dernier.masque !== masque) {
    dernier = { cle, masque, frontiere: frontiereEcran(projecteur, sousLeSol(masque, matriceCiel)) }
  }
  remplitRegion(ctx, dernier.frontiere, couleurs.sol)
  if (masque.courbesDeg !== undefined && masque.courbesDeg.length > 0) {
    // Only curves smooth: crest must follow filled sol edge segment by segment; a silhouette marks
    // an edge.
    traceCourbes(ctx, projecteur, matriceCiel, masque.courbesDeg, couleurs.courbes, true)
  }
  if (masque.silhouettesDeg !== undefined && masque.silhouettesDeg.length > 0) {
    traceCourbes(ctx, projecteur, matriceCiel, masque.silhouettesDeg, couleurs.bords)
  }
  traceCourbes(ctx, projecteur, matriceCiel, crete(masque), couleurs.bords)
}
