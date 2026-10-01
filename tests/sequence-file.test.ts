/**
 * §9.4 — Logistique de séquence de filé.
 *
 * La séquence type du PRD sert de référence : 2 h à 25 s donnent 288 images et environ
 * 9,3 Go. Le reste du test porte sur ce qui évite une sortie ratée — la consigne de
 * désactivation du dark automatique — et sur ce que le temps de prise de vue prescrit (T-0374).
 */

import { describe, expect, it } from 'vitest'
import { planPanorama, sequenceFile } from '../src/core/sequence-file.ts'
import { K } from '../src/registry/constants.ts'

const TAILLE_RAW_MO = 33

function sequence(surcharge: Partial<Parameters<typeof sequenceFile>[0]> = {}) {
  return sequenceFile({
    dureeTotaleMin: 120,
    tPoseS: 25,
    intervalleS: 1,
    tailleRawMo: TAILLE_RAW_MO,
    ...surcharge,
  })
}

describe('§9.4 — séquence type du PRD', () => {
  it('prescrit 288 poses et environ 9,3 Go pour 2 h à 25 s', () => {
    const resultat = sequence()
    expect(resultat.nPoses.value).toBe(288)
    expect(resultat.volumeGo.value).toBeCloseTo(9.3, 1)
  })

  it('liste la désactivation du dark automatique en consigne bloquante', () => {
    const resultat = sequence()
    expect(resultat.consignesBloquantes[0]).toMatch(/réduction de bruit sur longue exposition/)
  })

  it('prescrit la désactivation sans condition, quel que soit le réglage déclaré', () => {
    expect(sequence().consignesBloquantes.length).toBe(1)
    expect(sequence({ tPoseS: 10 }).consignesBloquantes.length).toBe(1)
  })
})

describe('T-0374 — ce que le temps de prise de vue prescrit', () => {
  const POSE_MAX_S = K('T_POSE_FILE_MAX_S') - 5

  it('tient en une photo jusqu’à la pose max du cadre, posée sur tout le temps', () => {
    const plan = planPanorama(POSE_MAX_S, POSE_MAX_S)
    expect(plan.mode).toBe('CHAMP')
    expect(plan.tPoseS.value).toBe(POSE_MAX_S)
  })

  it('passe au filé au-delà : pose C-36 haut, intervalle C-09', () => {
    const plan = planPanorama(POSE_MAX_S + 1, POSE_MAX_S)
    expect(plan.mode).toBe('FILE')
    expect(plan.intervalleS.value).toBe(K('INTERVALLE_INTER_POSE_FILE_MAX_S'))
    // Plus court qu'une pose conseillée : une seule pose, qui file.
    expect(plan.tPoseS.value).toBe(POSE_MAX_S + 1)
    expect(planPanorama(2 * 3600, POSE_MAX_S).tPoseS.value).toBe(K('T_POSE_FILE_MAX_S'))
  })

  it('prend C-36 haut comme seuil tant que la pose max n’est pas chiffrée', () => {
    expect(planPanorama(K('T_POSE_FILE_MAX_S'), null).mode).toBe('CHAMP')
    expect(planPanorama(K('T_POSE_FILE_MAX_S') + 1, null).mode).toBe('FILE')
  })

  it('compte assez de poses pour couvrir le temps voulu, quitte à le dépasser', () => {
    const pose = K('T_POSE_FILE_MAX_S')
    for (const duree of [2 * pose, 1.5 * pose]) {
      const plan = planPanorama(duree, POSE_MAX_S)
      const seq = sequence({
        dureeTotaleMin: duree / 60,
        tPoseS: plan.tPoseS.value,
        intervalleS: plan.intervalleS.value,
      })
      // 1 min et 45 s en poses de 30 s : deux photos dans les deux cas.
      expect(seq.nPoses.value).toBe(2)
    }
  })

  it('compte au moins une pose, jamais une séquence vide', () => {
    const duree = POSE_MAX_S + 1
    const plan = planPanorama(duree, POSE_MAX_S)
    const seq = sequence({
      dureeTotaleMin: duree / 60,
      tPoseS: plan.tPoseS.value,
      intervalleS: plan.intervalleS.value,
    })
    expect(seq.nPoses.value).toBe(1)
  })

  it('découpe 2 h selon la formule de §9.4', () => {
    const duree = 2 * 3600
    const plan = planPanorama(duree, POSE_MAX_S)
    const seq = sequence({
      dureeTotaleMin: duree / 60,
      tPoseS: plan.tPoseS.value,
      intervalleS: plan.intervalleS.value,
    })
    expect(seq.nPoses.value).toBe(Math.ceil(duree / plan.tPoseS.value))
  })
})

describe('§9.4 — rappel batterie', () => {
  it('rappelle la batterie au-delà du seuil du registre, jamais en dessous', () => {
    const longue = sequence({ dureeTotaleMin: K('DUREE_RAPPEL_BATTERIE_MIN') * 2 })
    expect(longue.messages.some((m) => /[Aa]ttention à la batterie/.test(m))).toBe(true)

    const courte = sequence({ dureeTotaleMin: K('DUREE_RAPPEL_BATTERIE_MIN') })
    expect(courte.messages.some((m) => /batterie/.test(m))).toBe(false)
  })

  it('ne chiffre ni autonomie, ni température, ni nombre de batteries', () => {
    const rappel = sequence({ dureeTotaleMin: K('DUREE_RAPPEL_BATTERIE_MIN') * 2 }).messages.join(
      ' ',
    )
    expect(rappel).not.toMatch(/CIPA|°C|batteries à emporter/)
  })
})
