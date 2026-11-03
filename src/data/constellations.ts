/**
 * §3.4 — Reference-layer package: figures, boundaries, asterisms, named stars.
 * THREE DISTINCT LAYERS, often confused:
 *   FIGURES     segments joining main stars; cultural convention, no official existence.
 *   FRONTIÈRES  official split of 88 IAU constellations: REGIONS, not drawings. Defined on B1875
 *               meridians/parallels: package keeps that epoch, render precesses.
 *   ASTÉRISMES  unofficial patterns crossing boundaries; what beginners recognise: mandatory layer.
 * ENCODING — JSON as UTF-8 in a `.bin`, unlike §12.2 catalogues: few thousand vertices vs tens
 * of thousands of stars. Binary codec would save ~100 KB of 200 KB for one more format to verify.
 * Same integrity path as other packages.
 */

export interface Segment {
  readonly ad1Deg: number
  readonly dec1Deg: number
  readonly ad2Deg: number
  readonly dec2Deg: number
}

export interface Figure {
  /** 3-letter IAU code: « AND », « ORI ». */
  readonly code: string
  /** IAU Latin name (official, untranslated). */
  readonly nom: string
  /** J2000 segments, resolved from source HIP ids. */
  readonly segments: readonly Segment[]
}

export interface Asterisme {
  readonly id: string
  readonly nom: string
  readonly segments: readonly Segment[]
}

/** Boundary edge: B1875 meridian or parallel. */
export type TypeArete = 'MERIDIEN' | 'PARALLELE'

export interface AreteFrontiere {
  readonly type: TypeArete
  /** B1875 coords (Delporte), never pre-precessed. */
  readonly ad1Deg: number
  readonly dec1Deg: number
  readonly ad2Deg: number
  readonly dec2Deg: number
  /** Constellations either side. */
  readonly codes: readonly [string, string]
}

export interface EtoileNommee {
  readonly adDeg: number
  readonly decDeg: number
  readonly magV: number
  /** Bayer designation « α And »; empty if none. */
  readonly designation: string
  /** Proper name « Alpheratz »; empty if none. */
  readonly nomPropre: string
  /** Spectral type as published; empty if absent. */
  readonly spectre: string
  /** Distance in parsecs; `null` if parallax absent/unreliable. */
  readonly distancePc: number | null
  /** 3-letter IAU constellation code from catalogue. */
  readonly constellation: string
}

/**
 * Both forms of a named star joined, or whichever exists (no orphan dash). Package guarantees ≥ 1
 * non-empty (`scripts/build-catalogs.ts`).
 * T-0287 — name lives here with its type: planétarium fiche and §8.4 pointing map name the same
 * star; a second rule elsewhere = two vocabularies for one object (lesson of T-0109).
 */
export function nomComplet(nommee: EtoileNommee): string {
  if (nommee.nomPropre === '') return nommee.designation
  if (nommee.designation === '') return nommee.nomPropre
  return `${nommee.nomPropre} — ${nommee.designation}`
}

export interface PaquetConstellations {
  readonly figures: readonly Figure[]
  readonly asterismes: readonly Asterisme[]
  readonly frontieres: readonly AreteFrontiere[]
  readonly etoilesNommees: readonly EtoileNommee[]
  /**
   * Segments dropped, no star resolved in loaded catalogue (Gaia vertices HYG lacks). Declared,
   * not silent: a truncated figure must show in manifest, not on screen.
   */
  readonly segmentsIgnores: number
  readonly source: string
}

export function encodeConstellations(paquet: PaquetConstellations): ArrayBuffer {
  const octets = new TextEncoder().encode(JSON.stringify(paquet))
  return octets.buffer.slice(
    octets.byteOffset,
    octets.byteOffset + octets.byteLength,
  ) as ArrayBuffer
}

/**
 * T-0343 — unreadable/malformed package → empty package, not exception: reference layers
 * missing, sky stays correct (§3.4, §12.5).
 */
export function decodeConstellations(buffer: ArrayBuffer): PaquetConstellations {
  let brut: unknown
  try {
    brut = JSON.parse(new TextDecoder().decode(buffer))
  } catch {
    return PAQUET_VIDE
  }
  return estPaquetConstellations(brut) ? brut : PAQUET_VIDE
}

function estPaquetConstellations(brut: unknown): brut is PaquetConstellations {
  if (typeof brut !== 'object' || brut === null) return false
  const p = brut as Record<string, unknown>
  return (
    Array.isArray(p.figures) &&
    Array.isArray(p.asterismes) &&
    Array.isArray(p.frontieres) &&
    Array.isArray(p.etoilesNommees) &&
    typeof p.segmentsIgnores === 'number' &&
    typeof p.source === 'string'
  )
}

export const PAQUET_VIDE: PaquetConstellations = Object.freeze({
  figures: [],
  asterismes: [],
  frontieres: [],
  etoilesNommees: [],
  segmentsIgnores: 0,
  source: '',
})
