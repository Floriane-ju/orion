/**
 * §12.2 — Binary catalogue encoding. Never CSV/JSON: 12 bytes per star.
 *   AD     float32  4 o   precision ≈ 0,15" over 360°, sufficient
 *   δ      float32  4 o
 *   mag V  int16    2 o   scale ×100, range −3 to +16
 *   B−V    int16    2 o   scale ×1000
 * HYG v3 complete to magnitude 9: 120 000 × 12 = 1,44 Mo vs ~30 Mo source CSV (×18 from encoding).
 * Metadata (version, count, checksum) in separate JSON manifest: `.bin` = records only, exact
 * volume computation, branch-free decoding.
 */

import { dUnBloc, pointDeCoupe, type Decoupable } from '../core/tranches.ts'

export const OCTETS_PAR_ETOILE = 12

const OFFSET_AD = 0
const OFFSET_DEC = 4
const OFFSET_MAG = 8
const OFFSET_BV = 10

const ECHELLE_MAG = 100
const ECHELLE_BV = 1000

/** Explicit little-endian: machine-independent format. */
const LITTLE_ENDIAN = true

export interface Etoile {
  /** J2000 right ascension, deg. */
  readonly adDeg: number
  /** J2000 declination, deg. */
  readonly decDeg: number
  /** Visual magnitude. */
  readonly magV: number
  /** B−V colour index. */
  readonly bv: number
}

export interface ManifestePaquet {
  readonly nom: string
  readonly version: string
  readonly nombreEntrees: number
  readonly octets: number
  /** Hex SHA-256 of binary file. */
  readonly sha256: string
  readonly source: string
  /** False = deferred package, e.g. Gaia (§12.2). */
  readonly obligatoire: boolean
}

export function encodeEtoiles(etoiles: readonly Etoile[]): ArrayBuffer {
  const buffer = new ArrayBuffer(etoiles.length * OCTETS_PAR_ETOILE)
  const vue = new DataView(buffer)
  for (let i = 0; i < etoiles.length; i++) {
    const e = etoiles[i]!
    const base = i * OCTETS_PAR_ETOILE
    vue.setFloat32(base + OFFSET_AD, e.adDeg, LITTLE_ENDIAN)
    vue.setFloat32(base + OFFSET_DEC, e.decDeg, LITTLE_ENDIAN)
    vue.setInt16(base + OFFSET_MAG, Math.round(e.magV * ECHELLE_MAG), LITTLE_ENDIAN)
    vue.setInt16(base + OFFSET_BV, Math.round(e.bv * ECHELLE_BV), LITTLE_ENDIAN)
  }
  return buffer
}

export function nombreEtoiles(buffer: ArrayBuffer): number {
  return Math.floor(buffer.byteLength / OCTETS_PAR_ETOILE)
}

/**
 * T-0296 — decode names its cut points: 80k stars in one block = long task on tablet. `dUnBloc`
 * runs uninterrupted (benches, tests), `parTranches` sliced on screen.
 */
export function* decodeEtoilesPas(buffer: ArrayBuffer): Decoupable<Etoile[]> {
  const vue = new DataView(buffer)
  const n = nombreEtoiles(buffer)
  const etoiles: Etoile[] = new Array(n)
  for (let i = 0; i < n; i++) {
    if (pointDeCoupe(i)) yield
    const base = i * OCTETS_PAR_ETOILE
    etoiles[i] = {
      adDeg: vue.getFloat32(base + OFFSET_AD, LITTLE_ENDIAN),
      decDeg: vue.getFloat32(base + OFFSET_DEC, LITTLE_ENDIAN),
      magV: vue.getInt16(base + OFFSET_MAG, LITTLE_ENDIAN) / ECHELLE_MAG,
      bv: vue.getInt16(base + OFFSET_BV, LITTLE_ENDIAN) / ECHELLE_BV,
    }
  }
  return etoiles
}

export function decodeEtoiles(buffer: ArrayBuffer): Etoile[] {
  return dUnBloc(decodeEtoilesPas(buffer))
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(empreinte))
    .map((octet) => octet.toString(16).padStart(2, '0'))
    .join('')
}

export type IntegritePaquet = 'OK' | 'CORROMPU' | 'ABSENT'

/**
 * Package matches manifest? Partial write after interruption = invalid; truncated catalogue never
 * served as complete (§12.3).
 */
export async function verifieIntegrite(
  buffer: ArrayBuffer | null,
  manifeste: ManifestePaquet,
): Promise<IntegritePaquet> {
  if (buffer === null) return 'ABSENT'
  if (buffer.byteLength !== manifeste.octets) return 'CORROMPU'
  const empreinte = await sha256Hex(buffer)
  return empreinte === manifeste.sha256 ? 'OK' : 'CORROMPU'
}
