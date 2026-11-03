/**
 * §3.4 — geometry of the 3 repérage layers.
 *
 * FRONTIÈRES TRAP: defined along meridians/parallels of epoch B1875, not J2000. Without
 * precession error reaches 1,75° at J2000, 2,11° in 2026: clearly visible. So brought to J2000
 * once, then precessed to displayed epoch by the image's single matrix (§3.1) — same path as
 * stars, no divergence between layers.
 *
 * A frontière edge follows a meridian or parallel, not a straight segment: subdivided before
 * transformation, else a parallel crossing half the sky would be drawn as a chord.
 */

import { K } from '../registry/constants.ts'
import type {
  AreteFrontiere,
  Asterisme,
  EtoileNommee,
  Figure,
  PaquetConstellations,
  Segment,
} from '../data/constellations.ts'
import { decalagePrecessionDeg, matricePrecession } from './horloges.ts'
import { selectionne, type IndexCiel } from './index-ciel.ts'
import { DEG, applique, transpose, versVecteur, type Mat3, type Vec3 } from './mat3.ts'
import { trace, type Traced } from './traced.ts'
import { ecartCourt, TOUR_DEG } from './unites.ts'

/** B1875 → J2000: inverse of J2000 → B1875 precession, i.e. its transpose. */
export function matriceB1875VersJ2000(): Mat3 {
  return transpose(matricePrecession(K('EPOQUE_FRONTIERES_IAU')))
}

/** Angular length of an edge, along the meridian or parallel it follows. */
export function longueurAreteDeg(arete: AreteFrontiere): number {
  if (arete.type === 'MERIDIEN') return Math.abs(arete.dec2Deg - arete.dec1Deg)
  const cos = Math.cos(((arete.dec1Deg + arete.dec2Deg) / 2) * DEG)
  return Math.abs(ecartCourt(arete.ad1Deg, arete.ad2Deg, TOUR_DEG)) * Math.abs(cos)
}

/**
 * Edge polyline, J2000. Subdivision happens BEFORE transformation, in the epoch where the edge
 * is straight.
 */
export function polyligneFrontiere(arete: AreteFrontiere, matrice: Mat3): readonly Vec3[] {
  const pas = Math.max(1, Math.ceil(longueurAreteDeg(arete) / K('SUBDIVISION_FRONTIERE_DEG')))
  const deltaAd = ecartCourt(arete.ad1Deg, arete.ad2Deg, TOUR_DEG)
  const points: Vec3[] = []
  for (let i = 0; i <= pas; i++) {
    const f = i / pas
    const ad = arete.ad1Deg + deltaAd * f
    const dec = arete.dec1Deg + (arete.dec2Deg - arete.dec1Deg) * f
    points.push(applique(matrice, versVecteur(ad, dec)))
  }
  return points
}

export interface CoucheFrontieres {
  readonly polylignes: readonly (readonly Vec3[])[]
  /** IAU codes of the two separated constellations, in polyline order. */
  readonly codes: readonly (readonly [string, string])[]
}

/** All frontières, J2000, subdivided. Computed once at pack load. */
export function coucheFrontieres(paquet: PaquetConstellations): CoucheFrontieres {
  const matrice = matriceB1875VersJ2000()
  const polylignes: (readonly Vec3[])[] = []
  const codes: (readonly [string, string])[] = []
  for (const arete of paquet.frontieres) {
    polylignes.push(polyligneFrontiere(arete, matrice))
    codes.push(arete.codes)
  }
  return { polylignes, codes }
}

/** Offset introduced by precession between frontières epoch and displayed epoch. */
export function ecartFrontieresDeg(anneeEpoque: number): Traced<number> {
  const annees = anneeEpoque - K('EPOQUE_FRONTIERES_IAU')
  return trace({
    value: decalagePrecessionDeg(annees),
    formula: 'PRECESSION',
    inputs: { n_annees: annees },
    constants: ['PRECESSION_ARCSEC_AN', 'EPOQUE_FRONTIERES_IAU'],
    note: 'limites officielles des constellations, recalées sur la date affichée',
  })
}

export interface SegmentVec {
  readonly a: Vec3
  readonly b: Vec3
  /**
   * T-0376 — star magnitude at each end, `null` if pack doesn't name it. Stroke stops before
   * the disc, and the disc depends on magnitude.
   */
  readonly magA: number | null
  readonly magB: number | null
}

/**
 * Match by position, same reason/tolerance as `nomEtoile` (§8.4): segments and named stars come
 * from the same HYG line.
 * ponytail: linear scan, once at load; upgrade to an index if load time shows it. Unnamed-star
 * vertex stays `null`, takes the floor margin.
 */
function magnitudeEn(nommees: readonly EtoileNommee[], adDeg: number, decDeg: number): number | null {
  const tolerance = K('TOLERANCE_APPARIEMENT_ETOILE_DEG')
  for (const e of nommees) {
    if (Math.abs(e.decDeg - decDeg) > tolerance) continue
    if (Math.abs(e.adDeg - adDeg) > tolerance) continue
    return e.magV
  }
  return null
}

function segmentsVers(
  segments: readonly Segment[],
  nommees: readonly EtoileNommee[],
): readonly SegmentVec[] {
  return segments.map((s) => ({
    a: versVecteur(s.ad1Deg, s.dec1Deg),
    b: versVecteur(s.ad2Deg, s.dec2Deg),
    magA: magnitudeEn(nommees, s.ad1Deg, s.dec1Deg),
    magB: magnitudeEn(nommees, s.ad2Deg, s.dec2Deg),
  }))
}

export interface CoucheTraces {
  readonly code: string
  readonly nom: string
  readonly segments: readonly SegmentVec[]
  /** Vertices barycentre, J2000: where the label sits (§3.4). */
  readonly centre: Vec3 | null
}

function barycentre(segments: readonly SegmentVec[]): Vec3 | null {
  if (segments.length === 0) return null
  let x = 0
  let y = 0
  let z = 0
  for (const s of segments) {
    x += s.a.x + s.b.x
    y += s.a.y + s.b.y
    z += s.a.z + s.b.z
  }
  const norme = Math.hypot(x, y, z)
  if (norme === 0) return null
  return { x: x / norme, y: y / norme, z: z / norme }
}

export function coucheFigures(
  figures: readonly Figure[],
  nommees: readonly EtoileNommee[] = [],
): readonly CoucheTraces[] {
  return figures.map((f) => {
    const segments = segmentsVers(f.segments, nommees)
    return { code: f.code, nom: f.nom, segments, centre: barycentre(segments) }
  })
}

export function coucheAsterismes(
  asterismes: readonly Asterisme[],
  nommees: readonly EtoileNommee[] = [],
): readonly CoucheTraces[] {
  return asterismes.map((a) => {
    const segments = segmentsVers(a.segments, nommees)
    return { code: a.id, nom: a.nom, segments, centre: barycentre(segments) }
  })
}

export interface EtoileTrace {
  readonly v: Vec3
  readonly magV: number
  readonly bv: number
}

/**
 * Catalogue stars carrying trace vertices, one per distinct vertex. A stroke ending in the void
 * reads as an error: zoom-bound magnitude limite (§3.3) switches off faint asterism stars
 * (Quadrant mural, Cintre) while the stroke stays → render paints them whatever the limit.
 * Match in the index, same tolerance as `magnitudeEn` (same HYG line). Vertex with no star in
 * loaded pack dropped — no star of unknown brightness drawn.
 */
export function etoilesDesTraces(couches: readonly CoucheTraces[], index: IndexCiel): readonly EtoileTrace[] {
  const tolerance = K('TOLERANCE_APPARIEMENT_ETOILE_DEG')
  // Chord, not cosine: index stores float32 directions; cosine near 1 loses far more at that
  // precision than the tolerance.
  const cordeMaxCarree = (tolerance * DEG) ** 2
  const vus = new Set<string>()
  const etoiles: EtoileTrace[] = []
  for (const couche of couches) {
    for (const segment of couche.segments) {
      for (const v of [segment.a, segment.b]) {
        const cle = `${v.x},${v.y},${v.z}`
        if (vus.has(cle)) continue
        vus.add(cle)
        let meilleur: EtoileTrace | null = null
        let cordeMeilleure = cordeMaxCarree
        selectionne(index, v, tolerance, Infinity, (x, y, z, magV, bv) => {
          const corde = (x - v.x) ** 2 + (y - v.y) ** 2 + (z - v.z) ** 2
          if (corde > cordeMeilleure) return
          cordeMeilleure = corde
          meilleur = { v, magV, bv }
        })
        if (meilleur !== null) etoiles.push(meilleur)
      }
    }
  }
  return Object.freeze(etoiles)
}

/**
 * §3.4 — "app states an astérisme isn't a constellation". Sentence lives here, not in a
 * component: business rule, not decoration.
 */
export const RAPPEL_ASTERISME =
  'motifs de repérage — un astérisme n’est pas une constellation'

export const RAPPEL_FIGURES = 'dessins traditionnels reliant les étoiles'
