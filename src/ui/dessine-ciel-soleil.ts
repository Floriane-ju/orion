/**
 * §3.3, T-0356 — le ciel éclairé par le Soleil, peint direction par direction.
 *
 * Un dégradé radial autour du Soleil (`dessineHaloSoleil`) ne connaît que la séparation ρ :
 * il donne un disque. Le couchant, lui, s'étage en bandes horizontales, parce que la lumière
 * diffusée est rougie une seconde fois sur le trajet qui la ramène à l'œil, et ce trajet ne
 * dépend que de la hauteur visée. Le ciel est donc un champ à deux variables (h, ρ), qu'aucun
 * dégradé de canevas ne sait tracer.
 *
 * Il se calcule sur une grille réduite (`CELLULE_CIEL_SOLEIL_PX`), s'agrandit avec le lissage
 * bilinéaire du navigateur — universel, Firefox compris —, et se peint OPAQUE : chaque cellule
 * porte le fond complet, halo d'horizon compris. La physique vient toute de
 * `composantesCielSoleil`.
 *
 * ponytail: la grille est gardée d'une image à l'autre tant que rien ne bouge — Soleil, visée,
 * fond, taille. En animation ou pendant un glissé, elle se recalcule à chaque image ; si ça se
 * voyait, c'est le pas de la grille qu'il faudrait monter.
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

/** Tout ce dont dépend la grille, à plat : si rien n'a bougé, elle se recopie telle quelle. */
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
 * Peint le ciel du Soleil sur `ctx`. Renvoie `false` sans rien peindre quand le Soleil n'éclaire
 * plus rien (nuit) ou sans `OffscreenCanvas` : l'appelant garde alors le halo radial.
 */
export function dessineCielSoleil(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  matriceCiel: Mat3,
  sbCiel: number,
  soleil: SoleilEcran,
): boolean {
  if (typeof OffscreenCanvas === 'undefined') return false
  // Nuit : la lueur est éteinte (Patat hors domaine), le fond et ses paliers suffisent.
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
  // Le centre de la cellule (i, j) est au pixel (i·pas, j·pas) : l'agrandissement le recale.
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
