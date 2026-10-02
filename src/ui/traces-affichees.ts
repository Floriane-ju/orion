/**
 * §10.2 — les valeurs tracées à l'écran, pour la rubrique « Calcul » de la modale info.
 *
 * T-0386 — la bulle d'une valeur tracée ne porte plus que la glose (et ce que le glossaire y
 * garde) : formule, entrées et constantes y faisaient un pavé illisible au survol. La chaîne
 * complète (N3) doit pourtant rester consultable : chaque `TracedValue` monté s'inscrit ici,
 * et la modale relit la liste. Elle montre donc le calcul de ce qui est affiché sous elle,
 * valeurs de l'utilisateur comprises, sans recopier une formule.
 *
 * ponytail: magasin de module sans tranches, à la `scene-etat.ts` — une vingtaine d'entrées
 * au plus, relues par la seule modale.
 */

import { useSyncExternalStore } from 'react'
import type { Traced } from '../core/traced.ts'
import type { TermeGlossaire } from '../registry/glossaire.ts'

export interface TraceAffichee {
  readonly terme: TermeGlossaire
  readonly suffixe: string | undefined
  readonly trace: Traced<number | null>
  /** La valeur telle que l'écran l'écrit, unité comprise ; `null` tant qu'elle manque. */
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
