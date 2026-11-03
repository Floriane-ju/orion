/**
 * §9.4 — filé sequence logistics: desired duration → intervalometer parameters + hardware
 * constraints VERIFIABLE BEFORE GOING OUT.
 * T-0374 — total duration = only input; pose and interval prescribed (`planPanorama`). Interval =
 * C-09, no input left to refuse. One hard rule: boîtier long-exposure noise reduction occupies a
 * time equal to the pose after each frame → sequence ruined. Disabling it = blocking consigne,
 * prescribed unconditionally (T-0167).
 * No battery autonomy modelled (T-0150): only shooting duration known, reminder not prediction.
 * No card budget (T-0167): required volume computed, remaining space was hand-entered.
 */

import { K } from '../registry/constants.ts'
import { rappelBatterie } from './rappel-batterie.ts'
import { trace, type Traced } from './traced.ts'
import { S_PAR_MIN } from './unites.ts'


export interface EntreeSequenceFile {
  readonly dureeTotaleMin: number
  readonly tPoseS: number
  readonly intervalleS: number
  readonly tailleRawMo: number
}

export interface SequenceFile {
  readonly nPoses: Traced<number>
  readonly volumeGo: Traced<number>
  readonly consignesBloquantes: readonly string[]
  readonly messages: readonly string[]
}

/**
 * T-0374 — what shooting time prescribes. Up to frame pose max (§9.1) the time fits one point-star
 * photo: §9.2 preview over whole duration. Beyond, trailing stars are the goal: duration splits
 * into C-36-high poses spaced by C-09.
 * Why C-36 high, not pose max: per-frame sharpness no longer matters in a filé, only frame count
 * costs. True optimum depends on sensor (read noise vs fond de ciel, thermal) — not modelled,
 * field convention stands in.
 * `poseMaxS` is `null` until panel quantifies the frame: C-36 = threshold meanwhile, preview
 * switches once real pose max known.
 */
export interface PlanPanorama {
  readonly mode: 'CHAMP' | 'FILE'
  readonly tPoseS: Traced<number>
  readonly intervalleS: Traced<number>
}

export function planPanorama(dureeTotaleS: number, poseMaxS: number | null): PlanPanorama {
  const seuil = poseMaxS ?? K('T_POSE_FILE_MAX_S')
  const mode = dureeTotaleS <= seuil ? 'CHAMP' : 'FILE'
  const inputs = { duree_totale_s: dureeTotaleS, t_max_cadre_s: poseMaxS }
  return {
    mode,
    tPoseS: trace({
      // Duration < advised pose fits one pose: trails alone.
      value: mode === 'CHAMP' ? dureeTotaleS : Math.min(K('T_POSE_FILE_MAX_S'), dureeTotaleS),
      formula: 'PLAN_PANORAMA',
      inputs,
      constants: ['T_POSE_FILE_MAX_S'],
    }),
    intervalleS: trace({
      value: mode === 'CHAMP' ? 0 : K('INTERVALLE_INTER_POSE_FILE_MAX_S'),
      formula: 'PLAN_PANORAMA',
      inputs,
      constants: ['INTERVALLE_INTER_POSE_FILE_MAX_S'],
    }),
  }
}

export function sequenceFile(entree: EntreeSequenceFile): SequenceFile {
  const dureeTotaleS = entree.dureeTotaleMin * S_PAR_MIN
  // Enough poses to COVER wanted time, may overshoot by a fraction of a pose: 1 min of 30 s poses
  // = two photos, not one. Interval removes nothing from the count, only lengthens séquence 1 s per
  // pose. Duration rounded to second (input step): min→s round trip leaves float dust
  // (45.000000001) that would add a photo.
  const nPosesValeur = Math.ceil(Math.round(dureeTotaleS) / entree.tPoseS)
  const volume = (nPosesValeur * entree.tailleRawMo) / K('MO_PAR_GO')

  const nPoses = trace({
    value: nPosesValeur,
    formula: 'NOMBRE_POSES_FILE',
    inputs: {
      duree_totale_s: dureeTotaleS,
      t_pose_s: entree.tPoseS,
      intervalle_s: entree.intervalleS,
    },
  })

  const volumeGo = trace({
    value: volume,
    formula: 'VOLUME_STOCKAGE',
    inputs: { n_poses: nPosesValeur, taille_raw_mo: entree.tailleRawMo },
    constants: ['MO_PAR_GO'],
  })

  const consignesBloquantes: readonly string[] = [
    'Désactivez la réduction de bruit sur longue exposition de l’appareil, sinon les ' +
      'traînées seront pointillées.',
  ]

  // No "N poses of 30 s, X Go, trails of Y°" summary: repeated the figure lines above.
  const messages: string[] = []
  const rappel = rappelBatterie(entree.dureeTotaleMin)
  if (rappel !== null) messages.push(rappel)

  return {
    nPoses,
    volumeGo,
    consignesBloquantes,
    messages,
  }
}
