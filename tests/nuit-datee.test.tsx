/**
 * §8.1, §4.1 — T-0267: after midnight, planned nuit stays the observed one.
 * Civil day of the instant dated the nuit: at 00:30 mid-séance plan flipped to next nuit
 * (créneaux, budget, pointage aid). Observation day runs noon → noon: cases pin the flip and
 * what it names. No ephemeris copied: sunset computed, only its DAY checked.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App.tsx'
import { fenetreNocturne } from '../src/core/nuit.ts'
import {
  jourLocalIso,
  midiDeLaNuit,
  nomDeLaNuit,
  nuitDeLInstant,
} from '../src/core/nuit-datee.ts'
import { K } from '../src/registry/constants.ts'
import { useSaisieLieu } from '../src/ui/app-saisie.ts'
import { SITE_REFERENCE } from './fixtures.ts'


/** 18 Sep 2026, local time: the civil day the instant crosses. */
const LENDEMAIN = { annee: 2026, mois: 8, jour: 18 } as const

function le18a(heures: number, minutes: number): Date {
  return new Date(LENDEMAIN.annee, LENDEMAIN.mois, LENDEMAIN.jour, heures, minutes)
}

describe('datation de la nuit §8.1', () => {
  it('à 00:30, garde la nuit en cours — celle du soir précédent', () => {
    expect(nuitDeLInstant(le18a(0, 30))).toBe('2026-09-17')
  })

  it('bascule au midi légal, et pas une minute avant', () => {
    const midi = K('MIDI_JOUR_OBSERVATIONNEL_H')
    expect(nuitDeLInstant(le18a(midi, -1))).toBe('2026-09-17')
    expect(nuitDeLInstant(le18a(midi, 1))).toBe('2026-09-18')
  })

  it('date la nuit sur le calendrier LOCAL, pas sur la tranche UTC', () => {
    // Trap A1 — `toISOString()` names the day before west of Greenwich, after east. Observed
    // nuit matters, not the reference meridian's.
    const soir = new Date(2026, 6, 15, 22, 30)
    expect(nuitDeLInstant(soir)).toBe('2026-07-15')
    expect(nuitDeLInstant(soir)).toBe(soir.toLocaleDateString('sv-SE'))
  })

  it('fait commencer la fenêtre nocturne le soir qui nomme la nuit', () => {
    const nuitIso = nuitDeLInstant(le18a(0, 30))
    const nuit = fenetreNocturne(SITE_REFERENCE, midiDeLaNuit(nuitIso))
    expect(nuit.coucherSoleil).not.toBeNull()
    expect(jourLocalIso(nuit.coucherSoleil!)).toBe('2026-09-17')
    expect(jourLocalIso(nuit.leverSoleil!)).toBe('2026-09-18')
  })

  it('part d’un midi LOCAL : à l’est, midi UTC tombe déjà après le coucher', () => {
    const depart = midiDeLaNuit('2026-09-17')
    expect(jourLocalIso(depart)).toBe('2026-09-17')
    expect(depart.getHours()).toBe(K('MIDI_JOUR_OBSERVATIONNEL_H'))
  })
})

describe('le nom d’une nuit porte ses deux dates', () => {
  it('nomme le soir et le matin', () => {
    expect(nomDeLaNuit('2026-09-17')).toBe('nuit du 17/09/2026 au 18/09/2026')
  })

  it('passe le mois et l’année sans perdre une date', () => {
    expect(nomDeLaNuit('2026-09-30')).toBe('nuit du 30/09/2026 au 01/10/2026')
    expect(nomDeLaNuit('2026-12-31')).toBe('nuit du 31/12/2026 au 01/01/2027')
  })
})

/** Only state `useSaisieLieu` takes from the clock: app's opening value. */
function NuitAuDemarrage() {
  return <>{useSaisieLieu(null).nuitIso}</>
}

describe('au démarrage, l’application ouvre la nuit en cours', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lancée à 02:00, affiche le plan de la nuit qu’on est en train d’observer', () => {
    vi.useFakeTimers()
    vi.setSystemTime(le18a(2, 0))
    expect(renderToStaticMarkup(<NuitAuDemarrage />)).toBe('2026-09-17')
  })

  it('lancée en fin d’après-midi, ouvre la nuit qui vient', () => {
    vi.useFakeTimers()
    vi.setSystemTime(le18a(18, 0))
    expect(renderToStaticMarkup(<NuitAuDemarrage />)).toBe('2026-09-18')
  })

  it('la carte Plan de nuit nomme la nuit par ses deux dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(le18a(2, 0))
    expect(renderToStaticMarkup(<App />)).toContain('nuit du 17/09/2026 au 18/09/2026')
  })
})
