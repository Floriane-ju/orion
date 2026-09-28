/**
 * §6.4 — ce que le catalogue montre : la portée, la recherche et les deux filtres.
 *
 * T-0182 — la fiche prend la place de la liste dans le panneau, et la liste est démontée
 * pendant ce temps. Une saisie tenue par le composant partirait donc avec lui : revenir de la
 * fiche rendrait un catalogue remis à zéro, alors que le geste est « je regarde celle-là, puis
 * je reviens à ma recherche ». L'état vit ici pour cette seule raison — comme [[scene-etat]],
 * un magasin externe se lit en rendu serveur comme dans le navigateur, et se teste sans DOM.
 */

import { useSyncExternalStore } from 'react'
import { DOMAINES } from '../registry/domains.ts'
import { TYPES_OBJET, type TypeObjet } from '../data/deepsky.ts'

export interface EtatCatalogue {
  /**
   * Vrai au départ : la liste répond d'abord « que photographier cette nuit ». Le catalogue
   * entier reste à une case — la base d'objets n'est pas fermée, c'est la séance qui l'est.
   */
  readonly photographiablesSeules: boolean
  readonly recherche: string
  /** Les types cochés du filtre — tous au départ, aucun restreint. */
  readonly types: ReadonlySet<TypeObjet>
  readonly magMax: number
}

const ETAT_INITIAL: EtatCatalogue = Object.freeze({
  photographiablesSeules: true,
  recherche: '',
  types: new Set(TYPES_OBJET),
  // La borne du domaine, jamais un nombre écrit ici : le curseur lit le même registre.
  magMax: DOMAINES.m_int.max,
})

let etat: EtatCatalogue = ETAT_INITIAL
const abonnes = new Set<() => void>()

function etatCatalogue(): EtatCatalogue {
  return etat
}

function abonne(notifie: () => void): () => void {
  abonnes.add(notifie)
  return () => {
    abonnes.delete(notifie)
  }
}

export function majCatalogue(retouche: Partial<EtatCatalogue>): void {
  etat = { ...etat, ...retouche }
  for (const notifie of abonnes) notifie()
}

/** Remet le catalogue dans son état de départ. Réservé aux tests. */
export function reinitialiseCatalogue(): void {
  majCatalogue(ETAT_INITIAL)
}

export function useCatalogue(): EtatCatalogue {
  return useSyncExternalStore(abonne, etatCatalogue, etatCatalogue)
}
