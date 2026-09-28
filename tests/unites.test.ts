/**
 * T-0336 — les réductions d'angle, le bornage et les séparations n'ont qu'une écriture.
 *
 * Ce sont des propriétés, pas des valeurs recopiées : une réduction reste dans son tour, un
 * écart court ne dépasse jamais le demi-tour, deux formes de la séparation s'accordent.
 */

import { describe, expect, it } from 'vitest'
import {
  DEG_PAR_HEURE,
  DEMI_TOUR_DEG,
  TOUR_DEG,
  ecartCourt,
  encadre,
  ramene,
} from '../src/core/unites.ts'
import {
  angleDeCosDeg,
  angleDeSinDeg,
  separationDeg,
  separationEquatorialeDeg,
  versVecteur,
} from '../src/core/mat3.ts'

const ANGLES = [-725, -360, -180.5, -1, 0, 1, 179.5, 180, 359.9, 360, 721]

describe('T-0336 — unités et angles', () => {
  it('ramène tout angle dans [0 ; tour[ sans changer sa direction', () => {
    for (const a of ANGLES) {
      const r = ramene(a, TOUR_DEG)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(TOUR_DEG)
      expect(Math.cos((r - a) * (Math.PI / DEMI_TOUR_DEG))).toBeCloseTo(1, 9)
    }
  })

  it('prend l’écart par le plus court chemin', () => {
    for (const a of ANGLES) {
      for (const b of ANGLES) {
        const d = ecartCourt(a, b, TOUR_DEG)
        expect(Math.abs(d)).toBeLessThanOrEqual(DEMI_TOUR_DEG)
        expect(ramene(a + d - b, TOUR_DEG) % TOUR_DEG).toBeCloseTo(0, 6)
      }
    }
  })

  it('borne sans jamais sortir de l’intervalle', () => {
    expect(encadre(-1, 0, 1)).toBe(0)
    expect(encadre(2, 0, 1)).toBe(1)
    expect(encadre(0.5, 0, 1)).toBe(0.5)
  })

  it('ne rend jamais NaN pour un cosinus ou un sinus sorti de [−1 ; 1] d’un arrondi', () => {
    expect(angleDeCosDeg(1 + Number.EPSILON)).toBe(0)
    expect(angleDeSinDeg(-1 - Number.EPSILON)).toBe(-90)
  })

  it('la séparation équatoriale est celle des deux directions', () => {
    const [ad1, dec1, ad2, dec2] = [5.5, -20, 13.25, 48]
    expect(separationEquatorialeDeg(ad1, dec1, ad2, dec2)).toBeCloseTo(
      separationDeg(versVecteur(ad1 * DEG_PAR_HEURE, dec1), versVecteur(ad2 * DEG_PAR_HEURE, dec2)),
      12,
    )
  })
})
