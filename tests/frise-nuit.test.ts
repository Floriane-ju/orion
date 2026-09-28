/**
 * §8.1 — la frise de la nuit découpe exactement ce que `fenetreNocturne` borne, et la Lune
 * levée qu'elle peint est celle que l'éphéméride place au-dessus de l'horizon.
 */

import { describe, expect, it } from 'vitest'
import { Body } from 'astronomy-engine'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { friseNuit, lectureFrise } from '../src/core/frise-nuit.ts'
import { positionCorps } from '../src/core/ephem.ts'
import { eclatLuneRelatif } from '../src/core/moon.ts'
import { K } from '../src/registry/constants.ts'

const SITE_REFERENCE = { latitudeDeg: 46.391, longitudeDeg: 6.697, altitudeM: 500 }
const MS_PAR_MINUTE = 60_000

function frise(site: typeof SITE_REFERENCE, dateIso: string) {
  const nuit = fenetreNocturne(site, new Date(`${dateIso}T12:00:00Z`))
  return { nuit, frise: friseNuit(site, nuit) }
}

describe('frise de la nuit §8.1', () => {
  it('couvre la nuit et sa marge de jour sans trou ni recouvrement', () => {
    const { nuit, frise: f } = frise(SITE_REFERENCE, '2026-09-28')
    expect(f).not.toBeNull()
    const segments = f!.segments
    const marge = K('FRISE_MARGE_JOUR_MIN') * MS_PAR_MINUTE
    expect(segments[0]).toEqual({
      phase: 'JOUR',
      debut: new Date(nuit.coucherSoleil!.getTime() - marge),
      fin: nuit.coucherSoleil,
    })
    expect(segments.at(-1)).toEqual({
      phase: 'JOUR',
      debut: nuit.leverSoleil,
      fin: new Date(nuit.leverSoleil!.getTime() + marge),
    })
    expect(f!.debut).toEqual(segments[0]!.debut)
    expect(f!.fin).toEqual(segments.at(-1)!.fin)
    segments.slice(1).forEach((s, i) => expect(s.debut).toEqual(segments[i]!.fin))
  })

  it('place la nuit noire exactement entre les deux crépuscules astronomiques', () => {
    const { nuit, frise: f } = frise(SITE_REFERENCE, '2026-09-28')
    const noire = f!.segments.filter((s) => s.phase === 'NUIT_NOIRE')
    expect(noire).toEqual([
      { phase: 'NUIT_NOIRE', debut: nuit.debutNuitAstronomique, fin: nuit.finNuitAstronomique },
    ])
    expect(f!.segments.map((s) => s.phase)).toEqual([
      'JOUR', 'CIVIL', 'NAUTIQUE', 'ASTRONOMIQUE', 'NUIT_NOIRE',
      'ASTRONOMIQUE', 'NAUTIQUE', 'CIVIL', 'JOUR',
    ])
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
    expect(f).not.toBeNull()
    expect(f!.segments.some((s) => s.phase === 'NUIT_NOIRE')).toBe(false)
  })

  it('rend null quand le Soleil ne se couche pas', () => {
    const { frise: f } = frise({ latitudeDeg: 70, longitudeDeg: 20, altitudeM: 0 }, '2026-06-21')
    expect(f).toBeNull()
  })

  it.each(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-20'])(
    'la Lune levée du %s est au-dessus de l’horizon, et couchée ailleurs',
    (date) => {
      const { frise: f } = frise(SITE_REFERENCE, date)
      const { levee } = f!.lune
      const dedans = (t: number) =>
        levee.some((i) => t > i.debut.getTime() && t < i.fin.getTime())
      // Échantillonnage à l'écart des bornes : un lever tombe à la minute près.
      const marge = 2 * MS_PAR_MINUTE
      for (let t = f!.debut.getTime() + marge; t < f!.fin.getTime() - marge; t += 10 * MS_PAR_MINUTE) {
        const proche = f!.lune.evenements.some((e) => Math.abs(e.instant.getTime() - t) < marge)
        if (proche) continue
        const haute = positionCorps(Body.Moon, new Date(t), SITE_REFERENCE).hauteurDeg > 0
        expect(dedans(t), new Date(t).toISOString()).toBe(haute)
      }
    },
  )

  it('dit la fraction éclairée entre 0 et 1', () => {
    const { frise: f } = frise(SITE_REFERENCE, '2026-09-28')
    expect(f!.lune.illumination).toBeGreaterThanOrEqual(0)
    expect(f!.lune.illumination).toBeLessThanOrEqual(1)
  })

  it.each(['2026-09-28', '2026-10-12'])(
    'n’incruste la Lune du %s qu’aux heures rondes où elle est levée',
    (date) => {
      const { frise: f } = frise(SITE_REFERENCE, date)
      for (const p of f!.lune.positions) {
        expect(p.instant.getTime() % (60 * MS_PAR_MINUTE)).toBe(0)
        expect(p.hauteurDeg).toBeGreaterThan(0)
        expect(p.eclat).toBeGreaterThan(0)
        expect(p.eclat).toBeLessThanOrEqual(1)
        expect(f!.lune.levee.some((i) => p.instant >= i.debut && p.instant <= i.fin)).toBe(true)
      }
    },
  )
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
    const duree = f!.fin.getTime() - f!.debut.getTime()
    for (const s of f!.segments) {
      const milieu = (s.debut.getTime() + s.fin.getTime()) / 2
      const lecture = lectureFrise(SITE_REFERENCE, f!, (milieu - f!.debut.getTime()) / duree)
      expect(lecture.phase).toBe(s.phase)
      expect(lecture.hauteurLuneDeg).toBeCloseTo(
        positionCorps(Body.Moon, lecture.instant, SITE_REFERENCE).hauteurDeg,
        6,
      )
    }
  })

  it('borne la fraction aux deux bouts de la frise', () => {
    const { frise: f } = frise(SITE_REFERENCE, '2026-09-28')
    expect(lectureFrise(SITE_REFERENCE, f!, -1).instant).toEqual(f!.debut)
    expect(lectureFrise(SITE_REFERENCE, f!, 2).instant).toEqual(f!.fin)
    expect(lectureFrise(SITE_REFERENCE, f!, 2).phase).toBe('JOUR')
  })
})
