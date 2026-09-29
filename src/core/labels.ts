/**
 * §3.4 — Composition des labels.
 *
 * HIÉRARCHIE PAR ZOOM
 *   fov > 180°  Lune et planètes uniquement (convention produit, FOV_LABELS_CORPS_SEULS_DEG)
 *   fov > 40°   noms de constellations uniquement
 *   10° à 40°   + désignations Bayer des étoiles de mag ≤ 3,5
 *   fov < 10°   + noms propres et désignations des objets du ciel profond
 *
 * Densité plafonnée à 25 labels simultanés, priorité à la magnitude, anti-chevauchement
 * obligatoire. Un champ dense sans ces deux règles produit une bouillie illisible ; c'est
 * une contrainte de lecture, pas une optimisation.
 */

import { K } from '../registry/constants.ts'

export type CategorieLabel = 'CORPS' | 'CONSTELLATION' | 'ETOILE' | 'OBJET'

/** Un texte et la place qu'il occupe : tout ce dont l'anti-chevauchement a besoin. */
export interface BoiteLabel {
  readonly texte: string
  readonly xPx: number
  readonly yPx: number
  readonly largeurPx: number
  readonly hauteurPx: number
}

export interface CandidatLabel extends BoiteLabel {
  readonly categorie: CategorieLabel
  /** Plus petit = plus prioritaire. La magnitude s'y verse directement. */
  readonly priorite: number
  /** Teinte propre au label, quand la couleur de texte commune ne le rattacherait à rien. */
  readonly couleur?: string
}

/** Catégories admises au champ donné. */
export function categoriesActives(fovDeg: number): ReadonlySet<CategorieLabel> {
  if (fovDeg > K('FOV_LABELS_CORPS_SEULS_DEG')) return new Set(['CORPS'])
  const actives: CategorieLabel[] = ['CORPS', 'CONSTELLATION']
  if (fovDeg <= K('FOV_LABELS_CONSTELLATIONS_DEG')) actives.push('ETOILE')
  if (fovDeg < K('FOV_LABELS_OBJETS_DEG')) actives.push('OBJET')
  return new Set(actives)
}

function chevauche(a: BoiteLabel, b: BoiteLabel): boolean {
  return (
    Math.abs(a.xPx - b.xPx) * 2 < a.largeurPx + b.largeurPx &&
    Math.abs(a.yPx - b.yPx) * 2 < a.hauteurPx + b.hauteurPx
  )
}

/**
 * Retient les labels affichables : catégories du zoom, priorité à la magnitude, aucun
 * chevauchement, au plus `LABELS_MAX`. Un label écarté l'est par manque de place, jamais
 * par troncature arbitraire de la liste d'entrée.
 */
export function composeLabels(
  candidats: readonly CandidatLabel[],
  fovDeg: number,
): readonly CandidatLabel[] {
  const actives = categoriesActives(fovDeg)
  const eligibles = candidats
    .filter((c) => actives.has(c.categorie))
    .slice()
    .sort((a, b) => a.priorite - b.priorite)

  const retenus: CandidatLabel[] = []
  for (const candidat of eligibles) {
    if (retenus.length >= K('LABELS_MAX')) break
    if (retenus.some((r) => chevauche(r, candidat))) continue
    retenus.push(candidat)
  }
  return retenus
}

/** §3.4 — seules les étoiles de magnitude ≤ 3,5 portent leur désignation Bayer. */
export function etoileLabellisable(magV: number): boolean {
  return magV <= K('MAG_LABEL_BAYER_MAX')
}

/**
 * T-0085 — décalages successifs essayés pour loger le label du survol, en hauteurs de label.
 * Au-delà, le voisinage est plein : mieux vaut ne rien révéler que masquer un nom retenu.
 */
const DECALAGES_SURVOL: readonly number[] = Object.freeze([0, -1, 1, -2, 2])

/**
 * T-0085 — le nom que le seuil de zoom de §3.4 a masqué, révélé sous le curseur.
 *
 * Transitoire : il n'entre pas dans `LABELS_MAX` et ne chasse aucun label retenu — il se
 * range entre eux ou renonce. La hiérarchie par zoom ne s'y applique pas : c'est justement
 * l'élément qu'elle a écarté que le survol vient nommer.
 *
 * Un élément déjà nommé n'est pas nommé deux fois. Depuis T-0109 la scène et le survol tirent
 * leur texte de la même fonction : au même champ, c'est le MÊME libellé, et le doublon se
 * reconnaît à l'égalité. Le test reste écrit en préfixe — il couvre en plus le cas d'un
 * libellé enrichi (« Véga » puis « Véga — α Lyr ») — et compare des textes, jamais des
 * positions que chaque catégorie décale autrement.
 */
export function labelSurvol(
  retenus: readonly CandidatLabel[],
  survol: BoiteLabel,
): BoiteLabel | null {
  if (retenus.some((r) => survol.texte.startsWith(r.texte))) return null
  for (const rangs of DECALAGES_SURVOL) {
    const place: BoiteLabel = { ...survol, yPx: survol.yPx + rangs * survol.hauteurPx }
    if (!retenus.some((r) => chevauche(r, place))) return Object.freeze(place)
  }
  return null
}
