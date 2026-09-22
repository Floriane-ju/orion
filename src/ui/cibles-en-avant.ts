/**
 * §6.4, §3.4 — ce que la scène garde en pleine lumière quand le catalogue est filtré.
 *
 * Filtrer la liste sans rien changer au ciel laissait les deux moitiés de l'écran répondre à
 * deux questions différentes : « voici les quarante objets sous la magnitude 8 » d'un côté,
 * quatorze mille marqueurs identiques de l'autre. La scène suit donc le même tamis — mais en
 * ESTOMPANT, jamais en effaçant : un objet retiré du ciel ne dirait plus où la sélection
 * tombe parmi le reste, ce qui est précisément ce qu'on cherche à voir.
 *
 * Le tamis est celui de `filtreObjets`, appelé ici tel quel : c'est la seule garantie que le
 * marqueur plein et la ligne de liste désignent le même ensemble. Case « Ne montrer que les objets
 * photographiables » cochée, le critère reste celui de la liste — une pose annoncée par le moteur
 * de séance, donc un créneau cette nuit, jamais la hauteur à l'instant affiché.
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

/**
 * Les désignations à peindre à pleine opacité, ou `null` quand AUCUN filtre n'est actif —
 * estomper quatorze mille marqueurs parce que l'utilisateur n'a rien demandé serait un
 * assombrissement permanent de la scène, pas une réponse à un geste.
 */
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
    // Une cible écartée porte une note et pas de pose : même critère que la liste, au mot près.
    const retenu = (o: ObjetCielProfond) =>
      !photographiablesSeules || photographiable(etats.get(o.designation))
    return new Set(retenus.filter(retenu).map((o) => o.designation))
  }, [catalogue, etats, photographiablesSeules, recherche, types, magMax])
}
