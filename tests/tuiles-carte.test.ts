/**
 * §12.5, §13.1 — les tuiles de la carte du site : jamais hors réseau, jamais indéfiniment,
 * jamais sans borne en mémoire (T-0363).
 *
 * Le réseau est remplacé par un chargeur factice : ce qui est vérifié, c'est la conduite face
 * à chaque issue, pas la disponibilité d'OSM.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheTuiles, cleTuile, tuileVisible } from '../src/data/tuiles-carte.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cache des tuiles de carte', () => {
  it('ne demande rien hors réseau', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const charge = vi.fn(async () => 'image')
    const cache = cacheTuiles(charge, 4)
    expect(cache.demande(3, 1, 2, () => {})).toBeNull()
    expect(charge).not.toHaveBeenCalled()
  })

  it('demande une tuile une seule fois et la rend une fois chargée', async () => {
    const charge = vi.fn(async () => 'image')
    const cache = cacheTuiles(charge, 4)
    const pret = vi.fn()
    expect(cache.demande(3, 1, 2, pret)).toBeNull()
    expect(cache.demande(3, 1, 2, pret)).toBeNull()
    await vi.waitFor(() => expect(pret).toHaveBeenCalled())
    expect(charge).toHaveBeenCalledTimes(1)
    expect(cache.demande(3, 1, 2, pret)).toBe('image')
  })

  it('n’en garde pas plus que le plafond, en évinçant la plus ancienne', async () => {
    const charge = vi.fn(async (z: number, x: number) => `t${z}/${x}`)
    const cache = cacheTuiles(charge, 2)
    for (const x of [0, 1, 2]) {
      cache.demande(4, x, 0, () => {})
      await vi.waitFor(() => expect(cache.demande(4, x, 0, () => {})).not.toBeNull())
    }
    expect(cache.taille()).toBe(2)
    charge.mockClear()
    expect(cache.demande(4, 0, 0, () => {})).toBeNull()
    expect(charge).toHaveBeenCalledTimes(1)
  })

  it('laisse la place à une nouvelle demande quand le chargement échoue', async () => {
    let echec = true
    const charge = vi.fn(async () => {
      if (echec) throw new Error('réseau')
      return 'image'
    })
    const cache = cacheTuiles(charge, 4)
    cache.demande(2, 0, 0, () => {})
    await vi.waitFor(() => expect(charge).toHaveBeenCalledTimes(1))
    await new Promise((fin) => setTimeout(fin, 0))
    echec = false
    const pret = vi.fn()
    cache.demande(2, 0, 0, pret)
    await vi.waitFor(() => expect(pret).toHaveBeenCalled())
    expect(cache.demande(2, 0, 0, () => {})).toBe('image')
  })
})

describe('numérotation', () => {
  it('referme la colonne à l’antiméridien et refuse les rangées hors du monde', () => {
    expect(tuileVisible(2, -1, 0)).toStrictEqual({ x: 3, y: 0 })
    expect(tuileVisible(2, 4, 3)).toStrictEqual({ x: 0, y: 3 })
    expect(tuileVisible(2, 0, -1)).toBeNull()
    expect(tuileVisible(2, 0, 4)).toBeNull()
    expect(cleTuile(2, 3, 1)).toBe('2/3/1')
  })
})
