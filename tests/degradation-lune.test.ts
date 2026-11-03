/**
 * Lunar degradation of fiche — class of S_lune share lost (§6.3, §8.3). Must not regress:
 * same Moon announced alike for galaxy and emission nebula; galaxy discarded for Moon
 * read "moyenne".
 */

import { describe, expect, it } from 'vitest'
import { degradationLune } from '../src/core/session-score.ts'
import { K } from '../src/registry/constants.ts'

describe('degradationLune', () => {
  it('Lune sans effet : aucune, quel que soit le type', () => {
    expect(degradationLune(0, 'FAIBLE')).toBe('AUCUNE')
    expect(degradationLune(0, 'FORTE')).toBe('AUCUNE')
  })

  it('la même ΔSB_lune pèse plus sur une tolérance faible que sur une forte', () => {
    const delta = K('TOLERANCE_LUNE_FAIBLE_DELTA_SB_MAG') * K('DEGRADATION_LUNE_MOYENNE_MAX')
    expect(degradationLune(delta, 'FAIBLE')).toBe('FORTE')
    expect(degradationLune(delta, 'FORTE')).toBe('FAIBLE')
  })

  it('une galaxie au-delà du seuil de gêne (écartée au plan) se lit forte', () => {
    expect(degradationLune(K('SEUIL_GENE_LUNE_DELTA_SB_MAG'), 'FAIBLE')).toBe('FORTE')
  })

  it('les bornes du registre découpent les classes', () => {
    const d = K('TOLERANCE_LUNE_DELTA_SB_MAG')
    expect(degradationLune(d * K('DEGRADATION_LUNE_AUCUNE_MAX'), 'FORTE')).toBe('FAIBLE')
    expect(degradationLune(d * K('DEGRADATION_LUNE_FAIBLE_MAX'), 'FORTE')).toBe('MOYENNE')
    expect(degradationLune(d, 'FORTE')).toBe('FORTE')
  })
})
