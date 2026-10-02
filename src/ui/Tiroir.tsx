/**
 * T-0215 — un tiroir de barre : un résumé qu'on clique, un contenu qui se déplie.
 *
 * T-0189 fixait déjà le contrat — le tiroir ne porte AUCUN JavaScript. Échap vient de
 * l'écoute unique du document (`gere-echap.ts`), la même pour tous les tiroirs, et elle
 * ramène le focus sur le `<summary>` ; `<details>` porte le reste, ouverture, clavier et
 * annonce. Ce composant ne fait que cesser de recopier ce contrat à quatre endroits.
 *
 * `resume` est un `ReactNode` et non un titre : les quatre tiroirs y mettent des choses
 * différentes — une pastille de coordonnées, une icône conditionnelle suivie d'un mot, une
 * icône et un libellé qui change quand la persistance échoue, un mot seul. Une prop `titre`
 * en chaîne n'aurait servi qu'au dernier.
 *
 * `alerte` reste ABSENTE par défaut plutôt que `false` : trois des quatre tiroirs n'ont pas
 * d'attribut `data-alerte` du tout, et en poser un partout changerait le balisage que
 * `coque.test.tsx` lit.
 */

import type { ReactNode } from 'react'

export interface TiroirProps {
  /** Le suffixe de la classe modificatrice : `site`, `nuit`, `outils`, `legende`. */
  readonly modificateur: string
  /** Le contenu du `<summary>` — ce qu'on voit tiroir fermé. */
  readonly resume: ReactNode
  readonly children: ReactNode
  /**
   * T-0041 — le tiroir signale qu'une section porte une alerte. Le rouge ne l'annonce jamais
   * seul (§11.1) : c'est au `resume` de la dire aussi en mots.
   */
  readonly alerte?: boolean | undefined
}

export function Tiroir({ modificateur, resume, children, alerte }: TiroirProps) {
  return (
    <details
      className={`tiroir tiroir-${modificateur}`}
      {...(alerte === undefined ? {} : { 'data-alerte': alerte })}
    >
      <summary>{resume}</summary>
      <div className="tiroir-contenu">{children}</div>
    </details>
  )
}
