/**
 * §5.2 — profil Suivi, et §9.1 — pose maximale à étoiles ponctuelles.
 *
 * Valeurs de référence : Annexe A du PRD.
 */

import { describe, expect, it } from 'vitest'
import { npf, profilSuivi } from '../src/core/suivi.ts'
import { dependDUnOrdreDeGrandeur } from '../src/core/traced.ts'

/** Annexe A — configuration ciel profond, 120 mm f/2,8, pitch 5,12 µm. */
const REFERENCE = { focaleMm: 120, ouvertureN: 2.8, pitchUm: 5.12 }

describe('pose maximale sans suivi §9.1', () => {
  it('vaut 2,10 s sur le profil de référence à l’équateur céleste', () => {
    expect(npf({ ...REFERENCE, decDeg: 0 }).value).toBeCloseTo(2.1, 2)
  })

  it('retrouve la carte de pose du grand angle de l’Annexe A', () => {
    const grandAngle = { focaleMm: 10, ouvertureN: 2.8, pitchUm: 5.12 }
    expect(npf({ ...grandAngle, decDeg: 0 }).value).toBeCloseTo(25.2, 1)
    expect(npf({ ...grandAngle, decDeg: -25 }).value).toBeCloseTo(27.8, 1)
    expect(npf({ ...grandAngle, decDeg: 50 }).value).toBeCloseTo(39.1, 1)
    expect(npf({ ...grandAngle, decDeg: 89 }).value).toBeGreaterThan(20 * 60)
  })

  it('double la pose en tolérance k = 2, sans l’appliquer en silence', () => {
    const strict = npf({ ...REFERENCE, decDeg: 0 })
    const tolerant = npf({ ...REFERENCE, decDeg: 0, tolerance: 'TOLERANT' })
    expect(tolerant.value).toBeCloseTo(strict.value! * 2, 6)
    expect(tolerant.constants.map((c) => c.ref)).toContain('C-06')
  })

  it('n’est pas définie sous le pôle exact, où cos δ s’annule', () => {
    expect(npf({ ...REFERENCE, decDeg: 90 }).value).toBeNull()
    expect(npf({ ...REFERENCE, decDeg: 90 }).flags).toContain('HORS_DOMAINE')
  })
})

describe('profil de suivi §5.2', () => {
  it('ferme le ciel profond sans suivi et renvoie au grand champ', () => {
    const sans = profilSuivi({ suiviActif: false, typeMonture: 'TRACKER', ...REFERENCE })
    expect(sans.mode).toBe('AUCUN')
    expect(sans.domaineCpOuvert).toBe(false)
    expect(sans.tMaxSuiviS.value).toBeNull()
    expect(sans.cause).toMatch(/grand champ/i)
  })

  it('traite « je ne sais pas » comme une mise en station approximative', () => {
    const inconnue = profilSuivi({
      suiviActif: true,
      qualiteMes: 'INCONNUE',
      typeMonture: 'TRACKER',
      ...REFERENCE,
    })
    expect(inconnue.mode).toBe('SUIVI_APPROX')
    expect(inconnue.tMaxSuiviS.value).toBeCloseTo(75, 6)
    expect(inconnue.domaineCpOuvert).toBe(true)
  })

  it('chiffre en une phrase le gain d’une mise en station soignée', () => {
    const approx = profilSuivi({
      suiviActif: true,
      qualiteMes: 'APPROX',
      typeMonture: 'GEM',
      ...REFERENCE,
    })
    // 45 × 200 / 120 = 75 s, contre 120 × 200 / 120 = 200 s.
    expect(approx.gainMiseEnStation).toMatch(/75/)
    expect(approx.gainMiseEnStation).toMatch(/200/)
  })

  it('atteint 200 s en mise en station soignée sur le profil de référence', () => {
    const soignee = profilSuivi({
      suiviActif: true,
      qualiteMes: 'SOIGNEE',
      typeMonture: 'GEM',
      ...REFERENCE,
    })
    expect(soignee.tMaxSuiviS.value).toBeCloseTo(200, 6)
    expect(soignee.gainMiseEnStation).toBeUndefined()
  })

  it('plafonne à 240 s sans autoguidage, quelle que soit la focale', () => {
    const courtes = profilSuivi({
      suiviActif: true,
      qualiteMes: 'SOIGNEE',
      typeMonture: 'GEM',
      focaleMm: 10,
    })
    // 120 × 200 / 10 = 2400 s, ramenés au plafond C-07.
    expect(courtes.tMaxSuiviS.value).toBe(240)
    expect(courtes.tMaxSuiviS.note).toMatch(/autoguidage/i)
  })

  it('ne plafonne pas une longue focale, qui reste sous les 240 s', () => {
    const longue = profilSuivi({
      suiviActif: true,
      qualiteMes: 'SOIGNEE',
      typeMonture: 'GEM',
      focaleMm: 800,
    })
    expect(longue.tMaxSuiviS.value).toBeCloseTo(30, 6)
  })

  it('affiche la pose de suivi en plage : elle dépend d’un ordre de grandeur', () => {
    const soignee = profilSuivi({
      suiviActif: true,
      qualiteMes: 'SOIGNEE',
      typeMonture: 'GEM',
      ...REFERENCE,
    })
    expect(dependDUnOrdreDeGrandeur(soignee.tMaxSuiviS)).toBe(true)
    expect(soignee.tMaxSuiviS.range).toBeDefined()
  })

  it('déclare l’altazimutale hors périmètre au lieu de chiffrer une pose', () => {
    const altaz = profilSuivi({
      suiviActif: true,
      qualiteMes: 'SOIGNEE',
      typeMonture: 'ALTAZ',
      ...REFERENCE,
    })
    expect(altaz.domaineCpOuvert).toBe(false)
    expect(altaz.tMaxSuiviS.value).toBeNull()
    expect(altaz.cause).toMatch(/rotation de champ/i)
  })

  it('garde le retournement au méridien pour la seule monture équatoriale', () => {
    const gem = profilSuivi({
      suiviActif: true,
      qualiteMes: 'SOIGNEE',
      typeMonture: 'GEM',
      ...REFERENCE,
    })
    const tracker = profilSuivi({
      suiviActif: true,
      qualiteMes: 'SOIGNEE',
      typeMonture: 'TRACKER',
      ...REFERENCE,
    })
    expect(gem.retournementMeridien).toBe(true)
    expect(tracker.retournementMeridien).toBe(false)
  })
})
