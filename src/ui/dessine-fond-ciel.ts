/**
 * T-0098, T-0100 — two layers brightening fond de ciel in vue réaliste.
 * Painted between fond `fillRect` and all else (under band, sol, repères): fond over repérage
 * masks orientation aids (§3.7); relief must cover halo when aim is low (T-0094).
 * TWO GEOMETRIES (contributors differ in symmetry):
 * - site halo = function of HEIGHT: altitude parallels, circles in none of the three projections
 *   → paliers via `balayage-ecran.ts` screen sweep;
 * - Lune halo = function of SEPARATION: `diffusionKS(ρ)` radial around it → radial gradient at
 *   its screen position is the right geometry (radius aside, measured on the projection).
 * No physics here: all from `fond-ciel-rendu.ts`, reusing `moon.ts` KS91 model.
 */

import type { Mat3, Vec3 } from '../core/mat3.ts'
import { DEG, versVecteur } from '../core/mat3.ts'
import type { Projecteur } from '../core/projection.ts'
import { sousLaHauteur } from '../core/sol.ts'
import type { GeometrieLune } from '../core/moon.ts'
import { brillanceLuneNl, nanolamberts } from '../core/moon.ts'
import {
  bornesPaliersHalo,
  brillanceSoleilZenithNl,
  facteurHaloHorizon,
  hauteurRepresentative,
  lueurSoleil,
  rougissement,
  sbDepuisNanolamberts,
} from '../core/fond-ciel-rendu.ts'
import { fondRealiste, fondRealisteSoleil } from './couleurs.ts'
import {
  frontiereEcran,
  remplitRegion,
  type FinesseBalayage,
  type FrontiereEcran,
} from './balayage-ecran.ts'
import { cleVue } from './dessine-sol.ts'
import { peintLisse } from './lissage.ts'
import { DEG_PAR_HEURE } from '../core/unites.ts'
import { K } from '../registry/constants.ts'

/**
 * Light sweep for halo paliers: a palier edge splits two close teintes (sol crest: sky vs black).
 * A height parallel is smooth: meshes 3x wider than sol's suffice, paliers smoothed after.
 * ponytail: if paliers show, raise PALIER COUNT (PALIERS_HALO_HORIZON), not edge fineness.
 */
let paliersCaches: { cle: string; frontieres: readonly FrontiereEcran[] } | null = null

const BALAYAGE_HALO: FinesseBalayage = { pasMaillePx: 12, pasBlocPx: 48, dichotomies: 4 }

/**
 * T-0098 — sky brightens toward horizon: emissive layer through growing thickness (van Rhijn
 * 1921), attenuated by path extinction. Zenith palier unpainted: it's the fond `fillRect`.
 * T-0352 — paliers go through `peintLisse` reduced canvas, upscaled smoothed: gradient, not
 * rings. Reduction takes TWO paliers per pixel at screen centre (projection stretches them toward
 * edge, where halo is vivid). Zenith palier painted there like others: copy covers whole fond. No
 * `OffscreenCanvas`: paliers painted directly.
 */
export function dessineHaloHorizon(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  matriceCiel: Mat3,
  sbCiel: number,
): void {
  const bornes = bornesPaliersHalo()
  // Same reason as sol (`cleVue`): paliers = heights, fixed in site frame; only aim moves them on
  // screen.
  const cle = cleVue(projecteur)
  if (paliersCaches === null || paliersCaches.cle !== cle) {
    paliersCaches = {
      cle,
      frontieres: bornes.map((borne) =>
        frontiereEcran(projecteur, sousLaHauteur(borne, matriceCiel), BALAYAGE_HALO),
      ),
    }
  }
  const { frontieres } = paliersCaches
  const bSite = nanolamberts(sbCiel)
  const paliers = (cible: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => {
    // Highest palier to lowest: regions nest, last painted wins.
    for (let i = bornes.length - 2; i >= 0; i--) {
      const sb = sbDepuisNanolamberts(bSite * facteurHaloHorizon(hauteurRepresentative(i)))
      remplitRegion(cible, frontieres[i]!, fondRealiste(sb, sbCiel))
    }
  }
  const { largeurPx, hauteurPx, fovDeg } = projecteur.vue
  const palierPx = (bornes[0]! * largeurPx) / fovDeg
  const lisse = peintLisse(ctx, largeurPx, hauteurPx, 2 * palierPx, 'source-over', (reduite) => {
    reduite.fillStyle = fondRealiste(sbCiel)
    // To reduced canvas edge, margin incl.: unpainted pixel would be transparent.
    reduite.fillRect(0, 0, largeurPx + 2 * palierPx, hauteurPx + 2 * palierPx)
    paliers(reduite)
  })
  if (!lisse) paliers(ctx)
}

export interface LuneEcran {
  /** Lune right ascension, hours — same as the drawn body's. */
  readonly adH: number
  readonly decDeg: number
  readonly altitudeDeg: number
  readonly azimutDeg: number
  readonly anglePhaseDeg: number
  /** Apparent half-diameter, degrees: real disc size on sky. */
  readonly demiDiametreDeg: number
}

/** Lune gradient stops, from Lune to a quarter turn. */
const CRANS_HALO_LUNE = 16
const SEPARATION_MAX_DEG = 90

/** Unit vector orthogonal to `v`, chosen never to degenerate. */
export function perpendiculaire(v: Vec3): Vec3 {
  // Cross product with LEAST aligned axis: norm never under 1/√2.
  const axe: Vec3 =
    Math.abs(v.z) < Math.abs(v.x) ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
  const x = v.y * axe.z - v.z * axe.y
  const y = v.z * axe.x - v.x * axe.z
  const z = v.x * axe.y - v.y * axe.x
  const norme = Math.hypot(x, y, z)
  return { x: x / norme, y: y / norme, z: z / norme }
}

/**
 * Direction of `cible` seen from `v`, in tangent plane at `v`: unit, orthogonal to `v`. If `cible`
 * is `v` (or opposite), any orthogonal does.
 */
function versLeCentre(v: Vec3, cible: Vec3): Vec3 {
  const cos = v.x * cible.x + v.y * cible.y + v.z * cible.z
  const x = cible.x - cos * v.x
  const y = cible.y - cos * v.y
  const z = cible.z - cos * v.z
  const norme = Math.hypot(x, y, z)
  if (!(norme > Number.EPSILON)) return perpendiculaire(v)
  return { x: x / norme, y: y / norme, z: z / norme }
}

/** Body scattering its light into the sky: Lune or Sun. */
interface SourceHalo {
  readonly adH: number
  readonly decDeg: number
  readonly altitudeDeg: number
}

/**
 * T-0100 — body brightens sky around it, radially: `brillance(ρ)` = brightness added at
 * separation ρ, `bFond` = sky brightness under it, `teinte(b)` = fond colour raised by `b`.
 *
 * ponytail: screen radius of a separation measured in ONE direction, applied to whole circle.
 * Exact in stereographic aimed at the body, approximate elsewhere — a canvas gradient can't be a
 * conic.
 */
function dessineHalo(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  source: SourceHalo,
  bFond: number,
  brillance: (separationDeg: number) => number,
  teinte: (b: number, separationDeg: number) => string,
): void {
  const direction = versVecteur(source.adH * DEG_PAR_HEURE, source.decDeg)
  const centre = projecteur.projette(direction)
  if (centre === null) return
  // T-0356 — radius measured TOWARD aim centre: the halo side the screen shows. Any direction gave
  // a body at the edge of a wide field a huge radius, halo core covering whole screen.
  const perp = versLeCentre(direction, projecteur.inverse(projecteur.centreXPx, projecteur.centreYPx))

  // Screen radius of the largest stop: sets gradient scale.
  const rayonDe = (separationDeg: number): number | null => {
    const a = separationDeg * DEG
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const point = projecteur.projette({
      x: cos * direction.x + sin * perp.x,
      y: cos * direction.y + sin * perp.y,
      z: cos * direction.z + sin * perp.z,
    })
    return point === null ? null : Math.hypot(point.xPx - centre.xPx, point.yPx - centre.yPx)
  }
  const rayonMax = rayonDe(SEPARATION_MAX_DEG)
  if (rayonMax === null || !(rayonMax > 0)) return

  const degrade = ctx.createRadialGradient(centre.xPx, centre.yPx, 0, centre.xPx, centre.yPx, rayonMax)
  for (let k = 0; k <= CRANS_HALO_LUNE; k++) {
    const separation = (SEPARATION_MAX_DEG * k) / CRANS_HALO_LUNE
    const b = brillance(separation)
    // Opacity = body's SHARE of total brightness: where it dominates, composite fond = model's
    // exactly; where it fades, underlying layer (horizon paliers incl.) reappears intact. No
    // arbitrary threshold.
    const part = b / (bFond + b)
    const couleur = teinte(b, separation)
    const rvb = couleur.slice(couleur.indexOf('(') + 1, couleur.indexOf(')'))
    degrade.addColorStop(k / CRANS_HALO_LUNE, `rgb(${rvb} / ${part})`)
  }
  ctx.fillStyle = degrade
  ctx.fillRect(0, 0, projecteur.vue.largeurPx, projecteur.vue.hauteurPx)
}

/**
 * T-0100 — Lune brightens sky around it.
 *
 * ponytail: extinction height = Lune's, same over whole gradient. True term depends on EACH
 * direction's height, not constant on a separation circle; but halo matters where vivid, near
 * Lune, where that height is its own. To get halo right at 90° from it, paint a 2D field, not a
 * gradient.
 */
export function dessineHaloLune(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  sbCiel: number,
  lune: LuneEcran,
): void {
  const geometrie = (separationDeg: number): GeometrieLune => ({
    altitudeLuneDeg: lune.altitudeDeg,
    altitudeCibleDeg: lune.altitudeDeg,
    separationDeg,
    anglePhaseDeg: lune.anglePhaseDeg,
  })
  // `moon.ts` rule 1: Lune below horizon brightens nothing.
  if (lune.altitudeDeg <= 0) return
  const bSite = nanolamberts(sbCiel) * facteurHaloHorizon(lune.altitudeDeg)
  dessineHalo(
    ctx,
    projecteur,
    lune,
    bSite,
    (separation) => brillanceLuneNl(geometrie(separation)) * K('GAIN_RENDU_HALO_LUNE'),
    (b) => fondRealiste(sbDepuisNanolamberts(bSite + b), sbCiel),
  )
}

export interface SoleilEcran {
  /** Sun right ascension, hours — same as the drawn body's. */
  readonly adH: number
  readonly decDeg: number
  readonly altitudeDeg: number
}

/**
 * Sun brightens sky around it like Lune (T-0100), same KS91. `sbCiel` already counts Sun AT ZENITH
 * (`sbZenithAvecCrepuscule`): that term is removed from fond before adding halo, else Sun counts
 * twice. Same limits as Lune halo: body height for extinction, radius measured in one direction.
 *
 * T-0356 — fallback only: scène paints Sun sky per direction (`dessineCielSoleil`); this radial
 * gradient serves only without `OffscreenCanvas`. Disc reddened by Sun air mass, not sunset bands.
 */
export function dessineHaloSoleil(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  sbCiel: number,
  soleil: SoleilEcran,
): void {
  const bFond = Math.max(0, nanolamberts(sbCiel) - brillanceSoleilZenithNl(-soleil.altitudeDeg))
  const rougi = rougissement(soleil.altitudeDeg)
  const lueur = (separationDeg: number) => lueurSoleil(soleil.altitudeDeg, separationDeg)
  dessineHalo(
    ctx,
    projecteur,
    soleil,
    bFond,
    (separationDeg) => {
      const l = lueur(separationDeg)
      return l.rayleighNl + l.mieNl
    },
    (_b, separationDeg) => fondRealisteSoleil(bFond, lueur(separationDeg), rougi, sbCiel),
  )
}
