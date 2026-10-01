/**
 * §9.4 — Logistique de séquence de filé.
 *
 * Traduit une durée souhaitée en paramètres d'intervallomètre et en contraintes matérielles
 * VÉRIFIABLES AVANT DE SORTIR.
 *
 * T-0374 — la durée totale est la seule saisie. La pose et l'intervalle ne se règlent plus :
 * ils se prescrivent (`planPanorama`). L'intervalle vaut C-09, donc le refus d'un intervalle
 * trop long n'a plus d'entrée à refuser. Reste une règle dure : la réduction de bruit sur
 * longue exposition du boîtier occupe un temps égal à la pose après chaque image, et la
 * séquence est ruinée. Sa désactivation est une consigne bloquante, prescrite sans condition —
 * T-0167, la déclarer active ne changeait pas la consigne, elle la rédigeait deux fois.
 *
 * Aucune autonomie de batterie n'est modélisée (T-0150) : seule la durée de prise de vue est
 * connue, et elle sert de rappel, pas de prédiction. Aucun budget de carte non plus (T-0167) :
 * le volume nécessaire est calculé, l'espace restant se saisissait à la main.
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
 * T-0374 — ce que le temps de prise de vue prescrit. Jusqu'à la pose max du cadre (§9.1), le
 * temps tient dans une seule photo à étoiles ponctuelles : c'est l'aperçu de §9.2, posé sur
 * toute la durée. Au-delà, des étoiles qui filent sont le but, et la durée se découpe en poses
 * de C-36 haut séparées de C-09.
 *
 * Pourquoi C-36 haut et non la pose max : la netteté de chaque image ne compte plus dans un
 * filé, seul le nombre d'images coûte. L'optimum dépend en vérité du capteur (bruit de lecture
 * face au fond de ciel, thermique) — non modélisé, la convention terrain en tient lieu.
 *
 * `poseMaxS` vaut `null` tant que le panneau n'a pas chiffré le cadre : C-36 sert alors de
 * seuil, faute de mieux, et l'aperçu bascule dès que la vraie pose max est connue.
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
      // Une durée plus courte qu'une pose conseillée tient en une pose : elle file, seule.
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
  // Assez de poses pour COUVRIR le temps voulu, quitte à le dépasser d'une fraction de pose :
  // 1 min en poses de 30 s, c'est deux photos, pas une. L'intervalle ne retire rien au compte,
  // il allonge seulement la séquence d'une seconde par pose. La durée est ramenée à la seconde,
  // le pas de sa saisie : rendue en minutes puis en secondes, elle garde une poussière
  // flottante (45,000000001) qui ajouterait une photo.
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

  // Le résumé « N poses de 30 s, X Go, traînées de Y° » est parti : il répétait les lignes
  // chiffrées posées juste au-dessus de lui.
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
