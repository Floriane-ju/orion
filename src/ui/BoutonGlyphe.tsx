/**
 * §11.2 — glyph-only button + the bulle saying what it does.
 * Replaces 9 copies of `Bulle` + `<button type="button">` + `Icone` with 4 geometry rules,
 * differing only by background, hence the variant:
 * - `cadre` — in a panel: discreet rule (cible list, fiche header);
 * - `flottant` — alone on sky: frame, translucent background, solid fill when pressed (view rail);
 * - `nu` — in a row that already borders it: no rule at rest (time transport, fiche back).
 * §11.1 — pressed FILLS the glyph in every variant (at night hue says nothing, shape does).
 * Accessible name = bulle sentence unless `libelle` given (bulle says something else: longer help,
 * shortcut list). Never both — `Bulle` contract.
 */

import { Bulle, type PlaceBulle } from './Bulle.tsx'
import { Icone } from './Icone.tsx'

export type VarianteGlyphe = 'cadre' | 'flottant' | 'nu'

export interface BoutonGlypheProps {
  /** Material Symbols ligature — see `Icone`. */
  readonly icone: string
  /** Bulle sentence; without `libelle` it is also the button name. */
  readonly aide: string
  /** Accessible name, when the bulle does more than name the gesture. */
  readonly libelle?: string
  readonly place?: PlaceBulle
  readonly variante?: VarianteGlyphe
  /** Toggle: `aria-pressed`. Absent: no two-state. */
  readonly presse?: boolean
  /** Command stays offered but its effect is suspended: it shows it. */
  readonly eteinte?: boolean
  /** PLACE class, for a layout rule — never to repaint the button. */
  readonly classe?: string
  /** Word after the glyph, when room allows. */
  readonly texte?: string
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
  texte,
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
        {texte}
      </button>
    </Bulle>
  )
}
