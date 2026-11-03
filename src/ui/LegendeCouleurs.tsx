/**
 * §6.3, §11.1 — colour legend of the ciel profond.
 * Rows DERIVED from `APPARENCE_OBJET`, not copied: a tint change in `apparence-objets.ts`
 * moves the legend, a new catalogue type appears on its own.
 * Colours in a STYLESHEET, not inline `style` (shell rule: no inline colour in markup, else
 * mode nuit has two sources). Sheet generated from the same table as the planetarium markers,
 * re-rendered on mode change; DOM counterpart of a canvas.
 * Colour never alone (§11.1): swatch `aria-hidden`, full type name informs.
 */

import type { TypeObjet } from '../data/deepsky.ts'
import { Accordeon } from './Accordeon.tsx'
import { APPARENCE_OBJET, EPAISSEUR_BORD_PX, teintesReference } from './apparence-objets.ts'
import { Icone } from './Icone.tsx'
import { LIBELLE_TYPE_OBJET } from './libelles-objet.ts'

/** Catch-all last: a legend opening on "type inconnu" teaches the exception first. */
function indetermine(types: readonly TypeObjet[]): boolean {
  return types.every((t) => t === 'INCONNU' || t === 'AUTRE')
}

export interface LigneLegende {
  readonly types: readonly TypeObjet[]
  /**
   * Cross instead of disc. Reading convenience, not the rule: the scène draws a cross for any
   * object lacking catalogue dimensions, whatever its type (`dessine-ciel.ts`,
   * `geometrieMarqueur` → `null`): 412 of 419 unknown-type objects, also 92 known-type ones.
   * The "forme" SECTION states the rule; this cross shows the most common row.
   */
  readonly croix: boolean
}

/** Two types of one tint share a row: the legend classifies colours. */
function parTeinte(): readonly LigneLegende[] {
  const groupes = new Map<string, TypeObjet[]>()
  for (const type of Object.keys(APPARENCE_OBJET) as readonly TypeObjet[]) {
    const { radiant, bord } = APPARENCE_OBJET[type]
    const cle = `${radiant.join()}|${bord.join()}`
    const deja = groupes.get(cle)
    if (deja === undefined) groupes.set(cle, [type])
    else deja.push(type)
  }
  // `sort` is stable: table order kept for the rest.
  return [...groupes.values()]
    .sort((a, b) => Number(indetermine(a)) - Number(indetermine(b)))
    .map((types) => Object.freeze({ types, croix: indetermine(types) }))
}

export const LIGNES_LEGENDE: readonly LigneLegende[] = Object.freeze(parTeinte())

/**
 * Swatch sheet, generated so rule count follows tint count. Disc = radial gradient + `peintEllipse`
 * outline; cross = one stroke → one colour (the bord, as `peintCroix`).
 */
function feuilleLegende(modeNuit: boolean): string {
  const teintes = teintesReference(modeNuit)
  return LIGNES_LEGENDE.map((ligne, rang) => {
    const { coeur, halo, bord } = teintes[ligne.types[0]!]
    const regle = ligne.croix
      ? `color:${bord}`
      : `background:radial-gradient(circle,${coeur},${halo});border:${EPAISSEUR_BORD_PX}px solid ${bord}`
    return `.legende-temoin-${rang}{${regle}}`
  }).join('')
}

export function LegendeCouleurs(props: { readonly modeNuit: boolean }) {
  return (
    <Accordeon titre="Légende">
      <style>{feuilleLegende(props.modeNuit)}</style>

      <section>
        <h2>Couleur — famille d’objet</h2>
        <ul className="legende-couleurs">
          {LIGNES_LEGENDE.map((ligne, rang) => (
            <li key={ligne.types[0]}>
              {ligne.croix ? (
                <Icone nom="close" classe={`legende-croix legende-temoin-${rang}`} />
              ) : (
                <span className={`legende-pastille legende-temoin-${rang}`} aria-hidden="true" />
              )}
              {ligne.types.map((type) => LIBELLE_TYPE_OBJET[type]).join(', ')}
            </li>
          ))}
        </ul>
      </section>

      {/* Shape is a CATALOGUE property, not the type's: no grand axe → no ellipse to scale,
          inventing one lies. Both swatches in interface grey (a tint would suggest a family). */}
      <section>
        <h2>Forme — taille de l’objet</h2>
        <ul className="legende-couleurs legende-formes">
          <li>
            <span className="legende-pastille legende-forme" aria-hidden="true" />
            taille réelle dans le ciel
          </li>
          <li>
            <Icone nom="close" classe="legende-croix legende-forme" />
            taille inconnue
          </li>
        </ul>
      </section>
    </Accordeon>
  )
}
