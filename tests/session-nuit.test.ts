/**
 * T-0345 — §8.3: the night = resource to allocate.
 * Créneaux forged from arbitrary origin: checks interval arithmetic (what stays free, overlaps,
 * longest piece kept), not an ephemeris.
 */

import { describe, expect, it } from 'vitest'
import {
  alloueCreneau,
  creneauxSeChevauchent,
  manqueIntegration,
  minutesLibres,
  retournementDansEtape,
} from '../src/core/session-nuit.ts'
import type { Intervalle, SousCreneau } from '../src/core/creneaux.ts'
import { MS_PAR_MINUTE, S_PAR_MIN } from '../src/core/unites.ts'

const ORIGINE = Date.UTC(2026, 0, 1)
const t = (minute: number): Date => new Date(ORIGINE + minute * MS_PAR_MINUTE)
const intervalle = (debut: number, fin: number): Intervalle => ({ debut: t(debut), fin: t(fin) })
const sous = (debut: number, fin: number): SousCreneau => ({
  ...intervalle(debut, fin),
  dureeMin: fin - debut,
  apresRetournement: false,
})
const creneau = (...morceaux: readonly SousCreneau[]) => ({ creneaux: morceaux })

describe('T-0345 — allocation de la nuit', () => {
  it('compte les minutes que rien n’occupe encore', () => {
    const c = creneau(sous(0, 120))
    expect(minutesLibres(c, [])).toBe(120)
    expect(minutesLibres(c, [intervalle(30, 60)])).toBe(90)
    expect(minutesLibres(c, [intervalle(-10, 200)])).toBe(0)
  })

  it('dit si deux cibles se disputent au moins une minute', () => {
    expect(creneauxSeChevauchent(creneau(sous(0, 60)), creneau(sous(59, 90)))).toBe(true)
    // Edge to edge: no common minute.
    expect(creneauxSeChevauchent(creneau(sous(0, 60)), creneau(sous(60, 90)))).toBe(false)
  })

  it('alloue dans le PLUS LONG morceau libre, borné à la durée demandée', () => {
    const c = creneau(sous(0, 240))
    // Busy 9-30: 9 min before, 210 after remain — the after is kept.
    const alloue = alloueCreneau(c, [intervalle(9, 30)], 60)
    expect(alloue).not.toBeNull()
    expect(alloue!.debut.getTime()).toBe(t(30).getTime())
    expect((alloue!.fin.getTime() - alloue!.debut.getTime()) / MS_PAR_MINUTE).toBe(60)
  })

  it('ne rend rien quand tout est pris', () => {
    expect(alloueCreneau(creneau(sous(0, 60)), [intervalle(0, 60)], 30)).toBeNull()
  })
})

describe('T-0271 — les alertes d’une étape décrivent son créneau alloué', () => {
  // Culmination forged at minute 240: target crosses meridian then.
  const creneauGem = { retournementMeridien: true, heureCulmination: t(240) }

  it('ne signale pas un retournement qui tombe hors de l’étape', () => {
    // M31 21:51 → 22:08, flip at 02:27: step ends well before.
    expect(
      retournementDansEtape({ creneau: creneauGem, creneauAlloue: intervalle(0, 17) }),
    ).toBeNull()
    // Step just after flip: already pointing the right side.
    expect(
      retournementDansEtape({ creneau: creneauGem, creneauAlloue: intervalle(240, 300) }),
    ).toBeNull()
  })

  it('signale, avec son heure, un retournement que l’étape traverse', () => {
    expect(
      retournementDansEtape({ creneau: creneauGem, creneauAlloue: intervalle(200, 280) }),
    ).toEqual(t(240))
    expect(
      retournementDansEtape({
        creneau: { ...creneauGem, retournementMeridien: false },
        creneauAlloue: intervalle(200, 280),
      }),
    ).toBeNull()
  })

  const etape = (dureeAlloueeMin: number, tRequisMin: number, nNuits: number) => ({
    dureeAlloueeMin,
    nNuits,
    integrationComplete: dureeAlloueeMin >= tRequisMin,
    integration: { tRequisS: { value: tRequisMin * S_PAR_MIN } },
  })

  it('nomme le créneau alloué quand c’est lui, et non la nuit, qui manque', () => {
    // B111: 27 min required, 20 allocated, one night would suffice.
    const phrase = manqueIntegration(etape(20, 27, 1))
    expect(phrase).toMatch(/créneau alloué de 20 min/i)
    expect(phrase).not.toMatch(/nuits/)
  })

  it('annonce les nuits quand le créneau de la cible ne suffit pas', () => {
    expect(manqueIntegration(etape(60, 180, 3))).toMatch(/prévoir 3 nuits/)
    expect(manqueIntegration(etape(30, 27, 1))).toBeNull()
  })
})
