/**
 * T-0284 — §6.4: the list judges the NIGHT's créneau, the scène shows the displayed instant.
 * By day the two differ and nothing said so: a « Cadrer » at 14:00 aimed under the horizon.
 * The sentence names the night and, outside it, where the scène stands.
 */

import type { FenetreNocturne } from '../core/nuit.ts'
import { heure } from './horaire.ts'

export function phraseNuitListe(nuit: FenetreNocturne, instant: Date): string {
  const { debutReference: debut, finReference: fin } = nuit
  if (debut === null || fin === null) return nuit.cause ?? 'Pas de nuit à planifier à cette date.'
  const base = `Liste établie pour la nuit de ${heure(debut)} à ${heure(fin)}.`
  if (instant < debut) return `${base} Le ciel affiché est à ${heure(instant)}, avant cette nuit.`
  if (instant > fin) return `${base} Le ciel affiché est à ${heure(instant)}, après cette nuit.`
  return base
}
