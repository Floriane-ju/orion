/**
 * T-0357 — le seuil de Schaefer prolonge la table Bortle vers les ciels clairs.
 *
 * Trois promesses : aucun saut au bord de la table, moins d'étoiles à mesure que le fond
 * s'éclaircit, et aucune étoile dans un ciel de plein crépuscule civil. Aucune magnitude
 * recopiée : les bornes viennent de la table elle-même et du moteur de crépuscule.
 */

import { describe, expect, it } from 'vitest'
import { M_LIM_OEIL_PLANCHER, SB_PLAFOND_TABLE, TABLE_BORTLE } from '../src/registry/bortle.ts'
import { sbZenithAvecCrepuscule } from '../src/core/fond-ciel-rendu.ts'
import { mLimOeilCielClair } from '../src/core/seuil-oeil.ts'
import { K } from '../src/registry/constants.ts'
import { apparitionReperes } from '../src/ui/apparence-objets.ts'

const SB_B1 = TABLE_BORTLE[0]!.sb

describe('T-0357 — magnitude limite sous un ciel plus clair que Bortle 9', () => {
  it('rejoint la table à son bord clair', () => {
    expect(mLimOeilCielClair(SB_PLAFOND_TABLE)).toBeCloseTo(M_LIM_OEIL_PLANCHER, 9)
  })

  it('décroît quand le crépuscule s’éclaircit, de la fin du nautique au coucher', () => {
    const depressions = [
      -K('HAUTEUR_CREPUSCULE_NAUTIQUE_DEG'),
      -K('HAUTEUR_CREPUSCULE_CIVIL_DEG'),
      0,
    ]
    const limites = depressions.map((d) => mLimOeilCielClair(sbZenithAvecCrepuscule(SB_B1, d)))
    expect(limites[1]!).toBeLessThan(limites[0]!)
    expect(limites[2]!).toBeLessThanOrEqual(limites[1]!)
  })

  it('ne laisse passer aucune étoile de première grandeur sous un fond de jour', () => {
    // Le Soleil dix degrés au-dessus de l'horizon : le ciel du jour.
    expect(mLimOeilCielClair(sbZenithAvecCrepuscule(SB_B1, -10))).toBeLessThan(1)
  })
})

describe('T-0357 — les repères nocturnes reviennent en fondu', () => {
  const civil = K('HAUTEUR_CREPUSCULE_CIVIL_DEG')

  it('sont absents Soleil levé et pleins dès la fin du crépuscule civil', () => {
    expect(apparitionReperes(-civil)).toBe(0)
    expect(apparitionReperes(0)).toBe(0)
    expect(apparitionReperes(civil)).toBe(1)
    expect(apparitionReperes(K('HAUTEUR_CREPUSCULE_NAUTIQUE_DEG'))).toBe(1)
  })

  it('croissent sans palier pendant le crépuscule civil', () => {
    const debut = apparitionReperes(civil / 3)
    const milieu = apparitionReperes(civil / 2)
    expect(debut).toBeGreaterThan(0)
    expect(milieu).toBeGreaterThan(debut)
    expect(milieu).toBeLessThan(1)
  })
})
