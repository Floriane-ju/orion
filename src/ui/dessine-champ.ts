/**
 * §9.2, §9.3 — render pass of champ preview and filé.
 * TWO LAYERS, one projection engine (§3.3): 1 real catalogue, 2 generative semis beyond
 * catalogued threshold.
 * One primitive draws stars, point or filées: §9.3 arc swept over accumulation duration. Too-long
 * pose unitaire → ovalized star, same code as 4 h filé.
 * T-0116 — pass paints no fond/galactic band, no longer tightens on cadre: draws ON scène canvas,
 * whole surface, between sol and repères. Planétarium already painted real fond (§3.7, horizon
 * halo, Lune halo, crépuscule) and Voie lactée (§3.6); repainting would erase or double with
 * another teinte. Only pose-added traces specific here. Rotation centre no longer marked: arcs
 * designate it, position stays in panel diagnostic.
 */

import { K } from '../registry/constants.ts'
import {
  arcEtoile,
  arcInvisible,
  arcsVisibles,
  effectifCielPourCouverture,
  longueurArcDeg,
} from '../core/file-etoiles.ts'
import {
  opaciteEtoile,
  profondeurPourZ,
  tableProfondeurParPixel,
  type EntreeProfondeur,
} from '../core/galactique.ts'
import type { IndexCiel } from '../core/index-ciel.ts'
import { fondLune, opaciteSousLuneXYZ, type FondLune, type LuneFile } from '../core/fond-lune-file.ts'
import { magnitudePourEffectif, selectionne } from '../core/index-ciel.ts'
import { rayonChampDeg, rayonEtoilePx, type Projecteur } from '../core/projection.ts'
import { angleDeSinDeg, DEG, separationDeg, type Vec3 } from '../core/mat3.ts'
import { TEINTES, couleurTeinteOpacite, teinte } from './couleurs.ts'
import { DEMI_TOUR_DEG, encadre, QUART_TOUR_DEG as DROIT, S_PAR_MIN, TOUR_RAD } from '../core/unites.ts'
import { RAYON_MIN_ETOILE_PX } from './apparence-objets.ts'

/**
 * What pass holds from matériel and §9 settings: all that does NOT depend on current frame. React
 * computes and publishes it; vue, projecteur, pole axis belong to the painted frame (T-0116).
 */
export interface ParametresFile {
  /** Depth reached by pose unitaire (§9.2): catalogue selection bound. */
  readonly magLimite: number
  /** Depth inputs, re-evaluated per star with its real per-pixel pose (§9.3). */
  readonly profondeur: EntreeProfondeur
  /** Stellar blob extent, arcsec: sets per-pixel pose. */
  readonly tacheArcsec: number
  /**
   * T-0400 — site sky background, mag/arcsec², source of `profondeur.eCielPxS`. Lune gêne relates
   * to it (B_lune / B_site) to brighten this flux per direction.
   */
  readonly sbSiteMag: number
  /** Suivi active (§5.2): stars stay points, pixel gets whole pose. */
  readonly suiviActif: boolean
  /** Accumulation duration drawn: pose unitaire in preview, total duration in filé. */
  readonly dureeS: number
  /**
   * T-0119 — LISIBILITÉ cap: canvas share traces may paint; `null` = no trace length readable
   * (champ preview: points, no overlap). Registre in real use; bench opens it on CLI (measurement
   * tunes it; `null` must reproduce pre-cap image, so « only cap changed » is verified).
   */
  readonly couvertureMax: number | null
  /**
   * T-0119 — COST cap: max whole-sky stars kept, `null` = unbounded. Two quantities, two fields:
   * coverage bounds what image shows, effectif what pass reads. Champ preview has only the second
   * (PROFONDEUR screen, points don't overlap) but reading 180000 stars/frame cost 160 ms.
   */
  readonly effectifMax: number | null
}

export interface EntreeDessinChamp extends ParametresFile {
  /** Real catalogue: layer 1, exact positions up to catalogued threshold. */
  readonly indexReel: IndexCiel
  /** Generative semis: layer 2, beyond threshold. */
  readonly indexSemis: IndexCiel
  readonly ctx: CanvasRenderingContext2D
  readonly projecteur: Projecteur
  /** J2000 direction of epoch north celestial pole: exact arc centre (§9.3). */
  readonly axePoleNord: Vec3
  readonly modeNuit: boolean
  /**
   * T-0400 — Lune retained for séance, vue réaliste: brightens each pixel's fond by separation,
   * faint traces vanish first. Absent: site fond alone.
   */
  readonly lune?: LuneFile | null | undefined
}

export interface SortieDessinChamp {
  readonly etoilesReelles: number
  readonly etoilesGenerees: number
  /**
   * Stars read by selection, drawn or not. Tells pass cost, not drawn count (else selection gain
   * told not measured; T-0021).
   */
  readonly etoilesVisitees: number
  /**
   * T-0119 — canvas share painted by traces: the quantity the cap bounds (else tuning
   * `COUVERTURE_TRACES_MAX` told not measured). Sum of VISIBLE lengths (off-canvas ones cost,
   * hide nothing). May exceed 1: wanted.
   */
  readonly couverturePeinte: number
}

/**
 * Stars awaiting paint, grouped by shared path.
 * T-0119 — champ preview painted 16000 stars in 36000 draw orders, each preceded by writes of
 * `globalAlpha`, `fillStyle`, `strokeStyle`, `lineWidth`: cost = ORDER COUNT, not calc.
 * `dessineCiel` solved it for point stars (one `Path2D` per teinte); this adds opacity and stroke
 * width axes. Two families (canvas primitives): Disc: filled, radius in geometry → key (teinte,
 * opacité). Trace: stroked, shared path has one width → key (teinte, opacité, rayon). Paths
 * allocated on demand (scène with 3 teintes doesn't pay for others).
 */
interface EnAttente {
  readonly disques: (Path2D | undefined)[]
  readonly traces: (Path2D | undefined)[]
  readonly niveauxOpacite: number
  readonly niveauxRayon: number
  /** Radius of brightest star in packet: upper bound of paliers. */
  readonly rayonMaxPx: number
}

function enAttente(rayonMaxPx: number): EnAttente {
  const niveauxOpacite = K('NIVEAUX_OPACITE_ETOILE')
  const niveauxRayon = K('NIVEAUX_RAYON_ETOILE')
  return {
    disques: Array.from({ length: TEINTES * niveauxOpacite }, () => undefined),
    traces: Array.from({ length: TEINTES * niveauxOpacite * niveauxRayon }, () => undefined),
    niveauxOpacite,
    niveauxRayon,
    rayonMaxPx: Math.max(RAYON_MIN_ETOILE_PX * (1 + Number.EPSILON), rayonMaxPx),
  }
}

/** Opacity snapped to its palier: palier decides path, hence draw order. */
function palierOpacite(opacite: number, niveaux: number, plancher: number): number {
  const relatif = (opacite - plancher) / (1 - plancher)
  return encadre(Math.round(relatif * (niveaux - 1)), 0, niveaux - 1)
}

function opaciteDuPalier(palier: number, niveaux: number, plancher: number): number {
  return plancher + ((1 - plancher) * palier) / (niveaux - 1)
}

/**
 * T-0402 — TRACE palier floors: thinnest wire under smallest disc, long-trace opacity under a
 * disc's. Discs keep theirs.
 */
const DEMI_LARGEUR_MIN_PX = Math.min(RAYON_MIN_ETOILE_PX, K('LARGEUR_TRACE_MIN_PX') / 2)
const PLANCHER_OPACITE_DISQUE = K('OPACITE_TRACE_MIN')
const PLANCHER_OPACITE_TRACE = K('OPACITE_TRACE_MIN') * K('OPACITE_TRACE_MAX')

/**
 * T-0402 — trace progress disc → wire, 0..1. Barely started trace keeps disc width and brightness;
 * thin faint wire only at `LONGUEUR_FONDU_TRACE_RAYONS` rayons. Without fade, bright star jumped
 * disc → pale wire, seemed to extinguish when starting to streak. Fade starts at ZERO length:
 * round-capped stroke of length L covers L + 2r, = disc only at L = 0. Starting at L = r lengthened
 * star by r between frames (5 px bright, ~0 faint): some streaked abruptly, others not.
 */
export function avanceeVersFil(longueurPx: number, rayonPx: number): number {
  return encadre(longueurPx / (rayonPx * K('LONGUEUR_FONDU_TRACE_RAYONS')), 0, 1)
}

/**
 * Geometric rayon paliers: rayon follows magnitude by power law, stars pile near floor; constant
 * pas would waste all paliers on few bright ones.
 */
function palierRayon(rayon: number, en: EnAttente): number {
  const relatif =
    Math.log(rayon / DEMI_LARGEUR_MIN_PX) / Math.log(en.rayonMaxPx / DEMI_LARGEUR_MIN_PX)
  return encadre(Math.round(relatif * (en.niveauxRayon - 1)), 0, en.niveauxRayon - 1)
}

function rayonDuPalier(palier: number, en: EnAttente): number {
  return (
    DEMI_LARGEUR_MIN_PX *
    (en.rayonMaxPx / DEMI_LARGEUR_MIN_PX) ** (palier / (en.niveauxRayon - 1))
  )
}

/**
 * T-0402 — filée trace width: stellar blob's, not map-disc diameter. Follows brightness (same
 * magnitude law as rayon), clamped between 1 px wire and low cap: on a photo brightness, not
 * thickness, distinguishes traces.
 */
export function largeurTracePx(rayonPx: number): number {
  return encadre(
    rayonPx * K('RAPPORT_LARGEUR_TRACE_RAYON'),
    K('LARGEUR_TRACE_MIN_PX'),
    K('LARGEUR_TRACE_MAX_PX'),
  )
}

function peintEnAttente(
  ctx: CanvasRenderingContext2D,
  en: EnAttente,
  modeNuit: boolean,
): void {
  for (let i = 0; i < en.disques.length; i++) {
    const chemin = en.disques[i]
    if (chemin === undefined) continue
    ctx.fillStyle = couleurTeinteOpacite(
      i % TEINTES,
      opaciteDuPalier(Math.floor(i / TEINTES), en.niveauxOpacite, PLANCHER_OPACITE_DISQUE),
      modeNuit,
    )
    ctx.fill(chemin)
  }
  ctx.lineCap = 'round'
  // T-0402 — light adds on sensor: two crossing traces brighten the crossing, none masks the other;
  // fond stays black between wires.
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < en.traces.length; i++) {
    const chemin = en.traces[i]
    if (chemin === undefined) continue
    const teintePalette = i % TEINTES
    const reste = Math.floor(i / TEINTES)
    ctx.strokeStyle = couleurTeinteOpacite(
      teintePalette,
      opaciteDuPalier(reste % en.niveauxOpacite, en.niveauxOpacite, PLANCHER_OPACITE_TRACE),
      modeNuit,
    )
    ctx.lineWidth = 2 * rayonDuPalier(Math.floor(reste / en.niveauxOpacite), en)
    ctx.stroke(chemin)
  }
  // Reset to defaults like sky pass for band: later drawing on same context must not inherit round
  // line cap.
  ctx.lineWidth = 1
  ctx.lineCap = 'butt'
  ctx.globalCompositeOperation = 'source-over'
}

interface Compteur {
  dessinees: number
  /** Stars read by `selectionne`, before any sort: pass cost reads here. */
  visitees: number
  /** Painted surface, px²: visible length × stroke width. */
  surfacePx: number
}

/** What both layers share of current frame: computed once, never twice. */
interface Scene {
  readonly centreJ2000: Vec3
  /**
   * Selection radius, degrees — WIDENED sweep field, not scène field.
   * T-0119 — out-of-field star whose declination circle crosses it leaves a trace: scène field
   * alone misses it (8 h filé: half the traces missing, popping in on pan). Widening = full sweep
   * `ω·T`, bounding star displacement during sequence. `arcInvisible` then rejects touchless ones
   * on bounding box, before any draw order.
   */
  readonly rayonSelectionDeg: number
  /**
   * Angular distance pole → field centre, degrees, and field radius widened by trace half-width.
   * T-0119 — sort making widened selection affordable. Star streaks on its declination circle:
   * touches field iff its polar radius differs from aim centre's by less than field radius.
   * Absolute gap on an already-read declination, BEFORE the arc (costliest calc, as T-0022). Else
   * 10° field on 8 h filé computed 15000 arcs to paint 3000: selection must cover whole sweep,
   * not pay for it.
   */
  /**
   * Bounds tested as declination SINE: declination monotone in `z` → gap compared on `z` too, no
   * arcsin per star.
   */
  readonly zMin: number
  readonly zMax: number
  /** §9.3 — per-pixel depth reached, tabulated by `z`: one calc item less per star. */
  readonly profondeurParZ: Float64Array
  /** T-0400 — under Lune, depth and contrast also depend on direction. */
  readonly fondLune: FondLune | null
  /** With suivi star doesn't move on sensor: no trace, no flux spreading. */
  readonly dureeMin: number
}

function sceneCourante(entree: EntreeDessinChamp): Scene {
  const { projecteur } = entree
  const dureeMin = entree.suiviActif ? 0 : entree.dureeS / S_PAR_MIN
  const table = { profondeur: entree.profondeur, tacheArcsec: entree.tacheArcsec, suiviActif: entree.suiviActif }
  const centreJ2000 = projecteur.inverse(projecteur.centreXPx, projecteur.centreYPx)
  // T-0116 — selection covers whole scène field: traces visible everywhere; cadre no longer bounds
  // them, only says which ones sensor records. Filé star budget converts on THIS radius: same
  // field, image, cost.
  const rayonChamp = rayonChampDeg(projecteur.vue)
  // Test margin, degrees: circle tangent to field within half trace width still paints there.
  // Aim-centre scale = scène's coarsest (stereographic factor grows to edge) → conservative.
  const degParPx = separationDeg(
    centreJ2000,
    projecteur.inverse(projecteur.centreXPx + 1, projecteur.centreYPx),
  )
  // Half-width of widest stroke pass can draw: brightest star of loaded packet.
  const margePx = rayonEtoilePx(entree.indexReel.magMin) + K('MARGE_ANTIALIASING_PX')
  // Declination circle touches field if polar radius differs from aim centre's by < field radius:
  // a declination interval → (monotone in `z`) a `z` interval.
  const coDecCentreDeg =
    DROIT - angleDeSinDeg(centreJ2000.z)
  const rayonTestDeg = rayonChamp + margePx * degParPx
  const borne = (coDecDeg: number): number =>
    Math.sin(encadre(DROIT - coDecDeg, -DROIT, DROIT) * DEG)
  return {
    centreJ2000,
    rayonSelectionDeg: Math.min(DEMI_TOUR_DEG, rayonChamp + longueurArcDeg(dureeMin, 0).value),
    zMin: borne(coDecCentreDeg + rayonTestDeg),
    zMax: borne(coDecCentreDeg - rayonTestDeg),
    profondeurParZ: tableProfondeurParPixel(table),
    fondLune: entree.lune === null || entree.lune === undefined ? null : fondLune(entree.lune, table),
    dureeMin,
  }
}

/** One star: arc swept during accumulation duration, point when short. */
function dessineCouche(
  entree: EntreeDessinChamp,
  scene: Scene,
  index: IndexCiel,
  magMin: number,
  magParZ: Float64Array,
  compteur: Compteur,
  attente: EnAttente,
): void {
  const { projecteur } = entree
  const { centreJ2000, dureeMin, rayonSelectionDeg } = scene
  // Selection reads to deepest limit of declinations field can receive; each star then judged on
  // its own case limit.
  const magMax = maxSurZ(magParZ, scene.zMin, scene.zMax)
  if (magMax <= magMin) return

  const stats = selectionne(index, centreJ2000, rayonSelectionDeg, magMax, (x, y, z, magV, bv) => {
    if (magV < magMin) return
    // Declination circle touches field? Two comparisons first, on raw polar component: no arcsin
    // per star.
    if (z < scene.zMin || z > scene.zMax) return
    if (magV > profondeurPourZ(magParZ, z)) return
    const rayon = Math.max(RAYON_MIN_ETOILE_PX, rayonEtoilePx(magV))
    // Reject/clip margin: stroke half-width + antialiasing overflow. Rejecting at the very edge
    // would erase that overflow (1 px of trace).
    const margeTrace = rayon + K('MARGE_ANTIALIASING_PX')

    // Trace brightness judged on per-PIXEL pose, not total duration: 2 h filé shows only bright
    // stars where same duration in stacked fixed poses shows thousands.
    //
    // Sort runs BEFORE the arc (T-0022): depends only on declination, read in `z`; arc = costliest
    // calc. A star dropped here must not have paid it.
    const opacite =
      scene.fondLune === null
        ? opaciteEtoile(magV, profondeurPourZ(scene.profondeurParZ, z))
        : opaciteSousLuneXYZ(scene.fondLune, magV, x, y, z)
    if (opacite < K('OPACITE_TRACE_MIN')) return

    const arc = arcEtoile(projecteur, { x, y, z }, dureeMin, entree.axePoleNord)
    if (arc.segments.length === 0) return
    // T-0115 replaced polyline (broke trace at canvas edge) with exact circle, ONE `ctx.arc`, whole
    // sweep. Calc gained x4, raster lost it: a 17000 px radius circle touching nothing painted
    // entirely. Usual case: 3600 of 4600 arcs, 4/5 of painted length, invisible by construction.
    // Box rejects them before draw order.
    if (arcInvisible(arc, projecteur.vue, margeTrace)) return
    const cercle = arc.cercle
    const teintePalette = teinte(bv)


    if (arc.longueurPx <= 0) {
      // No trace — suivi active: star stays a disc, joins path of its (teinte, opacité) pair, not
      // own draw order. Overlapping discs of one path don't accumulate (nonzero fill counts once),
      // like light: saturated pixel doesn't saturate twice.
      const point = arc.segments[0]![0]!
      const pOpacite = palierOpacite(opacite, attente.niveauxOpacite, PLANCHER_OPACITE_DISQUE)
      const indice = pOpacite * TEINTES + teintePalette
      const chemin = (attente.disques[indice] ??= new Path2D())
      chemin.moveTo(point.xPx + rayon, point.yPx)
      chemin.arc(point.xPx, point.yPx, rayon, 0, TOUR_RAD)
      compteur.surfacePx += Math.PI * rayon * rayon
    } else {
      // T-0402 — width and opacity slide disc → wire. Long traces attenuated because they add: at
      // full opacity the slightest crossing saturates to white.
      const t = avanceeVersFil(arc.longueurPx, rayon)
      const demiTrace = rayon + (largeurTracePx(rayon) / 2 - rayon) * t
      const opaciteTrace = opacite * (1 + (K('OPACITE_TRACE_MAX') - 1) * t)
      const pOpacite = palierOpacite(opaciteTrace, attente.niveauxOpacite, PLANCHER_OPACITE_TRACE)
      const indice =
        (palierRayon(demiTrace, attente) * attente.niveauxOpacite + pOpacite) * TEINTES + teintePalette
      const chemin = (attente.traces[indice] ??= new Path2D())
      if (cercle !== null) {
        // T-0115 — stereographic arc IS a circle: canvas primitive draws it exactly where polyline
        // approximated with hundreds of chords. But draws EVERYTHING given: sweep clipped at canvas
        // edge as polyline did. 4/5 of full-sky painted length was off-screen.
        const c = cercle
        // Sweep portions touching canvas. Clip HERE, sole branch drawing a long arc: disc judged on
        // box, a subpixel trace grazing the edge must not vanish on clipping.
        for (const portion of arcsVisibles(c, projecteur.vue, margeTrace)) {
          compteur.surfacePx += Math.abs(portion.balayageRad) * c.rayonPx * demiTrace * 2
          // `moveTo` portion start BEFORE arc: else `arc` joins previous portion end to this start
          // by a chord, and two traces split by an off-screen stretch get a straight line.
          chemin.moveTo(
            c.xPx + c.rayonPx * Math.cos(portion.debutRad),
            c.yPx + c.rayonPx * Math.sin(portion.debutRad),
          )
          const cordes = cordesPourArc(c.rayonPx, portion.balayageRad)
          // One chord holds the tolerated sagitta: it IS the arc. Native arc worse than useless
          // here — end angle grazing start sometimes normalized wrong way by raster; short poses
          // sprouted loops and stray strokes.
          if (cordes > 1 && c.rayonPx <= K('RAYON_ARC_NATIF_MAX_PX')) {
            chemin.arc(
              c.xPx,
              c.yPx,
              c.rayonPx,
              portion.debutRad,
              portion.debutRad + portion.balayageRad,
              portion.balayageRad < 0,
            )
            continue
          }
          // Huge radius — zoomed view, circle centre hundreds of thousands px away: browser raster
          // computes arc in single precision, loses subpixel far from centre. Thick stroke came
          // out drop, half-disc or capsule depending on rounding. Chords here in double precision;
          // a handful needed at this radius.
          for (let i = 1; i <= cordes; i++) {
            const angle = portion.debutRad + (portion.balayageRad * i) / cordes
            chemin.lineTo(c.xPx + c.rayonPx * Math.cos(angle), c.yPx + c.rayonPx * Math.sin(angle))
          }
        }
      } else {
        for (const segment of arc.segments) {
          segment.forEach((p, i) => {
            if (i === 0) chemin.moveTo(p.xPx, p.yPx)
            else {
              chemin.lineTo(p.xPx, p.yPx)
              const precedent = segment[i - 1]!
              compteur.surfacePx +=
                Math.hypot(p.xPx - precedent.xPx, p.yPx - precedent.yPx) * demiTrace * 2
            }
          })
        }
      }
    }
    compteur.dessinees++
  })
  compteur.visitees += stats.etoilesExaminees
}

/**
 * T-0402 — chord count tracing a circle arc within `FLECHE_MAX_CORDE_PX`. Chord c on radius R
 * deviates c²/8R: allowed chord = √(8R·f).
 */
export function cordesPourArc(rayonPx: number, balayageRad: number): number {
  const cordeMax = Math.sqrt(8 * rayonPx * K('FLECHE_MAX_CORDE_PX'))
  return Math.max(1, Math.ceil((rayonPx * Math.abs(balayageRad)) / cordeMax))
}

/** T-0119's two caps, in whole-sky effectif. */
export interface Budget {
  /** Lisibilité cap, valid where a trace sweeps a great circle. */
  readonly couverture: number
  /** Cost cap: counts stars read, not surface, not compensated. */
  readonly max: number
}

/**
 * T-0401 — limiting magnitude of a layer, per `z` case. Trace sweeps a cos δ arc: near pole it
 * paints little, one cut sized for celestial equator emptied sky there. Coverage budget divided by
 * cos^α δ. `depense`: effectif already taken by previous layer.
 */
export function tableMagParZ(
  index: IndexCiel,
  budget: Budget,
  depense: number,
  plafond: number,
): Float64Array {
  const cases = K('CASES_TABLE_PROFONDEUR_TRACE')
  const alpha = K('COMPENSATION_COUVERTURE_POLAIRE')
  const table = new Float64Array(cases)
  for (let i = 0; i < cases; i++) {
    const z = -1 + (2 * (i + 1 / 2)) / cases
    const cosDec = Math.sqrt(1 - z * z)
    const effectif = Math.min(budget.max, budget.couverture / cosDec ** alpha)
    table[i] = Math.min(plafond, magnitudePourEffectif(index, effectif - depense))
  }
  return table
}

/** Deepest limit of cases covered by interval `[zMin ; zMax]`. */
function maxSurZ(table: Float64Array, zMin: number, zMax: number): number {
  const caseDe = (z: number): number =>
    encadre((((z + 1) * table.length) / 2) | 0, 0, table.length - 1)
  let max = -Infinity
  for (let i = caseDe(zMin); i <= caseDe(zMax); i++) max = Math.max(max, table[i]!)
  return max
}

export function dessineChamp(entree: EntreeDessinChamp): SortieDessinChamp {
  const { ctx, projecteur } = entree

  const seuilReel = K('SEUIL_MAG_ETOILES_REELLES')
  const reelles: Compteur = { dessinees: 0, visitees: 0, surfacePx: 0 }
  const generees: Compteur = { dessinees: 0, visitees: 0, surfacePx: 0 }
  const vue = sceneCourante(entree)

  // T-0119 — cap bears on painted SURFACE, on BOTH layers.
  // T-0118 capped only semis (bounding stars read), trusting a real catalogue of « ~15000 stars »
  // as cheap. Packet holds 25791 under catalogued threshold: that layer paints the sheet. And star
  // count doesn't bound lisibilité: painted surface grows with filé duration (8 h: 1500 traces
  // cover canvas 5x).
  // Budget = SKY effectif, not field: counts canvas crossings, i.e. stars passing over it wherever
  // they are at first instant. Spent REAL CATALOGUE FIRST — recognizable sky, brightest traces;
  // dropped first must be seen last. Semis gets the remainder: nothing once filé is long.
  // Two caps, two quantities. Coverage bounds what image SHOWS, not what pass READS: short trace
  // (brief filé, narrow field: arc crosses canvas in tens of px) paints little so allows tens of
  // thousands. 5 min filé asked 268000 for 98 ms. Second cap = cost cap, on effectif itself.
  const budget: Budget = {
    max: entree.effectifMax ?? Infinity,
    couverture:
      entree.couvertureMax === null
        ? Infinity
        : effectifCielPourCouverture({
          projecteur,
          dureeMin: vue.dureeMin,
          couvertureMax: entree.couvertureMax,
          // Width of catalogue's faintest star = width FLOOR, budget slightly generous. Gap
          // absorbed by coverage target, tuned by measure (exact mean width needs the cap itself).
          largeurTraceRefPx: largeurTracePx(Math.max(RAYON_MIN_ETOILE_PX, rayonEtoilePx(seuilReel))),
        }),
  }
  const magReelle = tableMagParZ(
    entree.indexReel,
    budget,
    0,
    Math.min(entree.magLimite, seuilReel),
  )
  const attente = enAttente(rayonEtoilePx(entree.indexReel.magMin))
  dessineCouche(entree, vue, entree.indexReel, -Infinity, magReelle, reelles, attente)

  // What real catalogue didn't spend. Semis count from its own draw: exact, where an analytic law
  // gives the draw only to its slope. Cap under catalogued threshold: nothing to generate that
  // catalogue doesn't show; `dessineCouche` stops by itself.
  const magSemis = tableMagParZ(
    entree.indexSemis,
    budget,
    entree.indexReel.nombreEtoiles,
    entree.magLimite,
  )
  dessineCouche(entree, vue, entree.indexSemis, seuilReel, magSemis, generees, attente)

  // Both layers paint together: shared paths → order real catalogue vs semis indistinguishable.
  // Neither in front: stars of one sky, not two calques.
  peintEnAttente(ctx, attente, entree.modeNuit)


  return {
    etoilesReelles: reelles.dessinees,
    etoilesGenerees: generees.dessinees,
    etoilesVisitees: reelles.visitees + generees.visitees,
    couverturePeinte:
      (reelles.surfacePx + generees.surfacePx) /
      (projecteur.vue.largeurPx * projecteur.vue.hauteurPx),
  }
}
