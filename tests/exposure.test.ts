/**
 * §7.1 flux du fond de ciel · §7.2 pose unitaire · §7.3 intégration.
 *
 * Setup de référence de l'Annexe A : SB_ciel 20,95 · 120 mm f/2,8 · pitch 5,12 µm ·
 * ZP_sys 20,20 · bruit de lecture 1,5 e⁻ à ISO 640 · RAW de 33 Mo.
 */

import { describe, expect, it } from 'vitest'
import { nombre, nombreLibre } from '../src/registry/ecriture.ts'
import {
  arrondiObturateur,
  fluxCiel,
  fluxObjet,
  planIntegration,
  poseUnitaire,
  snrApres,
} from '../src/core/exposure.ts'
import { SaisieRefuseeError } from '../src/registry/domains.ts'
import { isoRecommande, BOITIER_REFERENCE } from '../src/data/equipment.ts'
import { K } from '../src/registry/constants.ts'

const OPTIQUE_REF = { zpSys: 20.2, pitchUm: 5.12, ouvertureN: 2.8 }
const E_CIEL = fluxCiel({ sbMagArcsec2: 20.95, ...OPTIQUE_REF }).value
/** M33 : SB 23,01 mag/arcsec² (§6.3). */
const E_OBJ = fluxObjet({ sbMagArcsec2: 23.0148, ...OPTIQUE_REF }).value

describe('flux du fond de ciel §7.1', () => {
  it('retrouve 1,68 e⁻/s/px pour le setup de référence', () => {
    expect(E_CIEL).toBeCloseTo(1.68, 2)
  })

  it('divise le flux par 2,04 en passant de f/2,8 à f/4', () => {
    const f4 = fluxCiel({ sbMagArcsec2: 20.95, ...OPTIQUE_REF, ouvertureN: 4 }).value
    expect(E_CIEL / f4).toBeCloseTo(2.04, 2)
    // Et la pose optimale est multipliée d'autant : t_opt ∝ 1 / E_ciel.
    const posef4 = poseUnitaire({ eCiel: f4, readNoiseE: 1.5, tMaxS: 75 })
    const pose = poseUnitaire({ eCiel: E_CIEL, readNoiseE: 1.5, tMaxS: null })
    expect(posef4.tOptS.value / pose.tOptS.value).toBeCloseTo(2.04, 2)
  })

  it('ne dépend pas du diamètre, seulement de l’ouverture et du pitch', () => {
    // Deux setups de diamètres très différents, même f/N et même pitch.
    const a = fluxCiel({ sbMagArcsec2: 20.95, ...OPTIQUE_REF }).value
    const b = fluxCiel({ sbMagArcsec2: 20.95, ...OPTIQUE_REF }).value
    expect(a).toBe(b)
  })

  it('porte [ESTIMÉ] quand le point zéro est générique, sans écran de calibration', () => {
    const estime = fluxCiel({ sbMagArcsec2: 20.95, ...OPTIQUE_REF, zpEstime: true })
    expect(estime.flags).toContain('ESTIME')
    expect(estime.note).toMatch(/estimée/)
  })

  it('refuse une brillance hors de la plage 16–22 plutôt que d’extrapoler', () => {
    expect(() => fluxCiel({ sbMagArcsec2: 24, ...OPTIQUE_REF })).toThrow(SaisieRefuseeError)
    expect(() => fluxCiel({ sbMagArcsec2: 12, ...OPTIQUE_REF })).toThrow(/hors de la plage/)
  })
})

describe('pose unitaire §7.2', () => {
  it('donne 13 s, plage 6 à 26 s, en régime nominal', () => {
    const pose = poseUnitaire({ eCiel: E_CIEL, readNoiseE: 1.5, tMaxS: 75 })
    expect(pose.tOptS.value).toBeCloseTo(13.4, 1)
    expect(pose.tAfficheeS).toBe(13)
    expect(pose.plageUtileS.value).toEqual([6, 26])
    expect(pose.regime).toBe('NOMINAL')
  })

  it('recommande l’ISO du seuil de double gain, en le nommant', () => {
    const iso = isoRecommande(BOITIER_REFERENCE)
    expect(iso.iso).toBe(640)
    expect(iso.readNoiseE).toBe(1.5)
    expect(iso.message).toMatch(/double gain/)
  })

  it('bascule en régime limité par le suivi et chiffre la perte, sans suivi', () => {
    // t_max = NPF = 2,10 s à 120 mm sur le setup de référence (§9.1).
    const pose = poseUnitaire({ eCiel: E_CIEL, readNoiseE: 1.5, tMaxS: 2.1 })
    expect(pose.regime).toBe('LIMITE_SUIVI')
    expect(pose.perteSnrBridee).toBeCloseTo(0.22, 2)
    expect(pose.message).toMatch(/La monture limite la pose/)
    expect(pose.message).toMatch(/grand champ/)
  })

  it('divise la pose par le rapport des deux facteurs C en mode permissif', () => {
    const defaut = poseUnitaire({ eCiel: E_CIEL, readNoiseE: 1.5, tMaxS: null })
    const permissif = poseUnitaire({ eCiel: E_CIEL, readNoiseE: 1.5, tMaxS: null, permissif: true })
    const rapport = K('FACTEUR_POSE_C_DEFAUT') / K('FACTEUR_POSE_C_PERMISSIF')
    expect(defaut.tOptS.value / permissif.tOptS.value).toBeCloseTo(rapport, 6)
    // La chaîne d'explication doit citer la constante réellement employée (§10.2).
    expect(permissif.tOptS.constants.map((c) => c.id)).toContain('FACTEUR_POSE_C_PERMISSIF')
    expect(defaut.tOptS.constants.map((c) => c.id)).toContain('FACTEUR_POSE_C_DEFAUT')
  })

  it('annonce le coût du mode permissif, et ne dit rien quand il est éteint', () => {
    const permissif = poseUnitaire({ eCiel: E_CIEL, readNoiseE: 1.5, tMaxS: 75, permissif: true })
    const perte = (c: number) => (1 - Math.sqrt(c / (c + 1))) * 100
    expect(permissif.notePermissif).toContain(nombre(perte(K('FACTEUR_POSE_C_PERMISSIF')), 1))
    expect(permissif.notePermissif).toContain(nombre(perte(K('FACTEUR_POSE_C_DEFAUT')), 1))
    expect(permissif.notePermissif).toContain(`${nombreLibre(permissif.tAfficheeS)} s`)

    // Éteint, aucune sortie ne bouge : le mode est un choix, pas un réglage silencieux.
    const defaut = poseUnitaire({ eCiel: E_CIEL, readNoiseE: 1.5, tMaxS: 75 })
    expect(defaut.notePermissif).toBeUndefined()
    expect(defaut).toEqual(poseUnitaire({ eCiel: E_CIEL, readNoiseE: 1.5, tMaxS: 75, permissif: false }))
  })

  it('propage la pose courte : plus d’images, plus de volume, mêmes darks à refaire', () => {
    const commun = { eObj: E_OBJ, eCiel: E_CIEL, readNoiseE: 1.5, snrCible: 50, tailleRawMo: 33 }
    const defaut = poseUnitaire({ eCiel: E_CIEL, readNoiseE: 1.5, tMaxS: 75 })
    const permissif = poseUnitaire({ eCiel: E_CIEL, readNoiseE: 1.5, tMaxS: 75, permissif: true })
    const planDefaut = planIntegration({ ...commun, tPoseS: defaut.tRecommandeS.value })
    const planPermissif = planIntegration({ ...commun, tPoseS: permissif.tRecommandeS.value })
    // Le rapport des poses se retrouve dans le nombre d'images, et l'intégration requise monte
    // parce que le bruit de lecture est payé une fois par image.
    expect(planPermissif.nPoses.value).toBeGreaterThan(planDefaut.nPoses.value * 3)
    expect(planPermissif.tRequisS.value).toBeGreaterThan(planDefaut.tRequisS.value)
    expect(planPermissif.volumeGo.value).toBeGreaterThan(planDefaut.volumeGo.value)
  })

  it('exige des poses PLUS LONGUES sous un ciel plus noir', () => {
    const bortle2 = fluxCiel({ sbMagArcsec2: 21.7, ...OPTIQUE_REF }).value
    expect(E_CIEL / bortle2).toBeCloseTo(1.99, 1)
    const pose = poseUnitaire({ eCiel: bortle2, readNoiseE: 1.5, tMaxS: 75 })
    expect(pose.tOptS.value).toBeCloseTo(27, 0)
  })

  it('applique 3 e⁻ affichés et [ESTIMÉ] quand le bruit de lecture est inconnu', () => {
    const pose = poseUnitaire({ eCiel: E_CIEL, readNoiseE: null, tMaxS: 75 })
    expect(pose.readNoiseUtiliseE).toBe(K('READ_NOISE_DEFAUT_E'))
    expect(pose.readNoiseEstime).toBe(true)
    expect(pose.tOptS.flags).toContain('ESTIME')
    expect(pose.tOptS.note).toMatch(/3 e⁻ par défaut/)
  })

  it('arrondit à une valeur d’obturateur usuelle', () => {
    expect(arrondiObturateur(13.43)).toBe(13)
    expect(arrondiObturateur(2.1)).toBe(2)
    expect(arrondiObturateur(118)).toBe(120)
  })
})

describe('nombre de poses et intégration §7.3', () => {
  const BASE = {
    eObj: E_OBJ,
    eCiel: E_CIEL,
    tPoseS: 13.426,
    readNoiseE: 1.5,
    tailleRawMo: 33,
  }

  it('chiffre M33 à environ 56 min, 250 poses et 8 Go pour un SNR de 10', () => {
    const plan = planIntegration({ ...BASE, snrCible: 10 })
    expect(plan.tRequisS.value / 60).toBeCloseTo(56, 0)
    expect(plan.nPoses.value).toBeCloseTo(250, -1)
    expect(plan.volumeGo.value).toBeCloseTo(8.1, 1)
    expect(plan.horsDePortee).toBe(false)
  })

  it('annonce que doubler la qualité quadruple le temps', () => {
    const snr10 = planIntegration({ ...BASE, snrCible: 10 }).tRequisS.value
    const snr20 = planIntegration({ ...BASE, snrCible: 20 }).tRequisS.value
    expect(snr20 / snr10).toBeCloseTo(4, 1)
    expect(planIntegration({ ...BASE, snrCible: 10 }).loiFondamentale).toMatch(/quatre fois plus de temps/)
    expect(planIntegration({ ...BASE, snrCible: 10 }).messages.join(' ')).toMatch(/quatre fois plus/)
  })

  it('vérifie la formule du rapport signal sur bruit contre sa résolution inverse', () => {
    const plan = planIntegration({ ...BASE, snrCible: 10 })
    expect(snrApres(BASE, plan.tRequisS.value)).toBeCloseTo(10, 6)
  })

  it('répartit sur plusieurs nuits et prescrit un lot de darks par nuit', () => {
    const plan = planIntegration({ ...BASE, snrCible: 20, dureeCreneauS: 2 * 3600 })
    expect(plan.nNuits?.value).toBeGreaterThan(1)
    expect(plan.messages.join(' ')).toMatch(/darks à chaque nuit/)
  })

  it('plafonne l’affichage et annonce la cible hors de portée quand le flux tend vers zéro', () => {
    const plan = planIntegration({ ...BASE, eObj: 0.0005, snrCible: 20 })
    expect(plan.horsDePortee).toBe(true)
    expect(plan.tRequisS.value).toBe(K('INTEGRATION_PLAFOND_H') * 3600)
    expect(plan.tRequisS.flags).toContain('HORS_DOMAINE')
    expect(plan.messages.join(' ')).toMatch(/hors de portée/)
  })

  it('annonce le budget de stockage avant la sortie', () => {
    expect(planIntegration({ ...BASE, snrCible: 20 }).messages.join(' ')).toMatch(/Go de carte/)
  })
})
