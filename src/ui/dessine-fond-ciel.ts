/**
 * T-0098, T-0100 — les deux couches qui éclaircissent le fond de ciel en vue réaliste.
 *
 * Elles se peignent entre le `fillRect` du fond et tout le reste : sous la bande galactique,
 * sous le sol, sous les repères. Un fond peint par-dessus le repérage masque ce qui sert à
 * s'orienter (§3.7), et le relief doit recouvrir le halo quand la visée est basse (T-0094).
 *
 * DEUX GÉOMÉTRIES, PARCE QUE LES DEUX CONTRIBUTEURS N'ONT PAS LA MÊME SYMÉTRIE :
 *
 * - le halo du site est fonction de la HAUTEUR : ses courbes de niveau sont des parallèles
 *   d'altitude, qui ne sont des cercles à l'écran dans aucune des trois projections. Il se
 *   peint donc en paliers, par le balayage écran de `balayage-ecran.ts` ;
 * - le halo lunaire est fonction de la SÉPARATION à la Lune : `diffusionKS(ρ)` est radiale
 *   autour d'elle. Un dégradé radial centré sur sa position écran est la bonne géométrie, pas
 *   une approximation — au rayon près, qui est mesuré sur la projection elle-même.
 *
 * Aucune de ces deux couches ne calcule de physique : tout vient de `fond-ciel-rendu.ts`, qui
 * réemploie lui-même le modèle KS91 de `moon.ts`.
 */

import type { Mat3, Vec3 } from '../core/mat3.ts'
import { DEG, versVecteur } from '../core/mat3.ts'
import type { Projecteur } from '../core/projection.ts'
import { sousLaHauteur } from '../core/sol.ts'
import type { GeometrieLune } from '../core/moon.ts'
import { brillanceLuneNl, nanolamberts } from '../core/moon.ts'
import {
  bornesPaliersHalo,
  facteurHaloHorizon,
  hauteurRepresentative,
  sbDepuisNanolamberts,
} from '../core/fond-ciel-rendu.ts'
import { fondRealiste } from './couleurs.ts'
import { frontiereEcran, remplitRegion, type FinesseBalayage } from './balayage-ecran.ts'
import { peintLisse } from './lissage.ts'
import { DEG_PAR_HEURE } from '../core/unites.ts'
import { K } from '../registry/constants.ts'

/**
 * Balayage allégé pour les paliers du halo : un bord de palier sépare deux teintes voisines,
 * là où la crête du sol sépare le ciel du noir. À 96 rayons et 9 dichotomies, l'écart au bord
 * exact reste sous le pixel, pour un quart du coût du balayage du sol.
 * ponytail: si les paliers se voyaient, c'est le nombre de PALIERS qu'il faudrait monter
 * (PALIERS_HALO_HORIZON), pas la finesse de leur bord.
 */
const BALAYAGE_HALO: FinesseBalayage = { rayons: 96, dichotomies: 9 }

/**
 * T-0098 — le ciel s'éclaircit vers l'horizon : la couche émissive y est vue sous une
 * épaisseur croissante (van Rhijn 1921), atténuée par l'extinction du trajet.
 *
 * Le palier du zénith n'est pas peint : c'est le `fillRect` du fond, déjà à la bonne teinte.
 *
 * T-0352 — les paliers passent par le canevas réduit de `peintLisse` et s'agrandissent
 * lissés : le halo se lit en dégradé, plus en anneaux. La réduction prend DEUX paliers par
 * pixel au centre de l'écran, parce que la projection les étire vers le bord, là justement où
 * le halo est vif. Sur ce canevas, le palier du zénith est peint comme les autres : la copie
 * recouvre tout le fond. Sans `OffscreenCanvas`, les paliers se peignent directement.
 */
export function dessineHaloHorizon(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  matriceCiel: Mat3,
  sbCiel: number,
): void {
  const bornes = bornesPaliersHalo()
  const bSite = nanolamberts(sbCiel)
  const paliers = (cible: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => {
    // Du plus haut palier au plus bas : les régions s'emboîtent, la dernière peinte l'emporte.
    for (let i = bornes.length - 2; i >= 0; i--) {
      const sb = sbDepuisNanolamberts(bSite * facteurHaloHorizon(hauteurRepresentative(i)))
      const frontiere = frontiereEcran(projecteur, sousLaHauteur(bornes[i]!, matriceCiel), BALAYAGE_HALO)
      remplitRegion(cible, frontiere, fondRealiste(sb))
    }
  }
  const { largeurPx, hauteurPx, fovDeg } = projecteur.vue
  const palierPx = (bornes[0]! * largeurPx) / fovDeg
  const lisse = peintLisse(ctx, largeurPx, hauteurPx, 2 * palierPx, 'source-over', (reduite) => {
    reduite.fillStyle = fondRealiste(sbCiel)
    // Jusqu'au bord du canevas réduit, marge comprise : un pixel non peint serait transparent.
    reduite.fillRect(0, 0, largeurPx + 2 * palierPx, hauteurPx + 2 * palierPx)
    paliers(reduite)
  })
  if (!lisse) paliers(ctx)
}

export interface LuneEcran {
  /** Ascension droite de la Lune, en heures — la même que celle du corps dessiné. */
  readonly adH: number
  readonly decDeg: number
  readonly altitudeDeg: number
  readonly azimutDeg: number
  readonly anglePhaseDeg: number
  /** Demi-diamètre apparent, en degrés : la taille réelle du disque sur le ciel. */
  readonly demiDiametreDeg: number
}

/** Crans du dégradé lunaire, de la Lune jusqu'à un quart de tour. */
const CRANS_HALO_LUNE = 16
const SEPARATION_MAX_DEG = 90

/** Un vecteur unitaire orthogonal à `v`, choisi pour ne jamais dégénérer. */
export function perpendiculaire(v: Vec3): Vec3 {
  // Le produit vectoriel avec l'axe le MOINS aligné : sa norme ne descend jamais sous 1/√2.
  const axe: Vec3 =
    Math.abs(v.z) < Math.abs(v.x) ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
  const x = v.y * axe.z - v.z * axe.y
  const y = v.z * axe.x - v.x * axe.z
  const z = v.x * axe.y - v.y * axe.x
  const norme = Math.hypot(x, y, z)
  return { x: x / norme, y: y / norme, z: z / norme }
}

/**
 * T-0100 — la Lune éclaircit le ciel autour d'elle.
 *
 * ponytail: la hauteur retenue pour l'extinction du trajet est celle de la Lune, la même sur
 * tout le dégradé. Le vrai terme dépend de la hauteur de CHAQUE direction, qui n'est pas
 * constante sur un cercle de séparation ; mais le halo compte là où il est vif, c'est-à-dire
 * près de la Lune, où cette hauteur est justement la sienne. Le jour où le halo lunaire devra
 * être juste à 90° d'elle, c'est un champ 2D qu'il faudra peindre, pas un dégradé.
 *
 * ponytail: le rayon écran d'une séparation est mesuré dans UNE direction et appliqué au
 * cercle entier. C'est exact en stéréographique visée sur la Lune, approché ailleurs — un
 * dégradé de canevas ne sait pas être une conique.
 */
export function dessineHaloLune(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  sbCiel: number,
  lune: LuneEcran,
): void {
  // Règle 1 de `moon.ts` : une Lune sous l'horizon n'éclaircit rien, quelle que soit sa phase.
  if (lune.altitudeDeg <= 0) return
  const direction = versVecteur(lune.adH * DEG_PAR_HEURE, lune.decDeg)
  const centre = projecteur.projette(direction)
  if (centre === null) return
  const perp = perpendiculaire(direction)

  const geometrie = (separationDeg: number): GeometrieLune => ({
    altitudeLuneDeg: lune.altitudeDeg,
    altitudeCibleDeg: lune.altitudeDeg,
    separationDeg,
    anglePhaseDeg: lune.anglePhaseDeg,
  })

  // Rayon écran du plus grand cran : c'est lui qui fixe l'échelle du dégradé.
  const rayonDe = (separationDeg: number): number | null => {
    const a = separationDeg * DEG
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const point = projecteur.projette({
      x: cos * direction.x + sin * perp.x,
      y: cos * direction.y + sin * perp.y,
      z: cos * direction.z + sin * perp.z,
    })
    return point === null ? null : Math.hypot(point.xPx - centre.xPx, point.yPx - centre.yPx)
  }
  const rayonMax = rayonDe(SEPARATION_MAX_DEG)
  if (rayonMax === null || !(rayonMax > 0)) return

  const bSite = nanolamberts(sbCiel) * facteurHaloHorizon(lune.altitudeDeg)
  const degrade = ctx.createRadialGradient(centre.xPx, centre.yPx, 0, centre.xPx, centre.yPx, rayonMax)
  for (let k = 0; k <= CRANS_HALO_LUNE; k++) {
    const separation = (SEPARATION_MAX_DEG * k) / CRANS_HALO_LUNE
    const bLune = brillanceLuneNl(geometrie(separation)) * K('GAIN_RENDU_HALO_LUNE')
    // L'opacité est la PART de la Lune dans la brillance totale : là où elle domine, le fond
    // composé est exactement celui du modèle ; là où elle s'efface, la couche du dessous —
    // paliers d'horizon compris — reparaît intacte. Aucun seuil arbitraire n'est introduit.
    const part = bLune / (bSite + bLune)
    const couleur = fondRealiste(sbDepuisNanolamberts(bSite + bLune))
    const rvb = couleur.slice(couleur.indexOf('(') + 1, couleur.indexOf(')'))
    degrade.addColorStop(k / CRANS_HALO_LUNE, `rgb(${rvb} / ${part})`)
  }
  ctx.fillStyle = degrade
  ctx.fillRect(0, 0, projecteur.vue.largeurPx, projecteur.vue.hauteurPx)
}
