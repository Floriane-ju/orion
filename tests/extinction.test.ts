/**
 * §7.6 — atmospheric attenuation by masse d'air.
 * PRD refs ×1,37 zenith, ×1,88 at 30° (k = 0,172) checked on T_requis (carries the verdict;
 * quadratic factor = feature core). Factor exact only sky-dominated (grand champ nominal,
 * T_requis ∝ 1/E_obj²) → nominal cases use a faint target; elsewhere bracketed.
 * k read from registry, expected factors from §7.6 rule.
 */

import { describe, expect, it } from 'vitest'
import {
  attenuationBrute,
  fluxCiel,
  fluxObjet,
  fluxObjetReel,
  integrationRequiseS,
  planIntegration,
} from '../src/core/exposure.ts'
import { masseAir, masseAirBrute } from '../src/core/site.ts'
import { K, plageK } from '../src/registry/constants.ts'

/** Annexe A setup: 120 mm f/2,8, pitch 5,12 µm, ZP_sys 20,20. */
const OPTIQUE_REF = { zpSys: 20.2, pitchUm: 5.12, ouvertureN: 2.8 }
const E_CIEL = fluxCiel({ sbMagArcsec2: 20.95, ...OPTIQUE_REF }).value
const SNR = 10
const T_POSE_S = 13
const READ_NOISE_E = 1.5
const TAILLE_RAW_MO = 33

/** Very faint target vs fond de ciel: sky-dominated §7.3 regime, PRD gives 10^(+0,8 k X). */
const E_OBJ_DOMINE = fluxObjet({ sbMagArcsec2: 26, ...OPTIQUE_REF })

/** M33: SB 23,01 mag/arcsec² (§6.3); stays under §7.3 ceiling. */
const E_OBJ_M33 = fluxObjet({ sbMagArcsec2: 23.0148, ...OPTIQUE_REF })

function tRequis(eObj: number): number {
  return integrationRequiseS(
    {
      eObj,
      eCiel: E_CIEL,
      tPoseS: T_POSE_S,
      readNoiseE: READ_NOISE_E,
      snrCible: SNR,
      tailleRawMo: TAILLE_RAW_MO,
    },
    SNR,
  )
}

/** Integration factor from extinction at given elevation. */
function facteurIntegration(hauteurDeg: number, eObj = E_OBJ_DOMINE): number {
  const reel = fluxObjetReel(eObj, masseAir(hauteurDeg))
  return tRequis(reel.eObjReel.value!) / tRequis(eObj.value)
}

function planAvecExtinction(hauteurDeg: number, eObj = E_OBJ_M33) {
  const reel = fluxObjetReel(eObj, masseAir(hauteurDeg))
  return {
    reel,
    plan: planIntegration({
      eObj: reel.eObjReel.value!,
      eCiel: E_CIEL,
      tPoseS: T_POSE_S,
      readNoiseE: READ_NOISE_E,
      snrCible: SNR,
      tailleRawMo: TAILLE_RAW_MO,
      eObjPlage: reel.plageEObj,
    }),
  }
}

describe('atténuation atmosphérique §7.6', () => {
  it('éteint le flux de l’objet de 0,4 × k × X magnitudes', () => {
    const zenith = fluxObjetReel(E_OBJ_DOMINE, masseAir(90))
    expect(zenith.masseAir.value).toBeCloseTo(1, 6)
    // Zenith X = 1: loss = k mag.
    expect(zenith.attenuation.value).toBeCloseTo(
      K('BASE_MAGNITUDE') ** (-K('EXTINCTION_V_MAG_PAR_MASSE_AIR') / K('POGSON')),
      12,
    )
    expect(zenith.eObjReel.value).toBeCloseTo(E_OBJ_DOMINE.value * zenith.attenuation.value!, 12)
  })

  it('multiplie T_requis par 1,37 au zénith et par 1,88 à 30° de hauteur', () => {
    // §7.6 table values at registry k.
    expect(K('EXTINCTION_V_MAG_PAR_MASSE_AIR')).toBeCloseTo(0.172, 6)
    expect(masseAirBrute(30)).toBeCloseTo(2, 6)
    expect(facteurIntegration(90)).toBeCloseTo(1.37, 2)
    expect(facteurIntegration(30)).toBeCloseTo(1.88, 2)
  })

  it('coûte toujours du temps, jamais moins, hors du régime dominé par le ciel', () => {
    // Bright target not purely sky-dominated: 10^(+0,4 k X) ≤ factor < 10^(+0,8 k X).
    // Ignoring extinction = optimistic in every regime, never pessimistic.
    const brillante = fluxObjet({ sbMagArcsec2: 20, ...OPTIQUE_REF })
    const x = masseAirBrute(30)
    const facteur = facteurIntegration(30, brillante)
    expect(facteur).toBeGreaterThan(1 / attenuationBrute(x))
    expect(facteur).toBeLessThan(1 / attenuationBrute(x) ** 2)
  })

  it('n’atténue jamais le fond de ciel : il est déjà relevé au sol', () => {
    // §7.6 extinguishes object only; sky flux (§7.1) unchanged, else counted twice.
    const { reel, plan } = planAvecExtinction(30)
    expect(plan.tRequisS.inputs.e_ciel).toBeCloseTo(E_CIEL, 12)
    expect(plan.tRequisS.inputs.e_obj).toBeCloseTo(E_OBJ_M33.value * reel.attenuation.value!, 12)
  })
})

describe('domaine de validité §7.6', () => {
  it('refuse l’atténuation sous la hauteur où 1 / sin(alt) cesse d’être valide', () => {
    const bas = fluxObjetReel(E_OBJ_DOMINE, masseAir(K('HAUTEUR_MIN_MASSE_AIR_DEG') - 1))
    expect(bas.attenuation.value).toBeNull()
    expect(bas.eObjReel.value).toBeNull()
    expect(bas.attenuation.flags).toContain('HORS_DOMAINE')
    // Refusal named, no silent extrapolation.
    expect(bas.eObjReel.note).toMatch(/trop basse/)
  })

  it('reste calculable juste au-dessus de la borne', () => {
    const limite = fluxObjetReel(E_OBJ_DOMINE, masseAir(K('HAUTEUR_MIN_MASSE_AIR_DEG')))
    expect(limite.attenuation.value).not.toBeNull()
    expect(limite.attenuation.flags).toBeUndefined()
  })

  it('n’applique aucune extinction quand la hauteur est inconnue, et le dit', () => {
    // Instant outside series domain → no elevation; duration = floor marked [HYP], never
    // an assumed zenith.
    const sansHauteur = fluxObjetReel(E_OBJ_DOMINE, masseAir(null))
    expect(sansHauteur.attenuation.value).toBe(1)
    expect(sansHauteur.attenuation.flags).toContain('HYP')
    expect(sansHauteur.eObjReel.value).toBe(E_OBJ_DOMINE.value)
    expect(sansHauteur.plageEObj).toBeNull()
    expect(sansHauteur.attenuation.note).toMatch(/minimum/)
  })
})

describe('traçabilité et plage de sortie §2.1, §10.2', () => {
  it('cite la formule de §7.6 et la constante d’extinction jusqu’à sa source', () => {
    const reel = fluxObjetReel(E_OBJ_DOMINE, masseAir(30))
    const constante = reel.attenuation.constants.find((c) => c.ref === 'L-04')
    expect(constante).toBeDefined()
    expect(constante!.ordreDeGrandeur).toBe(true)
    expect(constante!.source).toMatch(/Krisciunas/)
    expect(reel.attenuation.formula.section).toBe('7.6')
    expect(reel.attenuation.formula.expression).toMatch(/0,4/)
  })

  it('encadre l’intégration par les bornes déclarées de k, pas par un facteur deux', () => {
    const bornes = plageK('EXTINCTION_V_MAG_PAR_MASSE_AIR')!
    expect(bornes).toEqual([0.15, 0.3])

    const { plan } = planAvecExtinction(30)
    expect(plan.horsDePortee).toBe(false)
    const plage = plan.tRequisS.range!
    expect(plage).toBeDefined()
    // Clearer sky shortens integration, opaquer lengthens.
    expect(plage[0]).toBeLessThan(plan.tRequisS.value)
    expect(plage[1]).toBeGreaterThan(plan.tRequisS.value)

    const x = masseAirBrute(30)
    expect(plage[0]).toBeCloseTo(tRequis(E_OBJ_M33.value * attenuationBrute(x, bornes[0])), 6)
    expect(plage[1]).toBeCloseTo(tRequis(E_OBJ_M33.value * attenuationBrute(x, bornes[1])), 6)
    // Constant absent from trace → UI would show duration as exact (§2.1, last criterion).
    expect(plan.tRequisS.constants.some((c) => c.ref === 'L-04')).toBe(true)
  })

  it('ne porte pas de fourchette quand l’extinction n’est pas chiffrée', () => {
    // Unknown elevation: no honest range, term missing.
    const reel = fluxObjetReel(E_OBJ_M33, masseAir(null))
    const plan = planIntegration({
      eObj: reel.eObjReel.value!,
      eCiel: E_CIEL,
      tPoseS: T_POSE_S,
      readNoiseE: READ_NOISE_E,
      snrCible: SNR,
      tailleRawMo: TAILLE_RAW_MO,
      eObjPlage: reel.plageEObj,
    })
    expect(plan.tRequisS.range).toBeUndefined()
  })
})
