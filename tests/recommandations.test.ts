/**
 * §7.5 — Conseil filtre contextuel, et §10.3 — recommandation d'équipement.
 *
 * L'interdiction est aussi importante que la règle : aucun bandeau, aucune marque, aucun
 * prix, et rien du tout tant que l'explication n'est pas dépliée. Un gain non chiffrable
 * par les moteurs existants n'est jamais recommandé.
 */

import { describe, expect, it } from 'vitest'
import {
  conseilFiltre,
  fractionFondDeCielTransmise,
  recommandationsEquipement,
  type EntreeConseilFiltre,
} from '../src/core/recommandations.ts'

/** Valeurs de l'Annexe A : E_ciel = 1,68 e⁻/s/px, pose 13 s, RN 1,5 e⁻. */
function entree(surcharge: Partial<EntreeConseilFiltre> = {}): EntreeConseilFiltre {
  return {
    typeObjet: 'EMISSION',
    bortle: 4.5,
    deltaSbLuneMag: 1.2,
    cadragePlanifiable: true,
    explicationDepliee: true,
    eObj: 0.545,
    eCiel: 1.68,
    tPoseS: 13,
    readNoiseE: 1.5,
    snrCible: 10,
    tailleRawMo: 33,
    ...surcharge,
  }
}

describe('conseil filtre §7.5', () => {
  it('se déclenche sur une nébuleuse en émission sous la Lune, et chiffre les deux durées', () => {
    const conseil = conseilFiltre(entree())
    expect(conseil.declenche).toBe(true)
    expect(conseil.tRequisAvecS).not.toBeNull()
    expect(conseil.tRequisAvecS!).toBeLessThan(conseil.tRequisSansS)
    expect(conseil.gainSnr!).toBeGreaterThan(1)
    expect(conseil.message).toMatch(/Sans filtre/)
    expect(conseil.message).toMatch(/reste planifiable sans filtre/)
  })

  it('ne se déclenche jamais sur une galaxie, et nomme les seuls leviers utiles', () => {
    const conseil = conseilFiltre(entree({ typeObjet: 'GALAXIE' }))
    expect(conseil.declenche).toBe(false)
    expect(conseil.tRequisAvecS).toBeNull()
    expect(conseil.message).toMatch(/Aucun filtre n’aide/)
    expect(conseil.message).toMatch(/ciel plus noir/)
  })

  it('ne se déclenche pas non plus sur une nébuleuse par réflexion ou un amas', () => {
    expect(conseilFiltre(entree({ typeObjet: 'REFLEXION' })).declenche).toBe(false)
    expect(conseilFiltre(entree({ typeObjet: 'AMAS_GLOB' })).declenche).toBe(false)
    expect(conseilFiltre(entree({ typeObjet: 'NEB_OBSCURE' })).declenche).toBe(false)
  })

  it('reste muet tant que l’explication n’est pas dépliée', () => {
    const conseil = conseilFiltre(entree({ explicationDepliee: false }))
    expect(conseil.declenche).toBe(false)
    expect(conseil.message).toMatch(/dans l’explication du verdict/)
  })

  it('se déclenche aussi sur un ciel Bortle 5 sans Lune', () => {
    expect(conseilFiltre(entree({ bortle: 5, deltaSbLuneMag: 0 })).declenche).toBe(true)
    expect(conseilFiltre(entree({ bortle: 4, deltaSbLuneMag: 0 })).declenche).toBe(false)
  })

  it('transmet une fraction du fond de ciel tirée de la table de filtres', () => {
    const fraction = fractionFondDeCielTransmise('DUAL_BAND')
    expect(fraction.value).toBeGreaterThan(0)
    expect(fraction.value).toBeLessThan(1)
    expect(fractionFondDeCielTransmise('AUCUN').value).toBe(1)
    expect(fraction.constants.map((c) => c.ref)).toContain('C-22')
  })
})

describe('recommandation d’équipement §10.3', () => {
  const baseReco = {
    conseilFiltre: conseilFiltre(entree()),
    verdictDefavorable: true,
    explicationDepliee: true,
    leviersPresentes: ['SITE_PLUS_SOMBRE', 'PLUS_DE_TEMPS'],
    verdictCadrage: 'CADRAGE_OPTIMAL' as const,
    focaleActuelleMm: 120,
    focaleIdealeMm: null,
    nTuiles: null,
    regimeLimiteSuivi: false,
    suiviActif: true,
    tOptS: 13.4,
    tMaxSuiviS: 200,
  }

  it('n’affiche rien tant que l’explication n’est pas dépliée', () => {
    const sortie = recommandationsEquipement({ ...baseReco, explicationDepliee: false })
    expect(sortie.silencieux).toBe(true)
    expect(sortie.recommandations).toStrictEqual([])
    expect(sortie.message).toMatch(/dans l’explication du verdict/)
  })

  it('n’affiche rien avant que les leviers gratuits aient été présentés', () => {
    const sortie = recommandationsEquipement({ ...baseReco, leviersPresentes: [] })
    expect(sortie.recommandations).toStrictEqual([])
    expect(sortie.message).toMatch(/Essayez d’abord/)
  })

  it('n’affiche rien sur un verdict favorable', () => {
    const sortie = recommandationsEquipement({ ...baseReco, verdictDefavorable: false })
    expect(sortie.recommandations).toStrictEqual([])
  })

  it('exprime le gain par un différentiel calculé, sans marque ni prix', () => {
    const sortie = recommandationsEquipement(baseReco)
    expect(sortie.recommandations.length).toBeGreaterThan(0)
    for (const reco of sortie.recommandations) {
      expect(reco.rapport).toBeGreaterThan(0)
      expect(reco.sans).not.toBe('')
      expect(reco.avec).not.toBe('')
      const texte = `${reco.libelle} ${reco.explication}`
      expect(texte).not.toMatch(/€|\$|prix|marque|modèle/i)
    }
  })

  it('recommande une focale plus longue quand le cadrage est perdu', () => {
    const sortie = recommandationsEquipement({
      ...baseReco,
      conseilFiltre: conseilFiltre(entree({ typeObjet: 'GALAXIE' })),
      verdictCadrage: 'CADRAGE_PERDU',
      focaleIdealeMm: 4200,
    })
    const categories = sortie.recommandations.map((r) => r.categorie)
    expect(categories).toContain('FOCALE_PLUS_LONGUE')
    expect(categories).not.toContain('FILTRE_DUAL_BAND')
  })

  it('recommande une monture de suivi quand la pose est bridée faute de suivi', () => {
    const sortie = recommandationsEquipement({
      ...baseReco,
      conseilFiltre: conseilFiltre(entree({ typeObjet: 'GALAXIE' })),
      suiviActif: false,
      tOptS: 13.4,
      tMaxSuiviS: 2.1,
    })
    expect(sortie.recommandations.map((r) => r.categorie)).toContain('MONTURE_SUIVI')
  })

  it('ne recommande rien dont le gain ne soit chiffrable par les moteurs', () => {
    const sortie = recommandationsEquipement({
      ...baseReco,
      conseilFiltre: conseilFiltre(entree({ typeObjet: 'GALAXIE' })),
    })
    expect(sortie.recommandations).toStrictEqual([])
    expect(sortie.message).toMatch(/Aucun achat ne changerait/)
  })
})
