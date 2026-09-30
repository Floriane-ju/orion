/**
 * §4.1 — masque d'horizon.
 *
 * Un site sans donnée de relief reçoit un masque plat à 0°, marqué [HYP] : l'hypothèse est
 * annoncée, jamais présentée comme une mesure du terrain.
 */

import { describe, expect, it } from 'vitest'
import {
  NB_AZIMUTS,
  masqueDepuisPoints,
  masqueDepuisRelief,
  masquePlat,
  obstructionDeg,
} from '../src/core/site.ts'
import { SaisieRefuseeError } from '../src/registry/domains.ts'

describe('masque d’horizon §4.1', () => {
  it('replie sur un masque plat marqué [HYP] faute de donnée de relief', () => {
    const masque = masquePlat()
    expect(masque.altitudesDeg).toHaveLength(NB_AZIMUTS)
    expect(masque.altitudesDeg.every((a) => a === 0)).toBe(true)
    expect(masque.estHypothese).toBe(true)
    expect(masque.flags).toContain('HYP')
    expect(masque.note).toMatch(/horizon supposé plat/i)
  })

  it('accepte un profil de relief mesuré, qui n’est plus une hypothèse', () => {
    const relief = Array.from({ length: NB_AZIMUTS }, (_, az) => (az < 180 ? 12 : 3))
    const masque = masqueDepuisRelief(relief)
    expect(masque.estHypothese).toBe(false)
    expect(masque.flags).toBeUndefined()
    expect(obstructionDeg(masque, 90)).toBe(12)
    expect(obstructionDeg(masque, 270)).toBe(3)
  })

  it('referme l’azimut sur lui-même : 360° est 0°', () => {
    const relief = Array.from({ length: NB_AZIMUTS }, (_, az) => az / 10)
    const masque = masqueDepuisRelief(relief)
    expect(obstructionDeg(masque, 360)).toBe(obstructionDeg(masque, 0))
    expect(obstructionDeg(masque, -1)).toBe(obstructionDeg(masque, 359))
  })

  it('refuse un relief incomplet plutôt que de compléter au hasard', () => {
    expect(() => masqueDepuisRelief([0, 1, 2])).toThrow(SaisieRefuseeError)
    expect(() => masqueDepuisRelief([0, 1, 2])).toThrow(/360/)
  })

  it('refuse une obstruction hors de la plage 0 à 90°', () => {
    const relief = Array.from({ length: NB_AZIMUTS }, () => 0)
    relief[42] = 95
    expect(() => masqueDepuisRelief(relief)).toThrow(/masque/i)
  })
})

describe('masque saisi à la main §4.1', () => {
  it('interpole linéairement entre deux relevés, et referme le cercle', () => {
    const masque = masqueDepuisPoints([
      { azimutDeg: 0, altitudeDeg: 10 },
      { azimutDeg: 180, altitudeDeg: 20 },
    ])
    expect(masque.altitudesDeg).toHaveLength(NB_AZIMUTS)
    expect(masque.estHypothese).toBe(false)
    expect(obstructionDeg(masque, 0)).toBeCloseTo(10, 6)
    expect(obstructionDeg(masque, 180)).toBeCloseTo(20, 6)
    expect(obstructionDeg(masque, 90)).toBeCloseTo(15, 6)
    // Le retour du dernier relevé au premier passe par l'azimut 270, pas par un trou.
    expect(obstructionDeg(masque, 270)).toBeCloseTo(15, 6)
  })

  it('couvre tout le tour quand un seul azimut est relevé', () => {
    const masque = masqueDepuisPoints([{ azimutDeg: 165, altitudeDeg: 22 }])
    expect(masque.altitudesDeg.every((a) => a === 22)).toBe(true)
  })

  it('garde le relevé le plus haut quand deux portent le même azimut', () => {
    const masque = masqueDepuisPoints([
      { azimutDeg: 90, altitudeDeg: 5 },
      { azimutDeg: 90, altitudeDeg: 18 },
    ])
    expect(obstructionDeg(masque, 90)).toBe(18)
  })

  it('replie sur le masque plat [HYP] tant qu’aucun relevé n’est saisi', () => {
    const masque = masqueDepuisPoints([])
    expect(masque.estHypothese).toBe(true)
    expect(masque.flags).toContain('HYP')
  })

  it('refuse une altitude hors du domaine en nommant le champ', () => {
    const hors = [{ azimutDeg: 12, altitudeDeg: 95 }]
    expect(() => masqueDepuisPoints(hors)).toThrow(SaisieRefuseeError)
    expect(() => masqueDepuisPoints(hors)).toThrow(/masque d’horizon/)
  })

  it('refuse un azimut hors du tour en nommant le champ', () => {
    const hors = [{ azimutDeg: 400, altitudeDeg: 10 }]
    expect(() => masqueDepuisPoints(hors)).toThrow(SaisieRefuseeError)
    expect(() => masqueDepuisPoints(hors)).toThrow(/azimut/)
  })
})
