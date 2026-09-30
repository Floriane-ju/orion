/**
 * La projection Web Mercator des tuiles, dans les deux sens (T-0363).
 *
 * Le relief de §4.1 va du lieu au pixel ; la carte de choix du lieu fait l'aller-retour. Les
 * deux doivent tomber sur le même lieu, sinon le clic poserait le site à côté du point visé.
 */

import { describe, expect, it } from 'vitest'
import { LATITUDE_MAX_MERCATOR_DEG, lieuDePixel, pixelMonde } from '../src/core/mercator.ts'
import { SITE_REFERENCE } from './fixtures.ts'

const COTE = 256
const PRECISION = 9

describe('Web Mercator', () => {
  it('revient au lieu de départ, à tout zoom', () => {
    const { latitudeDeg, longitudeDeg } = SITE_REFERENCE
    for (const z of [0, 5, 12, 17]) {
      const p = pixelMonde(latitudeDeg, longitudeDeg, z, COTE)
      const lieu = lieuDePixel(p.x, p.y, z, COTE)
      expect(lieu.latitudeDeg).toBeCloseTo(latitudeDeg, PRECISION)
      expect(lieu.longitudeDeg).toBeCloseTo(longitudeDeg, PRECISION)
    }
  })

  it('pose l’origine au centre du monde et la latitude limite en haut', () => {
    const z = 3
    const monde = COTE * 2 ** z
    expect(pixelMonde(0, 0, z, COTE)).toStrictEqual({ x: monde / 2, y: monde / 2 })
    expect(pixelMonde(LATITUDE_MAX_MERCATOR_DEG, 0, z, COTE).y).toBeCloseTo(0, PRECISION)
    expect(lieuDePixel(0, 0, z, COTE).latitudeDeg).toBeCloseTo(LATITUDE_MAX_MERCATOR_DEG, PRECISION)
  })

  it('ramène la longitude dans [−180 ; 180[ au-delà de l’antiméridien', () => {
    const z = 2
    const monde = COTE * 2 ** z
    const a = lieuDePixel(monde / 4, monde / 2, z, COTE)
    const b = lieuDePixel(monde / 4 + monde, monde / 2, z, COTE)
    const c = lieuDePixel(monde / 4 - monde, monde / 2, z, COTE)
    expect(b.longitudeDeg).toBeCloseTo(a.longitudeDeg, PRECISION)
    expect(c.longitudeDeg).toBeCloseTo(a.longitudeDeg, PRECISION)
  })

  it('borne la latitude au carré Mercator hors de la carte', () => {
    expect(lieuDePixel(0, -1e6, 1, COTE).latitudeDeg).toBeCloseTo(LATITUDE_MAX_MERCATOR_DEG, PRECISION)
    expect(lieuDePixel(0, 1e6, 1, COTE).latitudeDeg).toBeCloseTo(-LATITUDE_MAX_MERCATOR_DEG, PRECISION)
  })
})
