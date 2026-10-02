/**
 * T-0383 — les verdicts de la fiche ne se contredisent plus.
 *
 * Le cas d'origine : M45 sous une Lune gibbeuse à 10°, notée « idéale » à côté d'une
 * dégradation lunaire « forte », posée 1 s sans explication malgré un suivi, déclarée « en
 * photo seulement » et « peu gênée par la pollution lumineuse » dans la phrase sur la Lune.
 * Chaque test reconstruit sa situation par le calcul, aucune valeur n'est recopiée.
 */

import { describe, expect, it } from 'vitest'
import { faciliteCible, plafondLune } from '../src/core/facilite.ts'
import { detectabilite, modulationDuType } from '../src/core/detectability.ts'
import { poseUnitaire } from '../src/core/exposure.ts'
import { K } from '../src/registry/constants.ts'
import { VALEURS_OBTURATEUR_S } from '../src/registry/verdicts.ts'
import type { Candidate } from '../src/core/session-types.ts'

describe('facilité — la Lune plafonne la note', () => {
  /** Une candidate au score plein : seule la Lune peut faire baisser sa note. */
  const candidate = (deltaSbLune: number): Candidate =>
    ({
      objet: {},
      score: { value: 1 },
      deltaSbLuneMag: { value: deltaSbLune },
      detect: { toleranceLune: 'MOYENNE' },
    }) as unknown as Candidate

  it('retient au plus la note de dégradation forte quand la Lune annule S_lune', () => {
    const facilite = faciliteCible(candidate(K('TOLERANCE_LUNE_MOYENNE_DELTA_SB_MAG')))
    expect(facilite!.note).toBe(K('FACILITE_NOTE_MAX_LUNE_FORTE'))
  })

  it('laisse la note pleine sans Lune', () => {
    expect(faciliteCible(candidate(0))!.note).toBe(K('FACILITE_NOTE_MAX'))
  })

  it('ordonne les plafonds : plus la Lune gêne, plus la note est basse', () => {
    expect(plafondLune('FORTE')).toBeLessThan(plafondLune('MOYENNE'))
    expect(plafondLune('MOYENNE')).toBeLessThan(plafondLune('FAIBLE'))
    expect(plafondLune('AUCUNE')).toBe(K('FACILITE_NOTE_MAX'))
  })
})

describe('pose — le plancher de l’obturateur se dit', () => {
  const rn = 1.5
  const plancher = Math.min(...VALEURS_OBTURATEUR_S)
  /** E_ciel qui donne t_opt = `tOptS` : t_opt = C·RN² / E_ciel. */
  const eCielPour = (tOptS: number) => (K('FACTEUR_POSE_C_DEFAUT') * rn ** 2) / tOptS
  const SUIVI_S = plancher * 1000

  it('nomme le fond de ciel, pas la monture, quand t_opt passe sous la plus courte vitesse', () => {
    const pose = poseUnitaire({ eCiel: eCielPour(plancher / 2), readNoiseE: rn, tMaxS: SUIVI_S })
    expect(pose.tAfficheeS).toBe(plancher)
    expect(pose.message).toMatch(/bruit du fond de ciel couvre celui du capteur/)
    expect(pose.limiteeParCiel).toBe(true)
  })

  it('garde le message nominal loin du plancher', () => {
    const pose = poseUnitaire({ eCiel: eCielPour(plancher * 60), readNoiseE: rn, tMaxS: SUIVI_S })
    expect(pose.message).not.toMatch(/bruit du fond de ciel/)
    expect(pose.limiteeParCiel).toBe(false)
  })
})

describe('détectabilité — un amas ouvert se voit par ses étoiles', () => {
  const mLimOeil = 6
  const sbCiel = 18
  const mInt = mLimOeil - 2
  // Grand axe qui place la brillance de surface deux magnitudes sous le ciel :
  // SB = m + 2,5 log10(π/4 · a²), a en arcsec.
  const aArcsec = Math.sqrt((4 / Math.PI) * 10 ** ((sbCiel + 2 - mInt) / K('POGSON')))
  const amas = (typeObjet: 'AMAS_OUVERT' | 'AMAS_GLOB') =>
    detectabilite({
      mInt,
      aArcmin: aArcsec / 60,
      typeObjet,
      sbCiel,
      mLimOeil,
      dMm: 50,
      lune: { altitudeDeg: 62, separationDeg: 10 },
    })

  it('juge l’amas ouvert sur sa magnitude intégrée, même plus pâle que le ciel par arcsec²', () => {
    const ouvert = amas('AMAS_OUVERT')
    expect(ouvert.deltaSb.value).toBeLessThan(0)
    expect(ouvert.verdict).toBe('OEIL_NU')
    expect(ouvert.explication).toMatch(/étoiles/)
    expect(ouvert.explication).not.toMatch(/plus pâle/)
  })

  it('garde le critère de contraste pour un globulaire, tache non résolue à l’œil', () => {
    expect(amas('AMAS_GLOB').verdict).not.toBe('OEIL_NU')
  })

  it('ne mêle plus le conseil du type à la phrase sur la Lune', () => {
    const ouvert = amas('AMAS_OUVERT')
    expect(ouvert.noteLune).toMatch(/Lune levée/)
    expect(ouvert.noteLune).not.toContain(modulationDuType('AMAS_OUVERT').conseil)
  })
})
