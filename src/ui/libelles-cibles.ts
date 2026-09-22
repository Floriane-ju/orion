/**
 * §3.4 — Le nom d'un élément de la scène, et l'endroit où ce nom se pose.
 *
 * T-0109 — un seul module possède le nommage et la mise en place. La scène peignait
 * « Dabih » là où le survol révélait « Dabih — β Cap », et les deux textes ne tombaient
 * même pas au même point : deux règles écrites à deux endroits donnaient deux vocabulaires,
 * et un nom qui sautait de dix pixels au premier cran de zoom.
 *
 * Un astre porte UN nom sur la scène, le même à tout champ : celui sous lequel on le
 * cherche. Un observateur repère « Dabih », pas « β Cap » — la désignation Bayer sert à
 * lever une ambiguïté, ce qu'un label n'a pas à faire. §3.4 nomme les étoiles de mag ≤ 3,5
 * comme celles qui PORTENT une désignation Bayer : c'est le critère d'éligibilité, appliqué
 * par `etoileLabellisable`, pas le texte à peindre.
 *
 * La désignation reste dans la fiche, qui garde sa forme longue : c'est un panneau, pas un
 * label. L'ancre, elle, dépend du marqueur que le label longe.
 */

import type { BoiteLabel } from '../core/labels.ts'
import { nomComplet } from '../data/constellations.ts'
import type { CibleEcran } from './dessine-ciel.ts'

/* T-0027 — noms des éléments trop petits à l'écran une fois le canevas 1920×1080 réduit à
   la taille d'affichage réelle (object-fit: contain). */
export const HAUTEUR_LABEL_PX = 18
export const LARGEUR_CARACTERE_PX = 10
export const MARQUEUR_OBJET_PX = 4
export const RAYON_CORPS_PX = 5

/**
 * T-0107 — cinq étoiles brillantes du ciel réel n'ont ni Bayer, ni Flamsteed, ni nom propre
 * dans les paquets versionnés. Elles n'ont pas de label ; elles n'ont que ce titre.
 */
export const TITRE_ETOILE_SANS_DESIGNATION = 'Étoile sans nom'

/**
 * Le texte à peindre pour cet élément, `null` s'il n'en porte aucun.
 *
 * Le même à tout champ : c'est ce qui fait qu'un nom révélé au survol et le même nom peint
 * un cran de zoom plus loin sont indiscernables. Une étoile brillante que le paquet nommé ne
 * porte pas n'a pas de label du tout — elle n'a que sa fiche.
 */
export function libelleCible(cible: CibleEcran): string | null {
  if (cible.type === 'OBJET') return cible.objet?.designation ?? null
  if (cible.type === 'CORPS') return cible.nom
  const nommee = cible.etoileNommee
  if (nommee === undefined) return null
  return nommee.nomPropre === '' ? nommee.designation : nommee.nomPropre
}

/** Le titre de la fiche : la forme longue, la même quel que soit le champ. */
export function titreCible(cible: CibleEcran): string {
  if (cible.type === 'OBJET' && cible.objet !== undefined) {
    const o = cible.objet
    return o.designation + (o.nomsCommuns === '' ? '' : ` — ${o.nomsCommuns.split('|')[0]}`)
  }
  if (cible.type === 'CORPS') return cible.nom
  const nommee = cible.etoileNommee
  return nommee === undefined ? TITRE_ETOILE_SANS_DESIGNATION : nomComplet(nommee)
}

/** L'ancre du label : il longe le marqueur que la scène a peint pour cet élément. */
export function ancreLabel(cible: CibleEcran): { readonly xPx: number; readonly yPx: number } {
  const marge = HAUTEUR_LABEL_PX / 2
  // T-0144 — l'objet porte l'encombrement de son marqueur : un nom posé à quatre pixels fixes
  // tomberait DANS une galaxie qui s'étale sur un quart du canevas.
  if (cible.type === 'OBJET') {
    return { xPx: cible.xPx + (cible.rayonPx ?? MARQUEUR_OBJET_PX) + marge, yPx: cible.yPx }
  }
  if (cible.type === 'CORPS') return { xPx: cible.xPx + RAYON_CORPS_PX + marge, yPx: cible.yPx }
  // L'étoile n'a pas de marqueur de taille fixe à contourner — son disque suit sa magnitude.
  // Le nom se pose en diagonale, seul décalage qui ne recouvre jamais l'astre qu'il nomme.
  return { xPx: cible.xPx + marge, yPx: cible.yPx - marge }
}

/** Le texte, sa place et son encombrement : ce que l'anti-chevauchement de §3.4 demande. */
export function boiteLabel(cible: CibleEcran, texte: string): BoiteLabel {
  return {
    texte,
    ...ancreLabel(cible),
    largeurPx: texte.length * LARGEUR_CARACTERE_PX,
    hauteurPx: HAUTEUR_LABEL_PX,
  }
}
