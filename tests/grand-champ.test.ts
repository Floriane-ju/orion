/**
 * §9.1 — Pose maximale à étoiles ponctuelles.
 *
 * Le critère qui compte n'est pas qu'une formule soit appliquée, mais qu'elle soit appliquée
 * PAR RÉGION DU CIEL : le setup grand angle de référence du PRD donne 25,2 s à l'équateur
 * céleste et 1 442 s à δ = +89°. Une pose unique pour tout le ciel serait fausse des deux
 * côtés — c'est ce que le test « suit la déclinaison, et non une règle uniforme » tient.
 */

import { describe, expect, it } from 'vitest'
import { cartePoseMax, traceePx } from '../src/core/grand-champ.ts'
import { fovDeg } from '../src/core/optics.ts'
import { npf } from '../src/core/suivi.ts'
import { K } from '../src/registry/constants.ts'

/** Setup grand angle de référence du PRD : 10 mm f/2,8, pitch 5,12 µm, plein format. */
const GRAND_ANGLE = { focaleMm: 10, ouvertureN: 2.8, pitchUm: 5.12 }
const CAPTEUR_L_MM = 35.9
const CAPTEUR_H_MM = 23.9

const FOV_L = fovDeg(CAPTEUR_L_MM, GRAND_ANGLE.focaleMm).value
const FOV_H = fovDeg(CAPTEUR_H_MM, GRAND_ANGLE.focaleMm).value

function carte(options: {
  centreDecDeg: number
  fovLDeg?: number
  fovHDeg?: number
  tMaxSuiviS?: number | null
}) {
  return cartePoseMax({
    ...GRAND_ANGLE,
    fovLDeg: options.fovLDeg ?? FOV_L,
    fovHDeg: options.fovHDeg ?? FOV_H,
    centreAdDeg: 0,
    centreDecDeg: options.centreDecDeg,
    rotationDeg: 0,
    modeObjectif: 'MODE_CADRE',
    ...(options.tMaxSuiviS === undefined ? {} : { tMaxSuiviS: options.tMaxSuiviS }),
  })
}

describe('§9.1 — pose max par déclinaison', () => {
  it('donne 25,2 s sur l’équateur céleste et nomme la zone limitante', () => {
    const resultat = carte({ centreDecDeg: 0 })
    expect(resultat.tMaxCadreS.value).toBeCloseTo(25.16, 1)
    expect(resultat.decMinAbsDeg).toBeCloseTo(0, 6)
    expect(resultat.zoneLimitante).toMatch(/δ = -?0°/)
  })

  it('suit la déclinaison, et non une règle uniforme', () => {
    const zones: readonly (readonly [number, number])[] = [
      [0, 25.16],
      [-25, 27.76],
      [50, 39.14],
      [89, 1441.6],
    ]
    for (const [decDeg, attendu] of zones) {
      expect(npf({ ...GRAND_ANGLE, decDeg }).value, `δ = ${decDeg}`).toBeCloseTo(attendu, 1)
    }
  })

  it('retient la zone de plus faible déclinaison absolue, pas le centre de visée', () => {
    // Bande verticale couvrant δ = +5° à δ = +70° : c'est δ = +5° qui commande.
    const resultat = carte({ centreDecDeg: 37.5, fovLDeg: 2, fovHDeg: 65 })
    expect(resultat.decMinAbsDeg).toBeCloseTo(5, 0)
    expect(resultat.tMaxCadreS.value).toBeCloseTo(npf({ ...GRAND_ANGLE, decDeg: 5 }).value!, 0)
  })

  it('avertit que la contrainte change de nature près du pôle', () => {
    const resultat = carte({ centreDecDeg: 89 })
    const polaire = resultat.cellules.reduce((max, cellule) =>
      Math.abs(cellule.decDeg) > Math.abs(max.decDeg) ? cellule : max,
    )
    expect(polaire.tNpfS === null || polaire.tNpfS > K('POSE_LONGUE_AVERTISSEMENT_S')).toBe(true)
    expect(resultat.messages.join(' ')).toMatch(/c’est le bruit et le ciel/)
  })

  it('bascule sur le plafond de la monture quand le suivi est actif, en le disant', () => {
    const sansSuivi = carte({ centreDecDeg: 0 })
    const avecSuivi = carte({ centreDecDeg: 0, tMaxSuiviS: 120 })
    expect(sansSuivi.regime).toBe('NPF')
    expect(avecSuivi.regime).toBe('SUIVI')
    expect(avecSuivi.poseOperanteS).toBe(120)
    // La NPF reste calculée et affichée, à titre informatif.
    expect(avecSuivi.tMaxCadreS.value).toBeCloseTo(25.16, 1)
    expect(avecSuivi.messages.join(' ')).toMatch(/c’est la monture qui limite/)
  })

  it('produit une carte, pas un nombre', () => {
    const resultat = carte({ centreDecDeg: 0 })
    expect(resultat.cellules.length).toBe(resultat.cote ** 2)
    const declinaisons = resultat.cellules.map((c) => c.decDeg)
    // Sur un grand champ, la déclinaison varie de plusieurs dizaines de degrés dans le cadre.
    expect(Math.max(...declinaisons) - Math.min(...declinaisons)).toBeGreaterThan(60)
  })

  it('chiffre la traînée réellement inscrite sur le capteur', () => {
    const echApx = (K('RADIAN_EN_ARCSEC') * GRAND_ANGLE.pitchUm) / (GRAND_ANGLE.focaleMm * 1000)
    // 15,041 "/s à δ = 0 : une pose de 60 s inscrit 902 arcsecondes de traînée.
    const trainee = traceePx(60, 0, echApx)
    expect(trainee.value * echApx).toBeCloseTo(15.041 * 60, 3)
    // À déclinaison plus élevée, la même pose trace moins.
    expect(traceePx(60, 60, echApx).value).toBeCloseTo(trainee.value / 2, 3)
  })
})

describe('§9.1 — le format du capteur ne borne pas la pose', () => {
  it('ne change pas la pose maximale, qui ne dépend que du pitch et de la focale', () => {
    const pleinFormat = carte({ centreDecDeg: 0, fovLDeg: FOV_L, fovHDeg: FOV_H })
    const recadre = carte({
      centreDecDeg: 0,
      fovLDeg: fovDeg(23.5, GRAND_ANGLE.focaleMm).value,
      fovHDeg: fovDeg(15.6, GRAND_ANGLE.focaleMm).value,
    })
    expect(recadre.tMaxCadreS.value).toBeCloseTo(pleinFormat.tMaxCadreS.value!, 6)
  })
})

describe('§9.1 — carte de pose d’un fisheye (T-0219)', () => {
  it('reste finie à 180° de champ et couvre la déclinaison que l’équidistante atteint', () => {
    const FISHEYE_MM = 8
    const fovL = fovDeg(CAPTEUR_L_MM, FISHEYE_MM, 'FISHEYE').value
    const fovH = fovDeg(CAPTEUR_H_MM, FISHEYE_MM, 'FISHEYE').value
    const resultat = cartePoseMax({
      ...GRAND_ANGLE,
      focaleMm: FISHEYE_MM,
      fovLDeg: fovL,
      fovHDeg: fovH,
      centreAdDeg: 0,
      centreDecDeg: 0,
      rotationDeg: 0,
      modeObjectif: 'MODE_FISHEYE',
    })
    for (const cellule of resultat.cellules) expect(Number.isFinite(cellule.decDeg)).toBe(true)
    // Rotation nulle, visée sur l'équateur : le bord haut du cadre est à δ = fovH / 2.
    expect(resultat.decMaxAbsDeg).toBeCloseTo(fovH / 2, 6)
  })
})
