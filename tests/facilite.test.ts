/**
 * §6.4 — la note de facilité : les invariants de l'échelle, sans une seule éphéméride.
 *
 * Le module se teste sur de l'arithmétique parce qu'il ne fait que ça : la physique est en
 * amont, dans les cinq sous-scores de §8.3. Aucune borne de classe n'est écrite ici — elles se
 * dérivent de `FACILITE_NOTE_MAX`, exactement comme dans le moteur. Un test qui recopierait
 * 0,2 et 0,4 verrouillerait l'échelle au lieu de la vérifier.
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
    // Le pas d'échantillonnage est plus fin que la largeur d'une classe : chaque classe est
    // donc traversée, sans que le test connaisse ses bornes.
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
    // La borne basse de chaque classe se calcule depuis l'échelle, jamais depuis une table.
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
