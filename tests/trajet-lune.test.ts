/**
 * T-0399 — la trace de la Lune en Panorama : instants échantillonnés sur la durée de prise de
 * vue, positions topocentriques tirées de `positionCorps`, jamais recopiées.
 */
import { describe, expect, it } from 'vitest'
import { Body, positionCorps } from '../src/core/ephem.ts'
import { cacheTrajetLune, instantsTrajet, trajetLune } from '../src/core/trajet-lune.ts'
import { K } from '../src/registry/constants.ts'
import { MS_PAR_MINUTE } from '../src/core/unites.ts'
import { SITE_REFERENCE } from './fixtures.ts'

const PAS_MS = K('PAS_TRAJET_LUNE_MIN') * MS_PAR_MINUTE
const DEBUT_MS = Date.parse('2026-10-08T21:03:17Z')

describe('instantsTrajet', () => {
  it('durée nulle : le seul instant de départ', () => {
    expect(instantsTrajet(DEBUT_MS, 0, PAS_MS)).toEqual([DEBUT_MS])
  })

  it('durée plus courte que le pas, sans point de grille dedans : début et fin exacts', () => {
    const debut = Math.ceil(DEBUT_MS / PAS_MS) * PAS_MS
    expect(instantsTrajet(debut, PAS_MS / 2, PAS_MS)).toEqual([debut, debut + PAS_MS / 2])
  })

  it('points de grille alignés, strictement intérieurs, bornés par les extrémités exactes', () => {
    const duree = 3 * PAS_MS
    const instants = instantsTrajet(DEBUT_MS, duree, PAS_MS)
    expect(instants[0]).toBe(DEBUT_MS)
    expect(instants.at(-1)).toBe(DEBUT_MS + duree)
    const interieurs = instants.slice(1, -1)
    expect(interieurs).toHaveLength(3)
    for (const t of interieurs) {
      expect(t % PAS_MS).toBe(0)
      expect(t).toBeGreaterThan(DEBUT_MS)
      expect(t).toBeLessThan(DEBUT_MS + duree)
    }
  })

  it('départ sur la grille : pas de doublon', () => {
    const debut = Math.ceil(DEBUT_MS / PAS_MS) * PAS_MS
    const instants = instantsTrajet(debut, 2 * PAS_MS, PAS_MS)
    expect(instants).toEqual([debut, debut + PAS_MS, debut + 2 * PAS_MS])
  })
})

describe('trajetLune', () => {
  it('donne la position de la Lune à chaque instant échantillonné', () => {
    const duree = 2 * 60 * MS_PAR_MINUTE
    const trajet = trajetLune(SITE_REFERENCE, DEBUT_MS, duree, cacheTrajetLune())
    const instants = instantsTrajet(DEBUT_MS, duree, PAS_MS)
    expect(trajet).toHaveLength(instants.length)
    trajet.forEach((p, i) => {
      expect(p).toEqual(positionCorps(Body.Moon, new Date(instants[i]!), SITE_REFERENCE))
    })
  })

  it('réutilise les points déjà calculés quand la fenêtre glisse', () => {
    const cache = cacheTrajetLune()
    const duree = 60 * MS_PAR_MINUTE
    trajetLune(SITE_REFERENCE, DEBUT_MS, duree, cache)
    const grille = instantsTrajet(DEBUT_MS, duree, PAS_MS).slice(1, -1)
    const avant = grille.map((t) => cache.positions.get(t))
    trajetLune(SITE_REFERENCE, DEBUT_MS + PAS_MS / 3, duree, cache)
    grille.forEach((t, i) => expect(cache.positions.get(t)).toBe(avant[i]))
  })

  it('évince ce qui sort de la fenêtre', () => {
    const cache = cacheTrajetLune()
    const duree = 60 * MS_PAR_MINUTE
    trajetLune(SITE_REFERENCE, DEBUT_MS, duree, cache)
    trajetLune(SITE_REFERENCE, DEBUT_MS + 10 * duree, duree, cache)
    for (const t of cache.positions.keys()) expect(t).toBeGreaterThanOrEqual(DEBUT_MS + 10 * duree)
  })

  it('un autre site vide le cache', () => {
    const cache = cacheTrajetLune()
    trajetLune(SITE_REFERENCE, DEBUT_MS, 0, cache)
    const ailleurs = { ...SITE_REFERENCE, longitudeDeg: SITE_REFERENCE.longitudeDeg + 30 }
    const [p] = trajetLune(ailleurs, DEBUT_MS, 0, cache)
    expect(p).toEqual(positionCorps(Body.Moon, new Date(DEBUT_MS), ailleurs))
  })

  it('hors du domaine des séries : aucune trace', () => {
    expect(trajetLune(SITE_REFERENCE, Date.parse('9999-01-01T00:00:00Z'), 0, cacheTrajetLune())).toEqual([])
  })
})
