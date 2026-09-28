/**
 * §8.1 et §4.1 — T-0267 : après minuit, la nuit planifiée reste celle qu'on observe.
 *
 * Le jour civil de l'instant datait la nuit. À 00:30, au milieu de la séance, le plan
 * basculait sur la nuit suivante — créneaux, budget et aide au pointage compris. Le jour
 * d'observation court d'un midi au suivant : ces cas fixent la bascule et ce qu'elle nomme.
 *
 * Aucune éphéméride recopiée : le coucher du Soleil est calculé, et seul le JOUR sur lequel
 * il tombe est vérifié.
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

const SITE_REFERENCE = { latitudeDeg: 46.391, longitudeDeg: 6.697, altitudeM: 500 }

/** Le 18 septembre 2026, en heure locale — le jour civil que l'instant traverse. */
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
    // Piège A1 — `toISOString()` désigne la veille à l'ouest de Greenwich, le lendemain à
    // l'est. C'est la nuit qu'on observe qui compte, pas celle du méridien de référence.
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

/** Le seul état que `useSaisieLieu` tire de l'horloge : ce que l'application ouvre. */
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
