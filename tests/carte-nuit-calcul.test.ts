/**
 * T-0346 — l'aimant du survol de la frise : un pointeur proche d'un lever ou d'un coucher de
 * Lune s'y accroche, un pointeur loin de tout trait reste où il est.
 */

import { describe, expect, it } from 'vitest'
import {
  aimante,
  bandesPhases,
  curseurInstant,
  hauteurFrise,
  instantClavier,
  instantFraction,
  libelleLuneInstant,
  marquesLune,
  pointsCourbe,
  pourcentCss,
  reperesHeures,
  type MarqueLune,
} from '../src/ui/carte-nuit-calcul.ts'
import { fenetreCalculFrise, fenetreFrise, friseCiel } from '../src/core/frise-nuit.ts'
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
  const centre = Date.parse('2026-09-28T21:37:00Z')
  const vue = fenetreFrise(centre)
  const debut = vue.debut.getTime()
  const fin = vue.fin.getTime()
  const pas = K('PAS_FRISE_CLAVIER_MIN') * MS_PAR_MINUTE

  it('le curseur de l’instant est au centre de la frise', () => {
    expect(curseurInstant(vue, new Date(centre))).toBe(pourcentCss(1 / 2))
  })

  it('un clic vise l’instant sous le pointeur, et le curseur revient à la même place', () => {
    const vise = instantFraction(vue, 0.37)
    expect(curseurInstant(vue, new Date(vise))).toBe(pourcentCss(0.37))
    expect(instantFraction(vue, -1)).toBe(debut)
    expect(instantFraction(vue, 2)).toBe(fin)
  })

  it('les flèches avancent ou reculent d’un pas, sans butée : la frise défile', () => {
    expect(instantClavier(vue, centre, 'ArrowRight')).toBe(centre + pas)
    expect(instantClavier(vue, centre, 'ArrowUp')).toBe(centre + pas)
    expect(instantClavier(vue, centre, 'ArrowLeft')).toBe(centre - pas)
    expect(instantClavier(vue, centre, 'ArrowDown')).toBe(centre - pas)
  })

  it('Début et Fin mènent aux bords de la fenêtre vue', () => {
    expect(instantClavier(vue, centre, 'Home')).toBe(debut)
    expect(instantClavier(vue, centre, 'End')).toBe(fin)
  })

  it('une autre touche ne règle rien', () => {
    expect(instantClavier(vue, centre, 'Enter')).toBeNull()
  })
})

describe('la frise défile', () => {
  const centre = Date.parse('2026-09-28T21:37:00Z')
  const frise = friseCiel(SITE_REFERENCE, fenetreCalculFrise(centre))

  it('une graduation garde son étiquette quand la fenêtre glisse', () => {
    const avant = reperesHeures(fenetreFrise(centre))
    const apres = reperesHeures(fenetreFrise(centre + 20 * MS_PAR_MINUTE))
    for (const r of apres) {
      const meme = avant.find((a) => a.cle === r.cle)
      if (meme !== undefined) expect(meme.majeur).toBe(r.majeur)
    }
  })

  it('ne pose que ce qui touche la fenêtre vue', () => {
    const vue = fenetreFrise(centre)
    for (const b of bandesPhases(frise, vue)) {
      expect(parseFloat(b.debut)).toBeLessThan(100)
      expect(parseFloat(b.debut) + parseFloat(b.largeur)).toBeGreaterThan(0)
    }
    for (const m of marquesLune(frise, vue)) {
      expect(m.fraction).toBeGreaterThanOrEqual(0)
      expect(m.fraction).toBeLessThanOrEqual(1)
    }
  })
})

describe('les courbes du Soleil et de la Lune', () => {
  it('une seule échelle : nadir en bas, horizon au milieu, zénith en haut', () => {
    expect(hauteurFrise(-90)).toBe(0)
    expect(hauteurFrise(0)).toBe(1 / 2)
    expect(hauteurFrise(90)).toBe(1)
  })

  it.each(['soleil', 'lune'] as const)('pose un point par échantillon du %s, à son instant et sa hauteur', (astre) => {
    const centre = Date.parse('2026-09-28T21:37:00Z')
    const vue = fenetreFrise(centre)
    const frise = friseCiel(SITE_REFERENCE, fenetreCalculFrise(centre))
    const hauteurs = astre === 'soleil' ? frise.soleil : frise.lune.hauteurs
    const points = pointsCourbe(hauteurs, vue).split(' ').map((p) => p.split(',').map(Number))
    expect(points).toHaveLength(hauteurs.length)
    const duree = vue.fin.getTime() - vue.debut.getTime()
    hauteurs.forEach((h, i) => {
      const [x, y] = points[i]!
      expect(x).toBeCloseTo(((h.instant.getTime() - vue.debut.getTime()) / duree) * 100, 1)
      expect(y).toBeCloseTo((1 - hauteurFrise(h.hauteurDeg)) * 100, 1)
    })
  })
})
