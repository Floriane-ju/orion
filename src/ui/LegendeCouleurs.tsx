/**
 * §6.3, §11.1 — la légende des couleurs du ciel profond.
 *
 * `APPARENCE_OBJET` peint chaque type d'une teinte, et les familles partagent la leur : trois
 * nébuleuses de mécanisme différent sont un seul rose. Rien à l'écran ne disait ce code — on
 * ne l'apprenait qu'en ouvrant une fiche, objet par objet.
 *
 * Les lignes sont DÉRIVÉES de la table des apparences, pas recopiées : une teinte modifiée
 * dans `apparence-objets.ts` déplace la légende avec elle, et un type ajouté au catalogue y
 * apparaît sans qu'on y pense. Une légende écrite à la main ment au premier changement.
 *
 * Les couleurs sont posées dans une FEUILLE, pas dans des attributs `style` : c'est la règle
 * de la coque — le balisage ne porte aucune couleur en ligne, sans quoi le mode nuit aurait
 * deux sources. Ici la feuille est engendrée depuis la même table que les marqueurs du
 * planétarium, et rendue à nouveau quand le mode change. Elle est le pendant DOM d'un canevas.
 *
 * La couleur ne porte jamais seule (§11.1) : le témoin est décoratif — `aria-hidden` — et
 * c'est le nom du type, en toutes lettres, qui informe.
 */

import type { TypeObjet } from '../data/deepsky.ts'
import { Accordeon } from './Accordeon.tsx'
import { APPARENCE_OBJET, EPAISSEUR_BORD_PX, teintesReference } from './apparence-objets.ts'
import { Icone } from './Icone.tsx'
import { LIBELLE_TYPE_OBJET } from './libelles-objet.ts'

/**
 * Le fourre-tout ferme la marche : une légende qui s'ouvre sur « type inconnu » enseigne
 * d'abord l'exception.
 */
function indetermine(types: readonly TypeObjet[]): boolean {
  return types.every((t) => t === 'INCONNU' || t === 'AUTRE')
}

export interface LigneLegende {
  readonly types: readonly TypeObjet[]
  /**
   * Croix plutôt que disque. C'est une COMMODITÉ de lecture, pas la règle : la scène pique
   * d'une croix tout objet dont le catalogue ignore les dimensions, quel que soit son type
   * (`dessine-ciel.ts`, `geometrieMarqueur` rendant `null`). Il se trouve que 412 des 419
   * objets de type inconnu sont dans ce cas — mais 92 objets d'un type connu le sont aussi.
   * C'est la SECTION « forme » qui énonce la règle ; cette croix-ci ne fait que montrer à
   * quoi ressemble la ligne la plus souvent rencontrée.
   */
  readonly croix: boolean
}

/** Deux types d'une même teinte tiennent une seule ligne : la légende classe des couleurs. */
function parTeinte(): readonly LigneLegende[] {
  const groupes = new Map<string, TypeObjet[]>()
  for (const type of Object.keys(APPARENCE_OBJET) as readonly TypeObjet[]) {
    const { radiant, bord } = APPARENCE_OBJET[type]
    const cle = `${radiant.join()}|${bord.join()}`
    const deja = groupes.get(cle)
    if (deja === undefined) groupes.set(cle, [type])
    else deja.push(type)
  }
  // `sort` est stable : l'ordre de la table est conservé pour tout le reste.
  return [...groupes.values()]
    .sort((a, b) => Number(indetermine(a)) - Number(indetermine(b)))
    .map((types) => Object.freeze({ types, croix: indetermine(types) }))
}

export const LIGNES_LEGENDE: readonly LigneLegende[] = Object.freeze(parTeinte())

/**
 * La feuille des témoins, engendrée plutôt qu'écrite pour que le nombre de règles suive le
 * nombre de teintes. Le disque reprend le dégradé radial et le contour de `peintEllipse` ;
 * la croix n'a qu'un trait, donc qu'une couleur — celle du bord, comme `peintCroix`.
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

      {/* La forme n'est pas une propriété du type mais du CATALOGUE : sans grand axe, aucune
          ellipse ne peut être dessinée à l'échelle, et en inventer une mentirait sur la
          seule chose que le marqueur a à dire. Les deux témoins sont donc peints en gris
          d'interface — les rattacher à une teinte laisserait croire à une famille. */}
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
