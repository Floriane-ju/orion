/**
 * §3.5, §9.1 — matériel cadre on scène: outline, then pose card.
 * Two passes at opposite ENDS of paint order (outline with repères; card last, masks what it
 * covers), same object, shared path. Extracted from `dessine-ciel.ts` together (T-0324, size cap).
 * Take only what they need, not the render pass: cadre knows nothing of stars, labels, clickable
 * cibles; passing the frame accumulator would let it touch them.
 */

import type { Cadre } from '../core/cadre.ts'
import type { Mat3 } from '../core/mat3.ts'
import type { Projecteur } from '../core/projection.ts'
import type { PaletteCiel } from './couleurs.ts'
import { dessineCartePose, type OptiquePose } from './dessine-pose-cadre.ts'
import { cheminCadre } from './traces-ciel.ts'

/** Outline thickness: cadre reads at a glance, repérage traces don't. */
const EPAISSEUR_CADRE_PX = 2
/** Cadres after first (zoom ring ends) = what ring CAN give, not gives: dimmed, don't compete. */
const OPACITE_CADRES_SECONDAIRES = 0.6
/** Dotted not dashed: long dash is pointage parcours (T-0324). */
const POINTILLE_CADRES_SECONDAIRES_PX: readonly number[] = Object.freeze([2, 4])

export interface EntreeCadre {
  readonly ctx: CanvasRenderingContext2D
  /**
   * RAW projecteur, never sol-filtered: outline = where matériel points, even below horizon (§3.5).
   */
  readonly brut: Projecteur
  readonly matriceCiel: Mat3
  readonly cadres: readonly Cadre[]
  /** Cadre opened/hovered cible would get, centered on it; absent outside zoom. */
  readonly cadreCible?: Cadre | undefined
  readonly teintes: PaletteCiel
  /** `couches.cadre`: off → neither outline nor card painted. */
  readonly actif: boolean
  /** §9.1 / T-0142 — present: pose card fills cadre. */
  readonly poseCadre?: OptiquePose | undefined
}

/** §3.5 — matériel cadre outline. */
export function dessineContourCadre(entree: EntreeCadre): void {
  if (!entree.actif) return
  const { ctx, brut, matriceCiel, teintes } = entree
  ctx.strokeStyle = teintes.cadre
  ctx.lineWidth = EPAISSEUR_CADRE_PX
  entree.cadres.forEach((cadre, i) => {
    // Style switches once, at first secondary cadre: without them no pattern set.
    if (i === 1) {
      ctx.globalAlpha = OPACITE_CADRES_SECONDAIRES
      ctx.setLineDash(POINTILLE_CADRES_SECONDAIRES_PX)
    }
    cheminCadre(ctx, brut, cadre, matriceCiel)
    ctx.stroke()
  })
  if (entree.cadres.length > 1) {
    ctx.globalAlpha = 1
    ctx.setLineDash([])
  }
  if (entree.cadreCible !== undefined) {
    ctx.strokeStyle = teintes.cadreCible
    cheminCadre(ctx, brut, entree.cadreCible, matriceCiel)
    ctx.stroke()
  }
  ctx.lineWidth = 1
}

/**
 * §9.1, T-0142 — pose card, LAST: masks cadre, traces, repères, names (painted with repères,
 * labels just above would show over it). FIRST cadre only (setting's): zoom ring cadres nest in
 * it, cards would overlap.
 */
export function dessineCarteDansCadre(entree: EntreeCadre): void {
  const { ctx, brut, matriceCiel, teintes, poseCadre } = entree
  if (poseCadre === undefined || !entree.actif) return
  for (const cadre of entree.cadres.slice(0, 1)) {
    const garni = dessineCartePose({
      ctx,
      projecteur: brut,
      cadre,
      matriceCiel,
      optique: poseCadre,
      chemin: () => cheminCadre(ctx, brut, cadre, matriceCiel),
      couleurTexte: teintes.texte,
      couleurMasque: teintes.fond,
      couleurLimitante: teintes.cadre,
    })
    // Outline re-stroked over mask: painted earlier it would lose half.
    if (garni) {
      ctx.strokeStyle = teintes.cadre
      ctx.lineWidth = EPAISSEUR_CADRE_PX
      cheminCadre(ctx, brut, cadre, matriceCiel)
      ctx.stroke()
      ctx.lineWidth = 1
    }
  }
}
