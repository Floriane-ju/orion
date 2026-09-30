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
 */

import { DITHERING_PX, PRESCRIPTIONS_CALIBRATION } from '../registry/verdicts.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { S_PAR_MIN } from './unites.ts'


export interface EntreeCalibration {
  readonly tPoseS: number
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
  const lots = [nombrePrescrit('FLATS'), nombrePrescrit('DARKS'), nombrePrescrit('OFFSETS')]
  const darks = lots.find((l) => l.type === 'DARKS')!

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
      value: (darks.nombre * entree.tPoseS) / S_PAR_MIN,
      formula: 'TEMPS_DARKS',
      inputs: { n_darks: darks.nombre, t_pose_s: entree.tPoseS },
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
