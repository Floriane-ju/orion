/**
 * §12.2 — Encodage binaire des catalogues.
 *
 * Jamais du CSV, jamais du JSON : 12 octets par étoile.
 *   AD     float32  4 o   précision ≈ 0,15" sur 360°, suffisante
 *   δ      float32  4 o
 *   mag V  int16    2 o   échelle ×100, plage −3 à +16
 *   B−V    int16    2 o   échelle ×1000
 *
 * HYG v3 complet jusqu'à magnitude 9 : 120 000 × 12 = 1,44 Mo, contre ~30 Mo pour le CSV
 * source. Le facteur 18 vient de l'encodage seul.
 *
 * Les métadonnées (version, comptage, somme de contrôle) vivent dans un manifeste JSON
 * séparé : le `.bin` ne contient que des enregistrements, ce qui garde le calcul de volume
 * exact et le décodage sans branche.
 */

import { dUnBloc, pointDeCoupe, type Decoupable } from '../core/tranches.ts'

export const OCTETS_PAR_ETOILE = 12

const OFFSET_AD = 0
const OFFSET_DEC = 4
const OFFSET_MAG = 8
const OFFSET_BV = 10

const ECHELLE_MAG = 100
const ECHELLE_BV = 1000

/** Little-endian partout, explicitement : le format ne dépend pas de la machine. */
const LITTLE_ENDIAN = true

export interface Etoile {
  /** Ascension droite J2000, en degrés. */
  readonly adDeg: number
  /** Déclinaison J2000, en degrés. */
  readonly decDeg: number
  /** Magnitude visuelle. */
  readonly magV: number
  /** Indice de couleur B−V. */
  readonly bv: number
}

export interface ManifestePaquet {
  readonly nom: string
  readonly version: string
  readonly nombreEntrees: number
  readonly octets: number
  /** SHA-256 hexadécimal du fichier binaire. */
  readonly sha256: string
  readonly source: string
  /** Faux pour un paquet différé comme Gaia (§12.2). */
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
 * T-0296 — le décodage nomme ses points de coupe : quatre-vingt mille étoiles décodées d'un
 * bloc tiennent le fil principal le temps d'une tâche longue sur une tablette. `dUnBloc` le
 * déroule sans interruption pour les bancs et les tests, `parTranches` par morceaux à l'écran.
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
 * Vérifie qu'un paquet correspond à son manifeste. Un paquet partiellement écrit après
 * interruption est marqué invalide : l'application ne sert jamais un catalogue tronqué
 * comme complet (§12.3).
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
