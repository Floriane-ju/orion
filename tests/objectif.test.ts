/**
 * T-0404 — §5.1 parc d'objectifs : le plancher d'ouverture d'un zoom, les plages de réglage
 * qu'un objectif impose, et l'objectif du parc qu'une cible écartée réclame (§6.1).
 *
 * Aucune ouverture intermédiaire n'est recopiée : le plancher se vérifie à ses deux bouts, par
 * sa monotonie et par la formule d'interpolation réécrite à partir des entrées.
 */

import { describe, expect, it } from 'vitest'
import {
  focaleOptimale,
  objectifPour,
  ouvertureA,
  ouverturePlancher,
  plagesReglage,
  plancherAuPas,
  valideObjectif,
  type Objectif,
} from '../src/core/objectif.ts'
import { DOMAINES, SaisieRefuseeError } from '../src/registry/domains.ts'
import { K } from '../src/registry/constants.ts'
import { fovDeg } from '../src/core/optics.ts'
import { ARCMIN_PAR_DEG } from '../src/core/unites.ts'

function objectif(champs: Partial<Objectif> = {}): Objectif {
  return {
    id: 'trans',
    nom: '18-55',
    focaleMinMm: 18,
    focaleMaxMm: 55,
    ouvertureGrandAngleN: 3.5,
    ouvertureTeleN: 5.6,
    typeObjectif: 'RECTILINEAIRE',
    ...champs,
  }
}

describe('§5.1 — plancher d’ouverture d’un zoom', () => {
  const zoom = objectif()

  it('vaut l’ouverture déclarée à chaque bout de la plage', () => {
    expect(ouverturePlancher(zoom, zoom.focaleMinMm)).toBe(zoom.ouvertureGrandAngleN)
    expect(ouverturePlancher(zoom, zoom.focaleMaxMm)).toBe(zoom.ouvertureTeleN)
  })

  it('s’interpole linéairement en focale entre les deux', () => {
    const f = (zoom.focaleMinMm + zoom.focaleMaxMm) / 2
    const attendu = (zoom.ouvertureGrandAngleN + zoom.ouvertureTeleN) / 2
    expect(ouverturePlancher(zoom, f)).toBeCloseTo(attendu, 12)
  })

  it('ne décroît jamais quand la focale s’allonge', () => {
    let avant = 0
    for (let f = zoom.focaleMinMm; f <= zoom.focaleMaxMm; f += 1) {
      const n = ouverturePlancher(zoom, f)
      expect(n).toBeGreaterThanOrEqual(avant)
      avant = n
    }
  })

  it('reste constant sur un zoom à ouverture constante et sur une focale fixe', () => {
    const constant = objectif({ focaleMinMm: 24, focaleMaxMm: 70, ouvertureGrandAngleN: 2.8, ouvertureTeleN: 2.8 })
    expect(ouverturePlancher(constant, 50)).toBe(2.8)
    const fixe = objectif({ focaleMinMm: 135, focaleMaxMm: 135, ouvertureGrandAngleN: 2, ouvertureTeleN: 2 })
    expect(ouverturePlancher(fixe, 135)).toBe(2)
  })

  it('s’arrondit au pas du domaine, vers le plus fermé — jamais sous le plancher', () => {
    const pas = DOMAINES.ouverture_N.pas
    for (let f = zoom.focaleMinMm; f <= zoom.focaleMaxMm; f += 1) {
      const exact = ouverturePlancher(zoom, f)
      const arrondi = plancherAuPas(exact)
      expect(arrondi).toBeGreaterThanOrEqual(exact)
      expect(arrondi - exact).toBeLessThan(pas)
    }
    // Une valeur déjà au pas ne monte pas d'un cran sous l'effet du flottant.
    expect(plancherAuPas(1.1)).toBe(1.1)
    expect(plancherAuPas(5.6)).toBe(5.6)
  })
})

describe('§5.1 — plages de réglage sous un objectif', () => {
  const zoom = objectif()

  it('borne la focale à la plage et l’ouverture au plancher de la focale retenue', () => {
    const plages = plagesReglage(zoom, zoom.focaleMaxMm * 2)
    expect(plages.focale).toEqual({ min: zoom.focaleMinMm, max: zoom.focaleMaxMm })
    expect(plages.ouverture.min).toBe(zoom.ouvertureTeleN)
    expect(plages.ouverture.max).toBe(DOMAINES.ouverture_N.max)
  })

  it('une focale illisible laisse l’ouverture au plancher du grand-angle', () => {
    expect(plagesReglage(zoom, Number.NaN).ouverture.min).toBe(zoom.ouvertureGrandAngleN)
  })
})

describe('§5.1 — un objectif saisi est validé en nommant le champ fautif', () => {
  it('accepte un objectif cohérent', () => {
    expect(valideObjectif(objectif())).toEqual(objectif())
  })

  it('refuse une focale min au-delà de la focale max', () => {
    expect(() => valideObjectif(objectif({ focaleMinMm: 60 }))).toThrow(SaisieRefuseeError)
    expect(() => valideObjectif(objectif({ focaleMinMm: 60 }))).toThrow(/focale/)
  })

  it('refuse un télé plus ouvert que le grand-angle', () => {
    expect(() => valideObjectif(objectif({ ouvertureTeleN: 2.8 }))).toThrow(/ouverture/)
  })

  it('refuse une focale hors du domaine', () => {
    expect(() => valideObjectif(objectif({ focaleMaxMm: DOMAINES.focale_mm.max + 1 }))).toThrow(
      SaisieRefuseeError,
    )
  })

  it('refuse un nom vide', () => {
    expect(() => valideObjectif(objectif({ nom: '  ' }))).toThrow(/nom/)
  })
})

describe('§6.1 — l’objectif du parc qui cadrerait une cible écartée', () => {
  const grandAngle = objectif({ id: 'ga', nom: '14 mm', focaleMinMm: 14, focaleMaxMm: 14, ouvertureGrandAngleN: 2.8, ouvertureTeleN: 2.8 })
  const tele = objectif({ id: 'tele', nom: '70-200', focaleMinMm: 70, focaleMaxMm: 200, ouvertureGrandAngleN: 4, ouvertureTeleN: 4 })
  const fisheye = objectif({ id: 'fe', nom: 'Fisheye', focaleMinMm: 8, focaleMaxMm: 15, typeObjectif: 'FISHEYE' })
  const parc = [grandAngle, tele, fisheye]

  it('au moins 135 mm : le zoom qui l’atteint, réglé à 135 mm', () => {
    expect(objectifPour(parc, { sens: 'AU_MOINS', focaleMm: 135 })).toEqual({ objectif: tele, focaleMm: 135 })
  })

  it('au moins 40 mm : le zoom le plus proche, à sa focale la plus courte', () => {
    expect(objectifPour(parc, { sens: 'AU_MOINS', focaleMm: 40 })).toEqual({ objectif: tele, focaleMm: 70 })
  })

  it('au plus 20 mm : jamais le fisheye, que la règle de cadrage ne décrit pas', () => {
    expect(objectifPour(parc, { sens: 'AU_PLUS', focaleMm: 20 })).toEqual({ objectif: grandAngle, focaleMm: 14 })
    expect(objectifPour([fisheye], { sens: 'AU_PLUS', focaleMm: 20 })).toBeNull()
  })

  it('rien dans le parc ne l’atteint, ou la cible demande une mosaïque', () => {
    expect(objectifPour(parc, { sens: 'AU_MOINS', focaleMm: 400 })).toBeNull()
    expect(objectifPour(parc, { sens: 'MOSAIQUE' })).toBeNull()
    expect(objectifPour([], { sens: 'AU_MOINS', focaleMm: 135 })).toBeNull()
  })
})

describe('T-0407 — la focale optimale d’une cible sous un zoom', () => {
  const zoom = objectif()
  const capteurHMm = 15.6
  /** La taille qu'un champ à cette focale cadre au remplissage visé : la formule, à l'envers. */
  const tailleCadreeA = (focaleMm: number): number =>
    fovDeg(capteurHMm, focaleMm).value * K('REMPLISSAGE_ZOOM_OPTIMAL') * ARCMIN_PAR_DEG

  it('dans la plage : la focale où le grand axe remplit le petit côté au remplissage visé', () => {
    const f = focaleOptimale(zoom, tailleCadreeA(35), capteurHMm)
    expect(f).toBe(35)
    const remplissage = tailleCadreeA(35) / ARCMIN_PAR_DEG / fovDeg(capteurHMm, f).value
    expect(remplissage).toBeCloseTo(K('REMPLISSAGE_ZOOM_OPTIMAL'), 6)
  })

  it('s’arrondit au millimètre', () => {
    expect(Number.isInteger(focaleOptimale(zoom, tailleCadreeA(35.4), capteurHMm))).toBe(true)
  })

  it('bornée aux deux bouts quand le remplissage visé sort de la plage', () => {
    expect(focaleOptimale(zoom, tailleCadreeA(zoom.focaleMaxMm * 3), capteurHMm)).toBe(
      zoom.focaleMaxMm,
    )
    expect(focaleOptimale(zoom, tailleCadreeA(zoom.focaleMinMm / 3), capteurHMm)).toBe(
      zoom.focaleMinMm,
    )
  })
})

describe('T-0407 — l’ouverture à une autre focale de la plage', () => {
  const zoom = objectif()
  const plancher = (f: number) => plancherAuPas(ouverturePlancher(zoom, f))

  it('au plancher, elle suit le plancher de la nouvelle focale', () => {
    const fCourante = zoom.focaleMinMm
    expect(ouvertureA(zoom, plancher(fCourante), fCourante, zoom.focaleMaxMm)).toBe(
      plancher(zoom.focaleMaxMm),
    )
  })

  it('fermée au-delà des deux planchers, elle est conservée', () => {
    const fermee = DOMAINES.ouverture_N.max
    expect(ouvertureA(zoom, fermee, zoom.focaleMinMm, zoom.focaleMaxMm)).toBe(fermee)
  })

  it('fermée entre les deux planchers, elle remonte au plancher du télé', () => {
    const entre = (zoom.ouvertureGrandAngleN + zoom.ouvertureTeleN) / 2
    expect(ouvertureA(zoom, entre, zoom.focaleMinMm, zoom.focaleMaxMm)).toBe(
      plancher(zoom.focaleMaxMm),
    )
  })
})
