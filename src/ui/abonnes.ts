/**
 * Les abonnés d'un magasin de module lu par `useSyncExternalStore`.
 *
 * Six magasins recopiaient le même `Set`, son désabonnement et sa boucle de notification :
 * une copie qui oublie le `delete` fuit un composant démonté, et rien ne l'aurait signalé.
 * L'état, lui, reste dans chaque module : c'est sa forme qui les distingue, pas l'abonnement.
 */

export interface Abonnes {
  /** L'abonnement tel que `useSyncExternalStore` le demande : il rend son désabonnement. */
  readonly abonne: (notifie: () => void) => () => void
  /** Réveille chaque abonné — après l'écriture, jamais avant : il relit l'état. */
  readonly notifie: () => void
  /** Oublie tous les abonnés. Réservé aux remises à zéro des tests. */
  readonly vide: () => void
}

export function creeAbonnes(): Abonnes {
  const abonnes = new Set<() => void>()
  return Object.freeze({
    abonne(notifie: () => void): () => void {
      abonnes.add(notifie)
      return () => {
        abonnes.delete(notifie)
      }
    },
    notifie(): void {
      for (const notifie of abonnes) notifie()
    },
    vide(): void {
      abonnes.clear()
    },
  })
}
