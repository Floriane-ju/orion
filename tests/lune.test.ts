/**
 * §8.1 — Lune, dégradation du fond de ciel et fenêtre utile, plus le mode dégradé de la
 * nuit nautique.
 *
 * Deux affirmations du PRD sont vérifiées ici parce qu'elles sont contre-intuitives :
 * une Lune sous l'horizon ne dégrade RIEN quelle que soit sa phase, et une nuit de Lune
 * n'est pas perdue — elle est chiffrée.
 */

import { describe, expect, it } from 'vitest'
import {
  deltaSbLune,
  etatLune,
  fenetreUtile,
  masseAirKS,
  nanolamberts,
} from '../src/core/moon.ts'
import { fenetreNocturne } from '../src/core/night.ts'
import { K } from '../src/registry/constants.ts'
import { separationEquatorialeDeg } from '../src/core/mat3.ts'

const SITE_REFERENCE = { latitudeDeg: 46.391, longitudeDeg: 6.697, altitudeM: 500 }
const SB_BORTLE_45 = 20.95

function midiUtc(dateIso: string): Date {
  return new Date(`${dateIso}T12:00:00Z`)
}

describe('mode dégradé de la nuit nautique §8.1', () => {
  const nuit = fenetreNocturne({ latitudeDeg: 52, longitudeDeg: 0, altitudeM: 0 }, midiUtc('2026-06-21'))

  it('annonce la nuit astronomique nulle, sans durée négative ni erreur', () => {
    expect(nuit.etat).toBe('PAS_DE_NUIT_ASTRONOMIQUE')
    expect(nuit.dureeNuitH).toBe(0)
    expect(nuit.dureeReferenceH).toBeGreaterThan(0)
  })

  it('retient la fenêtre nautique et chiffre sa pénalité de fond de ciel', () => {
    expect(nuit.modeDegrade).toBe(true)
    expect(nuit.debutReference).toStrictEqual(nuit.debutNautique)
    expect(nuit.penaliteSbMag).toBe(K('PENALITE_SB_CREPUSCULE_NAUTIQUE_MAG'))
    expect(nuit.cause).toMatch(/Mode dégradé/)
    expect(nuit.cause).toMatch(/pénalité de fond de ciel/)
  })

  it('n’active aucun mode dégradé quand la nuit noire existe', () => {
    const normale = fenetreNocturne(SITE_REFERENCE, midiUtc('2026-08-14'))
    expect(normale.modeDegrade).toBe(false)
    expect(normale.penaliteSbMag).toBe(0)
    expect(normale.debutReference).toStrictEqual(normale.debutNuitAstronomique)
  })
})

describe('dégradation lunaire, modèle de Krisciunas & Schaefer §8.1', () => {
  it('ne dégrade rien quand la Lune est sous l’horizon, quelle que soit sa phase', () => {
    const pleineLuneCouchee = deltaSbLune({
      sbCielNoirMag: SB_BORTLE_45,
      altitudeLuneDeg: -5,
      altitudeCibleDeg: 60,
      separationDeg: 90,
      anglePhaseDeg: 0,
    })
    expect(pleineLuneCouchee.value).toBe(0)
    expect(pleineLuneCouchee.note).toMatch(/aucune gêne/)
  })

  it('chiffre une pleine Lune haute au lieu de barrer la nuit', () => {
    const delta = deltaSbLune({
      sbCielNoirMag: SB_BORTLE_45,
      altitudeLuneDeg: 50,
      altitudeCibleDeg: 60,
      separationDeg: 60,
      anglePhaseDeg: 0,
    })
    expect(delta.value).toBeGreaterThan(1)
    expect(delta.note).toMatch(/poses plus courtes/)
    expect(delta.formula.section).toBe('8.1')
  })

  it('dégrade moins un croissant qu’une pleine Lune, à géométrie égale', () => {
    const commun = {
      sbCielNoirMag: SB_BORTLE_45,
      altitudeLuneDeg: 40,
      altitudeCibleDeg: 60,
      separationDeg: 70,
    }
    const pleine = deltaSbLune({ ...commun, anglePhaseDeg: 0 })
    const croissant = deltaSbLune({ ...commun, anglePhaseDeg: 120 })
    expect(croissant.value).toBeLessThan(pleine.value)
  })

  it('dégrade davantage près de la Lune que loin d’elle', () => {
    const commun = {
      sbCielNoirMag: SB_BORTLE_45,
      altitudeLuneDeg: 40,
      altitudeCibleDeg: 50,
      anglePhaseDeg: 0,
    }
    expect(deltaSbLune({ ...commun, separationDeg: 20 }).value).toBeGreaterThan(
      deltaSbLune({ ...commun, separationDeg: 120 }).value,
    )
  })

  it('cite ses constantes de registre plutôt que des nombres nus', () => {
    const delta = deltaSbLune({
      sbCielNoirMag: SB_BORTLE_45,
      altitudeLuneDeg: 30,
      altitudeCibleDeg: 45,
      separationDeg: 60,
      anglePhaseDeg: 30,
    })
    expect(delta.constants.map((c) => c.ref)).toContain('L-01')
    expect(delta.constants.some((c) => c.ordreDeGrandeur)).toBe(true)
  })
})

describe('grandeurs intermédiaires du modèle', () => {
  it('donne une masse d’air de 1 au zénith et bornée à l’horizon', () => {
    expect(masseAirKS(90)).toBeCloseTo(1, 6)
    expect(masseAirKS(0)).toBeCloseTo(5, 0)
  })

  it('convertit une brillance de surface en nanolamberts de façon monotone', () => {
    expect(nanolamberts(20)).toBeGreaterThan(nanolamberts(22))
  })

  it('mesure une séparation angulaire nulle sur soi-même et 180° à l’opposé', () => {
    expect(separationEquatorialeDeg(3, 20, 3, 20)).toBeCloseTo(0, 6)
    expect(separationEquatorialeDeg(0, 90, 0, -90)).toBeCloseTo(180, 6)
  })
})

describe('fenêtre utile §8.1', () => {
  it('expose séparément la fenêtre sans Lune et la nuit complète', () => {
    // Pleine Lune du 29 août 2026 : elle traverse une grande part de la nuit.
    const nuit = fenetreNocturne(SITE_REFERENCE, midiUtc('2026-08-29'))
    const utile = fenetreUtile(SITE_REFERENCE, nuit)
    expect(utile.dureeNuitH).toBeCloseTo(nuit.dureeNuitH, 6)
    expect(utile.dureeH).toBeLessThanOrEqual(utile.dureeNuitH)
    expect(utile.note).toMatch(/Lune/)
  })

  it('n’ampute rien quand la Lune est absente de la nuit', () => {
    const nuit = fenetreNocturne(SITE_REFERENCE, midiUtc('2026-08-14'))
    const utile = fenetreUtile(SITE_REFERENCE, nuit)
    if (!utile.luneInterfere) {
      expect(utile.dureeH).toBeCloseTo(utile.dureeNuitH, 1)
    }
  })
})

describe('état de la Lune', () => {
  it('produit phase, illumination et instants sans appel réseau', () => {
    const lune = etatLune(SITE_REFERENCE, new Date('2026-08-14T22:00:00Z'))
    expect(lune.illumination).toBeGreaterThanOrEqual(0)
    expect(lune.illumination).toBeLessThanOrEqual(1)
    expect(lune.anglePhaseDeg).toBeGreaterThanOrEqual(0)
    expect(lune.anglePhaseDeg).toBeLessThanOrEqual(180)
    expect(lune.sousHorizon).toBe(lune.altitudeDeg <= 0)
  })
})
