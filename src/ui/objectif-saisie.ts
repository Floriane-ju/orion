/**
 * §5.1, T-0404 — focale / ouverture setting under the mounted objectif.
 * One reading for three consumers (calc chain, profile save, panel fields): bounded
 * differently, one ouverture would be shown, another computed or saved (T-0208).
 */

import { plagesReglage, type Objectif, type Plage } from '../core/objectif.ts'
import type { Bornage } from '../registry/domains.ts'
import { nombreSaisi } from './saisie-bornee.ts'

/** Mounted objectif, or `null` in free objectif — also for an id vanished from the parc. */
export function objectifActif(objectifs: readonly Objectif[], id: string): Objectif | null {
  return objectifs.find((o) => o.id === id) ?? null
}

export interface ReglageOptique {
  readonly focale: Bornage
  readonly ouverture: Bornage
  /** Ranges of the mounted objectif; absent in free objectif. */
  readonly plages?: { readonly focale: Plage; readonly ouverture: Plage }
}

/** Focale bounded first: it sets the ouverture floor. */
export function reglageOptique(
  objectif: Objectif | null,
  focale: string,
  ouverture: string,
): ReglageOptique {
  if (objectif === null) {
    return { focale: nombreSaisi('focale_mm', focale), ouverture: nombreSaisi('ouverture_N', ouverture) }
  }
  const focaleRetenue = nombreSaisi('focale_mm', focale, plagesReglage(objectif, Number.NaN).focale)
  const plages = plagesReglage(objectif, focaleRetenue.valeur)
  return {
    focale: focaleRetenue,
    ouverture: nombreSaisi('ouverture_N', ouverture, plages.ouverture),
    plages,
  }
}

/** Ouverture floor at the typed focale, once clamped into range. */
export function plancherA(objectif: Objectif, focale: string): number {
  return plagesReglage(objectif, reglageOptique(objectif, focale, '').focale.valeur).ouverture.min
}
