/**
 * §8.1 — la frise du ciel découpe aux mêmes hauteurs du Soleil que `fenetreNocturne`, sur une
 * fenêtre de 24 h centrée sur l'instant, et la Lune levée qu'elle peint est celle que
 * l'éphéméride place au-dessus de l'horizon.
 */

import { describe, expect, it } from 'vitest'
import { Body } from 'astronomy-engine'
import { fenetreNocturne } from '../src/core/nuit.ts'
import {
  fenetreCalculFrise,
  fenetreFrise,
  friseCiel,
  lectureFrise,
  phaseFrise,
} from '../src/core/frise-nuit.ts'
import { positionCorps } from '../src/core/ephem.ts'
import { eclatLuneRelatif } from '../src/core/moon.ts'
import { K } from '../src/registry/constants.ts'
import { SITE_REFERENCE } from './fixtures.ts'

const MS_PAR_MINUTE = 60_000
const MS_PAR_H = 60 * MS_PAR_MINUTE

/** La fenêtre centrée sur le soir du jour : elle couvre la nuit entière. */
function frise(site: typeof SITE_REFERENCE, dateIso: string) {
  const nuit = fenetreNocturne(site, new Date(`${dateIso}T12:00:00Z`))
  const centre = new Date(`${dateIso}T23:00:00Z`).getTime()
  return { nuit, frise: friseCiel(site, fenetreFrise(centre)) }
}

describe('fenêtre de la frise', () => {
  it('centre l’instant, une demi-fenêtre de part et d’autre', () => {
    const centre = Date.parse('2026-09-28T21:37:00Z')
    const demi = K('FRISE_DEMI_FENETRE_H') * MS_PAR_H
    expect(fenetreFrise(centre)).toEqual({ debut: new Date(centre - demi), fin: new Date(centre + demi) })
  })

  it('la fenêtre de calcul couvre la vue de tout instant de son heure', () => {
    const heure = Date.parse('2026-09-28T21:00:00Z')
    const calcul = fenetreCalculFrise(heure)
    for (const t of [heure, heure + 37 * MS_PAR_MINUTE, heure + MS_PAR_H - 1]) {
      expect(fenetreCalculFrise(t)).toEqual(calcul)
      const vue = fenetreFrise(t)
      expect(vue.debut >= calcul.debut && vue.fin <= calcul.fin).toBe(true)
    }
  })
})

describe('frise du ciel §8.1', () => {
  it('couvre la fenêtre sans trou ni recouvrement, chaque phase d’un seul tenant', () => {
    const { frise: f } = frise(SITE_REFERENCE, '2026-09-28')
    const segments = f.segments
    expect(segments[0]!.debut).toEqual(f.debut)
    expect(segments.at(-1)!.fin).toEqual(f.fin)
    segments.slice(1).forEach((s, i) => {
      expect(s.debut).toEqual(segments[i]!.fin)
      expect(s.phase).not.toBe(segments[i]!.phase)
    })
  })

  it('place la nuit noire entre les deux crépuscules astronomiques, le jour hors du coucher-lever', () => {
    const { nuit, frise: f } = frise(SITE_REFERENCE, '2026-09-28')
    expect(f.segments.map((s) => s.phase)).toEqual([
      'JOUR', 'CIVIL', 'NAUTIQUE', 'ASTRONOMIQUE', 'NUIT_NOIRE',
      'ASTRONOMIQUE', 'NAUTIQUE', 'CIVIL', 'JOUR',
    ])
    const noire = f.segments[4]!
    expect(Math.abs(noire.debut.getTime() - nuit.debutNuitAstronomique!.getTime())).toBeLessThan(MS_PAR_MINUTE)
    expect(Math.abs(noire.fin.getTime() - nuit.finNuitAstronomique!.getTime())).toBeLessThan(MS_PAR_MINUTE)
    expect(Math.abs(f.segments[0]!.fin.getTime() - nuit.coucherSoleil!.getTime())).toBeLessThan(MS_PAR_MINUTE)
    expect(Math.abs(f.segments[8]!.debut.getTime() - nuit.leverSoleil!.getTime())).toBeLessThan(MS_PAR_MINUTE)
  })

  it('le crépuscule civil tient entre le coucher et le crépuscule nautique', () => {
    const { nuit } = frise(SITE_REFERENCE, '2026-09-28')
    expect(K('HAUTEUR_CREPUSCULE_CIVIL_DEG')).toBeGreaterThan(K('HAUTEUR_CREPUSCULE_NAUTIQUE_DEG'))
    expect(nuit.debutCivil!.getTime()).toBeGreaterThan(nuit.coucherSoleil!.getTime())
    expect(nuit.debutCivil!.getTime()).toBeLessThan(nuit.debutNautique!.getTime())
    expect(nuit.finCivil!.getTime()).toBeGreaterThan(nuit.finNautique!.getTime())
    expect(nuit.finCivil!.getTime()).toBeLessThan(nuit.leverSoleil!.getTime())
  })

  it('sans nuit noire, la frise n’en peint pas — et ne s’arrête pas pour autant', () => {
    const { frise: f } = frise({ latitudeDeg: 55, longitudeDeg: 10, altitudeM: 0 }, '2026-06-21')
    expect(f.segments.some((s) => s.phase === 'NUIT_NOIRE')).toBe(false)
    expect(f.segments.some((s) => s.phase === 'NAUTIQUE')).toBe(true)
  })

  it('peint le jour d’un bout à l’autre quand le Soleil ne se couche pas', () => {
    const { frise: f } = frise({ latitudeDeg: 70, longitudeDeg: 20, altitudeM: 0 }, '2026-06-21')
    expect(f.segments.map((s) => s.phase)).toEqual(['JOUR'])
  })

  it.each(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-20'])(
    'la Lune levée du %s est au-dessus de l’horizon, et couchée ailleurs',
    (date) => {
      const { frise: f } = frise(SITE_REFERENCE, date)
      const { levee } = f.lune
      const dedans = (t: number) =>
        levee.some((i) => t > i.debut.getTime() && t < i.fin.getTime())
      // Échantillonnage à l'écart des bornes : un lever tombe à la minute près.
      const marge = 2 * MS_PAR_MINUTE
      for (let t = f.debut.getTime() + marge; t < f.fin.getTime() - marge; t += 10 * MS_PAR_MINUTE) {
        const proche = f.lune.evenements.some((e) => Math.abs(e.instant.getTime() - t) < marge)
        if (proche) continue
        const haute = positionCorps(Body.Moon, new Date(t), SITE_REFERENCE).hauteurDeg > 0
        expect(dedans(t), new Date(t).toISOString()).toBe(haute)
      }
    },
  )

  it.each(['soleil', 'lune'] as const)(
    'échantillonne la hauteur du %s d’un bout à l’autre, au pas du registre',
    (astre) => {
      const { frise: f } = frise(SITE_REFERENCE, '2026-09-28')
      const hauteurs = astre === 'soleil' ? f.soleil : f.lune.hauteurs
      const corps = astre === 'soleil' ? Body.Sun : Body.Moon
      const pas = K('PAS_COURBES_FRISE_MIN') * MS_PAR_MINUTE
      expect(hauteurs[0]!.instant).toEqual(f.debut)
      expect(hauteurs.at(-1)!.instant).toEqual(f.fin)
      hauteurs.slice(1, -1).forEach((p, i) => {
        expect(p.instant.getTime() - hauteurs[i]!.instant.getTime()).toBe(pas)
      })
      for (const p of hauteurs) {
        expect(p.hauteurDeg).toBeCloseTo(positionCorps(corps, p.instant, SITE_REFERENCE).hauteurDeg, 6)
      }
    },
  )

  it('dit la fraction éclairée entre 0 et 1', () => {
    const { frise: f } = frise(SITE_REFERENCE, '2026-09-28')
    expect(f.lune.illumination).toBeGreaterThanOrEqual(0)
    expect(f.lune.illumination).toBeLessThanOrEqual(1)
  })
})

describe('éclat relatif de la Lune', () => {
  it('vaut 1 pour une pleine Lune au zénith, 0 pour une Lune couchée', () => {
    expect(eclatLuneRelatif(0, 90)).toBeCloseTo(1, 10)
    expect(eclatLuneRelatif(0, -1)).toBe(0)
  })

  it('croît avec la hauteur et décroît avec l’angle de phase', () => {
    expect(eclatLuneRelatif(40, 60)).toBeGreaterThan(eclatLuneRelatif(40, 15))
    expect(eclatLuneRelatif(20, 45)).toBeGreaterThan(eclatLuneRelatif(90, 45))
  })
})

describe('lecture d’un instant de la frise', () => {
  it('rend la phase peinte à cet endroit et la hauteur de la Lune à cet instant', () => {
    const { frise: f } = frise(SITE_REFERENCE, '2026-09-28')
    for (const s of f.segments) {
      const milieu = new Date((s.debut.getTime() + s.fin.getTime()) / 2)
      const lecture = lectureFrise(SITE_REFERENCE, f, milieu)
      expect(lecture.phase).toBe(s.phase)
      expect(lecture.hauteurLuneDeg).toBeCloseTo(
        positionCorps(Body.Moon, milieu, SITE_REFERENCE).hauteurDeg,
        6,
      )
    }
  })

  it('hors de la frise, calcule la phase plutôt que de la deviner', () => {
    const { frise: f } = frise(SITE_REFERENCE, '2026-09-28')
    expect(phaseFrise(SITE_REFERENCE, f, new Date('2026-09-30T12:00:00Z'))).toBe('JOUR')
    expect(phaseFrise(SITE_REFERENCE, f, new Date('2026-09-30T23:00:00Z'))).toBe('NUIT_NOIRE')
  })
})
