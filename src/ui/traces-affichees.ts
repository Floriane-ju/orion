/**
 * §10.2 — traced values on screen, for info modal "Calcul" section.
 * T-0386 — traced value's bulle = glose (+ glossaire extras) only: formula/inputs/constants made
 * an unreadable hover block. Full chain (N3) stays consultable: each mounted `TracedValue`
 * registers here, modal rereads list → calcul of what's displayed, user values included, no
 * formula copied.
 * ponytail: module store without slices, like `scene-etat.ts` — ~20 entries max, read only by
 * modal.
 */

import { useSyncExternalStore } from 'react'
import type { Traced } from '../core/traced.ts'
import type { TermeGlossaire } from '../registry/glossaire.ts'

export interface TraceAffichee {
  readonly terme: TermeGlossaire
  readonly suffixe: string | undefined
  readonly trace: Traced<number | null>
  /** Value as screen writes it, unit included; `null` while missing. */
  readonly valeur: string | null
}

let traces: ReadonlyMap<string, TraceAffichee> = new Map()
const abonnes = new Set<() => void>()

function publie(suivantes: ReadonlyMap<string, TraceAffichee>): void {
  traces = suivantes
  abonnes.forEach((rappel) => rappel())
}

export function inscritTrace(id: string, entree: TraceAffichee): void {
  publie(new Map(traces).set(id, entree))
}

export function retireTrace(id: string): void {
  if (!traces.has(id)) return
  const suivantes = new Map(traces)
  suivantes.delete(id)
  publie(suivantes)
}

function abonne(rappel: () => void): () => void {
  abonnes.add(rappel)
  return () => abonnes.delete(rappel)
}

export function useTracesAffichees(): ReadonlyMap<string, TraceAffichee> {
  return useSyncExternalStore(abonne, () => traces, () => traces)
}
