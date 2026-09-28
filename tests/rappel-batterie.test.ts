/**
 * T-0345 — §9.4 : le rappel batterie ne chiffre rien, il se déclenche au-delà d'un seuil.
 */

import { describe, expect, it } from 'vitest'
import { rappelBatterie } from '../src/core/rappel-batterie.ts'
import { K } from '../src/registry/constants.ts'

describe('T-0345 — rappel batterie', () => {
  const seuil = K('DUREE_RAPPEL_BATTERIE_MIN')

  it('se tait jusqu’au seuil, et parle au-delà', () => {
    expect(rappelBatterie(seuil)).toBeNull()
    expect(rappelBatterie(seuil + 1)).toMatch(/batterie/)
  })

  it('se tait sur une durée qui n’est pas un nombre', () => {
    expect(rappelBatterie(Number.NaN)).toBeNull()
    expect(rappelBatterie(Number.POSITIVE_INFINITY)).toBeNull()
  })
})
