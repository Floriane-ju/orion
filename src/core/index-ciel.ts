/**
 * §3.3 — catalogue spatial index. PRD: HEALPix or equatorial quadtree; only cells intersecting the
 * field go to GPU, selection cost independent of zoom.
 * Two properties carry §3.1's "adding stars does not measurably degrade frequency":
 *   1. cells outside the field never visited;
 *   2. stars sorted by ascending magnitude within a cell, scan stops at first star fainter than
 *      zoom limit → added faint stars land AFTER the stop: stars examined per frame unchanged.
 * Unit directions computed once at build; per frame one matrix product per kept star.
 */

import { K } from '../registry/constants.ts'
import type { Etoile } from '../data/catalog.ts'
import { DEG, angleDeCosDeg, separationDeg, versVecteur, type Vec3 } from './mat3.ts'
import { dUnBloc, pointDeCoupe, type Decoupable } from './tranches.ts'
import { encadre, ramene, TOUR_DEG } from './unites.ts'

export interface CelluleCiel {
  readonly centre: Vec3
  /** Exact cell bounding radius, degrees. */
  readonly rayonDeg: number
  readonly x: Float32Array
  readonly y: Float32Array
  readonly z: Float32Array
  readonly mag: Float32Array
  readonly bv: Float32Array
  /** Source-catalogue star index, for click identification. */
  readonly source: Int32Array
}

export interface IndexCiel {
  readonly cellules: readonly CelluleCiel[]
  readonly nombreEtoiles: number
  /** Faintest magnitude present: real depth of loaded packet. */
  readonly profondeurMag: number
  /**
   * Cumulative count per magnitude step: `cumulMag[i]` = stars with magnitude
   * ≤ `magMin + i * PAS_COMPTAGE_CUMULE_MAG`.
   * T-0119 — converts trace budget → magnitude cap. Seed count law (§9.2, `SEMIS_ETOILES_TOTAL`
   * to `SEMIS_MAG_MAX`) can't serve: extended to bright stars gives a few hundred at cataloged
   * threshold vs tens of thousands in the real packet (describes seed, not catalogue).
   */
  readonly cumulMag: Float32Array
  /** Brightest magnitude present: cumulative count origin, read from data. */
  readonly magMin: number
}

interface Accumulateur {
  readonly indices: number[]
}

function rayonEnglobant(centre: Vec3, adMinDeg: number, adMaxDeg: number, decMinDeg: number, decMaxDeg: number): number {
  const adMid = (adMinDeg + adMaxDeg) / 2
  const decMid = (decMinDeg + decMaxDeg) / 2
  const bords: Vec3[] = [
    versVecteur(adMinDeg, decMinDeg),
    versVecteur(adMinDeg, decMaxDeg),
    versVecteur(adMaxDeg, decMinDeg),
    versVecteur(adMaxDeg, decMaxDeg),
    versVecteur(adMid, decMinDeg),
    versVecteur(adMid, decMaxDeg),
    versVecteur(adMinDeg, decMid),
    versVecteur(adMaxDeg, decMid),
  ]
  let maxCos = 1
  for (const b of bords) {
    const cos = centre.x * b.x + centre.y * b.y + centre.z * b.z
    if (cos < maxCos) maxCos = cos
  }
  return angleDeCosDeg(maxCos)
}

/**
 * Builds the index: one-level equatorial quadtree, constant-side declination bands each cut in
 * right ascension → comparable cell width up to poles.
 */
export function construitIndex(etoiles: readonly Etoile[]): IndexCiel {
  return dUnBloc(construitIndexPas(etoiles))
}

/**
 * Starless-sky index, drawn until catalogue decoded. `magnitudePourEffectif` returns `+Infinity`
 * there (as when requested count exceeds content): nothing to cap.
 */
export const INDEX_VIDE: IndexCiel = Object.freeze(construitIndex([]))

/**
 * T-0296 — same build, cut points named. Costliest startup stage: 80 000 stars bucketed, sorted
 * per cell, projected = 150 ms main thread on a tablet.
 * Cuts at 3 heavy sweeps: bucketing, per-cell fill (sorts + trigonometry), cumulative count.
 * Users: `core/tranches.ts`.
 */
export function* construitIndexPas(etoiles: readonly Etoile[]): Decoupable<IndexCiel> {
  const taille = K('CELLULE_INDEX_DEG')
  const bandes = Math.max(1, Math.round(180 / taille))
  const hauteurBande = 180 / bandes

  // Per band: cell count in right ascension.
  const colonnes: number[] = []
  for (let b = 0; b < bandes; b++) {
    const decMin = -90 + b * hauteurBande
    const decMax = decMin + hauteurBande
    const cosMax = Math.max(Math.cos(decMin * DEG), Math.cos(decMax * DEG))
    colonnes.push(Math.max(1, Math.round((360 * cosMax) / taille)))
  }

  const decalages: number[] = []
  let total = 0
  for (const n of colonnes) {
    decalages.push(total)
    total += n
  }

  const paniers: Accumulateur[] = Array.from({ length: total }, () => ({ indices: [] }))
  let profondeur = -Infinity

  for (let i = 0; i < etoiles.length; i++) {
    if (pointDeCoupe(i)) yield
    const e = etoiles[i]!
    if (e.magV > profondeur) profondeur = e.magV
    const b = encadre(Math.floor((e.decDeg + 90) / hauteurBande), 0, bandes - 1)
    const n = colonnes[b]!
    const ad = ramene(e.adDeg, TOUR_DEG)
    const c = Math.min(n - 1, Math.floor((ad / TOUR_DEG) * n))
    paniers[decalages[b]! + c]!.indices.push(i)
  }

  const cellules: CelluleCiel[] = []
  for (let b = 0; b < bandes; b++) {
    const decMin = -90 + b * hauteurBande
    const decMax = decMin + hauteurBande
    const n = colonnes[b]!
    const largeur = 360 / n
    for (let c = 0; c < n; c++) {
      const panier = paniers[decalages[b]! + c]!
      if (panier.indices.length === 0) continue
      yield
      // Ascending magnitude = interruptible scan.
      panier.indices.sort((a, z) => etoiles[a]!.magV - etoiles[z]!.magV)

      const adMin = c * largeur
      const adMax = adMin + largeur
      const centre = versVecteur((adMin + adMax) / 2, (decMin + decMax) / 2)
      const taillePanier = panier.indices.length
      const cellule: CelluleCiel = {
        centre,
        rayonDeg: rayonEnglobant(centre, adMin, adMax, decMin, decMax),
        x: new Float32Array(taillePanier),
        y: new Float32Array(taillePanier),
        z: new Float32Array(taillePanier),
        mag: new Float32Array(taillePanier),
        bv: new Float32Array(taillePanier),
        source: new Int32Array(taillePanier),
      }
      for (let j = 0; j < taillePanier; j++) {
        const indice = panier.indices[j]!
        const e = etoiles[indice]!
        const v = versVecteur(e.adDeg, e.decDeg)
        cellule.x[j] = v.x
        cellule.y[j] = v.y
        cellule.z[j] = v.z
        cellule.mag[j] = e.magV
        cellule.bv[j] = e.bv
        cellule.source[j] = indice
      }
      cellules.push(cellule)
    }
  }

  let magMin = Infinity
  for (let i = 0; i < etoiles.length; i++) {
    if (pointDeCoupe(i)) yield
    const magV = etoiles[i]!.magV
    if (magV < magMin) magMin = magV
  }

  return {
    cellules,
    nombreEtoiles: etoiles.length,
    // T-0297 — starless index = no depth, not depth 0 (scene said "catalogue stops at
    // magnitude 0.0" before decode).
    profondeurMag: Number.isFinite(profondeur) ? profondeur : Number.POSITIVE_INFINITY,
    cumulMag: yield* construitCumulMag(
      etoiles,
      magMin,
      Number.isFinite(profondeur) ? profondeur : 0,
    ),
    magMin: Number.isFinite(magMin) ? magMin : 0,
  }
}

/**
 * Cumulative magnitude count, built with the index: per-frame inversion = one read. Indexed by
 * magnitude, not star → few hundred bytes.
 */
function* construitCumulMag(
  etoiles: readonly Etoile[],
  magMin: number,
  profondeurMag: number,
): Decoupable<Float32Array> {
  const pas = K('PAS_COMPTAGE_CUMULE_MAG')
  const cases = Math.max(1, Math.ceil((profondeurMag - magMin) / pas) + 1)
  const cumul = new Float32Array(cases)
  for (let j = 0; j < etoiles.length; j++) {
    if (pointDeCoupe(j)) yield
    const i = Math.ceil((etoiles[j]!.magV - magMin) / pas)
    cumul[encadre(i, 0, cases - 1)]! += 1
  }
  for (let i = 1; i < cases; i++) cumul[i]! += cumul[i - 1]!
  return cumul
}

/**
 * T-0119 — faintest magnitude such that index holds ≤ `effectif` stars over the whole sphere.
 * `+Infinity` when requested count exceeds index content: nothing to cap (≠ "catalogue cut at last
 * magnitude"). Returns reached cell's threshold, never interpolated beyond: deeper exceeds budget.
 */
export function magnitudePourEffectif(index: IndexCiel, effectif: number): number {
  const cumul = index.cumulMag
  if (effectif >= index.nombreEtoiles) return Infinity
  if (effectif < 1) return -Infinity
  const pas = K('PAS_COMPTAGE_CUMULE_MAG')
  for (let i = 0; i < cumul.length; i++) {
    if (cumul[i]! > effectif) return index.magMin + (i - 1) * pas
  }
  return Infinity
}

export interface StatistiquesSelection {
  readonly cellulesRetenues: number
  /** Stars actually read. Counter must stay stable (§3.1). */
  readonly etoilesExaminees: number
}

export type VisiteEtoile = (
  x: number,
  y: number,
  z: number,
  magV: number,
  bv: number,
  source: number,
) => void

/** Visits field stars brightest → faintest, stops past magnitude limit. */
export function selectionne(
  index: IndexCiel,
  centreJ2000: Vec3,
  rayonChampDeg: number,
  magLimite: number,
  visite: VisiteEtoile,
): StatistiquesSelection {
  // T-0396 — limit −∞ (jour) keeps no star: index not scanned.
  if (magLimite === Number.NEGATIVE_INFINITY) return { cellulesRetenues: 0, etoilesExaminees: 0 }
  let cellulesRetenues = 0
  let etoilesExaminees = 0

  for (const cellule of index.cellules) {
    const separation = separationDeg(centreJ2000, cellule.centre)
    if (separation > rayonChampDeg + cellule.rayonDeg) continue

    cellulesRetenues++
    const mags = cellule.mag
    for (let j = 0; j < mags.length; j++) {
      if (mags[j]! > magLimite) break
      etoilesExaminees++
      visite(cellule.x[j]!, cellule.y[j]!, cellule.z[j]!, mags[j]!, cellule.bv[j]!, cellule.source[j]!)
    }
  }
  return { cellulesRetenues, etoilesExaminees }
}
