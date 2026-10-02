/**
 * Lecteur WOFF2 minimal pour les tests de polices (T-0389).
 *
 * Il ne lit que ce qu'un test demande à une fonte livrée : les points de code de sa `cmap`
 * et sa chasse (`hhea.advanceWidthMax` rapportée à `head.unitsPerEm`). Le brotli est celui de
 * Node : pas de fontTools, pas de dépendance. `glyf`/`loca` transformés ne sont jamais lus.
 */

import { readFileSync } from 'node:fs'
import { brotliDecompressSync } from 'node:zlib'

// WOFF2 §5.1 : index des étiquettes connues, dans l'ordre de la spécification.
const ETIQUETTES: readonly string[] = Object.freeze(
  [
    'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf',
    'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT',
    'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT',
    'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar',
    'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd',
    'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
  ],
)

export interface Fonte {
  readonly points: ReadonlySet<number>
  /** Avance maximale en fraction de cadratin : 0,6 pour une mono de 600 / 1000. */
  readonly chasse: number
}

function base128(octets: Uint8Array, position: { i: number }): number {
  let valeur = 0
  for (let n = 0; n < 5; n++) {
    const o = octets[position.i++]!
    valeur = valeur * 128 + (o & 0x7f)
    if ((o & 0x80) === 0) return valeur
  }
  throw new Error('UIntBase128 trop long')
}

function tables(octets: Uint8Array): ReadonlyMap<string, DataView> {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
  if (vue.getUint32(0) !== 0x774f4632) throw new Error('pas un WOFF2')
  const nombre = vue.getUint16(12)
  const position = { i: 48 }
  const entrees: { etiquette: string; longueur: number }[] = []
  for (let t = 0; t < nombre; t++) {
    const drapeaux = octets[position.i++]!
    let etiquette = ETIQUETTES[drapeaux & 0x3f] ?? ''
    if ((drapeaux & 0x3f) === 0x3f) {
      etiquette = String.fromCharCode(...octets.subarray(position.i, position.i + 4))
      position.i += 4
    }
    const origine = base128(octets, position)
    const version = drapeaux >> 6
    const glyphes = etiquette === 'glyf' || etiquette === 'loca'
    const transformee = glyphes ? version !== 3 : version !== 0
    const longueur = transformee ? base128(octets, position) : origine
    entrees.push({ etiquette, longueur })
  }
  const compresse = vue.getUint32(20)
  const flux = brotliDecompressSync(octets.subarray(position.i, position.i + compresse))
  const resultat = new Map<string, DataView>()
  let curseur = 0
  for (const { etiquette, longueur } of entrees) {
    resultat.set(etiquette, new DataView(flux.buffer, flux.byteOffset + curseur, longueur))
    curseur += longueur
  }
  return resultat
}

/** Formats 4 et 12, les seuls que servent les sous-ensembles Google Fonts. */
function pointsDeCmap(cmap: DataView): ReadonlySet<number> {
  const points = new Set<number>()
  const nombre = cmap.getUint16(2)
  for (let s = 0; s < nombre; s++) {
    const debut = cmap.getUint32(4 + s * 8 + 4)
    const format = cmap.getUint16(debut)
    if (format === 12) {
      const groupes = cmap.getUint32(debut + 12)
      for (let g = 0; g < groupes; g++) {
        const p = debut + 16 + g * 12
        for (let c = cmap.getUint32(p); c <= cmap.getUint32(p + 4); c++) points.add(c)
      }
    } else if (format === 4) {
      const segments = cmap.getUint16(debut + 6) / 2
      for (let g = 0; g < segments; g++) {
        const fin = cmap.getUint16(debut + 14 + g * 2)
        const depart = cmap.getUint16(debut + 16 + segments * 2 + g * 2)
        // ponytail: plage supposée pleine sans lire glyphIdArray ; un trou vers .notdef
        // passerait pour couvert. Lire glyphIdArray si un sous-ensemble en fabrique un.
        for (let c = depart; c <= fin && c !== 0xffff; c++) points.add(c)
      }
    }
  }
  return points
}

export function litWoff2(chemin: string): Fonte {
  const t = tables(readFileSync(chemin))
  const head = t.get('head')!
  const hhea = t.get('hhea')!
  return Object.freeze({
    points: pointsDeCmap(t.get('cmap')!),
    chasse: hhea.getUint16(10) / head.getUint16(18),
  })
}
