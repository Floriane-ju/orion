/**
 * §12.5 — embedded site-map fond: encode round-trips to quantization cell; unreadable packet
 * → empty fond, no exception (T-0364).
 */

import { describe, expect, it } from 'vitest'
import {
  FOND_VIDE,
  QUANTUM_FOND_DEG,
  decodeFondCarte,
  encodeFondCarte,
  type FondCarteSource,
} from '../src/data/fond-carte.ts'
import { pixelMonde } from '../src/core/mercator.ts'
import { SITE_REFERENCE } from './fixtures.ts'

const { latitudeDeg: LAT, longitudeDeg: LON } = SITE_REFERENCE

const SOURCE: FondCarteSource = {
  terres: [
    [
      [LON, LAT],
      [LON + 1, LAT],
      [LON + 1, LAT + 1],
    ],
  ],
  frontieres: [
    [
      [-LON, -LAT],
      [-LON + 2, -LAT + 2],
    ],
  ],
  villes: [{ nom: 'Référence', latitudeDeg: LAT, longitudeDeg: LON, zoomMin: 3 }],
  source: 'essai',
}

describe('paquet fond-carte', () => {
  it('relit les tracés en coordonnées Mercator normalisées, à la maille près', () => {
    const fond = decodeFondCarte(encodeFondCarte(SOURCE))
    expect(fond.terres).toHaveLength(1)
    expect(fond.frontieres).toHaveLength(1)
    const trace = fond.terres[0]!
    expect(trace).toHaveLength(6)
    const attendu = pixelMonde(LAT, LON, 0, 1)
    // One projected quantization cell ≪ a thousandth of the world.
    expect(trace[0]).toBeCloseTo(attendu.x, 4)
    expect(trace[1]).toBeCloseTo(attendu.y, 4)
    expect(QUANTUM_FOND_DEG).toBeLessThan(0.05)
  })

  it('relit les villes avec leur nom et leur zoom d’apparition', () => {
    const [ville] = decodeFondCarte(encodeFondCarte(SOURCE)).villes
    expect(ville?.nom).toBe('Référence')
    expect(ville?.zoomMin).toBe(3)
    expect(ville?.x).toBeCloseTo(pixelMonde(LAT, LON, 0, 1).x, 4)
  })

  it('rend le fond vide sur un paquet tronqué ou vide', () => {
    const complet = encodeFondCarte(SOURCE)
    expect(decodeFondCarte(complet.slice(0, complet.byteLength - 7))).toBe(FOND_VIDE)
    expect(decodeFondCarte(new ArrayBuffer(0))).toBe(FOND_VIDE)
  })
})
