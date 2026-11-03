/**
 * §8.3, §9.4 — reminder replacing the quantified battery budget (C-16, T-0150/T-0151).
 * No autonomy modelled: CIPA autonomy measured in flash bursts, forecast temperature hand-entered,
 * product gave an order of magnitude the look of a prediction. Self-computed and true: shooting
 * duration. Above threshold, remind the risk, nothing more.
 */

import { K } from '../registry/constants.ts'
import { dureeLisible } from '../registry/ecriture.ts'
import { S_PAR_MIN } from './unites.ts'


/** `null` under threshold: a reminder on every séance is no reminder. */
export function rappelBatterie(dureeMin: number): string | null {
  const seuil = K('DUREE_RAPPEL_BATTERIE_MIN')
  if (!Number.isFinite(dureeMin) || dureeMin <= seuil) return null
  return (
    `Attention à la batterie : ${dureeLisible(dureeMin * S_PAR_MIN)} de prise de vue. ` +
    'Prévoyez de quoi tenir la nuit.'
  )
}
