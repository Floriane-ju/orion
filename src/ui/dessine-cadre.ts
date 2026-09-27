/**
 * §3.5 et §9.1 — le cadre matériel sur la scène : son contour, puis sa carte de pose.
 *
 * Les deux passes sont aux deux BOUTS de l'ordre de peinture — le contour avec les repères, la
 * carte tout en dernier parce qu'elle masque ce qu'elle recouvre — mais elles décrivent le même
 * objet et partagent leur chemin. Extraites ensemble de `dessine-ciel.ts` (T-0324), qui avait
 * atteint le plafond de taille du projet.
 *
 * Elles ne reçoivent pas la passe de rendu mais ce dont elles ont besoin : le cadre matériel ne
 * sait rien des étoiles, des labels ni des cibles cliquables, et lui passer l'accumulateur de
 * l'image lui donnerait de quoi les toucher.
 */

import type { Cadre } from '../core/cadre.ts'
import type { Mat3 } from '../core/mat3.ts'
import type { Projecteur } from '../core/projection.ts'
import type { PaletteCiel } from './couleurs.ts'
import { dessineCartePose, type OptiquePose } from './dessine-pose-cadre.ts'
import { cheminCadre } from './traces-ciel.ts'

/** Épaisseur du contour : le cadre se lit d'un coup d'œil, les tracés de repérage non. */
const EPAISSEUR_CADRE_PX = 2

export interface EntreeCadre {
  readonly ctx: CanvasRenderingContext2D
  /**
   * Projecteur BRUT, jamais celui filtré par le sol : le contour dit où pointe le matériel, y
   * compris sous l'horizon. Un cadrage qui se rompt en visant bas ne dirait plus où l'on
   * pointe (§3.5).
   */
  readonly brut: Projecteur
  readonly matriceCiel: Mat3
  readonly cadres: readonly Cadre[]
  readonly teintes: PaletteCiel
  /** `couches.cadre` : sans elle, ni le contour ni la carte ne se peignent. */
  readonly actif: boolean
  /** §9.1 / T-0142 — présente, la carte de pose garnit le cadre. */
  readonly poseCadre?: OptiquePose | undefined
}

/** §3.5 — le contour du cadre matériel. */
export function dessineContourCadre(entree: EntreeCadre): void {
  if (!entree.actif) return
  const { ctx, brut, matriceCiel, teintes } = entree
  ctx.strokeStyle = teintes.cadre
  ctx.lineWidth = EPAISSEUR_CADRE_PX
  for (const cadre of entree.cadres) {
    cheminCadre(ctx, brut, cadre, matriceCiel)
    ctx.stroke()
  }
  ctx.lineWidth = 1
}

/**
 * §9.1, T-0142 — la carte de pose, EN DERNIER : elle masque le cadre, traces, repères et noms
 * compris. Peinte avec les repères, elle laisserait passer par-dessus elle les labels retenus
 * juste au-dessus.
 */
export function dessineCarteDansCadre(entree: EntreeCadre): void {
  const { ctx, brut, matriceCiel, teintes, poseCadre } = entree
  if (poseCadre === undefined || !entree.actif) return
  for (const cadre of entree.cadres) {
    const garni = dessineCartePose({
      ctx,
      projecteur: brut,
      cadre,
      matriceCiel,
      optique: poseCadre,
      chemin: () => cheminCadre(ctx, brut, cadre, matriceCiel),
      couleurTexte: teintes.texte,
      couleurLimitante: teintes.cadre,
    })
    // Le contour se retrace sur le masque : peint plus tôt, il en perdrait la moitié.
    if (garni) {
      ctx.strokeStyle = teintes.cadre
      ctx.lineWidth = EPAISSEUR_CADRE_PX
      cheminCadre(ctx, brut, cadre, matriceCiel)
      ctx.stroke()
      ctx.lineWidth = 1
    }
  }
}
