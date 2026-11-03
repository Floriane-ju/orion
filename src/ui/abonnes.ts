/**
 * Subscribers of a module store read by `useSyncExternalStore`.
 * Shared: 6 stores copied the same `Set`/unsubscribe/notify loop; a copy missing `delete` leaks
 * an unmounted component. State stays per module (shape differs, not subscription).
 */

export interface Abonnes {
  /** Subscription as `useSyncExternalStore` wants it: returns its unsubscribe. */
  readonly abonne: (notifie: () => void) => () => void
  /** Wakes every subscriber; after the write, never before (they reread state). */
  readonly notifie: () => void
  /** Forgets all subscribers. Test resets only. */
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
