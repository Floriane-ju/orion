/**
 * §6.4, §3.4 — what scène keeps at full light when catalogue filtered.
 * Scène follows list filter but DIMS, never hides: removed objects no longer show where selection
 * falls among rest.
 * Uses `filtreObjets` as is: only way full marker and list row denote same set.
 * « photographiables » checked: criterion = list's (pose announced by séance engine = créneau
 * tonight), never hauteur at displayed instant.
 */

import { useMemo } from 'react'
import {
  filtreObjets,
  photographiable,
  restreintParType,
  type EtatCible,
} from '../core/cibles-liste.ts'
import { DOMAINES } from '../registry/domains.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { useCatalogue } from './catalogue-etat.ts'

/** Désignations painted at full opacity; `null` = NO filter (else permanent dimming). */
export function useCiblesEnAvant(
  catalogue: readonly ObjetCielProfond[],
  etats: ReadonlyMap<string, EtatCible>,
): ReadonlySet<string> | null {
  const { photographiablesSeules, recherche, types, magMax } = useCatalogue()

  return useMemo(() => {
    const filtreActif =
      photographiablesSeules ||
      recherche.trim() !== '' ||
      restreintParType(types) ||
      magMax < DOMAINES.m_int.max
    if (!filtreActif) return null

    const retenus = filtreObjets(catalogue, { types, magMax, recherche })
    // Écartée cible: note, no pose; same criterion as list.
    const retenu = (o: ObjetCielProfond) =>
      !photographiablesSeules || photographiable(etats.get(o.designation))
    return new Set(retenus.filter(retenu).map((o) => o.designation))
  }, [catalogue, etats, photographiablesSeules, recherche, types, magMax])
}
