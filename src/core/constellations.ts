/**
 * §3.4 — Mise en géométrie des trois couches de repérage.
 *
 * LE PIÈGE DES FRONTIÈRES. Elles sont définies le long de méridiens et de parallèles de
 * l'époque B1875, pas J2000. Sans précession, l'erreur atteint 1,75° à J2000 et 2,11° en
 * 2026 : largement visible. Elles sont donc ramenées ici en J2000 une fois pour toutes,
 * puis précessées vers l'époque affichée par la matrice unique de l'image (§3.1) — le même
 * chemin que les étoiles, ce qui interdit toute divergence entre les deux couches.
 *
 * Une arête de frontière n'est pas un segment droit : elle suit un méridien ou un
 * parallèle. Elle est subdivisée avant transformation, faute de quoi un parallèle traversant
 * un demi-ciel se tracerait comme une corde.
 */

import { K } from '../registry/constants.ts'
import type {
  AreteFrontiere,
  Asterisme,
  Figure,
  PaquetConstellations,
  Segment,
} from '../data/constellations.ts'
import { decalagePrecessionDeg, matricePrecession } from './horloges.ts'
import { DEG, applique, transpose, versVecteur, type Mat3, type Vec3 } from './mat3.ts'
import { trace, type Traced } from './traced.ts'
import { ecartCourt, TOUR_DEG } from './unites.ts'

/** B1875 → J2000 : l'inverse de la précession J2000 → B1875, donc sa transposée. */
export function matriceB1875VersJ2000(): Mat3 {
  return transpose(matricePrecession(K('EPOQUE_FRONTIERES_IAU')))
}

/** Longueur angulaire d'une arête, le long du méridien ou du parallèle qu'elle suit. */
export function longueurAreteDeg(arete: AreteFrontiere): number {
  if (arete.type === 'MERIDIEN') return Math.abs(arete.dec2Deg - arete.dec1Deg)
  const cos = Math.cos(((arete.dec1Deg + arete.dec2Deg) / 2) * DEG)
  return Math.abs(ecartCourt(arete.ad1Deg, arete.ad2Deg, TOUR_DEG)) * Math.abs(cos)
}

/**
 * Polyligne d'une arête, en J2000. La subdivision se fait AVANT la transformation, dans
 * l'époque où l'arête est droite.
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
  /** Code IAU des deux constellations séparées, dans l'ordre des polylignes. */
  readonly codes: readonly (readonly [string, string])[]
}

/** Toutes les frontières, en J2000, subdivisées. Calculé une fois au chargement du paquet. */
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

/** Écart introduit par la précession entre l'époque des frontières et l'époque affichée. */
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
}

function segmentsVers(segments: readonly Segment[]): readonly SegmentVec[] {
  return segments.map((s) => ({
    a: versVecteur(s.ad1Deg, s.dec1Deg),
    b: versVecteur(s.ad2Deg, s.dec2Deg),
  }))
}

export interface CoucheTraces {
  readonly code: string
  readonly nom: string
  readonly segments: readonly SegmentVec[]
  /** Barycentre des sommets, en J2000 : c'est là que se pose le label (§3.4). */
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

export function coucheFigures(figures: readonly Figure[]): readonly CoucheTraces[] {
  return figures.map((f) => {
    const segments = segmentsVers(f.segments)
    return { code: f.code, nom: f.nom, segments, centre: barycentre(segments) }
  })
}

export function coucheAsterismes(asterismes: readonly Asterisme[]): readonly CoucheTraces[] {
  return asterismes.map((a) => {
    const segments = segmentsVers(a.segments)
    return { code: a.id, nom: a.nom, segments, centre: barycentre(segments) }
  })
}

/**
 * §3.4 — « l'app indique qu'un astérisme n'est pas une constellation ». La phrase est ici
 * plutôt que dans un composant : c'est une règle métier, pas une décoration.
 */
export const RAPPEL_ASTERISME =
  'motifs de repérage — un astérisme n’est pas une constellation'

export const RAPPEL_FIGURES = 'dessins traditionnels reliant les étoiles'
