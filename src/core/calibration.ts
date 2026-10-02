/**
 * §7.4 — Plan de calibration et dithering.
 *
 * C'est l'étape systématiquement oubliée, et celle qui ruine le plus de sessions. L'ordre
 * affiché n'est pas alphabétique : FLATS > DARKS > OFFSETS. À f/2,8 sur plein format, le
 * vignettage atteint un à deux diaphragmes dans les coins — sans flats, l'image garde un
 * halo central et des angles sombres que rien ne rattrape ensuite.
 *
 * Rien ici n'est une calibration du matériel au sens de §2.3 : ce sont des poses de
 * calibration prises sur le terrain, pas un réglage du point zéro système.
 *
 * Aucune bibliothèque de darks réutilisable n'est validée (T-0152) : un dark ne vaut que pour
 * la température du capteur, que l'application ne mesure pas. Prescrire un lot à chaque séance,
 * en fin de séance capteur encore froid, est la consigne qui ne peut pas se tromper.
 *
 * Le plan couvre toute la nuit, pas une cible : un dark ne vaut que pour SA durée de pose,
 * donc un lot par durée distincte du plan. Flats et offsets restent uniques — même optique,
 * même ISO de session.
 */

import { DITHERING_PX, PRESCRIPTIONS_CALIBRATION } from '../registry/verdicts.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { S_PAR_MIN } from './unites.ts'


export interface EntreeCalibration {
  /** Durées de pose du plan ; un lot de darks par durée distincte. */
  readonly tPosesS: readonly number[]
  readonly iso: number
  readonly nPoses: number
  readonly autoguidage?: boolean
  /** Vrai quand la focale ou l'orientation a changé depuis les flats de la cible précédente. */
  readonly changementFocaleOuOrientation?: boolean
}

export interface LotCalibration {
  readonly type: 'FLATS' | 'DARKS' | 'OFFSETS'
  readonly nombre: number
  readonly plage: readonly [number, number]
  readonly consigne: string
  /** Darks seulement : la durée de pose qu'ils doivent reproduire. */
  readonly tPoseS?: number
}

export interface PlanCalibration {
  /** Dans l'ordre d'importance affiché : flats d'abord. */
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
