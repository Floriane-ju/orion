/**
 * §3.3 — unified render engine. ONE ENGINE, THREE MODES: planétarium (§3), field preview (§9.2),
 * filé (§9.3) all go through `projecteur()`; mode changes only radial function R(θ). Two
 * codebases → planétarium frame ≠ preview: invisible in dev, fatal in the field.
 *   MODE_PLANETARIUM  stereographic   R = 2·tan(θ/2)   conformal, field 1° to 180°
 *   MODE_CADRE        gnomonic        R = tan(θ)       rectilinear lens projection
 *   MODE_FISHEYE      equidistant     R = θ            fisheye lenses (§5.1)
 * First two need no transcendental function: unit vector (X, Y, Z) in view frame gives
 * R/sin(θ) = 1/Z (gnomonic), 2/(1 + Z) (stereographic) → constant per-star cost.
 */

import { K } from '../registry/constants.ts'
import { nombre } from '../registry/ecriture.ts'
import { mLimOeilBorne } from '../registry/bortle.ts'
import { mLimOeilCielClair } from './seuil-oeil.ts'
import { DEG, multiplie, transpose, type Mat3, type Vec3 } from './mat3.ts'
import { trace, type Traced } from './traced.ts'

export type ModeProjection = 'MODE_PLANETARIUM' | 'MODE_CADRE' | 'MODE_FISHEYE'

export interface Vue {
  readonly mode: ModeProjection
  /** Horizontal field, degrees. */
  readonly fovDeg: number
  readonly largeurPx: number
  readonly hauteurPx: number
  /** Aim centre, site horizontal coordinates. */
  readonly azimutDeg: number
  readonly hauteurDeg: number
  /** View roll, degrees. */
  readonly rotationDeg: number
  /**
   * T-0258 — render-pixel offset aim centre ↔ canvas middle. Canvas spans the shell but two
   * always-open surfaces overlay it (view rail left, séance panel right): aiming at canvas middle
   * put aim under the panel → focal changed unseen, forbidden by §11.3. Absent: aim centered, as
   * offscreen views want (§9.2, §9.3).
   */
  readonly decalageCentreXPx?: number
}

export interface PointEcran {
  readonly xPx: number
  readonly yPx: number
}

/**
 * T-0065 — same point, written in place. Render pass reuses one per frame: else `projette`
 * allocates per star and polyline, GC shows as pan jitter (invisible in mean fps, visible to eye).
 * T-0111 — projected point carries pixels only. Angular distance to aim centre dropped: its
 * `atan2` cost a third of the filé pass for one reader called once per frame. Measure between
 * DIRECTIONS with `separationDeg`.
 */
export interface PointEcranMut {
  xPx: number
  yPx: number
}

/** Render-pass work point, hoisted out of the filling loop. */
export function pointEcran(): PointEcranMut {
  return { xPx: 0, yPx: 0 }
}

/**
 * View frame: x screen right, y up, z toward aim centre. No zenith singularity: azimuth = roll.
 */
export function matriceVue(azimutDeg: number, hauteurDeg: number, rotationDeg: number): Mat3 {
  const a = azimutDeg * DEG
  const h = hauteurDeg * DEG
  const r = rotationDeg * DEG
  const cosR = Math.cos(r)
  const sinR = Math.sin(r)

  const droite: Vec3 = { x: -Math.sin(a), y: Math.cos(a), z: 0 }
  const haut: Vec3 = {
    x: -Math.sin(h) * Math.cos(a),
    y: -Math.sin(h) * Math.sin(a),
    z: Math.cos(h),
  }
  const centre: Vec3 = {
    x: Math.cos(h) * Math.cos(a),
    y: Math.cos(h) * Math.sin(a),
    z: Math.sin(h),
  }
  return [
    droite.x * cosR + haut.x * sinR,
    droite.y * cosR + haut.y * sinR,
    droite.z * cosR + haut.z * sinR,
    -droite.x * sinR + haut.x * cosR,
    -droite.y * sinR + haut.y * cosR,
    -droite.z * sinR + haut.z * cosR,
    centre.x,
    centre.y,
    centre.z,
  ]
}

/** Projected radius of an angle from centre, projection units (θ radians). */
export function rayonProjete(mode: ModeProjection, thetaRad: number): number {
  if (mode === 'MODE_CADRE') return Math.tan(thetaRad)
  if (mode === 'MODE_FISHEYE') return thetaRad
  return 2 * Math.tan(thetaRad / 2)
}

/**
 * Inverse of `rayonProjete`. A click crosses it once, never a star.
 * T-0220 — equidistant bounded at antipode: R > π = no sky; 190° would silently name 170° opposite.
 */
export function angleProjete(mode: ModeProjection, rayon: number): number {
  if (mode === 'MODE_CADRE') return Math.atan(rayon)
  if (mode === 'MODE_FISHEYE') return Math.min(rayon, Math.PI)
  return 2 * Math.atan(rayon / 2)
}

/**
 * View-frame direction of a projection-plane point (u, v in R units). Common inverse of click
 * (§3.3) and hardware frame (§3.5, §9.1): fisheye frame inverts as equidistant, not gnomonic
 * (T-0219).
 */
export function directionDuPlan(mode: ModeProjection, u: number, v: number): Vec3 {
  const rayon = Math.hypot(u, v)
  if (rayon <= Number.EPSILON) return { x: 0, y: 0, z: 1 }
  const theta = angleProjete(mode, rayon)
  const sin = Math.sin(theta)
  return { x: (sin * u) / rayon, y: (sin * v) / rayon, z: Math.cos(theta) }
}

/** Pixel scale: requested horizontal field fills canvas width exactly. */
export function echelleProjection(vue: Vue): number {
  return vue.largeurPx / 2 / rayonProjete(vue.mode, (vue.fovDeg / 2) * DEG)
}

/**
 * T-0258 — canvas point where aimed direction lands: middle shifted toward free sky. Single
 * source; anything reading "the centre" goes through it or the projecteur republishing it, else
 * aim sentence and image name different points.
 */
function centreViseePx(vue: Vue): PointEcran {
  return {
    xPx: vue.largeurPx / 2 + (vue.decalageCentreXPx ?? 0),
    yPx: vue.hauteurPx / 2,
  }
}

/**
 * Radius, degrees from aim centre, of the sky cap the canvas shows, corner included. Domain shared
 * by star selection (§3.3), Voie lactée segment gap (§3.7), filé budget (§9.3): one computation,
 * else three definitions of one field.
 * Via R(θ) and inverse, never `(fov / 2) × diagonal`: small-angle approx UNDERESTIMATES the field
 * as it opens, too-small cap erases visible geometry (at 170° borders vanished at edge, T-0110).
 * That needed an arbitrary cap to stay within the sky; exact inverse doesn't: no radial function
 * exceeds 180° in its domain.
 */
export function rayonChampDeg(vue: Vue): number {
  // T-0258 — offset centre isn't equidistant from both edges: the farther sets the field. Keeping
  // half-width would erase opposite-edge geometry (T-0110 defect).
  const centreX = centreViseePx(vue).xPx
  const demiLargeurPx = Math.max(centreX, vue.largeurPx - centreX)
  const rayonCoin =
    (rayonProjete(vue.mode, (vue.fovDeg / 2) * DEG) *
      Math.hypot(demiLargeurPx, vue.hauteurPx / 2)) /
    (vue.largeurPx / 2)
  return angleProjete(vue.mode, rayonCoin) / DEG
}

/**
 * §8.4 / T-0324 — field needed so a cap of radius `rayonDeg` around aim fits ENTIRELY in canvas.
 * Partial inverse of `rayonChampDeg`, opposite end: that one measures the corner, this one the
 * NEAREST edge. `fovDeg` = horizontal field (fills width, `echelleProjection`) but canvas is wider
 * than tall and aim offset (T-0258): sizing on width lets content exit top and bottom.
 * Via R(θ) and inverse, never rule of three on degrees (small-angle approx, chased out by T-0110).
 */
export function fovPourRayonDeg(vue: Vue, rayonDeg: number): number {
  const centreX = centreViseePx(vue).xPx
  const demiCotePx = Math.min(centreX, vue.largeurPx - centreX, vue.hauteurPx / 2)
  if (demiCotePx <= 0) return vue.fovDeg
  const rayonBord = (rayonProjete(vue.mode, rayonDeg * DEG) * (vue.largeurPx / 2)) / demiCotePx
  return (2 * angleProjete(vue.mode, rayonBord)) / DEG
}

/**
 * Useful reach of a projected point, in canvas diagonals, pixels for a given view.
 * Beyond, a position isn't one: near projection singularity radial factor diverges; neighbour
 * polyline vertices land tens of thousands of px apart and their chord CROSSES the image (phantom
 * line, mesh covering what it should border). Declared unprojectable like formula refusals:
 * outside displayed field of several screens.
 */
export function porteeUtilePx(vue: Vue): number {
  return K('PORTEE_PROJECTION_DIAGONALES') * Math.hypot(vue.largeurPx, vue.hauteurPx)
}

export interface Projecteur {
  readonly vue: Vue
  /** J2000 equatorial → view frame. One matrix per frame (§3.1). */
  readonly matrice: Mat3
  readonly echelle: number
  /**
   * T-0258 — canvas point of aimed direction. Republished so nothing recomputes it: `largeurPx / 2`
   * elsewhere = second centre.
   */
  readonly centreXPx: number
  readonly centreYPx: number
  /** `null` when direction unprojectable: never a point at infinity. */
  projette(v: Vec3): PointEcran | null
  /**
   * Same projection, no allocation: scalars in, result written to `out`; `false` if unprojectable.
   * Hot-loop form; `projette` merely wraps it so the two can't diverge (§3.3).
   */
  projetteEn(x: number, y: number, z: number, out: PointEcranMut): boolean
  /** J2000 direction under a screen point, for mouse picking. */
  inverse(xPx: number, yPx: number): Vec3
}

/**
 * Composes frame matrix, returns projecteur. `matriceCiel`: J2000 equatorial → site horizontal;
 * view matrix chains to screen.
 */
export function projecteur(vue: Vue, matriceCiel: Mat3): Projecteur {
  const matrice = multiplie(matriceVue(vue.azimutDeg, vue.hauteurDeg, vue.rotationDeg), matriceCiel)
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = matrice
  const inverseMatrice = transpose(matrice)
  const k = echelleProjection(vue)
  const { xPx: centreX, yPx: centreY } = centreViseePx(vue)
  const mode = vue.mode
  // Compared squared: no sqrt per star (T-0065).
  const porteeCarree = porteeUtilePx(vue) ** 2
  // T-0220 — equidistant has no singularity at infinity: antipode projects onto whole circle R = π.
  // Pixel reach stops nothing → bound is angular.
  const thetaMaxEquidistante = Math.PI - K('MARGE_ANTIPODE_EQUIDISTANTE_DEG') * DEG

  // Named closure, not method: `projette` calls it without `this` → destructured projecteur
  // behaves the same.
  const projetteEn = (vx: number, vy: number, vz: number, out: PointEcranMut): boolean => {
    const x = m11 * vx + m12 * vy + m13 * vz
    const y = m21 * vx + m22 * vy + m23 * vz
    const z = m31 * vx + m32 * vy + m33 * vz

    // R/sin(θ) factor, never divides by zero in its domain. Outside: unprojectable → false, not a
    // point at infinity (§3.3, last criterion).
    let facteur: number
    if (mode === 'MODE_CADRE') {
      if (z <= Number.EPSILON) return false
      facteur = 1 / z
    } else if (mode === 'MODE_PLANETARIUM') {
      if (1 + z <= Number.EPSILON) return false
      facteur = 2 / (1 + z)
    } else {
      // `sqrt` not `hypot`: `Math.hypot` rescales against overflow unit directions can't produce,
      // paid at every arc point (T-0111).
      const s = Math.sqrt(x * x + y * y)
      if (s <= Number.EPSILON) {
        out.xPx = centreX
        out.yPx = centreY
        return true
      }
      const theta = Math.atan2(s, z)
      if (theta > thetaMaxEquidistante) return false
      facteur = theta / s
    }
    const xPx = centreX + k * facteur * x
    const yPx = centreY - k * facteur * y
    if ((xPx - centreX) ** 2 + (yPx - centreY) ** 2 > porteeCarree) return false
    out.xPx = xPx
    out.yPx = yPx
    return true
  }

  return {
    vue,
    matrice,
    echelle: k,
    centreXPx: centreX,
    centreYPx: centreY,
    projetteEn,
    projette(v: Vec3): PointEcran | null {
      const out = pointEcran()
      return projetteEn(v.x, v.y, v.z, out) ? out : null
    },
    inverse(xPx: number, yPx: number): Vec3 {
      const vueVec = directionDuPlan(mode, (xPx - centreX) / k, (centreY - yPx) / k)
      const [i11, i12, i13, i21, i22, i23, i31, i32, i33] = inverseMatrice
      return {
        x: i11 * vueVec.x + i12 * vueVec.y + i13 * vueVec.z,
        y: i21 * vueVec.x + i22 * vueVec.y + i23 * vueVec.z,
        z: i31 * vueVec.x + i32 * vueVec.y + i33 * vueVec.z,
      }
    },
  }
}

// Catalogue depth tied to zoom

/**
 * §3.3 — mag_limite = mag_base + 5 × log10(fov_ref / fov_courant), reduced slope when zooming out.
 * TRIAL — §3.3 formula empties the sky zoomed out: 180° field → magnitude 4.1, 212 stars, just
 * when user zooms out to orient. Floor at mag_base keeps 3 335, too costly to draw.
 * Beyond reference field: ONE Pogson coefficient instead of two — 2.5 mag per field decade
 * instead of 5: magnitude 5.3, 850 stars at 180° (4x PRD, 4x fewer than floor). Zoom in keeps §3.3
 * slope.
 * Deliberate PRD deviation, to validate before keeping.
 */
export function magnitudeLimite(fovDeg: number): Traced<number> {
  // PRD's "5" = 2 × Pogson coefficient (5 mag per flux ratio 100). Derived, not hardcoded (§2.1).
  const decades = Math.log10(K('FOV_REFERENCE_RENDU_DEG') / fovDeg)
  const coefficients = decades < 0 ? 1 : 2
  return trace({
    value: K('MAG_BASE_RENDU') + coefficients * K('POGSON') * decades,
    formula: 'MAGNITUDE_LIMITE_ZOOM',
    inputs: { fov_deg: fovDeg },
    constants: ['MAG_BASE_RENDU', 'FOV_REFERENCE_RENDU_DEG', 'POGSON'],
  })
}

/**
 * Realistic view: EFFECTIVE fond de ciel caps displayed depth; render shows sky as seen, not full
 * catalogue (§3.3).
 * T-0100 — parameter = sky brightness, not naked-eye limiting magnitude: capping on resolved
 * `mLimOeil` capped nothing when `null` ("out of table") → sky BRIGHTER than Bortle 9 under Moon
 * showed more stars than suburbs. Brightness says which side of the table was left;
 * `mLimOeilBorne` clamps to the edge and declares it.
 */
export function magnitudeRendue(
  fovDeg: number,
  sbEffectif: number | null,
  vueRealiste: boolean,
): Traced<number> {
  const zoom = magnitudeLimite(fovDeg)
  if (!vueRealiste || sbEffectif === null) return zoom
  const borne = mLimOeilBorne(sbEffectif)
  // T-0357 — brighter than table = twilight or Moon: Schaefer threshold takes over, not a limit
  // frozen at the edge (sunset lit all stars to magnitude 4 at once).
  const oeil =
    borne.borne === 'CIEL_PLUS_CLAIR' && Number.isFinite(sbEffectif)
      ? { ...borne, value: mLimOeilCielClair(sbEffectif) }
      : borne
  const horsTable =
    oeil.borne === 'AUCUNE'
      ? ''
      : oeil.borne === 'CIEL_PLUS_CLAIR'
        ? ` Ciel plus clair que Bortle 9 : seuil de Schaefer, limite ${nombre(oeil.value, 1)}.`
        : ` Ciel plus noir que Bortle 1 : limite fixée à ${nombre(oeil.value, 1)}.`
  return trace({
    value: Math.min(zoom.value, oeil.value),
    formula: 'MAGNITUDE_LIMITE_RENDUE',
    inputs: { mag_limite_zoom: zoom.value, sb_effectif: sbEffectif, m_lim_oeil: oeil.value },
    ...(oeil.borne === 'AUCUNE' ? {} : { flags: ['HORS_DOMAINE'] as const }),
    note:
      'Vue réaliste : seules les étoiles visibles depuis ce ciel sont affichées.' + horsTable,
  })
}

export interface BornesZoom {
  readonly fovMinDeg: number
  readonly fovMaxDeg: number
  /** Set when zoom floor comes from missing Gaia packet (§3.3). */
  readonly cause?: string
}

/**
 * T-0095 — field cap belongs to the projection, not the view.
 * Gnomonic R = tan(θ): pixel scale (width/2) / R(fov/2) → 0 as fov → 180°, whole sky collapses on
 * centre pixel. Nothing crashes — why the defect is costly.
 * Stereographic diverges only at 360°: its cap was never §3.3's, it was gnomonic's applied to all
 * modes → 300° (whole sky minus a 60° cap fits). Equidistant also 300° (T-0220): VIEW field ≠ lens
 * field, bounded apart by §5.1 (`CHAMP_MAX_FISHEYE_DEG`); zooming out around frame helps
 * orientation.
 */
export function fovMaxSelonMode(mode: ModeProjection): number {
  if (mode === 'MODE_CADRE') return K('FOV_MAX_GNOMONIQUE_DEG')
  if (mode === 'MODE_PLANETARIUM') return K('FOV_MAX_STEREOGRAPHIQUE_DEG')
  return K('FOV_MAX_EQUIDISTANTE_DEG')
}

/** §3.3 — without Gaia packet, app floors zoom at 15° field and declares it. */
export function bornesZoom(gaiaCharge: boolean, mode: ModeProjection): BornesZoom {
  const fovMaxDeg = fovMaxSelonMode(mode)
  if (gaiaCharge) return { fovMinDeg: K('FOV_MIN_AVEC_GAIA_DEG'), fovMaxDeg }
  return {
    fovMinDeg: K('FOV_MIN_SANS_GAIA_DEG'),
    fovMaxDeg,
    cause:
      `Zoom limité à ${K('FOV_MIN_SANS_GAIA_DEG')}° de champ : sous cette borne, le ` +
      'catalogue d’étoiles embarqué laisserait le ciel presque vide.',
  }
}

export interface EtatProfondeur {
  readonly magLimite: Traced<number>
  /** Faintest magnitude actually present in loaded catalogue. */
  readonly profondeurCatalogue: number
  readonly catalogueEpuise: boolean
  readonly cause?: string
}

/**
 * §3.3 — `catalogue_epuise` must be displayed. Under loaded-catalogue bound, §9.2 generative seed
 * would complete the render, ALWAYS declared; until it exists, app declares the gap rather than
 * invent stars.
 */
export function etatProfondeur(
  fovDeg: number,
  profondeurCatalogue: number,
  sbEffectif: number | null,
  vueRealiste: boolean,
): EtatProfondeur {
  const magLimite = magnitudeRendue(fovDeg, sbEffectif, vueRealiste)
  const epuise = magLimite.value > profondeurCatalogue
  return {
    magLimite,
    profondeurCatalogue,
    catalogueEpuise: epuise,
    ...(epuise
      ? {
          cause:
            `Le catalogue s’arrête à la magnitude ${nombre(profondeurCatalogue, 1)} : le ciel ` +
            'paraît plus pauvre qu’en vrai, et rien n’est inventé pour le combler.',
        }
      : {}),
  }
}

/** §3.3 — star render radius, model shared with §9.2 preview. */
export function rayonEtoilePx(magV: number): number {
  return (
    K('RAYON_ETOILE_R0_PX') *
    K('BASE_MAGNITUDE') ** (-K('COEF_RAYON_MAGNITUDE') * (magV - K('MAG_REFERENCE_RAYON')))
  )
}

// No §10.2 trace for radius: canvas-drawn stars, nothing unfolds. Formula `RAYON_ETOILE` stays in
// Annexe B (T-0063).
