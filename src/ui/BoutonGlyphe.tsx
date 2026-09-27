/**
 * §11.2 — un bouton qui ne porte qu'un glyphe, et la bulle qui dit ce qu'il fait.
 *
 * Neuf boutons recopiaient le même balisage — une `Bulle`, un `<button type="button">`, une
 * `Icone` — et chacun sa règle de géométrie : quatre façons d'écrire « une cible gantée, sans
 * rembourrage, glyphe centré ». Ils ne diffèrent que par le fond sur lequel ils se posent, et
 * c'est ce que dit la variante :
 *
 * - `cadre` — posé dans un panneau : un filet discret (liste des cibles, en-tête de fiche) ;
 * - `flottant` — posé seul sur le ciel : son propre cadre, fond translucide, aplat plein quand
 *   il est enfoncé (rail de la vue) ;
 * - `nu` — posé dans une rangée qui le borde déjà : pas de filet au repos (transport du temps,
 *   retour de fiche).
 *
 * §11.1 — un état enfoncé REMPLIT le glyphe, quelle que soit la variante : la nuit, la teinte ne
 * dit rien seule, la forme le dit.
 *
 * Le nom accessible est la phrase de la bulle, sauf si `libelle` est donné : c'est le cas où la
 * bulle dit autre chose que le geste (une aide plus longue, une liste de raccourcis). Jamais les
 * deux à la fois — le contrat de `Bulle`.
 */

import { Bulle, type PlaceBulle } from './Bulle.tsx'
import { Icone } from './Icone.tsx'

export type VarianteGlyphe = 'cadre' | 'flottant' | 'nu'

export interface BoutonGlypheProps {
  /** Ligature Material Symbols — voir `Icone`. */
  readonly icone: string
  /** La phrase de la bulle ; sans `libelle`, elle est aussi le nom du bouton. */
  readonly aide: string
  /** Nom accessible, quand la bulle ne se contente pas de nommer le geste. */
  readonly libelle?: string
  readonly place?: PlaceBulle
  readonly variante?: VarianteGlyphe
  /** Bascule : `aria-pressed`. Absent, le bouton n'a pas d'état à deux positions. */
  readonly presse?: boolean
  /** La commande reste offerte mais son effet est suspendu : elle le montre. */
  readonly eteinte?: boolean
  /** Classe de PLACE, pour une règle de disposition — jamais pour repeindre le bouton. */
  readonly classe?: string
  readonly onClick?: () => void
}

export function BoutonGlyphe({
  icone,
  aide,
  libelle,
  place,
  variante = 'cadre',
  presse,
  eteinte = false,
  classe,
  onClick,
}: BoutonGlypheProps) {
  const classes = ['bouton-glyphe', `bouton-glyphe-${variante}`]
  if (eteinte) classes.push('eteinte')
  if (classe !== undefined) classes.push(classe)
  return (
    <Bulle texte={aide} {...(place === undefined ? {} : { place })} nomme={libelle === undefined}>
      <button
        type="button"
        className={classes.join(' ')}
        {...(libelle === undefined ? {} : { 'aria-label': libelle })}
        {...(presse === undefined ? {} : { 'aria-pressed': presse })}
        {...(onClick === undefined ? {} : { onClick })}
      >
        <Icone nom={icone} />
      </button>
    </Bulle>
  )
}
