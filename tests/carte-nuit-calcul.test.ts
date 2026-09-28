/**
 * T-0346 — l'aimant du survol de la frise : un pointeur proche d'un lever ou d'un coucher de
 * Lune s'y accroche, un pointeur loin de tout trait reste où il est.
 */

import { describe, expect, it } from 'vitest'
import { aimante, libelleLuneInstant, type MarqueLune } from '../src/ui/carte-nuit-calcul.ts'

function marque(fraction: number, texte: string): MarqueLune {
  return { cle: texte, position: `${fraction * 100}%`, fraction, texte }
}

const LEVER = marque(0.2, 'lever de lune')
const COUCHER = marque(0.25, 'coucher de lune')
const PORTEE = 0.04

describe('aimant du survol de la frise', () => {
  it('laisse le pointeur en place loin de tout trait', () => {
    expect(aimante(0.6, [LEVER, COUCHER], PORTEE)).toEqual({ fraction: 0.6, marque: null })
  })

  it('accroche le pointeur au trait à portée', () => {
    expect(aimante(0.17, [LEVER], PORTEE)).toEqual({ fraction: 0.2, marque: LEVER })
  })

  it('préfère le trait le plus proche quand deux sont à portée', () => {
    expect(aimante(0.24, [LEVER, COUCHER], PORTEE).marque).toBe(COUCHER)
    expect(aimante(0.21, [LEVER, COUCHER], PORTEE).marque).toBe(LEVER)
  })

  it('ne fait rien sans trait', () => {
    expect(aimante(0.3, [], PORTEE)).toEqual({ fraction: 0.3, marque: null })
  })
})

describe('la Lune à l’instant pointé', () => {
  it('dit sa hauteur, sa profondeur sous l’horizon, ou l’horizon lui-même', () => {
    expect(libelleLuneInstant(54.2)).toBe('Lune à 54° de hauteur')
    expect(libelleLuneInstant(-2.4)).toBe('Lune à 2° sous l’horizon')
    expect(libelleLuneInstant(-0.3)).toBe('Lune à l’horizon')
    expect(libelleLuneInstant(0.4)).toBe('Lune à l’horizon')
  })
})
