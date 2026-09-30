/**
 * §12.5 — le fond embarqué de la carte du site : terres, frontières et villes (T-0364).
 *
 * Il est ce qui reste de la carte hors réseau. Natural Earth au 1:50 M : assez pour reconnaître
 * sa région et poser le site à quelques kilomètres, ce que le ciel ne distingue de toute façon
 * pas — une minute de latitude décale une étoile d'une minute d'arc.
 *
 * Format binaire, petit-boutiste : trois compteurs (terres, frontières, octets des villes),
 * puis chaque tracé — son nombre de points, puis ses couples (lon, lat) quantifiés en Int16 —,
 * puis les villes en JSON. Les points sont relus en coordonnées Mercator normalisées [0 ; 1] :
 * la projection se fait une fois au chargement, pas à chaque image.
 */

import { pixelMonde } from '../core/mercator.ts'

/** Maille de quantification : ≈ 1 km, sous la précision du 1:50 M. Int16 couvre ±327°. */
export const QUANTUM_FOND_DEG = 0.01

/** Mercator s'arrête à ±85° : l'Antarctique se ferme au bord du monde sans point infini. */
const LATITUDE_MAX_TRACE_DEG = 85

type Point = readonly [lonDeg: number, latDeg: number]

export interface VilleSource {
  readonly nom: string
  readonly latitudeDeg: number
  readonly longitudeDeg: number
  /** Le zoom à partir duquel son nom s'affiche — `min_zoom` de Natural Earth. */
  readonly zoomMin: number
}

export interface FondCarteSource {
  readonly terres: readonly (readonly Point[])[]
  readonly frontieres: readonly (readonly Point[])[]
  readonly villes: readonly VilleSource[]
  readonly source: string
}

export interface VilleFond {
  readonly nom: string
  readonly x: number
  readonly y: number
  readonly zoomMin: number
}

export interface FondCarte {
  /** Chaque tracé : x0, y0, x1, y1… en coordonnées Mercator normalisées. */
  readonly terres: readonly Float64Array[]
  readonly frontieres: readonly Float64Array[]
  readonly villes: readonly VilleFond[]
}

export const FOND_VIDE: FondCarte = Object.freeze({ terres: [], frontieres: [], villes: [] })

const OCTETS_U32 = 4
const OCTETS_POINT = 4
const ENTETE = 3 * OCTETS_U32

type VilleBrute = [nom: string, latDeg: number, lonDeg: number, zoomMin: number]

export function encodeFondCarte(fond: FondCarteSource): ArrayBuffer {
  const villes = new TextEncoder().encode(
    JSON.stringify(
      fond.villes.map((v): VilleBrute => [v.nom, v.latitudeDeg, v.longitudeDeg, v.zoomMin]),
    ),
  )
  const traces = [...fond.terres, ...fond.frontieres]
  const octets =
    ENTETE + traces.reduce((s, t) => s + OCTETS_U32 + t.length * OCTETS_POINT, 0) + villes.length
  const buffer = new ArrayBuffer(octets)
  const vue = new DataView(buffer)
  vue.setUint32(0, fond.terres.length, true)
  vue.setUint32(OCTETS_U32, fond.frontieres.length, true)
  vue.setUint32(2 * OCTETS_U32, villes.length, true)
  let o = ENTETE
  for (const trace of traces) {
    vue.setUint32(o, trace.length, true)
    o += OCTETS_U32
    for (const [lon, lat] of trace) {
      vue.setInt16(o, Math.round(lon / QUANTUM_FOND_DEG), true)
      vue.setInt16(o + 2, Math.round(lat / QUANTUM_FOND_DEG), true)
      o += OCTETS_POINT
    }
  }
  new Uint8Array(buffer, o).set(villes)
  return buffer
}

/** Un paquet illisible donne le fond vide : la carte reste, sans tracé (§12.5). */
export function decodeFondCarte(buffer: ArrayBuffer): FondCarte {
  try {
    return decode(buffer)
  } catch {
    return FOND_VIDE
  }
}

function projete(latDeg: number, lonDeg: number): { x: number; y: number } {
  const lat = Math.max(-LATITUDE_MAX_TRACE_DEG, Math.min(LATITUDE_MAX_TRACE_DEG, latDeg))
  return pixelMonde(lat, lonDeg, 0, 1)
}

function decode(buffer: ArrayBuffer): FondCarte {
  const vue = new DataView(buffer)
  const nbTerres = vue.getUint32(0, true)
  const nbFrontieres = vue.getUint32(OCTETS_U32, true)
  const octetsVilles = vue.getUint32(2 * OCTETS_U32, true)
  let o = ENTETE
  const lit = (): Float64Array => {
    const n = vue.getUint32(o, true)
    o += OCTETS_U32
    const trace = new Float64Array(2 * n)
    for (let i = 0; i < n; i++, o += OCTETS_POINT) {
      const p = projete(
        vue.getInt16(o + 2, true) * QUANTUM_FOND_DEG,
        vue.getInt16(o, true) * QUANTUM_FOND_DEG,
      )
      trace[2 * i] = p.x
      trace[2 * i + 1] = p.y
    }
    return trace
  }
  const terres = Array.from({ length: nbTerres }, lit)
  const frontieres = Array.from({ length: nbFrontieres }, lit)
  if (o + octetsVilles !== buffer.byteLength) throw new Error('paquet fond-carte tronqué')
  const brutes = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, o))) as VilleBrute[]
  const villes = brutes.map(([nom, lat, lon, zoomMin]) =>
    Object.freeze({ nom, zoomMin, ...projete(lat, lon) }),
  )
  return Object.freeze({ terres, frontieres, villes })
}
