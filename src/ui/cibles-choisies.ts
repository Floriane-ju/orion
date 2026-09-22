/**
 * §6.4 → §8.3 — les cibles que l'utilisateur veut photographier cette nuit.
 *
 * C'est l'ENTRÉE du plan de séance, et c'est la seule. Le ciel propose (§6.4), l'utilisateur
 * choisit, le moteur ordonne : sans ce magasin, le plan retombe sur le palmarès automatique
 * que personne n'a demandé.
 *
 * Magasin de module comme [[seance-etat]] et [[catalogue-etat]], pour la même raison : les
 * deux gestes d'ajout — l'en-tête de fiche et la ligne de liste — ne partagent aucun ancêtre
 * autre que l'application, et la liste est démontée pendant qu'on lit la fiche. Un état tenu
 * par l'un des deux composants partirait avec lui.
 *
 * Une désignation, jamais l'objet : c'est la clé du catalogue partout ailleurs (`etatsCibles`,
 * `idLigneCible`, la clé des étapes du plan), et une copie d'objet figée ici survivrait à une
 * mise à jour du catalogue en annonçant une magnitude périmée.
 */

import { useSyncExternalStore } from 'react'
import { ecritCiblesChoisies } from '../data/db.ts'

let etat: ReadonlySet<string> = Object.freeze(new Set<string>())
const abonnes = new Set<() => void>()

/**
 * §12.3 — rien ne s'écrit tant que la relecture du démarrage n'a pas abouti.
 *
 * Deux échecs sans ce drapeau : une écriture partie avant la relecture écraserait la sélection
 * enregistrée par la sélection vide du premier rendu ; et quand la relecture ÉCHOUE, l'écran
 * promet déjà « plus rien ne s'enregistre » (`app-donnees.ts`) — la sélection tient la même
 * promesse que le lieu et le matériel.
 */
let hydrate = false

export function ciblesChoisies(): ReadonlySet<string> {
  return etat
}

function abonne(notifie: () => void): () => void {
  abonnes.add(notifie)
  return () => {
    abonnes.delete(notifie)
  }
}

function pose(suivant: ReadonlySet<string>): void {
  etat = Object.freeze(suivant)
  for (const notifie of abonnes) notifie()
}

/**
 * §12.3 — la sélection relue de la base, posée avant le premier rendu.
 *
 * C'est elle qui ouvre les écritures : tant qu'elle n'a pas eu lieu, le magasin lit et ne
 * grave rien.
 */
export function poseCiblesChoisies(designations: readonly string[]): void {
  hydrate = true
  pose(new Set(designations))
}

/**
 * Ajoute la cible au plan, ou l'en retire. Un seul verbe pour les deux sens : le bouton est
 * une bascule, et deux fonctions auraient demandé à l'appelant de relire l'état pour choisir
 * laquelle — donc de le lire à un autre moment que le rendu.
 */
export function basculeChoixCible(designation: string): void {
  const suivant = new Set(etat)
  if (!suivant.delete(designation)) suivant.add(designation)
  pose(suivant)
  if (!hydrate) return
  // L'échec d'écriture ne remonte pas à l'écran : le plan de la nuit reste juste, seule sa
  // survie au rechargement est perdue, et `usePersistance` porte déjà ce message-là.
  void ecritCiblesChoisies([...suivant]).catch(() => undefined)
}

/** Remet la sélection à zéro, hydratation comprise. Réservé aux tests. */
export function reinitialiseCiblesChoisies(): void {
  hydrate = false
  pose(new Set())
}

export function useCiblesChoisies(): ReadonlySet<string> {
  return useSyncExternalStore(abonne, ciblesChoisies, ciblesChoisies)
}
