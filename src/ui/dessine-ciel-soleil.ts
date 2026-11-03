/**
 * §3.3, T-0356 — Sun-lit sky, painted per direction.
 * Radial gradient (`dessineHaloSoleil`) knows only separation ρ → a disc. Sunset layers in
 * horizontal bands: scattered light reddens again on path to eye, depends only on aimed height.
 * Sky = field of (h, ρ); no canvas gradient draws it.
 * Computed on reduced grid (`CELLULE_CIEL_SOLEIL_PX`), upscaled by browser bilinear smoothing
 * (universal, Firefox incl.), painted OPAQUE: each cell carries full fond incl. horizon halo.
 * All physics in `composantesCielSoleil`.
 *
 * ponytail: grid kept frame to frame while nothing moves (Sun, aim, fond, size). Animating or
 * dragging, it recomputes every frame; if visible, raise the grid step.
 */

import type { Mat3 } from '../core/mat3.ts'
import { angleDeCosDeg, angleDeSinDeg, versVecteur } from '../core/mat3.ts'
import type { Projecteur } from '../core/projection.ts'
import { nanolamberts } from '../core/moon.ts'
import {
  brillanceSoleilZenithNl,
  composantesCielSoleil,
  eclairageSoleil,
  lueurSoleil,
} from '../core/fond-ciel-rendu.ts'
import { DEG_PAR_HEURE } from '../core/unites.ts'
import { K } from '../registry/constants.ts'
import { ecritOctets } from './couleurs.ts'
import type { SoleilEcran } from './dessine-fond-ciel.ts'

interface Grille {
  readonly toile: OffscreenCanvasRenderingContext2D
  readonly cle: Float64Array
  image: ImageData | null
}

let grille: Grille | null = null

/** Everything grille depends on, flat: if nothing moved, it is reused as is. */
function cleDe(
  projecteur: Projecteur,
  matriceCiel: Mat3,
  sbCiel: number,
  soleil: SoleilEcran,
  cle: Float64Array,
): boolean {
  const { vue } = projecteur
  const valeurs = [
    ...projecteur.matrice,
    ...matriceCiel,
    projecteur.echelle,
    projecteur.centreXPx,
    projecteur.centreYPx,
    vue.largeurPx,
    vue.hauteurPx,
    vue.fovDeg,
    sbCiel,
    soleil.adH,
    soleil.decDeg,
    soleil.altitudeDeg,
  ]
  let change = false
  for (let i = 0; i < valeurs.length; i++) {
    if (cle[i] !== valeurs[i]) {
      cle[i] = valeurs[i]!
      change = true
    }
  }
  return change
}

const TAILLE_CLE = 9 + 9 + 3 + 3 + 1 + 3

/**
 * Paints Sun sky on `ctx`. `false` + nothing painted when Sun lights nothing (nuit) or no
 * `OffscreenCanvas`: caller keeps radial halo.
 */
export function dessineCielSoleil(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  matriceCiel: Mat3,
  sbCiel: number,
  soleil: SoleilEcran,
): boolean {
  if (typeof OffscreenCanvas === 'undefined') return false
  // Nuit: glow off (Patat out of domain), fond and its paliers suffice.
  if (soleil.altitudeDeg <= 0 && lueurSoleil(soleil.altitudeDeg, 0).mieNl === 0) return false

  const { largeurPx, hauteurPx } = projecteur.vue
  const pas = K('CELLULE_CIEL_SOLEIL_PX')
  const colonnes = Math.ceil(largeurPx / pas) + 1
  const lignes = Math.ceil(hauteurPx / pas) + 1

  if (grille === null) {
    const toile = new OffscreenCanvas(colonnes, lignes).getContext('2d')
    if (toile === null) return false
    grille = { toile, cle: new Float64Array(TAILLE_CLE).fill(Number.NaN), image: null }
  }
  const { toile } = grille
  const redimensionne = toile.canvas.width !== colonnes || toile.canvas.height !== lignes
  if (redimensionne) {
    toile.canvas.width = colonnes
    toile.canvas.height = lignes
    grille.image = null
  }
  if (cleDe(projecteur, matriceCiel, sbCiel, soleil, grille.cle) || grille.image === null) {
    grille.image = calculeGrille(projecteur, matriceCiel, sbCiel, soleil, colonnes, lignes, pas)
    toile.putImageData(grille.image, 0, 0)
  }

  const lissageInitial = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = true
  // Cell (i, j) centre is at pixel (i·pas, j·pas): upscale re-aligns it.
  ctx.drawImage(toile.canvas, -pas / 2, -pas / 2, colonnes * pas, lignes * pas)
  ctx.imageSmoothingEnabled = lissageInitial
  return true
}

function calculeGrille(
  projecteur: Projecteur,
  matriceCiel: Mat3,
  sbCiel: number,
  soleil: SoleilEcran,
  colonnes: number,
  lignes: number,
  pas: number,
): ImageData {
  const image = new ImageData(colonnes, lignes)
  const s = versVecteur(soleil.adH * DEG_PAR_HEURE, soleil.decDeg)
  const [, , , , , , m31, m32, m33] = matriceCiel
  const bFondNl = Math.max(0, nanolamberts(sbCiel) - brillanceSoleilZenithNl(-soleil.altitudeDeg))
  const eclairage = eclairageSoleil(soleil.altitudeDeg, bFondNl, sbCiel)
  for (let j = 0; j < lignes; j++) {
    for (let i = 0; i < colonnes; i++) {
      const v = projecteur.inverse(i * pas, j * pas)
      const norme = Math.hypot(v.x, v.y, v.z)
      const sinH = (m31 * v.x + m32 * v.y + m33 * v.z) / norme
      const cosRho = (s.x * v.x + s.y * v.y + s.z * v.z) / norme
      const couleur = composantesCielSoleil(
        eclairage,
        angleDeSinDeg(sinH),
        angleDeCosDeg(cosRho),
      )
      ecritOctets(couleur, image.data, 4 * (j * colonnes + i))
    }
  }
  return image
}
