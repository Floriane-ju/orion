/**
 * §9.1 — T-0142: max pose card painted INSIDE sensor cadre.
 * §9.1 grid IS the cadre: 9 cells per side, each with declination and tolerated pose. Read in
 * panel beside scène it forced mentally matching abstract grid and described rectangle; in cadre,
 * each number lands on the region it quantifies.
 * Cadre MASKED before filling: pose over a filé star background is unreadable. So this pass is
 * the frame's last — covers traces, repères, names, not the reverse.
 */

import { K } from '../registry/constants.ts'
import { degres, formatePose } from '../registry/ecriture.ts'
import { cellulesCadreJ2000, type Cadre } from '../core/cadre.ts'
import { angleDeSinDeg, type Mat3 } from '../core/mat3.ts'
import { pointEcran, type Projecteur } from '../core/projection.ts'
import { npf } from '../core/suivi.ts'
import { POLICE_SCENE } from './couleurs.ts'

/** What NPF asks of matériel, nothing more (§9.1). */
export interface OptiquePose {
  readonly focaleMm: number
  readonly ouvertureN: number
  readonly pitchUm: number
}

/** Share of cell height taken by pose figure. */
const FRACTION_POLICE = 0.3
/** Declination is the figure's legend: read below, smaller. */
const FRACTION_POLICE_DEC = 0.78
/**
 * Under this font size text is a smear: cadre stays empty rather than masked for nothing. Screen
 * fact, not a §9.1 threshold.
 */
const POLICE_MIN_PX = 5

interface CelluleEcran {
  readonly xPx: number
  readonly yPx: number
  readonly decDeg: number
  readonly tNpfS: number | null
}

/**
 * Paints cadre pose card. `false` if not painted (cadre off-field, or too small on screen for its
 * figures): nothing masked then.
 */
export function dessineCartePose(entree: {
  readonly ctx: CanvasRenderingContext2D
  readonly projecteur: Projecteur
  readonly cadre: Cadre
  readonly matriceCiel: Mat3
  readonly optique: OptiquePose
  /** Closed cadre outline path, composed by caller: only one exists (§3.5). */
  readonly chemin: () => void
  readonly couleurTexte: string
  /** Opaque mask at scène fond: filled cadre lets nothing show through. */
  readonly couleurMasque: string
  /** Teinte of limiting zone and its neighbours: they set the pose. */
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

  // Cell is square in cadre, not on screen: smaller dimension decides, else an oblique cadre
  // overflows its cells.
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
    // At exact pole NPF diverges: cell carries the symbol, not an invented duration.
    const pose = cellule.tNpfS === null ? '∞' : `${formatePose(cellule.tNpfS)} s`
    ctx.fillText(pose, cellule.xPx, cellule.yPx - policeDec / 2)
    ctx.font = `${policeDec}px ${POLICE_SCENE}`
    ctx.fillText(`δ ${degres(cellule.decDeg, 0)}`, cellule.xPx, cellule.yPx + police / 2)
  }
  ctx.font = ancienneFonte
  ctx.textAlign = ancienAlignement
  return true
}
