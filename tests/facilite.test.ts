/**
 * §6.4 — note de facilité: scale invariants, no ephemeris.
 * Pure arithmetic (physics upstream, 5 sub-scores §8.3). Class bounds derived from
 * `FACILITE_NOTE_MAX` as in engine; copying 0,2/0,4 would lock the scale, not check it.
 */

import { describe, expect, it } from 'vitest'
import { faciliteCible, libelleFacilite, noteDepuisScore, noteEcartee } from '../src/core/facilite.ts'
import { K } from '../src/registry/constants.ts'
import { TABLE_FACILITE } from '../src/registry/verdicts.ts'
import type { CauseEcart, CibleEcartee } from '../src/core/session-types.ts'

const MAX = K('FACILITE_NOTE_MAX')

describe('noteDepuisScore — une cible évaluée est notée de 1 à l’échelle', () => {
  it('donne 1 au score nul : « impossible » n’existe presque jamais (prd.md:83)', () => {
    expect(noteDepuisScore(0)).toBe(1)
  })

  it('donne l’échelle au score plein, jamais un cran de plus', () => {
    expect(noteDepuisScore(1)).toBe(MAX)
  })

  it('borne un score négatif à 1 plutôt que de produire une note absurde', () => {
    expect(noteDepuisScore(-1)).toBe(1)
  })

  it('ne sort jamais de [1, échelle], quel que soit le score', () => {
    // Step finer than class width: every class crossed, bounds unknown.
    const pas = 1 / (MAX * 20)
    for (let score = 0; score <= 1 + pas; score += pas) {
      const note = noteDepuisScore(score)
      expect(note, `score ${score}`).toBeGreaterThanOrEqual(1)
      expect(note, `score ${score}`).toBeLessThanOrEqual(MAX)
    }
  })

  it('ne décroît jamais quand le score croît', () => {
    const pas = 1 / (MAX * 20)
    let precedente = noteDepuisScore(0)
    for (let score = 0; score <= 1; score += pas) {
      const note = noteDepuisScore(score)
      expect(note, `score ${score}`).toBeGreaterThanOrEqual(precedente)
      precedente = note
    }
  })

  it('atteint réellement chaque note de l’échelle : aucune classe n’est morte', () => {
    const pas = 1 / (MAX * 20)
    const atteintes = new Set<number>()
    for (let score = 0; score <= 1; score += pas) atteintes.add(noteDepuisScore(score))
    for (let note = 1; note <= MAX; note += 1) {
      expect(atteintes.has(note), `note ${note}`).toBe(true)
    }
  })

  it('découpe l’échelle en parts égales', () => {
    // Class lower bound derived from scale, not a table.
    for (let note = 1; note <= MAX; note += 1) {
      expect(noteDepuisScore((note - 1) / MAX), `borne basse de ${note}`).toBe(note)
    }
  })
})

describe('noteEcartee — 0 est réservé aux causes que le moteur nomme', () => {
  it('ne note pas une donnée manquante : non documenté n’est pas difficile', () => {
    expect(noteEcartee('DONNEE_MANQUANTE')).toBeNull()
  })

  it('donne 0 à toute autre cause d’écart', () => {
    const causes: readonly CauseEcart[] = [
      'CADRAGE',
      'HAUTEUR',
      'RELIEF',
      'FENETRE',
      'HORS_PORTEE',
      'CONFLIT_CRENEAU',
    ]
    for (const code of causes) expect(noteEcartee(code), code).toBe(0)
  })
})

describe('TABLE_FACILITE — l’échelle est libellée de bout en bout', () => {
  it('porte un libellé pour 0 et pour chaque note de l’échelle', () => {
    for (let note = 0; note <= MAX; note += 1) {
      expect(libelleFacilite(note), `note ${note}`).not.toBeNull()
    }
  })

  it('ne porte aucune note hors de l’échelle', () => {
    for (const ligne of TABLE_FACILITE) {
      expect(ligne.note, ligne.libelle).toBeGreaterThanOrEqual(0)
      expect(ligne.note, ligne.libelle).toBeLessThanOrEqual(MAX)
    }
    expect(libelleFacilite(MAX + 1)).toBeNull()
  })

  it('reste gelée : le registre ne se réécrit pas à l’exécution', () => {
    expect(Object.isFrozen(TABLE_FACILITE)).toBe(true)
    for (const ligne of TABLE_FACILITE) expect(Object.isFrozen(ligne)).toBe(true)
  })
})

describe('faciliteCible — la cible écartée porte sa note, ou aucune', () => {
  const ecartee = (code: CauseEcart): CibleEcartee => ({
    designation: 'CIBLE_TEST',
    code,
    cause: 'cause produite par le moteur',
  })

  it('rend la note 0 et son libellé sur une impossibilité nommée', () => {
    const facilite = faciliteCible(ecartee('CADRAGE'))
    expect(facilite).not.toBeNull()
    expect(facilite!.note).toBe(0)
    expect(facilite!.libelle).toBe(libelleFacilite(0))
  })

  it('ne rend rien sur une donnée manquante', () => {
    expect(faciliteCible(ecartee('DONNEE_MANQUANTE'))).toBeNull()
  })
})
