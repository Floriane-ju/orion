/**
 * §3.2, T-0394 — le trajet dans le temps tient sous le plafond de lisibilité.
 *
 * Les durées attendues se dérivent de la formule de `facteur_max` et de la pente de pointe
 * de la courbe, jamais d'un chiffre recopié : c'est la règle qui est éprouvée.
 */

import { describe, expect, it } from 'vitest'
import { courbeTrajet, dureeForcee, ecartMontre, penteMaxTrajet, planTrajet } from '../src/core/trajet-temps.ts'
import { MS_PAR_JOUR } from '../src/core/horloges.ts'
import { facteurMax, pxParDegre, vitesseEcran } from '../src/core/curseur-temps.ts'
import { K } from '../src/registry/constants.ts'
import { MS_PAR_MINUTE } from '../src/core/unites.ts'

const DEPART = Date.UTC(2026, 9, 2, 14, 12)
/** Revue DA §4.2 : de 16 h 12 à environ 20 h 50, quelque 280 minutes de ciel. */
const SOIREE = 280 * MS_PAR_MINUTE
const PENTE_MAX = penteMaxTrajet()

function plan(fovDeg: number, largeurPx: number, ecartMs = SOIREE, mouvementReduit = false) {
  return planTrajet({
    departMs: DEPART,
    arriveeMs: DEPART + ecartMs,
    pxParDegre: pxParDegre(largeurPx, fovDeg),
    mouvementReduit,
  })
}

describe('planTrajet §3.2', () => {
  it('garde la durée nominale en vue large, pointe sous le repliement', () => {
    // Une heure de ciel à 200° de champ sur 1280 px : loin du plafond.
    const heure = 60 * MS_PAR_MINUTE
    const p = plan(200, 1280, heure)
    expect(p).toEqual({ saut: false, dureeMs: K('DUREE_TRAJET_MS') })
    const pointe = (PENTE_MAX * heure) / K('DUREE_TRAJET_MS')
    expect(vitesseEcran(pointe, pxParDegre(1280, 200)).value).toBeLessThanOrEqual(
      K('V_ECRAN_REPLIEMENT_PX_S'),
    )
  })

  it('allonge le trajet juste assez pour que la pointe touche le plafond', () => {
    const pxDeg = pxParDegre(1920, 200)
    const p = plan(200, 1920)
    if (p.saut) throw new Error('un trajet était attendu')
    expect(p.dureeMs).toBeGreaterThan(K('DUREE_TRAJET_MS'))
    expect((PENTE_MAX * SOIREE) / p.dureeMs).toBeCloseTo(facteurMax(pxDeg).value, 6)
  })

  it('devient un saut annoncé quand le plafond l’allongerait trop', () => {
    expect(plan(60, 1920)).toEqual({ saut: true, raison: 'ILLISIBLE' })
  })

  it('forcé, traverse même là où le plafond ferait sauter', () => {
    const p = planTrajet({
      departMs: DEPART,
      arriveeMs: DEPART + 30 * SOIREE,
      pxParDegre: pxParDegre(1920, 60),
      mouvementReduit: false,
      force: true,
    })
    expect(p).toEqual({ saut: false, dureeMs: dureeForcee(30 * SOIREE) })
  })

  it('forcé, saute encore sous prefers-reduced-motion', () => {
    const p = planTrajet({
      departMs: DEPART,
      arriveeMs: DEPART + SOIREE,
      pxParDegre: pxParDegre(1920, 60),
      mouvementReduit: true,
      force: true,
    })
    expect(p).toEqual({ saut: true, raison: 'MOUVEMENT_REDUIT' })
  })

  it('saute sous prefers-reduced-motion', () => {
    expect(plan(200, 1280, SOIREE, true)).toEqual({ saut: true, raison: 'MOUVEMENT_REDUIT' })
  })

  it('ne fait rien d’un trajet sur place', () => {
    expect(plan(200, 1280, 0)).toEqual({ saut: true, raison: 'SUR_PLACE' })
  })

  it('vaut en marche arrière comme en marche avant', () => {
    expect(plan(200, 1920, -SOIREE)).toEqual(plan(200, 1920))
  })
})

describe('courbeTrajet', () => {
  const H = 1e-6
  const pente = (t: number) => (courbeTrajet(t + H) - courbeTrajet(t - H)) / (2 * H)

  it('part de 0, arrive à 1, sans vitesse aux deux bouts', () => {
    expect(courbeTrajet(0)).toBe(0)
    expect(courbeTrajet(1)).toBe(1)
    expect(pente(H)).toBeCloseTo(0, 3)
    expect(pente(1 - H)).toBeCloseTo(0, 3)
  })

  it('ne recule jamais, et sa pointe est penteMaxTrajet, sans saut de vitesse', () => {
    const pas = Array.from({ length: 101 }, (_, i) => i / 100)
    for (let i = 1; i < pas.length; i++) {
      expect(courbeTrajet(pas[i]!)).toBeGreaterThanOrEqual(courbeTrajet(pas[i - 1]!))
    }
    const p = K('COURBE_TRAJET_BASCULE')
    expect(pente(p)).toBeCloseTo(penteMaxTrajet(), 3)
    expect(Math.max(...pas.map(pente).filter(Number.isFinite))).toBeLessThanOrEqual(penteMaxTrajet() + 1e-3)
  })

  it('se pose plus lentement qu’elle ne part', () => {
    // À égale distance des bouts, il reste moins à parcourir qu'il n'en a été parcouru.
    expect(1 - courbeTrajet(0.8)).toBeLessThan(courbeTrajet(0.2))
  })
})

describe('dureeForcee', () => {
  it('part de la nominale, s’allonge d’un pas à chaque doublement des jours', () => {
    expect(dureeForcee(0)).toBe(K('DUREE_TRAJET_MS'))
    expect(dureeForcee(MS_PAR_JOUR)).toBeCloseTo(K('DUREE_TRAJET_MS') + K('DUREE_TRAJET_PAR_DOUBLEMENT_MS'))
    expect(dureeForcee(3 * MS_PAR_JOUR)).toBeCloseTo(K('DUREE_TRAJET_MS') + 2 * K('DUREE_TRAJET_PAR_DOUBLEMENT_MS'))
  })

  it('croît avec l’écart, dans les deux sens, sans dépasser le plafond', () => {
    expect(dureeForcee(7 * MS_PAR_JOUR)).toBeGreaterThan(dureeForcee(MS_PAR_JOUR))
    expect(dureeForcee(-7 * MS_PAR_JOUR)).toBe(dureeForcee(7 * MS_PAR_JOUR))
    expect(dureeForcee(1000 * MS_PAR_JOUR)).toBe(K('DUREE_TRAJET_FORCE_MAX_MS'))
  })
})

describe('ecartMontre', () => {
  const max = K('JOURS_TRAJET_FORCE_MAX') * MS_PAR_JOUR
  const H = MS_PAR_JOUR / 24

  it('jusqu’au plafond de jours, montre tout', () => {
    expect(ecartMontre(max)).toBe(max)
    expect(ecartMontre(-5 * H)).toBe(-5 * H)
  })

  it('au-delà, ne montre que les derniers jours et la fraction de journée', () => {
    expect(ecartMontre(40 * MS_PAR_JOUR + 6 * H)).toBe(max + 6 * H)
    expect(ecartMontre(-(40 * MS_PAR_JOUR + 6 * H))).toBe(-(max + 6 * H))
  })

  it('ce qui se saute est un nombre entier de jours : le Soleil reste à sa place', () => {
    const ecart = 365 * MS_PAR_JOUR + 7 * H
    expect((ecart - ecartMontre(ecart)) % MS_PAR_JOUR).toBe(0)
  })
})
