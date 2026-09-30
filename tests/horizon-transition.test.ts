/**
 * §4.1, T-0369 — l'horizon dessiné glisse d'un relief à l'autre.
 */

import { describe, expect, it } from 'vitest'
import { NB_AZIMUTS } from '../src/core/site.ts'
import { R } from '../src/registry/relief.ts'
import { HORIZON_PLAT, horizonA, versHorizon } from '../src/ui/horizon-transition.ts'

const DUREE = R('DUREE_TRANSITION_RELIEF_MS')
/** Un relief quelconque : ce qui compte est qu'il diffère du plat à chaque azimut. */
const RELIEF = Object.freeze(Array.from({ length: NB_AZIMUTS }, (_, i) => 1 + (i % 7)))

describe('transition de l’horizon', () => {
  it('pose la première cible sans animation', () => {
    const t = versHorizon(null, RELIEF, 0, DUREE)
    expect(horizonA(t, 0, DUREE)).toBe(RELIEF)
  })

  it('part de l’ancien relief et finit sur la cible, par identité', () => {
    const t = versHorizon(versHorizon(null, RELIEF, 0, DUREE), HORIZON_PLAT, 0, DUREE)
    expect(horizonA(t, 0, DUREE)).toEqual(RELIEF)
    const milieu = horizonA(t, DUREE / 2, DUREE)
    milieu.forEach((a, i) => {
      expect(a).toBeGreaterThan(0)
      expect(a).toBeLessThan(RELIEF[i] ?? 0)
    })
    expect(horizonA(t, DUREE, DUREE)).toBe(HORIZON_PLAT)
  })

  it('une cible neuve en cours de route repart de la forme affichée', () => {
    const aplatit = versHorizon(versHorizon(null, RELIEF, 0, DUREE), HORIZON_PLAT, 0, DUREE)
    const affiche = horizonA(aplatit, DUREE / 2, DUREE)
    const nouveau = Object.freeze(RELIEF.map((a) => a * 2))
    const monte = versHorizon(aplatit, nouveau, DUREE / 2, DUREE)
    expect(horizonA(monte, DUREE / 2, DUREE)).toEqual(affiche)
    expect(horizonA(monte, DUREE / 2 + DUREE, DUREE)).toBe(nouveau)
  })

  it('garde la transition en cours quand la cible ne change pas', () => {
    const t = versHorizon(versHorizon(null, RELIEF, 0, DUREE), HORIZON_PLAT, 0, DUREE)
    expect(versHorizon(t, HORIZON_PLAT, DUREE / 2, DUREE)).toBe(t)
  })

  it('sans durée, la cible se pose d’un coup', () => {
    const t = versHorizon(versHorizon(null, RELIEF, 0, 0), HORIZON_PLAT, 0, 0)
    expect(horizonA(t, 0, 0)).toBe(HORIZON_PLAT)
  })
})
