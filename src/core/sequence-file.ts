/**
 * §9.4 — Logistique de séquence de filé.
 *
 * Traduit une durée souhaitée en paramètres d'intervallomètre et en contraintes matérielles
 * VÉRIFIABLES AVANT DE SORTIR. Deux règles y sont dures :
 *
 *   1. L'intervalle inter-pose dépasse C-09 → l'application refuse et chiffre le trou produit
 *      dans chaque trace. C'est un défaut irréparable en post-traitement.
 *   2. La réduction de bruit sur longue exposition du boîtier occupe un temps égal à la pose
 *      après chaque image : l'intervalle effectif devient supérieur à la pose, et la séquence
 *      est ruinée. Sa désactivation est une consigne bloquante, prescrite sans condition —
 *      T-0167, la déclarer active ne changeait pas la consigne, elle la rédigeait deux fois.
 *
 * Aucune autonomie de batterie n'est modélisée (T-0150) : seule la durée de prise de vue est
 * connue, et elle sert de rappel, pas de prédiction. Aucun budget de carte non plus (T-0167) :
 * le volume nécessaire est calculé, l'espace restant se saisissait à la main.
 */

import { K } from '../registry/constants.ts'
import { degres, formatePose, nombre, nombreLibre } from '../registry/ecriture.ts'
import { longueurArcDeg } from './file-etoiles.ts'
import { rappelBatterie } from './rappel-batterie.ts'
import { trace, type Traced } from './traced.ts'
import { S_PAR_H, S_PAR_MIN } from './unites.ts'


export interface EntreeSequenceFile {
  readonly dureeTotaleMin: number
  readonly tPoseS: number
  readonly intervalleS: number
  readonly tailleRawMo: number
  /** Déclinaison de la zone visée : elle fixe l'arc obtenu et la longueur d'un trou. */
  readonly decDeg: number
}

export interface SequenceFile {
  readonly nPoses: Traced<number>
  readonly volumeGo: Traced<number>
  readonly arcObtenuDeg: Traced<number>
  /** Renseigné quand l'intervalle dépasse C-09 : la séquence est refusée, le trou chiffré. */
  readonly intervalleRefuse: string | null
  readonly consignesBloquantes: readonly string[]
  readonly messages: readonly string[]
}

/** Longueur du trou laissé dans chaque trace par un intervalle inter-pose, en degrés. */
export function trouTraceDeg(intervalleS: number, decDeg: number): Traced<number> {
  // Un trou est un arc : celui que l'étoile décrit pendant que l'obturateur est fermé.
  return trace({
    value: longueurArcDeg(intervalleS / S_PAR_MIN, decDeg).value,
    formula: 'TROU_TRACE',
    inputs: { intervalle_s: intervalleS, dec_deg: decDeg },
    constants: ['ROTATION_CIEL_DEG_H'],
  })
}

export function sequenceFile(entree: EntreeSequenceFile): SequenceFile {
  const dureeTotaleS = entree.dureeTotaleMin * S_PAR_MIN
  const cadenceS = entree.tPoseS + entree.intervalleS
  const nPosesValeur = Math.floor(dureeTotaleS / cadenceS)
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

  const arcObtenuDeg = longueurArcDeg(entree.dureeTotaleMin, entree.decDeg)

  const intervalleMax = K('INTERVALLE_INTER_POSE_FILE_MAX_S')
  const trou = trouTraceDeg(entree.intervalleS, entree.decDeg)
  const intervalleRefuse =
    entree.intervalleS > intervalleMax
      ? `Pause de ${nombreLibre(entree.intervalleS)} s trop longue (max ${intervalleMax} s) : les traînées ` +
        `auront des trous de ${nombre(trou.value * S_PAR_H, 0)}", irréparables.`
      : null

  const consignesBloquantes: readonly string[] = [
    'Désactivez la réduction de bruit sur longue exposition de l’appareil, sinon les ' +
      'traînées seront pointillées.',
  ]

  const messages: string[] = []
  if (entree.tPoseS < K('T_POSE_FILE_MIN_S') || entree.tPoseS > K('T_POSE_FILE_MAX_S')) {
    messages.push(
      `Pose de ${formatePose(entree.tPoseS)} s : visez ${K('T_POSE_FILE_MIN_S')} à ` +
        `${K('T_POSE_FILE_MAX_S')} s pour un filé.`,
    )
  }
  messages.push(
    `${nPosesValeur} poses de ${formatePose(entree.tPoseS)} s empilées en mode éclaircir, ` +
      `${nombre(volume, 1)} Go, traînées de ${degres(arcObtenuDeg.value, 2)}.`,
  )
  const rappel = rappelBatterie(entree.dureeTotaleMin)
  if (rappel !== null) messages.push(rappel)

  return {
    nPoses,
    volumeGo,
    arcObtenuDeg,
    intervalleRefuse,
    consignesBloquantes,
    messages,
  }
}
