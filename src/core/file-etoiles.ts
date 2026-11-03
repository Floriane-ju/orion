/**
 * §9.3 — star-filé preview.
 *
 * 3 things must be EXACT (where most simulators cheat):
 *   1. THE PÔLE. Often outside cadre; forcing it into the image misleads cadrage in the field.
 *      App gives its real position (outside canvas if needed) and its direction from the visée.
 *   2. GEOMETRY. In rectilinéaire a déclinaison circle projects to a conic, not a circle;
 *      concentric circles = classic shortcut, wrong at 130° champ. Each arc = same star swept in
 *      angle horaire, projected by the §3.3 engine.
 *      T-0115 — exception stéréographique, where the circle is an IDENTITY: `MODE_PLANETARIUM`
 *      projects by 2/(1 + z), R = 2·tan(θ/2) from visée antipode; conformal → déclinaison
 *      circle projects to an exact circle. Warning above applies to rectilinéaire (`MODE_CADRE`)
 *      and équidistante (`MODE_FISHEYE`): polyline alone there.
 *   3. LENGTH varies as cos δ between stars in the same cadre.
 *
 * Also missed by most simulators: a trailing star is LESS BRIGHT PER PIXEL than a point star,
 * same flux spread over the whole trace.
 */

import { K } from '../registry/constants.ts'
import { nombre } from '../registry/ecriture.ts'
import { DEG, applique, rotationAutourDe, separationDeg, type Vec3 } from './mat3.ts'
import { pointEcran, porteeUtilePx, type PointEcran, type Projecteur, type Vue } from './projection.ts'
import { trace, type Traced } from './traced.ts'
import { DEMI_TOUR_DEG, ecartCourt, encadre, MIN_PAR_H, ramene, TOUR_RAD } from './unites.ts'

export interface PositionPole {
  /** **Must drive display**: out of cadre, arcs stay centred outside canvas. */
  readonly dansCadre: boolean
  /** Position in canvas. May be out of bounds, and stays so: nothing recentred. */
  readonly xPx: number | null
  readonly yPx: number | null
  readonly altitudeDeg: number
  readonly azimutDeg: number
}

/**
 * §9.3 — rotation-centre position. Celestial pole is fixed in local frame: altitude = site
 * latitude, azimut = true north in northern hemisphere.
 */
export function positionPole(
  projecteur: Projecteur,
  latitudeDeg: number,
  axePoleNord: Vec3,
): PositionPole {
  const nord = latitudeDeg >= 0
  const pole: Vec3 = nord
    ? axePoleNord
    : { x: -axePoleNord.x, y: -axePoleNord.y, z: -axePoleNord.z }
  const largeur = projecteur.vue.largeurPx
  const hauteur = projecteur.vue.hauteurPx
  const point = projecteur.projette(pole)
  const dansCadre =
    point !== null &&
    point.xPx >= 0 &&
    point.yPx >= 0 &&
    point.xPx <= largeur &&
    point.yPx <= hauteur

  return {
    dansCadre,
    xPx: point?.xPx ?? null,
    yPx: point?.yPx ?? null,
    altitudeDeg: Math.abs(latitudeDeg),
    azimutDeg: nord ? 0 : DEMI_TOUR_DEG,
  }
}

/** §9.3 — arc length, varies between stars in the same cadre. */
export function longueurArcDeg(dureeMin: number, decDeg: number): Traced<number> {
  return trace({
    value: K('ROTATION_CIEL_DEG_H') * (dureeMin / MIN_PAR_H) * Math.cos(decDeg * DEG),
    formula: 'ARC_FILE',
    inputs: { duree_min: dureeMin, dec_deg: decDeg },
    constants: ['ROTATION_CIEL_DEG_H'],
  })
}

/**
 * T-0115 — EXACT arc, stéréographique only. Radians, canvas frame: `debutRad` = start angle
 * from centre, `balayageRad` = signed extent, negative if arc turns counter-clockwise on screen.
 */
export interface ArcCercle {
  readonly xPx: number
  readonly yPx: number
  readonly rayonPx: number
  readonly debutRad: number
  readonly balayageRad: number
}

/** Bounding box of a trace, canvas pixels. */
export interface BoiteEcran {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export interface ArcFile {
  /** Polylines in pixels — several once the star leaves the cadre then returns. */
  readonly segments: readonly (readonly PointEcran[])[]
  /**
   * Exact circle arc when projection keeps one (T-0115): `segments` holds only the start
   * position; drawn via `ctx.arc`, not polyline.
   */
  readonly cercle: ArcCercle | null
  readonly longueurPx: number
  /** True when the star enters or leaves the champ during the sequence. */
  readonly tronque: boolean
  /**
   * Exact bounding box of the circle arc, `null` for polyline. Polyline bounds itself (breaks
   * its segment when a point leaves canvas); T-0115 exact circle goes to `ctx.arc` as one order,
   * whole sweep — a 17 000 px-radius circle touching nothing was painted in full. This box
   * allows rejecting it beforehand.
   */
  readonly boite: BoiteEcran | null
}

/**
 * Arc doesn't touch canvas (half stroke included): nothing to paint. Tests the box, never a
 * sweep sampling: box disjoint from canvas PROVES the arc absent, spaced points could miss a
 * corner. Arc whose box covers the screen without crossing is painted for nothing — price of
 * certainty, far below what it removes.
 */
export function arcInvisible(arc: ArcFile, vue: Vue, demiTraitPx: number): boolean {
  const b = arc.boite
  if (b === null) return false
  return (
    b.maxX < -demiTraitPx ||
    b.maxY < -demiTraitPx ||
    b.minX > vue.largeurPx + demiTraitPx ||
    b.minY > vue.hauteurPx + demiTraitPx
  )
}

/** Sub-arc of the sweep as `ArcCercle`: ready for `ctx.arc`. */
export interface SousArc {
  readonly debutRad: number
  readonly balayageRad: number
}

/** Does this circle point fall in the canvas widened by half stroke? */
function dansCanevas(
  cercle: ArcCercle,
  angleRad: number,
  vue: Vue,
  margePx: number,
): boolean {
  const x = cercle.xPx + cercle.rayonPx * Math.cos(angleRad)
  const y = cercle.yPx + cercle.rayonPx * Math.sin(angleRad)
  return (
    x >= -margePx &&
    y >= -margePx &&
    x <= vue.largeurPx + margePx &&
    y <= vue.hauteurPx + margePx
  )
}

/**
 * Sweep portions whose trace really touches canvas.
 *
 * T-0115 hands the arc to `ctx.arc` as one order, whole sweep: cheap to COMPUTE (5 projections,
 * not hundreds) but the rasteriser walks everything — a 17 000 px-radius circle with a tenth
 * crossing the screen was painted whole. The replaced polyline broke at the edge; this gives
 * the circle that back.
 *
 * Split EXACT, never sampled. A circle crosses the canvas edge only at angles where it cuts one
 * of the 4 supporting lines: between 2 consecutive crossings it is wholly in or out, midpoint
 * decides. Kept portion bounded by true crossings, not a sampling step that could shave a corner.
 */
export function arcsVisibles(
  cercle: ArcCercle,
  vue: Vue,
  margePx: number,
): readonly SousArc[] {
  const { rayonPx: r, xPx: cx, yPx: cy, debutRad, balayageRad } = cercle
  const etendue = Math.abs(balayageRad)
  if (etendue === 0 || r <= 0) return []
  const sens = balayageRad < 0 ? -1 : 1

  // Crossing angles of the 4 lines of the widened canvas, brought into the sweep. `coupures` =
  // ADVANCE along the sweep, not absolute angle: direction and multiple turns fold in, sorting
  // suffices.
  const coupures: number[] = [0, etendue]
  const ajoute = (angleRad: number): void => {
    for (let t = ramene((angleRad - debutRad) * sens, TOUR_RAD); t < etendue; t += TOUR_RAD) coupures.push(t)
  }
  for (const x of [-margePx, vue.largeurPx + margePx]) {
    const cos = (x - cx) / r
    if (cos >= -1 && cos <= 1) {
      const a = Math.acos(cos)
      ajoute(a)
      ajoute(-a)
    }
  }
  for (const y of [-margePx, vue.hauteurPx + margePx]) {
    const sin = (y - cy) / r
    if (sin >= -1 && sin <= 1) {
      const a = Math.asin(sin)
      ajoute(a)
      ajoute(Math.PI - a)
    }
  }
  coupures.sort((a, b) => a - b)

  const gardes: SousArc[] = []
  for (let i = 0; i < coupures.length - 1; i++) {
    const debut = coupures[i]!
    const fin = coupures[i + 1]!
    if (fin - debut <= 0) continue
    if (!dansCanevas(cercle, debutRad + sens * (debut + fin) / 2, vue, margePx)) continue
    const precedent = gardes[gardes.length - 1]
    // Touching kept portions form one paint order: unmerged, a circle crossing the screen end
    // to end would leave as four `ctx.arc`.
    if (precedent !== undefined && Math.abs(precedent.debutRad + precedent.balayageRad - (debutRad + sens * debut)) < Number.EPSILON * TOUR_RAD) {
      gardes[gardes.length - 1] = {
        debutRad: precedent.debutRad,
        balayageRad: precedent.balayageRad + sens * (fin - debut),
      }
    } else {
      gardes.push({ debutRad: debutRad + sens * debut, balayageRad: sens * (fin - debut) })
    }
  }
  return gardes
}

/**
 * Arc described by a star during accumulation. Camera fixed on ground, sky rotates: sweeping
 * angle horaire = rotating the star around the celestial pole in equatorial frame, image matrix
 * staying that of start instant. Projection code is §3.3's, no filé-specific geometry.
 */
/**
 * T-0024 — projected length of a polyline segment, pixels. Sagitta = c²/8R for chord c on
 * projected radius R: at 4 px chord, deviation from the conic < 1 px once radius > 2 px, i.e.
 * every visible arc. §9.3 fidelity held where judged.
 */
const PAS_ARC_PX = K('PAS_ARC_FILE_PX')
/** Pre-sampling segments estimating projected length before walking it. */
const PRE_ECHANTILLONS = K('PRE_ECHANTILLONS_ARC_FILE')

/**
 * Approximate projected arc length, or `null` if the star isn't projectable everywhere.
 * T-0111 — summed with `sqrt`, not `Math.hypot`: its overflow-safe scaling protects nothing on a
 * difference of 2 canvas abscissas, and was paid at every step of every arc.
 */
function longueurApprocheePx(
  projecteur: Projecteur,
  etoile: Vec3,
  balayageDeg: number,
  axePoleNord: Vec3,
): number | null {
  const rotation = rotationAutourDe(axePoleNord, -balayageDeg / PRE_ECHANTILLONS)
  let position = etoile
  let precedent = projecteur.projette(position)
  if (precedent === null) return null
  let longueur = 0
  for (let i = 0; i < PRE_ECHANTILLONS; i++) {
    position = applique(rotation, position)
    const point = projecteur.projette(position)
    if (point === null) return null
    const dx = point.xPx - precedent.xPx
    const dy = point.yPx - precedent.yPx
    longueur += Math.sqrt(dx * dx + dy * dy)
    precedent = point
  }
  return longueur
}

/**
 * T-0115 — projected positions enough for a stéréographique arc: start, quarters, middle, end.
 * 3 determine the circle, all 5 give the sweep.
 */
const ECHANTILLONS_CERCLE = K('ECHANTILLONS_CERCLE_FILE')
/**
 * Pass buffers hoisted out of the function (`pointEcran` pattern, T-0065): 5 positions + 4
 * deltas per star, thousands of stars/frame — dead arrays would stutter a pan.
 */
const xsCercle = new Float64Array(ECHANTILLONS_CERCLE)
const ysCercle = new Float64Array(ECHANTILLONS_CERCLE)
const ecartsCercle = new Float64Array(ECHANTILLONS_CERCLE - 1)

/** Is this angle crossed by the sweep? Bounds the arc, not the whole circle. */
function dansBalayage(angleRad: number, debutRad: number, balayageRad: number): boolean {
  const sens = balayageRad < 0 ? -1 : 1
  const depuisDebut = ramene((angleRad - debutRad) * sens, TOUR_RAD)
  return depuisDebut <= Math.abs(balayageRad)
}

/**
 * T-0115 — exact arc in stéréographique, or `null` when polyline needed.
 *
 * `MODE_PLANETARIUM` projects by 2/(1 + z): stéréographique from visée antipode, conformal,
 * keeps circles. The déclinaison circle swept by the star projects to an EXACT circle — 5
 * projections replace polyline's hundreds, nothing approximated. §9.3 geometry solved in
 * closed form, not relaxed.
 *
 * 2 fallbacks, same defect: a déclinaison circle grazing the visée antipode projects as a LINE
 * (infinite radius). Polyline takes over.
 */
function arcStereographique(
  projecteur: Projecteur,
  etoile: Vec3,
  balayageDeg: number,
  axePoleNord: Vec3,
): ArcFile | null {
  const [r11, r12, r13, r21, r22, r23, r31, r32, r33] = rotationAutourDe(
    axePoleNord,
    -balayageDeg / (ECHANTILLONS_CERCLE - 1),
  )
  const out = pointEcran()
  let px = etoile.x
  let py = etoile.y
  let pz = etoile.z
  for (let i = 0; i < ECHANTILLONS_CERCLE; i++) {
    if (i > 0) {
      const x = r11 * px + r12 * py + r13 * pz
      const y = r21 * px + r22 * py + r23 * pz
      const z = r31 * px + r32 * py + r33 * pz
      px = x
      py = y
      pz = z
    }
    // 1st fallback: a single non-projectable position → arc passes near the singularity. Polyline
    // cuts it there; a circle fitted on the others wouldn't.
    if (!projecteur.projetteEn(px, py, pz, out)) return null
    xsCercle[i] = out.xPx
    ysCercle[i] = out.yPx
  }

  // Circle through start, middle, end: 3 points determine a circle, no least-squares, no residual.
  const ax = xsCercle[0]!
  const ay = ysCercle[0]!
  const bx = xsCercle[2]!
  const by = ysCercle[2]!
  const cx = xsCercle[ECHANTILLONS_CERCLE - 1]!
  const cy = ysCercle[ECHANTILLONS_CERCLE - 1]!
  const det = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  // Coincident (zero duration) or aligned positions: no circle to draw.
  if (det === 0) return null
  const a2 = ax * ax + ay * ay
  const b2 = bx * bx + by * by
  const c2 = cx * cx + cy * cy
  const centreX = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / det
  const centreY = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / det
  const rayonPx = Math.sqrt((ax - centreX) ** 2 + (ay - centreY) ** 2)
  // 2nd fallback: beyond useful range radius diverges; circle = singularity neighbourhood
  // (§3.3), not a position. Threshold already exists, no new constant. `!(… <= …)` also
  // catches non-finite radius.
  if (!(rayonPx <= porteeUtilePx(projecteur.vue))) return null

  const debutRad = Math.atan2(ay - centreY, ax - centreX)
  let angleAvant = debutRad
  let vote = 0
  for (let i = 1; i < ECHANTILLONS_CERCLE; i++) {
    const angle = Math.atan2(ysCercle[i]! - centreY, xsCercle[i]! - centreX)
    const ecart = ecartCourt(angleAvant, angle, TOUR_RAD)
    ecartsCercle[i - 1] = ecart
    vote += ecart > 0 ? 1 : ecart < 0 ? -1 : 0
    angleAvant = angle
  }
  // Screen sweep may exceed half a turn: delta > 180° folds wrong way, drops a whole turn.
  // Direction from a VOTE: total sweep < full turn → only 1 of the 4 deltas can exceed 180°, the
  // other 3 decide. Each delta then brought into that direction.
  const sens = vote >= 0 ? 1 : -1
  let balayageRad = 0
  for (let i = 0; i < ECHANTILLONS_CERCLE - 1; i++) {
    const ecart = ecartsCercle[i]!
    balayageRad += ecart * sens < 0 ? ecart + sens * TOUR_RAD : ecart
  }

  // EXACT arc bounding box: both ends + those of the 4 circle extremes the sweep really crosses.
  // Tells whether trace leaves the cadre.
  let minX = Math.min(ax, cx)
  let maxX = Math.max(ax, cx)
  let minY = Math.min(ay, cy)
  let maxY = Math.max(ay, cy)
  for (let angle = 0; angle < TOUR_RAD; angle += Math.PI / 2) {
    if (!dansBalayage(angle, debutRad, balayageRad)) continue
    const x = centreX + rayonPx * Math.cos(angle)
    const y = centreY + rayonPx * Math.sin(angle)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  return {
    segments: [[{ xPx: ax, yPx: ay }]],
    cercle: { xPx: centreX, yPx: centreY, rayonPx, debutRad, balayageRad },
    // Arc length, not chord sum: decides disc vs stroke.
    longueurPx: rayonPx * Math.abs(balayageRad),
    tronque:
      minX < 0 || minY < 0 || maxX > projecteur.vue.largeurPx || maxY > projecteur.vue.hauteurPx,
    boite: { minX, minY, maxX, maxY },
  }
}

export function arcEtoile(
  projecteur: Projecteur,
  etoile: Vec3,
  dureeMin: number,
  axePoleNord: Vec3,
): ArcFile {
  const largeur = projecteur.vue.largeurPx
  const hauteur = projecteur.vue.hauteurPx
  const balayageDeg = K('ROTATION_CIEL_DEG_H') * (dureeMin / MIN_PAR_H)
  if (projecteur.vue.mode === 'MODE_PLANETARIUM') {
    const exact = arcStereographique(projecteur, etoile, balayageDeg, axePoleNord)
    if (exact !== null) return exact
  }
  const pasDeg = K('PAS_ANGLE_HORAIRE_FILE_DEG')
  // §9.3 reference step: 0,25° angle horaire = 481 positions at 480 min. Stays the FINEST step —
  // nothing gains from subdividing.
  const pasFin = Math.max(1, Math.ceil(balayageDeg / pasDeg))
  // T-0024 — a star 1° from pôle draws a few-pixel trace yet paid the same 481 steps as an
  // equator star crossing cadre. Count now follows PROJECTED length, where conic fidelity is
  // judged. Estimate impossible (star not projectable over sweep): keep fine step.
  const estimation = longueurApprocheePx(projecteur, etoile, balayageDeg, axePoleNord)
  const pas =
    estimation === null
      ? pasFin
      : encadre(Math.ceil(estimation / PAS_ARC_PX), 1, pasFin)
  // Elementary rotation around epoch celestial pole, step by step: angle horaire grows → apparent
  // ascension droite decreases equally.
  // T-0111 — matrix destructured here, product hand-written in loop: `applique` allocates a
  // vector per step (dead object per star position), a quarter of the pass. Operation order =
  // `applique`'s term for term: trajectory bit-identical.
  const [r11, r12, r13, r21, r22, r23, r31, r32, r33] = rotationAutourDe(
    axePoleNord,
    -balayageDeg / pas,
  )

  const segments: PointEcran[][] = []
  let courant: PointEcran[] = []
  let longueurPx = 0
  let tronque = false
  let precedentX = 0
  let precedentY = 0
  let precedent = false
  let px = etoile.x
  let py = etoile.y
  let pz = etoile.z
  // Single work point: only RETAINED positions become an object; non-projectable ones would cost
  // one only to be dropped.
  const out = pointEcran()

  for (let i = 0; i <= pas; i++) {
    if (i > 0) {
      const x = r11 * px + r12 * py + r13 * pz
      const y = r21 * px + r22 * py + r23 * pz
      const z = r31 * px + r32 * py + r33 * pz
      px = x
      py = y
      pz = z
    }
    const projetable = projecteur.projetteEn(px, py, pz, out)
    const xPx = out.xPx
    const yPx = out.yPx
    const dedans = projetable && xPx >= 0 && yPx >= 0 && xPx <= largeur && yPx <= hauteur
    if (projetable) {
      // Exiting point is kept: without it the trace would stop before the edge.
      courant.push({ xPx, yPx })
      if (precedent) {
        const dx = xPx - precedentX
        const dy = yPx - precedentY
        longueurPx += Math.sqrt(dx * dx + dy * dy)
      }
    }
    if (!dedans) {
      tronque = true
      if (courant.length > 0) segments.push(courant)
      courant = []
      precedent = false
    } else {
      precedentX = xPx
      precedentY = yPx
      precedent = true
    }
  }
  if (courant.length > 0) segments.push(courant)

  // No box: polyline bounded itself, segment by segment, breaking as soon as a point left canvas.
  return { segments, cercle: null, longueurPx, tronque, boite: null }
}

/**
 * §9.3 — time the star spends on its spot during the sequence. Trailing star is less bright per
 * pixel than a point star (same flux over whole trace): pose seen by a pixel = time the star
 * stays on its spot, not sequence duration; decides whether trace stands out from fond de ciel.
 * Extent = SPOT's (`tacheNpfArcsec`), not a pixel's: star spreads over several pixels and
 * accumulates full pose until it leaves its spot.
 */
export function poseParPixelS(dureeS: number, tacheArcsec: number, decDeg: number): number {
  // 1°/h = 1 arcsec/s: spot crossing time reads directly from its extent. NOT dependent on
  // sequence duration — longer filé lengthens trace, doesn't brighten it.
  const traverseeS = tacheArcsec / (K('ROTATION_CIEL_DEG_H') * Math.max(Math.cos(decDeg * DEG), Number.EPSILON))
  return Math.min(dureeS, traverseeS)
}

export interface EntreeCouvertureFile {
  readonly projecteur: Projecteur
  /** Drawn accumulation duration, minutes. Zero with suivi: no trace. */
  readonly dureeMin: number
  /** Canvas fraction the traces may paint (§9.3). */
  readonly couvertureMax: number
  /** Reference stroke width, pixels. */
  readonly largeurTraceRefPx: number
}

/**
 * §9.3 — T-0119: how many stars the sky can carry before filé stops being legible.
 *
 * Bound the PAINTED SURFACE, not star count. Past coverage 1 every sky pixel is repainted
 * several times: trace has no visible length, planétarium fond de ciel vanishes beneath, paint
 * time spent erasing what was just painted.
 *
 * Counts CROSSINGS, not stars. A pixel is painted as often as a star passes it during the
 * sequence: crossings/pixel = `star density × trace angular width × path travelled` =
 * `n · w · ωT·cos δ`; mean canvas coverage = mean of that over canvas. Inverted → sky population
 * the target coverage allows.
 *
 * Makes the cap STABLE, 3 pitfalls vanish:
 *   - **Visée tilt.** Cap on arc length at champ centre collapses aiming at pôle (cos δ → 0:
 *     central trace tiny, yet champ holds the rest of the sky). Here cos δ averaged OVER THE
 *     CANVAS: polar visée counts its edge's long traces.
 *   - **Projection stretch.** Trace angular width from the LOCAL scale at each sample: in
 *     plein-ciel stéréographique radial factor diverges to the edge, a single scale is off ×3.
 *   - **Stars outside champ.** Crossings count what passes, not what is there at first instant.
 *     Half the traces of an 8-hour filé come from stars not yet in champ; a membership model
 *     forgets them.
 *
 * Returns `+Infinity` when no trace to bound — suivi active, or pose so short coverage is
 * negligible. Caller reads "no cap", not "huge cap".
 */
export function effectifCielPourCouverture(entree: EntreeCouvertureFile): number {
  const balayageRad = longueurArcDeg(entree.dureeMin, 0).value * DEG
  if (balayageRad <= 0 || entree.largeurTraceRefPx <= 0) return Infinity

  const { projecteur } = entree
  const cotes = K('ECHANTILLONS_COUVERTURE_FILE')
  let somme = 0
  let retenus = 0
  for (let i = 0; i < cotes; i++) {
    for (let j = 0; j < cotes; j++) {
      // Samples at CELL CENTRES of a grid: edges not counted twice, and the corner (where
      // stéréographique scale diverges most) doesn't dominate the mean alone.
      const xPx = ((i + 1 / 2) / cotes) * projecteur.vue.largeurPx
      const yPx = ((j + 1 / 2) / cotes) * projecteur.vue.hauteurPx
      const direction = projecteur.inverse(xPx, yPx)
      // LOCAL scale, rad/px: angular separation between 2 directions 1 px apart → trace angular
      // width there.
      const radParPx = separationDeg(direction, projecteur.inverse(xPx + 1, yPx)) * DEG
      if (!Number.isFinite(radParPx) || radParPx <= 0) continue
      // `z` = polar component of J2000 direction, same frame as per-pixel pose: arcsin =
      // déclinaison, so `cos δ` = norm of equatorial part. Precession from J2000 = few arcmin, no
      // effect on a mean setting a render cap.
      const cosDec = Math.hypot(direction.x, direction.y)
      somme += cosDec * radParPx * entree.largeurTraceRefPx
      retenus++
    }
  }
  if (retenus === 0) return Infinity
  const solideMoyenParEtoile = (somme / retenus) * balayageRad
  if (solideMoyenParEtoile <= 0) return Infinity
  // `couverture = (N / 4π) × solid angle swept per star`, inverted on N.
  return (entree.couvertureMax * 2 * TOUR_RAD) / solideMoyenParEtoile
}

export interface EntreeDiagnosticFile {
  readonly projecteur: Projecteur
  readonly latitudeDeg: number
  /** J2000 direction of the north celestial pole of displayed epoch (§3.1). */
  readonly axePoleNord: Vec3
  readonly dureeMin: number
  /** Extreme déclinaisons present in the cadre (§9.1). */
  readonly decMinAbsDeg: number
  readonly decMaxAbsDeg: number
  /** Height of the champ covered by the cadre, degrees. */
  readonly hauteurCadreDeg: number
}

export interface DiagnosticFile {
  readonly pole: PositionPole
  /** Longest cadre arc: that of the smallest absolute déclinaison. */
  readonly longueurArcMaxDeg: Traced<number>
  readonly longueurArcMinDeg: Traced<number>
  /** Share of cadre height covered by the longest arc. */
  readonly fractionHauteurCadre: number
  readonly messages: readonly string[]
}

export function diagnosticFile(entree: EntreeDiagnosticFile): DiagnosticFile {
  const pole = positionPole(entree.projecteur, entree.latitudeDeg, entree.axePoleNord)
  const longueurArcMaxDeg = longueurArcDeg(entree.dureeMin, entree.decMinAbsDeg)
  const longueurArcMinDeg = longueurArcDeg(entree.dureeMin, entree.decMaxAbsDeg)
  const fractionHauteurCadre = longueurArcMaxDeg.value / entree.hauteurCadreDeg

  const messages: string[] = []
  const pourcent = nombre(fractionHauteurCadre * 100, 0)
  // T-0374 — threshold on what the eye sees (cadre share the arc crosses), not a duration: at
  // long focale 20 min already make a filé; at fisheye an hour doesn't always.
  if (fractionHauteurCadre < K('FRACTION_CADRE_FILE_LISIBLE')) {
    messages.push(
      `Traînées courtes (${pourcent} % du cadre) : des étoiles étirées plutôt qu’un filé.`,
    )
  }

  return { pole, longueurArcMaxDeg, longueurArcMinDeg, fractionHauteurCadre, messages }
}
