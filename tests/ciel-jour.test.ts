/**
 * Ciel de jour en vue réaliste : le Soleil diffuse par KS91 comme la Lune, et l'œil s'adapte
 * (`LUMINANCE_ECRAN_ZENITH_ADAPTE`) pour que le zénith reste bleu et le halo blanchisse.
 */
import { describe, expect, it } from 'vitest'
import {
  adaptationEcran,
  brillanceSoleilNl,
  composantesFond,
  sbDepuisNanolamberts,
  sbZenithAvecCrepuscule,
} from '../src/core/fond-ciel-rendu.ts'
import { nanolamberts } from '../src/core/moon.ts'
import { interpoleBortle } from '../src/registry/bortle.ts'
import { K } from '../src/registry/constants.ts'

const SB_SITE = interpoleBortle(4).sb
const ALTITUDE_SOLEIL_DEG = 45
const PROCHE_DEG = 5

describe('ciel de jour', () => {
  it('un Soleil couché n’ajoute rien : le crépuscule vient de Patat 2006', () => {
    expect(
      brillanceSoleilNl({ altitudeSoleilDeg: -1, altitudeCibleDeg: 90, separationDeg: 91 }),
    ).toBe(0)
  })

  it('Soleil levé, le zénith est bien plus clair qu’au bord du crépuscule', () => {
    const jour = sbZenithAvecCrepuscule(SB_SITE, -ALTITUDE_SOLEIL_DEG)
    const crepuscule = sbZenithAvecCrepuscule(SB_SITE, 1)
    expect(nanolamberts(jour)).toBeGreaterThan(nanolamberts(crepuscule))
  })

  it('le zénith de jour est bleu clair, à la luminance adaptée', () => {
    const sb = sbZenithAvecCrepuscule(SB_SITE, -ALTITUDE_SOLEIL_DEG)
    const [r, v, b] = composantesFond(sb)
    expect(b).toBeCloseTo(K('LUMINANCE_ECRAN_ZENITH_ADAPTE'), 12)
    expect(r).toBeLessThan(v)
    expect(v).toBeLessThan(b)
  })

  it('près du Soleil, le ciel sature vers le blanc sous la même adaptation', () => {
    const zenith = sbZenithAvecCrepuscule(SB_SITE, -ALTITUDE_SOLEIL_DEG)
    const bProche = brillanceSoleilNl({
      altitudeSoleilDeg: ALTITUDE_SOLEIL_DEG,
      altitudeCibleDeg: ALTITUDE_SOLEIL_DEG,
      separationDeg: PROCHE_DEG,
    })
    const [r, v, b] = composantesFond(sbDepuisNanolamberts(bProche), zenith)
    expect(b).toBeGreaterThan(1)
    expect(v).toBeGreaterThan(1)
    expect(r).toBeGreaterThan(K('CHROMA_CIEL_JOUR_R'))
  })

  it('la nuit, l’œil n’a pas à s’adapter', () => {
    expect(adaptationEcran(interpoleBortle(9).sb)).toBe(1)
  })
})
