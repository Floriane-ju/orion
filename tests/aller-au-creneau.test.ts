/**
 * T-0284 — §6.4: one gesture from the fiche puts the scène at the créneau, cible centred and
 * followed; the list says which night it judges. Night and target SEARCHED, not written.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { coordonneesHorizon } from '../src/core/cibles-liste.ts'
import { matriceALaMinute } from '../src/core/horloges.ts'
import { MS_PAR_H, MS_PAR_MINUTE } from '../src/core/unites.ts'
import { cadreA } from '../src/ui/BoutonCadrer.tsx'
import { phraseNuitListe } from '../src/ui/nuit-liste.ts'
import { etatScene, minuteAffichee, reinitialiseScene } from '../src/ui/scene-etat.ts'
import { SITE_REFERENCE as SITE, objetGalaxie } from './fixtures.ts'

const NUIT = fenetreNocturne(SITE, new Date('2026-08-12T12:00:00Z'))
const DEBUT = NUIT.debutReference!
const FIN = NUIT.finReference!

describe('T-0284 — aller au créneau depuis la fiche', () => {
  beforeEach(() => reinitialiseScene())

  const objet = objetGalaxie({ designation: 'CIBLE' })

  it('place l’instant au créneau, fige le temps et centre la cible à cet instant', () => {
    cadreA(objet, SITE, DEBUT)
    const etat = etatScene()
    const minute = Math.floor(DEBUT.getTime() / MS_PAR_MINUTE)
    expect(minuteAffichee(etat)).toBe(minute)
    expect(etat.temps.modeTemps).toBe('FIGE')
    const attendu = coordonneesHorizon(objet, matriceALaMinute(SITE, minute))
    expect(etat.vue.azimutDeg).toBeCloseTo(attendu.azimutDeg, 9)
    expect(etat.vue.hauteurDeg).toBeCloseTo(attendu.hauteurDeg, 9)
  })

  it('garde le champ choisi — T-0447', () => {
    const { fovDeg } = etatScene().vue
    cadreA(objet, SITE, DEBUT)
    expect(etatScene().vue.fovDeg).toBe(fovDeg)
  })

  it('pose le suivi : la cible reste centrée quand le temps bouge', () => {
    cadreA(objet, SITE, DEBUT)
    expect(etatScene().suivi?.designation).toBe(objet.designation)
  })
})

describe('T-0284 — la liste dit quelle nuit elle juge', () => {
  it('nomme la nuit, sans écart quand le ciel est dedans', () => {
    const milieu = new Date((DEBUT.getTime() + FIN.getTime()) / 2)
    const phrase = phraseNuitListe(NUIT, milieu)
    expect(phrase).toMatch(/^Liste établie pour la nuit de /)
    expect(phrase).not.toMatch(/ciel affiché/)
  })

  it('de jour, dit que le ciel affiché est avant la nuit', () => {
    expect(phraseNuitListe(NUIT, new Date(DEBUT.getTime() - MS_PAR_H))).toMatch(/avant cette nuit/)
  })

  it('après l’aube, dit que le ciel affiché est après la nuit', () => {
    expect(phraseNuitListe(NUIT, new Date(FIN.getTime() + MS_PAR_H))).toMatch(/après cette nuit/)
  })
})
