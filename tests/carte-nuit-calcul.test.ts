/**
 * T-0346 — l'aimant du survol de la frise : un pointeur proche d'un lever ou d'un coucher de
 * Lune s'y accroche, un pointeur loin de tout trait reste où il est.
 */

import { describe, expect, it } from 'vitest'
import {
  aimante,
  curseurInstant,
  instantClavier,
  instantFraction,
  libelleLuneInstant,
  pourcentCss,
  type MarqueLune,
} from '../src/ui/carte-nuit-calcul.ts'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { friseNuit } from '../src/core/frise-nuit.ts'
import { MS_PAR_MINUTE } from '../src/core/unites.ts'
import { K } from '../src/registry/constants.ts'
import { SITE_REFERENCE } from './fixtures.ts'

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

describe('T-0390 — la frise règle l’instant', () => {
  const nuit = fenetreNocturne(SITE_REFERENCE, new Date('2026-09-28T12:00:00Z'))
  const frise = friseNuit(SITE_REFERENCE, nuit)!
  const debut = frise.debut.getTime()
  const fin = frise.fin.getTime()
  const pas = K('PAS_FRISE_CLAVIER_MIN') * MS_PAR_MINUTE

  it('un clic vise l’instant sous le pointeur, et le curseur revient à la même place', () => {
    const vise = instantFraction(frise, 0.37)
    expect(curseurInstant(frise, new Date(vise))).toBe(pourcentCss(0.37))
    expect(instantFraction(frise, -1)).toBe(debut)
    expect(instantFraction(frise, 2)).toBe(fin)
  })

  it('les flèches avancent ou reculent d’un pas, sans sortir de la nuit', () => {
    const milieu = (debut + fin) / 2
    expect(instantClavier(frise, milieu, 'ArrowRight')).toBe(milieu + pas)
    expect(instantClavier(frise, milieu, 'ArrowUp')).toBe(milieu + pas)
    expect(instantClavier(frise, milieu, 'ArrowLeft')).toBe(milieu - pas)
    expect(instantClavier(frise, milieu, 'ArrowDown')).toBe(milieu - pas)
    expect(instantClavier(frise, fin, 'ArrowRight')).toBe(fin)
    expect(instantClavier(frise, debut, 'ArrowLeft')).toBe(debut)
  })

  it('Début et Fin mènent aux bornes ; un instant hors de la nuit y rentre', () => {
    expect(instantClavier(frise, (debut + fin) / 2, 'Home')).toBe(debut)
    expect(instantClavier(frise, (debut + fin) / 2, 'End')).toBe(fin)
    expect(instantClavier(frise, debut - 10 * pas, 'ArrowRight')).toBe(debut + pas)
  })

  it('une autre touche ne règle rien', () => {
    expect(instantClavier(frise, debut, 'Enter')).toBeNull()
  })
})
