/**
 * §10.2 — verdict explanation DERIVED from calc, not prose: dominant factor comes from a
 * logarithmic derivative, not a hand-written phrase, so it can't diverge from its engine.
 */

import { describe, expect, it } from 'vitest'
import {
  chaineCalcul,
  explication,
  facteursDominants,
  leviers,
  sensibilites,
} from '../src/core/explain.ts'
import { detectabilite } from '../src/core/detectability.ts'
import { fluxCiel, fluxE, fluxObjet, integrationRequiseS, poseUnitaire } from '../src/core/exposure.ts'
import { libelleEntree } from '../src/registry/libelles.ts'

const ZP = 20.2
const PITCH = 5.12
const N = 2.8
const SB_CIEL = 20.95

const M33 = detectabilite({
  mInt: 5.7,
  aArcmin: 71,
  bArcmin: 42,
  typeObjet: 'GALAXIE',
  sbCiel: SB_CIEL,
  mLimOeil: 6.05,
  dMm: 42.857,
})
const E_CIEL = fluxCiel({ sbMagArcsec2: SB_CIEL, zpSys: ZP, pitchUm: PITCH, ouvertureN: N })
const E_OBJ = fluxObjet({ sbMagArcsec2: M33.sbObj.value!, zpSys: ZP, pitchUm: PITCH, ouvertureN: N })
const POSE = poseUnitaire({ eCiel: E_CIEL.value, readNoiseE: 1.5, tMaxS: 75 })

const POINT = {
  sb_obj: M33.sbObj.value!,
  sb_ciel: SB_CIEL,
  t_pose_s: POSE.tRecommandeS.value,
  read_noise_e: POSE.readNoiseUtiliseE,
  snr_cible: 10,
}

const SORTIE = (v: Readonly<Record<string, number>>): number =>
  integrationRequiseS(
    {
      eObj: fluxE(v.sb_obj!, ZP, PITCH, N),
      eCiel: fluxE(v.sb_ciel!, ZP, PITCH, N),
      tPoseS: v.t_pose_s!,
      readNoiseE: v.read_noise_e!,
      snrCible: v.snr_cible!,
      tailleRawMo: 33,
    },
    v.snr_cible!,
  )

describe('facteur dominant §10.2', () => {
  it('désigne la brillance de surface de l’objet sur un verdict photo seulement', () => {
    const sens = sensibilites(SORTIE, POINT)
    expect(facteursDominants(sens)).toEqual(['sb_obj'])
    expect(sens.sb_obj!).toBeGreaterThan(sens.sb_ciel!)
  })

  it('retrouve les exposants analytiques du modèle', () => {
    const sens = sensibilites(SORTIE, POINT)
    // T ∝ SNR²: sensitivity to target SNR is exactly 2.
    expect(sens.snr_cible!).toBeCloseTo(2, 3)
    // Analytic chain: ∂lnT/∂lnSB_obj = (2 − E_obj/somme) × 0,4 × ln10 × SB_obj; object flux
    // squared in denominator, once in numerator.
    const somme = E_OBJ.value + E_CIEL.value + POINT.read_noise_e ** 2 / POINT.t_pose_s
    const attendu = (2 - E_OBJ.value / somme) * 0.4 * Math.LN10 * POINT.sb_obj
    expect(sens.sb_obj!).toBeCloseTo(attendu, 1)
  })

  it('présente conjointement deux variables de sensibilité équivalente', () => {
    const produit = (v: Readonly<Record<string, number>>) => v.x! * v.y!
    expect(facteursDominants(sensibilites(produit, { x: 3, y: 7 }))).toEqual(['x', 'y'])
  })
})

describe('leviers §10.2', () => {
  it('met le changement de site en premier rang, jamais l’achat', () => {
    const applicables = leviers({ verdict: 'PHOTO_SEULE', typeObjet: 'GALAXIE', cibleImposee: true })
    expect(applicables[0]?.code).toBe('SITE_PLUS_SOMBRE')
    expect(applicables.map((l) => l.code)).not.toContain('FILTRE_DUAL_BAND')
    expect(applicables.findIndex((l) => l.cout === 'achat')).toBe(-1)
  })

  it('n’ouvre le filtre bi-bande que sur les objets en émission', () => {
    const emission = leviers({ verdict: 'PHOTO_SEULE', typeObjet: 'EMISSION', cibleImposee: true })
    expect(emission.map((l) => l.code)).toContain('FILTRE_DUAL_BAND')
    // And never before the free levers.
    expect(emission.findIndex((l) => l.code === 'FILTRE_DUAL_BAND')).toBeGreaterThan(0)
  })

  it('n’ouvre la focale que lorsque le cadrage est refusé', () => {
    expect(leviers({ cadrageRefuse: true, cibleImposee: true }).map((l) => l.code)).toContain(
      'FOCALE_DIFFERENTE',
    )
    expect(leviers({ cadrageRefuse: false, cibleImposee: true }).map((l) => l.code)).not.toContain(
      'FOCALE_DIFFERENTE',
    )
  })

  it('ouvre le créneau quand la Lune est levée ou la cible basse', () => {
    expect(leviers({ luneLevee: true, cibleImposee: true }).map((l) => l.code)).toContain('CRENEAU')
    expect(leviers({ hauteurFaible: true, cibleImposee: true }).map((l) => l.code)).toContain('CRENEAU')
  })
})

describe('chaîne de calcul §10.2', () => {
  const etapes = [
    { libelle: 'Brillance de surface', trace: M33.sbObj },
    { libelle: 'Contraste', trace: M33.deltaSb },
    { libelle: 'Flux du ciel', trace: E_CIEL },
    { libelle: 'Pose optimale', trace: POSE.tOptS },
  ]

  it('porte une formule et une valeur à chaque étape', () => {
    for (const etape of chaineCalcul(etapes)) {
      expect(etape.expression).not.toBe('')
      expect(etape.section).toMatch(/^\d+(\.\d+)?$/)
      expect(etape.valeur).not.toBeNull()
    }
  })

  it('renvoie chaque constante consommée à son entrée de registre', () => {
    const constantes = chaineCalcul(etapes).flatMap((e) => e.constantes)
    expect(constantes.length).toBeGreaterThan(0)
    for (const constante of constantes) {
      expect(constante.ref).not.toBe('')
      expect(constante.source).not.toBe('')
    }
  })

  it('déplie un verdict favorable au même titre qu’un défavorable', () => {
    const favorable = explication({
      verdictN1: 'Cadrage optimal.',
      phraseFacteur: 'La cible occupe la fenêtre visée.',
      etapes,
      sortie: SORTIE,
      point: POINT,
      contexte: { verdict: 'OEIL_NU', cibleImposee: true },
    })
    expect(favorable.n3.length).toBe(etapes.length)
    expect(favorable.facteurs.length).toBeGreaterThan(0)
  })

  it('compose une explication N2 qui nomme le facteur et le levier', () => {
    const complete = explication({
      verdictN1: 'Photo seulement.',
      phraseFacteur: M33.explication,
      etapes,
      sortie: SORTIE,
      point: POINT,
      contexte: { verdict: 'PHOTO_SEULE', typeObjet: 'GALAXIE', cibleImposee: true },
    })
    expect(complete.n2).toContain(`Facteur dominant : ${libelleEntree('sb_obj')}`)
    expect(complete.n2).toMatch(/Premier levier : se déplacer vers un site plus sombre/)
    expect(complete.leviers[0]?.cout).not.toBe('achat')
  })
})
