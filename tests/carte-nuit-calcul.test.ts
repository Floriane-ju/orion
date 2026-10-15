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
  hauteurSurCourbe,
  ordonneeFrise,
  instantClavier,
  instantFraction,
  glisseMolette,
  WheelMode,
  instantGlisse,
  libelleLuneInstant,
  marquesLune,
  pointsCourbe,
  pourcentCss,
  reperesHeures,
  tiretsHorizon,
  type MarqueLune,
} from '../src/ui/carte-nuit-calcul.ts'
import { fenetreCalculFrise, fenetreFrise, friseCiel } from '../src/core/frise-nuit.ts'
import { MS_PAR_H, MS_PAR_MINUTE } from '../src/core/unites.ts'
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

  it('glisser la frise fait défiler le temps sous le curseur, comme on tire un ruban', () => {
    const duree = fin - debut
    // Tirer vers la droite ramène le passé sous le curseur ; vers la gauche, l'avenir.
    expect(instantGlisse(vue, centre, 0.25)).toBe(centre - duree / 4)
    expect(instantGlisse(vue, centre, -0.5)).toBe(centre + duree / 2)
    expect(instantGlisse(vue, centre, 0)).toBe(centre)
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

  // T-0418 — l'aplat de l'étiquette suit la phase sous son repère : clair de jour seulement.
  it('dit de jour le repère qui tombe dans le jour, et lui seul', () => {
    const vue = fenetreFrise(centre)
    const reperes = reperesHeures(vue, frise)
    for (const r of reperes) {
      const t = Number(r.cle)
      const segment = frise.segments.find((sg) => sg.debut.getTime() <= t && t < sg.fin.getTime())
      expect(r.jour).toBe(segment?.phase === 'JOUR')
    }
    expect(reperes.some((r) => r.jour)).toBe(true)
    expect(reperes.some((r) => !r.jour)).toBe(true)
    // Sans frise, rien n'est de jour.
    expect(reperesHeures(vue).some((r) => r.jour)).toBe(false)
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

describe('glisseMolette — T-0424, le défilement horizontal tire la frise', () => {
  const largeur = 800
  const ligne = 16

  it('défiler vers la droite tire la frise comme un glisser vers la gauche : le futur arrive', () => {
    expect(glisseMolette({ deltaX: 80, deltaY: 0, deltaMode: WheelMode.PIXEL }, largeur, ligne)).toBe(-0.1)
  })

  it('un delta en lignes (Firefox) se compte en hauteurs de ligne', () => {
    expect(glisseMolette({ deltaX: -5, deltaY: 0, deltaMode: WheelMode.LIGNE }, largeur, ligne)).toBe(0.1)
  })

  it('un delta en pages se compte en largeurs de frise', () => {
    expect(glisseMolette({ deltaX: 1, deltaY: 0, deltaMode: WheelMode.PAGE }, largeur, ligne)).toBe(-1)
  })

  it('un défilement surtout vertical reste à la page', () => {
    expect(glisseMolette({ deltaX: 3, deltaY: 40, deltaMode: WheelMode.PIXEL }, largeur, ligne)).toBeNull()
    expect(glisseMolette({ deltaX: 0, deltaY: 0, deltaMode: WheelMode.PIXEL }, largeur, ligne)).toBeNull()
  })
})

describe('hauteurSurCourbe — le point du curseur tombe sur le trait', () => {
  const t0 = new Date(2026, 0, 7, 18, 0)
  const courbe = [
    { instant: t0, hauteurDeg: -10 },
    { instant: new Date(t0.getTime() + 60 * 60_000), hauteurDeg: 20 },
  ]
  it('interpole entre deux échantillons', () => {
    const milieu = new Date(t0.getTime() + 30 * 60_000)
    expect(hauteurSurCourbe(courbe, milieu)).toBeCloseTo(5, 9)
    expect(hauteurSurCourbe(courbe, t0)).toBe(-10)
  })
  it('ne dit rien hors de la courbe', () => {
    expect(hauteurSurCourbe(courbe, new Date(t0.getTime() - 1))).toBeNull()
    expect(hauteurSurCourbe(courbe, new Date(t0.getTime() + 2 * 60 * 60_000))).toBeNull()
  })
  it('place l’horizon au milieu de la frise', () => {
    expect(ordonneeFrise(0)).toBe(pourcentCss(1 / 2))
  })
})

describe('tiretsHorizon — les tirets de l’horizon suivent les heures', () => {
  it('accroche la tuile à la première heure pleine, d’une heure de large', () => {
    const debut = new Date(2026, 0, 7, 18, 15)
    const vue = { debut, fin: new Date(debut.getTime() + 24 * MS_PAR_H) }
    const { heure, premiere } = tiretsHorizon(vue)
    expect(heure).toBeCloseTo(1 / 24, 12)
    expect(premiere).toBeCloseTo(0.75 / 24, 12)
  })
  it('décale la tuile quand la frise défile', () => {
    const a = new Date(2026, 0, 7, 18, 15)
    const b = new Date(a.getTime() + 30 * 60_000)
    const vue = (d: Date) => ({ debut: d, fin: new Date(d.getTime() + 24 * MS_PAR_H) })
    expect(tiretsHorizon(vue(a)).premiere).not.toBeCloseTo(tiretsHorizon(vue(b)).premiere, 6)
  })
})
