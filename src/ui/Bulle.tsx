/**
 * T-0147 — le survol textuel de l'interface, dessiné par la feuille de style.
 *
 * L'infobulle native (`title`) est la seule surface de l'application que la palette ne
 * peut pas atteindre : le navigateur la peint lui-même, claire et arrondie, et §11.1
 * n'a aucune prise dessus — une lampe blanche au milieu d'une interface conçue pour
 * l'obscurité. Elle n'a pas non plus de largeur : une glose de deux lignes s'étale sur
 * une seule, hors écran. La bulle est donc du DOM, pas un attribut.
 *
 * PAS DE JAVASCRIPT ICI. T-0189 — Échap la congédie (1.4.13), mais depuis une écoute unique
 * posée sur le document (`gere-echap.ts`) : au survol seul, aucun nœud de la bulle ne tient le
 * focus, une écoute portée par l'ancre ne verrait jamais la touche.
 *
 * L'ouverture est `:hover` / `:has(:focus-visible)` sur l'ancre — le clavier
 * l'obtient sans code, et rien ne se recalcule au survol. Pas `:focus-within` : le focus
 * qu'un clic laisse au bouton tiendrait la bulle ouverte une fois la souris partie (T-0240). Le débordement non plus n'est pas
 * mesuré ici : `place` dit le côté PRÉFÉRÉ, et l'ancrage CSS (`position-try-fallbacks`,
 * `styles.css`) rabat la bulle lui-même quand ce côté ne tient pas à l'écran.
 *
 * Le seul rôle du composant dans ce placement est de donner à chaque ancre un nom unique :
 * `anchor-name` ne se partage pas — deux ancres du même nom et toutes les bulles se
 * rattachent à la dernière.
 *
 * NOMMER OU DÉCRIRE. Sur un contrôle qui ne porte qu'un glyphe, la bulle EST son nom
 * accessible (`nomme`) : l'`aria-label` disparaît du bouton, sans quoi le lecteur d'écran
 * annoncerait deux fois la même phrase. Ailleurs — un terme du glossaire, déjà nommé par
 * son libellé — elle le décrit.
 */

import { cloneElement, useId, type CSSProperties, type ReactElement, type ReactNode } from 'react'

/** Le côté où la bulle se déplie, relatif au contrôle qui l'ouvre. */
export type PlaceBulle = 'haut' | 'bas' | 'gauche' | 'droite'

/** Ce que la bulle greffe sur l'enfant : l'un ou l'autre, jamais les deux. */
interface LienAria {
  readonly 'aria-labelledby'?: string | undefined
  readonly 'aria-describedby'?: string | undefined
}

interface BulleProps {
  /** Une phrase le plus souvent ; le détail complet d'une valeur tracée (TracedValue) sinon. */
  readonly texte: ReactNode
  readonly place?: PlaceBulle
  /** La bulle porte le nom accessible du contrôle, au lieu de le décrire. */
  readonly nomme?: boolean
  readonly children: ReactElement<LienAria>
}

export function Bulle({ texte, place = 'haut', nomme = false, children }: BulleProps) {
  const id = useId()
  // Une propriété personnalisée plutôt que `anchorName` : c'est la seule forme que React
  // écrit telle quelle, et la feuille de style garde la main sur le reste du placement.
  // `useId` n'a pas promis de rendre un identifiant CSS : ce qui n'en est pas devient un
  // tiret, sinon le nom d'ancre est invalide et le placement retombe silencieusement.
  const ancre = {
    '--bulle-ancre-nom': `--bulle-${id.replace(/[^a-zA-Z0-9-]/g, '-')}`,
  } as CSSProperties
  return (
    <span className="bulle-ancre" style={ancre}>
      {cloneElement(children, nomme ? { 'aria-labelledby': id } : { 'aria-describedby': id })}
      <span className="bulle" id={id} role="tooltip" data-place={place}>
        {texte}
      </span>
    </span>
  )
}
