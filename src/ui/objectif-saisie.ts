/**
 * §5.1, T-0404 — le réglage focale / ouverture sous l'objectif monté.
 *
 * Une seule lecture pour trois consommateurs — la chaîne de calcul, l'enregistrement du profil
 * et les champs du panneau : si l'un bornait autrement que les autres, on verrait une ouverture
 * et on en calculerait, ou on en enregistrerait, une autre (T-0208).
 */

import { plagesReglage, type Objectif, type Plage } from '../core/objectif.ts'
import type { Bornage } from '../registry/domains.ts'
import { nombreSaisi } from './saisie-bornee.ts'

/** L'objectif monté, ou `null` en objectif libre — y compris pour un identifiant disparu du parc. */
export function objectifActif(objectifs: readonly Objectif[], id: string): Objectif | null {
  return objectifs.find((o) => o.id === id) ?? null
}

export interface ReglageOptique {
  readonly focale: Bornage
  readonly ouverture: Bornage
  /** Les plages de l'objectif monté ; absentes en objectif libre. */
  readonly plages?: { readonly focale: Plage; readonly ouverture: Plage }
}

/** La focale bornée d'abord : c'est elle qui fixe le plancher de l'ouverture. */
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

/** Le plancher d'ouverture à la focale saisie, une fois celle-ci ramenée dans la plage. */
export function plancherA(objectif: Objectif, focale: string): number {
  return plagesReglage(objectif, reglageOptique(objectif, focale, '').focale.valeur).ouverture.min
}
