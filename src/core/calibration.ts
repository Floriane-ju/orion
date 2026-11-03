/**
 * §7.4 — calibration plan and dithering.
 * Most forgotten step, ruins most sessions. Displayed order not alphabetical: FLATS > DARKS >
 * OFFSETS. At f/2,8 plein format vignetting reaches 1-2 stops in corners — without flats:
 * central halo and dark corners nothing fixes later.
 *
 * Not a §2.3 matériel calibration: field calibration frames, not system zero-point setting.
 *
 * No reusable darks library (T-0152): a dark is valid only for sensor temperature, which the
 * app doesn't measure. Prescribe a batch each séance, at end while sensor still cold: the
 * instruction that can't be wrong.
 *
 * Plan covers whole night, not one cible: dark valid only for ITS pose duration → one batch per
 * distinct duration. Flats/offsets stay single — same optique, same session ISO.
 */

import { DITHERING_PX, PRESCRIPTIONS_CALIBRATION } from '../registry/verdicts.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { S_PAR_MIN } from './unites.ts'


export interface EntreeCalibration {
  /** Plan pose durations; one darks batch per distinct duration. */
  readonly tPosesS: readonly number[]
  readonly iso: number
  readonly nPoses: number
  readonly autoguidage?: boolean
  /** True when focale or orientation changed since previous cible's flats. */
  readonly changementFocaleOuOrientation?: boolean
}

export interface LotCalibration {
  readonly type: 'FLATS' | 'DARKS' | 'OFFSETS'
  readonly nombre: number
  readonly plage: readonly [number, number]
  readonly consigne: string
  /** Darks only: pose duration they must reproduce. */
  readonly tPoseS?: number
}

export interface PlanCalibration {
  /** In displayed order of importance: flats first. */
  readonly lots: readonly LotCalibration[]
  readonly surcoutTempsMin: Traced<number>
  readonly dithering: string
  readonly avertissements: readonly string[]
}

function nombrePrescrit(type: LotCalibration['type']): LotCalibration {
  const p = PRESCRIPTIONS_CALIBRATION.find((x) => x.type === type)!
  return { type, nombre: p.defaut, plage: [p.min, p.max], consigne: p.consigne }
}

export function planCalibration(entree: EntreeCalibration): PlanCalibration {
  const durees = [...new Set(entree.tPosesS)].sort((a, b) => b - a)
  const darks = durees.map((tPoseS) => ({ ...nombrePrescrit('DARKS'), tPoseS }))
  const lots = [nombrePrescrit('FLATS'), ...darks, nombrePrescrit('OFFSETS')]
  const nDarks = nombrePrescrit('DARKS').nombre
  const sommePosesS = durees.reduce((somme, t) => somme + t, 0)

  const avertissements = [
    'Ne touchez plus à la bague de mise au point avant les flats.',
  ]
  if (entree.changementFocaleOuOrientation === true) {
    avertissements.push(
      'Focale ou orientation changée : refaites des flats pour cette cible.',
    )
  }
  return {
    lots,
    surcoutTempsMin: trace({
      value: (nDarks * sommePosesS) / S_PAR_MIN,
      formula: 'TEMPS_DARKS',
      inputs: { n_darks: nDarks, t_pose_s: sommePosesS },
      note: 'Darks à prendre en fin de séance, capteur encore froid.',
    }),
    dithering:
      entree.autoguidage === true
        ? `décalage de ${DITHERING_PX.min} à ${DITHERING_PX.max} px entre les poses, via ` +
          'l’autoguidage.'
        : `décalage de ${DITHERING_PX.min} à ${DITHERING_PX.max} px à chaque pose : la ` +
          'dérive naturelle de la monture suffit.',
    avertissements,
  }
}
