/**
 * §3.1 — la Lune peinte dans sa phase, comme le disque de la frise de nuit (`CarteNuit`) : la
 * part éclairée dans la teinte du texte ; la part sombre ne se peint pas, elle est du ciel.
 *
 * Le limbe éclairé regarde le Soleil À L'ÉCRAN, pas une gauche ou une droite fixées par
 * l'hémisphère comme sur la frise : sur une carte que l'on tourne, que l'on renverse et que l'on
 * roule, c'est la seule orientation qui reste juste. L'angle de phase vient d'`astronomy-engine`
 * (`etatLune`), le même calcul que la fraction éclairée de la frise.
 */
import { K } from '../registry/constants.ts'
import { TOUR_RAD } from '../core/unites.ts'
import { DEG, type Vec3 } from '../core/mat3.ts'
import { pointEcran, type PointEcran, type Projecteur } from '../core/projection.ts'
import type { PaletteCiel } from './couleurs.ts'
import { perpendiculaire } from './dessine-fond-ciel.ts'
import { RAYON_LUNE_PX } from './libelles-cibles.ts'

/** Pas, en radians, vers le Soleil le long du ciel : assez court pour rester près du disque. */
const PAS_VERS_SOLEIL_RAD = 1e-3
const QUART_TOUR_RAD = TOUR_RAD / 4

/**
 * Direction à l'écran, en radians, du Soleil vu depuis la Lune : le point projeté est un pas
 * vers le Soleil sur le grand cercle qui les joint. Le Soleil lui-même peut tomber derrière
 * l'observateur, hors du domaine de la projection ; ce pas-là, jamais.
 */
export function angleLimbeEclaireRad(
  projecteur: Projecteur,
  lune: Vec3,
  soleil: Vec3,
  centre: PointEcran,
): number | null {
  const d = soleil.x * lune.x + soleil.y * lune.y + soleil.z * lune.z
  const tx = soleil.x - d * lune.x
  const ty = soleil.y - d * lune.y
  const tz = soleil.z - d * lune.z
  const norme = Math.hypot(tx, ty, tz)
  // Conjonction ou opposition exactes : aucun côté n'est plus éclairé que l'autre.
  if (norme === 0) return null
  const s = PAS_VERS_SOLEIL_RAD / norme
  const q = pointEcran()
  if (!projecteur.projetteEn(lune.x + s * tx, lune.y + s * ty, lune.z + s * tz, q)) return null
  return Math.atan2(q.yPx - centre.yPx, q.xPx - centre.xPx)
}

/**
 * Rayon peint : la taille réelle du disque sur le ciel dès que le zoom la rend plus grande que
 * `RAYON_LUNE_PX`, ce plancher sinon — au champ large, un demi-degré ferait un point où la
 * phase ne se lit plus. Le rayon se MESURE en projetant un point du limbe, comme le marqueur
 * d'un objet : le facteur d'échelle de la projection varie à travers le champ.
 */
export function rayonLunePx(
  projecteur: Projecteur,
  lune: Vec3,
  centre: PointEcran,
  demiDiametreDeg: number | null,
): number {
  if (demiDiametreDeg === null) return RAYON_LUNE_PX
  const perp = perpendiculaire(lune)
  const cos = Math.cos(demiDiametreDeg * DEG)
  const sin = Math.sin(demiDiametreDeg * DEG)
  const q = pointEcran()
  const limbe = projecteur.projetteEn(
    lune.x * cos + perp.x * sin,
    lune.y * cos + perp.y * sin,
    lune.z * cos + perp.z * sin,
    q,
  )
  if (!limbe) return RAYON_LUNE_PX
  return Math.max(RAYON_LUNE_PX, Math.hypot(q.xPx - centre.xPx, q.yPx - centre.yPx))
}

/**
 * Ajoute au chemin courant la part éclairée d'un disque de centre (x, y), limbe éclairé vers
 * `angleRad`. Coordonnées absolues, sans transformation du contexte : plusieurs disques se
 * composent ainsi en un seul chemin, rempli d'un coup (T-0402).
 *
 * Le terminateur est une demi-ellipse de demi-largeur r·|cos φ| : côté sombre quand la Lune
 * est gibbeuse (cos φ > 0), côté éclairé quand elle est en croissant. Sans angle de phase, le
 * disque est plein : mieux vaut une Lune sans phase qu'une phase inventée.
 */
function cheminPhase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  angleRad: number | null,
  anglePhaseDeg: number | null,
): void {
  const a = angleRad ?? 0
  ctx.moveTo(x + r * Math.cos(a - QUART_TOUR_RAD), y + r * Math.sin(a - QUART_TOUR_RAD))
  if (anglePhaseDeg === null) {
    ctx.arc(x, y, r, a - QUART_TOUR_RAD, a - QUART_TOUR_RAD + TOUR_RAD)
    return
  }
  const rx = r * Math.abs(Math.cos(anglePhaseDeg * DEG))
  const croissant = Math.cos(anglePhaseDeg * DEG) < 0
  ctx.arc(x, y, r, a - QUART_TOUR_RAD, a + QUART_TOUR_RAD)
  ctx.ellipse(x, y, rx, r, a, QUART_TOUR_RAD, -QUART_TOUR_RAD, croissant)
  ctx.closePath()
}

/**
 * Peint le disque de rayon `r`, limbe éclairé vers `angleRad`.
 *
 * Seule la part éclairée se peint. La part sombre a la couleur du ciel DEVANT elle — la
 * lumière diffusée par l'atmosphère est entre la Lune et nous —, et `teintes.fond` n'est que
 * celle du zénith : peinte, elle tranchait sur un ciel relevé par le halo ou le crépuscule,
 * jusqu'à un liseré sombre au limbe d'une Lune presque pleine.
 */
export function dessineLune(
  ctx: CanvasRenderingContext2D,
  centre: PointEcran,
  r: number,
  angleRad: number | null,
  anglePhaseDeg: number | null,
  teintes: PaletteCiel,
): void {
  ctx.fillStyle = teintes.lune
  ctx.beginPath()
  cheminPhase(ctx, centre.xPx, centre.yPx, r, angleRad, anglePhaseDeg)
  ctx.fill()
}

/**
 * T-0399 — la trace de la Lune sur une pose à monture coupée. La Lune sature le capteur en une
 * fraction de seconde ; aucune pose ne l'estompe, contrairement à une étoile dont la trace
 * s'éteint avec la pose par pixel.
 *
 * T-0402 — la trace est le disque en phase ÉTALÉ le long du trajet : la forme de la Lune
 * répétée tous les `PAS_ETALEMENT_LUNE_RAYONS` rayons, en un seul chemin. Il n'y a plus de
 * seuil : la bande pleine ne se peignait qu'au-delà du rayon, et à grand champ quatre minutes
 * de filé laissaient une Lune immobile. Étalée, elle s'allonge dès le premier pixel, et un
 * croissant laisse une trace de croissant, pas une bande de la largeur du disque.
 *
 * Le trajet se rompt sur tout point que le projecteur refuse — sous le relief quand il est
 * filtré du sol, derrière l'observateur sinon. Retourne la longueur projetée, en pixels.
 */
export function dessineTrajetLune(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  points: readonly Vec3[],
  r: number,
  soleil: Vec3 | null,
  anglePhaseDeg: number | null,
  teinte: string,
): number {
  const q = pointEcran()
  const pas = r * K('PAS_ETALEMENT_LUNE_RAYONS')
  ctx.beginPath()
  let longueur = 0
  let precedent: { readonly xPx: number; readonly yPx: number; readonly angle: number | null } | null =
    null
  for (const v of points) {
    if (!projecteur.projetteEn(v.x, v.y, v.z, q)) {
      precedent = null
      continue
    }
    const x = q.xPx
    const y = q.yPx
    // L'orientation du limbe tourne à l'écran pendant un long filé : relue à chaque point du
    // trajet, tenue sur le segment qui suit.
    const angle = soleil === null ? null : angleLimbeEclaireRad(projecteur, v, soleil, { xPx: x, yPx: y })
    if (precedent === null) cheminPhase(ctx, x, y, r, angle, anglePhaseDeg)
    else {
      const dx = x - precedent.xPx
      const dy = y - precedent.yPx
      const segment = Math.hypot(dx, dy)
      const n = Math.ceil(segment / pas)
      for (let i = 1; i <= n; i++) {
        cheminPhase(ctx, precedent.xPx + (dx * i) / n, precedent.yPx + (dy * i) / n, r, precedent.angle, anglePhaseDeg)
      }
      longueur += segment
    }
    precedent = { xPx: x, yPx: y, angle }
  }
  ctx.fillStyle = teinte
  ctx.fill()
  return longueur
}
