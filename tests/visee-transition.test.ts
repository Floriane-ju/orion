/** §6.4, T-0447 — the displayed visée glides to the cible. */

import { describe, expect, it } from 'vitest'
import { viseeA } from '../src/ui/visee-transition.ts'

const DUREE = 100

describe('glissement de la visée — T-0447', () => {
  const depart = { azimutDeg: 90, hauteurDeg: 10 }
  const cible = { azimutDeg: 110, hauteurDeg: 30 }
  const transition = { depart, debutMs: 0 }

  it('part du point quitté', () => {
    expect(viseeA(transition, cible, 0, DUREE)).toEqual(depart)
  })

  it('passe à mi-chemin à mi-durée', () => {
    const milieu = viseeA(transition, cible, DUREE / 2, DUREE)
    expect(milieu.azimutDeg).toBeCloseTo(100, 9)
    expect(milieu.hauteurDeg).toBeCloseTo(20, 9)
  })

  it('rend la cible elle-même à l’arrivée : la boucle sait que c’est fini', () => {
    expect(viseeA(transition, cible, DUREE, DUREE)).toBe(cible)
  })

  it('saute sans durée (prefers-reduced-motion)', () => {
    expect(viseeA(transition, cible, 0, 0)).toBe(cible)
  })

  it('passe 0°/360° par le plus court chemin, azimut toujours dans 0–360°', () => {
    const nord = { depart: { azimutDeg: 350, hauteurDeg: 0 }, debutMs: 0 }
    const azimut = viseeA(nord, { azimutDeg: 10, hauteurDeg: 0 }, DUREE / 2, DUREE).azimutDeg
    expect(azimut).toBeCloseTo(0, 9)
  })
})
