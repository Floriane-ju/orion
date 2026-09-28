/**
 * T-0345 — §8.3 : la nuit est une ressource à allouer.
 *
 * Les créneaux sont forgés à partir d'une origine arbitraire : ce qui est vérifié est
 * l'arithmétique des intervalles (ce qui reste libre, ce qui se chevauche, le plus long morceau
 * retenu), pas une éphéméride.
 */

import { describe, expect, it } from 'vitest'
import { alloueCreneau, creneauxSeChevauchent, minutesLibres } from '../src/core/session-nuit.ts'
import type { Intervalle, SousCreneau } from '../src/core/creneaux.ts'
import { MS_PAR_MINUTE } from '../src/core/unites.ts'

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
    // Bord à bord : aucune minute commune.
    expect(creneauxSeChevauchent(creneau(sous(0, 60)), creneau(sous(60, 90)))).toBe(false)
  })

  it('alloue dans le PLUS LONG morceau libre, borné à la durée demandée', () => {
    const c = creneau(sous(0, 240))
    // Occupé de 9 à 30 : restent 9 minutes avant, 210 après — c'est l'après qui est retenu.
    const alloue = alloueCreneau(c, [intervalle(9, 30)], 60)
    expect(alloue).not.toBeNull()
    expect(alloue!.debut.getTime()).toBe(t(30).getTime())
    expect((alloue!.fin.getTime() - alloue!.debut.getTime()) / MS_PAR_MINUTE).toBe(60)
  })

  it('ne rend rien quand tout est pris', () => {
    expect(alloueCreneau(creneau(sous(0, 60)), [intervalle(0, 60)], 30)).toBeNull()
  })
})
