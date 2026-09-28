/**
 * §8.1, §4.1, §12.4 — fenêtre nocturne, midi solaire vrai, seuils du site.
 *
 * Valeurs de référence : Annexe A du PRD, site 46,391° N / 6,697° E.
 */

import { describe, expect, it } from 'vitest'
import { fenetreNocturne, offsetMidiSolaireMin } from '../src/core/nuit.ts'
import { seuilsDeclinaison, masseAir } from '../src/core/site.ts'
import { HorsDomaineSeriesError, dansLeDomaineDesSeries } from '../src/core/ephem.ts'

const SITE_REFERENCE = { latitudeDeg: 46.391, longitudeDeg: 6.697, altitudeM: 500 }

/** §12.4 : l'écart admis sur un instant est de 2 minutes de temps. */
const TOLERANCE_INSTANT_MIN = 2

/**
 * Une durée de nuit est la différence de deux instants calculés indépendamment : sa
 * tolérance est le double de celle d'un instant. Les valeurs de l'Annexe A ne portent
 * d'ailleurs pas d'année, or les dates de solstice se déplacent d'un jour d'une année
 * à l'autre.
 */
const TOLERANCE_DUREE_H = (2 * TOLERANCE_INSTANT_MIN) / 60

function midiUtc(dateIso: string): Date {
  return new Date(`${dateIso}T12:00:00Z`)
}

describe('fenêtre nocturne §8.1', () => {
  it.each([
    // date, durée annoncée en Annexe A
    ['2026-08-14', 5 + 49 / 60],
    ['2026-06-21', 2 + 35 / 60],
    ['2026-12-21', 11 + 43 / 60],
  ])('retrouve la durée de nuit astronomique du %s (Annexe A)', (date, attendue) => {
    const nuit = fenetreNocturne(SITE_REFERENCE, midiUtc(date))
    expect(nuit.etat).toBe('NUIT_ASTRONOMIQUE')
    expect(Math.abs(nuit.dureeNuitH - attendue)).toBeLessThan(TOLERANCE_DUREE_H)
  })

  it('tient les 2 minutes sur la date de rédaction du PRD', () => {
    // 5 h 49 annoncées pour le 14 août : c'est la valeur de travail du document.
    const nuit = fenetreNocturne(SITE_REFERENCE, midiUtc('2026-08-14'))
    expect(Math.abs(nuit.dureeNuitH - (5 + 49 / 60)) * 60).toBeLessThan(TOLERANCE_INSTANT_MIN)
  })

  it('centre le milieu de nuit entre les deux crépuscules, pas sur minuit', () => {
    const nuit = fenetreNocturne(SITE_REFERENCE, midiUtc('2026-08-14'))
    const debut = nuit.debutNuitAstronomique!.getTime()
    const fin = nuit.finNuitAstronomique!.getTime()
    // getTime() est en millisecondes entières : le milieu peut tomber sur une demi-ms.
    expect(Math.abs(nuit.milieuNuitVrai!.getTime() - (debut + fin) / 2)).toBeLessThanOrEqual(1)
  })

  it('annonce la nuit astronomique nulle à haute latitude sans refuser le site', () => {
    const nuit = fenetreNocturne(
      { latitudeDeg: 68, longitudeDeg: 20, altitudeM: 0 },
      midiUtc('2026-06-21'),
    )
    expect(nuit.etat).not.toBe('NUIT_ASTRONOMIQUE')
    expect(nuit.cause).toMatch(/nuit/)
  })

  it('masque les corps du système solaire hors du domaine des séries', () => {
    expect(dansLeDomaineDesSeries(midiUtc('2026-08-14'))).toBe(true)
    expect(dansLeDomaineDesSeries(midiUtc('1400-08-14'))).toBe(false)
    expect(() => fenetreNocturne(SITE_REFERENCE, midiUtc('1400-08-14'))).toThrow(
      HorsDomaineSeriesError,
    )
  })
})

describe('midi solaire vrai §4.1', () => {
  it('vaut +26,8 min par rapport à UTC au site de référence', () => {
    const offset = offsetMidiSolaireMin(SITE_REFERENCE.longitudeDeg, 0)
    expect(offset.value).toBeCloseTo(26.8, 1)
    expect(offset.formula.section).toBe('4.1')
  })

  it('retranche le décalage du fuseau', () => {
    expect(offsetMidiSolaireMin(6.697, 2).value).toBeCloseTo(26.788 - 120, 2)
  })
})

describe('seuils du site §4.1', () => {
  const seuils = seuilsDeclinaison(SITE_REFERENCE.latitudeDeg)

  it('retrouve les seuils chiffrés de l’Annexe A', () => {
    expect(seuils.decCircumpolaire.value).toBeCloseTo(43.6, 1)
    expect(seuils.decMinImagerie.value).toBeCloseTo(-13.6, 1)
    expect(seuils.decMinVisuel.value).toBeCloseTo(-23.6, 1)
  })

  it('cite la constante de seuil consommée', () => {
    expect(seuils.decMinImagerie.constants[0]?.ref).toBe('C-01')
    expect(seuils.decMinVisuel.constants[0]?.ref).toBe('C-02')
  })
})

describe('masse d’air §8.2', () => {
  it('vaut 2 au seuil d’imagerie de 30°', () => {
    expect(masseAir(30).value).toBeCloseTo(2, 6)
  })

  it('signale la sortie du domaine sous 15° au lieu de se taire', () => {
    expect(masseAir(10).flags).toContain('HORS_DOMAINE')
  })

  it('ne produit aucune valeur sous l’horizon', () => {
    expect(masseAir(-1).value).toBeNull()
  })
})
