/**
 * T-0394 — « Aller à la nuit » se retire dès que l'utilisateur a bougé le temps ou la visée
 * lui-même.
 */

import { describe, expect, it } from 'vitest'
import { appelABouge, type ReperesAppel } from '../src/ui/CarteNuit.tsx'
import type { TempsScene } from '../src/ui/scene-etat.ts'

const lecture: TempsScene = { modeTemps: 'MAINTENANT', facteur: 0, decalageMs: 0 }
const fige: TempsScene = { modeTemps: 'FIGE', facteur: 0, decalageMs: 0 }
const vue = { azimutDeg: 180, hauteurDeg: 30, fovDeg: 200 }
const depart = (temps: TempsScene): ReperesAppel => ({ temps, minute: 1, vue })

describe('appelABouge', () => {
  it('en lecture, la minute qui avance seule ne compte pas', () => {
    expect(appelABouge(depart(lecture), { ...depart(lecture), minute: 2 })).toBe(false)
  })

  it('un changement de mode compte : transport, saut, reprise', () => {
    expect(appelABouge(depart(lecture), depart(fige))).toBe(true)
  })

  it('temps figé, une minute réécrite compte : compteur ou frise', () => {
    expect(appelABouge(depart(fige), depart(fige))).toBe(false)
    expect(appelABouge(depart(fige), { ...depart(fige), minute: 2 })).toBe(true)
  })

  it('glisser ou zoomer compte', () => {
    expect(appelABouge(depart(lecture), { ...depart(lecture), vue: { ...vue, azimutDeg: 181 } })).toBe(true)
    expect(appelABouge(depart(lecture), { ...depart(lecture), vue: { ...vue, hauteurDeg: 31 } })).toBe(true)
    expect(appelABouge(depart(lecture), { ...depart(lecture), vue: { ...vue, fovDeg: 100 } })).toBe(true)
  })
})
