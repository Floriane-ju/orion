/**
 * T-0113 — l'état de la coque : ce qui est posé sur la scène, et ce qui est ouvert à côté.
 *
 * La coque ne pile plus trois colonnes : la scène occupe tout, et les réglages viennent
 * dessus en cartes repliables ou à côté en panneau latéral. Le repli doit être lisible de
 * plusieurs endroits sans ancêtre commun — une carte se replie depuis son propre en-tête, un
 * geste extérieur l'ouvre. Même raison que [[scene-etat]] et [[seance-etat]] : l'état vit dans
 * le module, donc il se lit en rendu serveur comme dans le navigateur, et se teste sans DOM.
 *
 * T-0238 — les cartes ne se déplacent plus : il n'y a plus de position à tenir, seulement le
 * repli.
 */

import { useSyncExternalStore } from 'react'

/** Les cartes posées sur la scène. Chacune est nommée d'après ce qu'elle montre. */
export type CleCarte = 'SITE' | 'BOITIER' | 'OPTIQUE' | 'PLAN'

export interface EtatCarte {
  readonly ouverte: boolean
}

export interface EtatCoque {
  readonly cartes: Readonly<Record<CleCarte, EtatCarte>>
}

/**
 * Le plan démarre replié : il se consulte pendant qu'on regarde le ciel, il ne s'impose pas —
 * déplié au démarrage, il couvrirait la moitié de la scène avant qu'on ait rien demandé.
 *
 * T-0182 — la carte Cible est partie : la fiche prend la place de la liste dans le panneau,
 * là où on l'a choisie.
 *
 * T-0213 — la carte Vue aussi : ses bascules se prennent EN regardant le ciel. Un repli leur
 * coûtait deux gestes par réglage. Elles sont devenues le rail posé au bord de la scène
 * (`RailVue`), toujours visible, donc sans état de repli.
 *
 * T-0238 — la colonne du matériel (T-0197) redevient deux cartes, Boîtier et Optique. Elles
 * démarrent repliées : le matériel se règle une fois puis ne bouge plus, et leur résumé
 * (recadrage, « 24 mm f/2.8 ») suffit à le relire sans déplier. Ce que la carte rend, c'est la
 * scène — dépliées au démarrage, elles retiraient 19 rem au ciel avant qu'on ait rien demandé.
 *
 * La carte Site remplace le tiroir du lieu de la barre basse, démontée. Même raison que le
 * matériel : le lieu se règle une fois par sortie, et ses coordonnées résumées suffisent à le
 * relire.
 */
const ETAT_INITIAL: EtatCoque = Object.freeze({
  cartes: Object.freeze({
    SITE: { ouverte: false },
    BOITIER: { ouverte: false },
    OPTIQUE: { ouverte: false },
    PLAN: { ouverte: false },
  }),
})

let etat: EtatCoque = ETAT_INITIAL
const abonnes = new Set<() => void>()

export function etatCoque(): EtatCoque {
  return etat
}

function abonne(notifie: () => void): () => void {
  abonnes.add(notifie)
  return () => {
    abonnes.delete(notifie)
  }
}

function pose(suivant: EtatCoque): void {
  etat = suivant
  for (const notifie of abonnes) notifie()
}

function retoucheCarte(cle: CleCarte, retouche: Partial<EtatCarte>): void {
  pose({
    ...etat,
    cartes: { ...etat.cartes, [cle]: { ...etat.cartes[cle], ...retouche } },
  })
}

export function basculeCarte(cle: CleCarte): void {
  retoucheCarte(cle, { ouverte: !etat.cartes[cle].ouverte })
}

/** Ouvre sans replier : appelé quand un geste EXTÉRIEUR à la carte doit la faire lire. */
export function ouvreCarte(cle: CleCarte): void {
  if (etat.cartes[cle].ouverte) return
  retoucheCarte(cle, { ouverte: true })
}

/** Remet la coque dans son état de départ. Réservé aux tests. */
export function reinitialiseCoque(): void {
  pose(ETAT_INITIAL)
}

export function useCoque(): EtatCoque {
  return useSyncExternalStore(abonne, etatCoque, etatCoque)
}
