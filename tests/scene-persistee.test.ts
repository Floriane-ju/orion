/**
 * T-0355 — la scène s'ouvre en vue réaliste et survit au rechargement.
 *
 * Le stockage est hors du périmètre de confiance : un champ abîmé retombe sur le défaut sans
 * emporter les autres.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { ecritScenePersistee, litScenePersistee } from '../src/data/scene-persistee.ts'
import {
  etatScene,
  majRendu,
  majVue,
  montreParcours,
  reinitialiseScene,
  scenePersistee,
  vaA,
} from '../src/ui/scene-etat.ts'

function stockage(): Map<string, string> {
  const cles = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (c: string) => cles.get(c) ?? null,
      setItem: (c: string, v: string) => void cles.set(c, v),
    },
  })
  return cles
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage
  reinitialiseScene()
})

describe('T-0355 — scène persistée', () => {
  it('s’ouvre en vue réaliste', () => {
    reinitialiseScene()
    expect(etatScene().rendu.vueRealiste).toBe(true)
  })

  it('relit ce qu’elle a écrit : pointage, champ, projection, couches, instant figé', () => {
    stockage()
    reinitialiseScene()
    const ms = Date.UTC(2026, 7, 21, 22, 47)
    majVue({ azimutDeg: 123, hauteurDeg: 45, fovDeg: 20, mode: 'MODE_CADRE' })
    majRendu((r) => ({ vueRealiste: false, couches: { ...r.couches, frontieres: true } }))
    vaA(ms)
    ecritScenePersistee(scenePersistee(etatScene(), ms))

    const lu = litScenePersistee()
    expect(lu.vue).toMatchObject({ azimutDeg: 123, hauteurDeg: 45, fovDeg: 20, mode: 'MODE_CADRE' })
    expect(lu.temps?.modeTemps).toBe('FIGE')
    expect(lu.ms).toBe(ms)
    expect(lu.rendu?.vueRealiste).toBe(false)
    expect(lu.rendu?.couches?.frontieres).toBe(true)
  })

  it('un parcours ouvert garde l’instant d’avant lui, pas celui du pointage', () => {
    reinitialiseScene()
    const avant = Date.UTC(2026, 7, 21, 20, 0)
    vaA(avant)
    montreParcours(
      { designation: 'M31', etapes: [], adCibleH: 0, decCibleDeg: 0 },
      Date.UTC(2026, 7, 21, 23, 0),
    )
    expect(scenePersistee(etatScene(), Date.UTC(2026, 7, 21, 23, 0)).ms).toBe(avant)
  })

  it('ignore les champs abîmés sans perdre les autres', () => {
    const cles = stockage()
    cles.set(
      'orion.scene',
      JSON.stringify({
        vue: { azimutDeg: 'nord', hauteurDeg: 400, fovDeg: 30, mode: 'MODE_INCONNU' },
        temps: { modeTemps: 'FIGE', facteur: null },
        ms: 'hier',
        rendu: { vueRealiste: 'oui', couches: { sol: false, figures: 1 } },
      }),
    )
    expect(litScenePersistee()).toStrictEqual({
      vue: { fovDeg: 30 },
      temps: { modeTemps: 'FIGE' },
      rendu: { couches: { sol: false } },
    })
    cles.set('orion.scene', '{ pas du JSON')
    expect(litScenePersistee()).toStrictEqual({})
  })
})
