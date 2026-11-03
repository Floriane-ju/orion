/**
 * §3.4 — name of a scène element and where it sits.
 * T-0109 — one module owns naming + placement (scene painted "Dabih", hover showed
 * "Dabih — β Cap" at another point: two rules, two vocabularies, a name jumping 10 px).
 * A body has ONE name on the scène, same at any champ: the one it is searched by. Bayer
 * disambiguates, a label need not. §3.4 names stars mag ≤ 3,5 that CARRY a Bayer designation:
 * that is the eligibility criterion (`etoileLabellisable`), not the text.
 * Designation stays in the fiche (long form). Anchor depends on the marker the label hugs.
 */

import { Body } from 'astronomy-engine'
import type { BoiteLabel } from '../core/labels.ts'
import { nomComplet } from '../data/constellations.ts'
import type { CibleEcran } from './dessine-ciel.ts'
import { SANS_NOM } from '../registry/libelles.ts'
import { nomCommun } from './libelles-objet.ts'
import { POLICE_SCENE } from './couleurs.ts'
import { K } from '../registry/constants.ts'

export const HAUTEUR_LABEL_PX = K('HAUTEUR_NOM_SCENE_PX')
/** Font of names painted on the scène: single spec, all labels measure alike. */
export const POLICE_LABEL = `${HAUTEUR_LABEL_PX}px ${POLICE_SCENE}`
export const LARGEUR_CARACTERE_PX = HAUTEUR_LABEL_PX * K('CHASSE_POLICE_SCENE_EM')
export const MARQUEUR_OBJET_PX = 4
/** T-0376 — above star cap: Sirius must not match Jupiter's size. */
export const RAYON_CORPS_PX = 6
/** Moon shows its phase; planet size made the crescent unreadable. */
export const RAYON_LUNE_PX = 10

/**
 * T-0107 — five bright real-sky stars have no Bayer, Flamsteed or proper name in the versioned
 * packs: no label, only this title.
 */
const TITRE_ETOILE_SANS_DESIGNATION = `Étoile ${SANS_NOM}`

/**
 * Text to paint for this element, `null` if none. Same at any champ (hover name = name painted
 * a zoom step later). Bright star missing from the named pack: no label, fiche only.
 */
export function libelleCible(cible: CibleEcran): string | null {
  if (cible.type === 'OBJET') return cible.objet?.designation ?? null
  if (cible.type === 'CORPS') return cible.nom
  const nommee = cible.etoileNommee
  if (nommee === undefined) return null
  return nommee.nomPropre === '' ? nommee.designation : nommee.nomPropre
}

/** Fiche title: long form, same at any champ. */
export function titreCible(cible: CibleEcran): string {
  if (cible.type === 'OBJET' && cible.objet !== undefined) {
    const o = cible.objet
    const nom = nomCommun(o)
    return o.designation + (nom === '' ? '' : ` — ${nom}`)
  }
  if (cible.type === 'CORPS') return cible.nom
  const nommee = cible.etoileNommee
  return nommee === undefined ? TITRE_ETOILE_SANS_DESIGNATION : nomComplet(nommee)
}

/** Label anchor: hugs the marker the scène painted. */
export function ancreLabel(cible: CibleEcran): { readonly xPx: number; readonly yPx: number } {
  const marge = HAUTEUR_LABEL_PX / 2
  // T-0144 — object carries its marker's extent: a fixed 4 px offset would land INSIDE a galaxy
  // spanning a quarter of the canvas.
  if (cible.type === 'OBJET') {
    return { xPx: cible.xPx + (cible.rayonPx ?? MARQUEUR_OBJET_PX) + marge, yPx: cible.yPx }
  }
  if (cible.type === 'CORPS') {
    const rayon = cible.rayonPx ?? (cible.corps?.corps === Body.Moon ? RAYON_LUNE_PX : RAYON_CORPS_PX)
    return { xPx: cible.xPx + rayon + marge, yPx: cible.yPx }
  }
  // Star has no fixed-size marker (disc follows magnitude). Diagonal offset: the only one that
  // never covers the star.
  return { xPx: cible.xPx + marge, yPx: cible.yPx - marge }
}

/** Text, place, extent: what §3.4 anti-overlap needs. */
export function boiteLabel(cible: CibleEcran, texte: string): BoiteLabel {
  return {
    texte,
    ...ancreLabel(cible),
    largeurPx: texte.length * LARGEUR_CARACTERE_PX,
    hauteurPx: HAUTEUR_LABEL_PX,
  }
}
