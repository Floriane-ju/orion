/**
 * §9.1 — T-0142 : la carte de pose maximale peinte DANS le cadre du capteur.
 *
 * La grille de §9.1 EST le cadre : neuf cellules de côté, chacune portant sa déclinaison et
 * la pose qu'elle tolère. Lue au panneau, à côté de la scène, elle demandait de rapprocher de
 * tête une grille abstraite et le rectangle qu'elle décrit. Peinte dans le cadre, chaque
 * nombre tombe sur la région qu'il chiffre.
 *
 * Le cadre est MASQUÉ avant d'être garni : une pose lue sur un fond d'étoiles filées ne se
 * lit pas. C'est aussi pourquoi cette passe est la dernière de l'image — elle recouvre les
 * traces, les repères et les noms, pas l'inverse.
 */

import { K } from '../registry/constants.ts'
import { cellulesCadreJ2000, type Cadre } from '../core/cadre.ts'
import { angleDeSinDeg, type Mat3 } from '../core/mat3.ts'
import { pointEcran, type Projecteur } from '../core/projection.ts'
import { npf } from '../core/tracking.ts'
import { POLICE_SCENE } from './couleurs.ts'
import { formatePose } from './horaire.ts'

/** Ce que la NPF demande du matériel, et rien de plus (§9.1). */
export interface OptiquePose {
  readonly focaleMm: number
  readonly ouvertureN: number
  readonly pitchUm: number
}

/** Part de la hauteur d'une cellule prise par le chiffre de pose. */
const FRACTION_POLICE = 0.3
/** La déclinaison est la légende du chiffre : elle se lit en dessous, plus petite. */
const FRACTION_POLICE_DEC = 0.78
/**
 * Sous cette taille de police, le texte n'est plus qu'une bavure : le cadre reste alors
 * vide plutôt que masqué pour rien. C'est un fait d'écran, pas un seuil de §9.1.
 */
const POLICE_MIN_PX = 5

interface CelluleEcran {
  readonly xPx: number
  readonly yPx: number
  readonly decDeg: number
  readonly tNpfS: number | null
}

/**
 * Peint la carte de pose du cadre. Rend `false` quand elle ne l'est pas — cadre hors champ,
 * ou trop petit à l'écran pour porter ses chiffres —, auquel cas rien n'a été masqué.
 */
export function dessineCartePose(entree: {
  readonly ctx: CanvasRenderingContext2D
  readonly projecteur: Projecteur
  readonly cadre: Cadre
  readonly matriceCiel: Mat3
  readonly optique: OptiquePose
  /** Chemin fermé du contour du cadre, composé par l'appelant : il n'en existe qu'un (§3.5). */
  readonly chemin: () => void
  readonly couleurTexte: string
  /** Masque opaque, au fond de la scène : le cadre garni ne laisse rien transparaître. */
  readonly couleurMasque: string
  /** Teinte de la zone limitante et de ses voisines : ce sont elles qui fixent la pose. */
  readonly couleurLimitante: string
}): boolean {
  const { ctx, projecteur, cadre, matriceCiel, optique } = entree
  const cote = Math.max(1, Math.round(K('CELLULES_CARTE_POSE')))
  const p = pointEcran()

  const visibles: CelluleEcran[] = []
  let xMin = Infinity
  let xMax = -Infinity
  let yMin = Infinity
  let yMax = -Infinity
  let plusCourte: number | null = null

  for (const cellule of cellulesCadreJ2000(cadre, matriceCiel, cote)) {
    if (!projecteur.projetteEn(cellule.dir.x, cellule.dir.y, cellule.dir.z, p)) continue
    const decDeg = angleDeSinDeg(cellule.dir.z)
    const tNpfS = npf({ ...optique, decDeg }).value
    visibles.push({ xPx: p.xPx, yPx: p.yPx, decDeg, tNpfS })
    if (p.xPx < xMin) xMin = p.xPx
    if (p.xPx > xMax) xMax = p.xPx
    if (p.yPx < yMin) yMin = p.yPx
    if (p.yPx > yMax) yMax = p.yPx
    if (tNpfS !== null && (plusCourte === null || tNpfS < plusCourte)) plusCourte = tNpfS
  }
  if (visibles.length === 0) return false

  // La cellule est carrée dans le cadre, pas à l'écran : la plus petite des deux dimensions
  // décide, sans quoi un cadre vu de biais déborderait de ses cases.
  const police = (Math.min(xMax - xMin, yMax - yMin) / cote) * FRACTION_POLICE
  if (police < POLICE_MIN_PX) return false

  entree.chemin()
  ctx.fillStyle = entree.couleurMasque
  ctx.fill()

  const seuil = plusCourte === null ? null : plusCourte * K('ECART_POSE_CADRE_SIGNIFICATIF')
  const policeDec = police * FRACTION_POLICE_DEC
  const ancienneFonte = ctx.font
  const ancienAlignement = ctx.textAlign
  ctx.textAlign = 'center'
  for (const cellule of visibles) {
    const limitante =
      seuil !== null && cellule.tNpfS !== null && cellule.tNpfS <= seuil
    ctx.fillStyle = limitante ? entree.couleurLimitante : entree.couleurTexte
    ctx.font = `${police}px ${POLICE_SCENE}`
    // Au pôle exact la NPF diverge : la cellule porte le symbole, pas une durée inventée.
    const pose = cellule.tNpfS === null ? '∞' : `${formatePose(cellule.tNpfS)} s`
    ctx.fillText(pose, cellule.xPx, cellule.yPx - policeDec / 2)
    ctx.font = `${policeDec}px ${POLICE_SCENE}`
    ctx.fillText(`δ ${cellule.decDeg.toFixed(0)}°`, cellule.xPx, cellule.yPx + police / 2)
  }
  ctx.font = ancienneFonte
  ctx.textAlign = ancienAlignement
  return true
}
