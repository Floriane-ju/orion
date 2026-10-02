/**
 * §3.3, §4.1 — les primitives de tracé du planétarium : polylignes célestes, cadre, horizon.
 *
 * T-0193 — sorties de `dessine-ciel.ts`, qui compose l'image ; ici on ne décide de rien, on
 * TRACE. La séparation tient à ce que ces fonctions ont en commun et que la composition n'a
 * pas : elles écartent d'abord ce qui ne touche pas le champ (T-0110), puis rompent le chemin
 * dès qu'un point n'est pas projetable — une polyligne céleste qui passe derrière l'observateur
 * ne se referme jamais en travers de l'écran.
 */

import { angleDeCosDeg, applique, transpose, versVecteur, type Mat3, type Vec3 } from '../core/mat3.ts'
import { contourCadreJ2000, type Cadre } from '../core/cadre.ts'
import { pointEcran, type PointEcranMut, type Projecteur } from '../core/projection.ts'
import { horsDuChamp, type ChampVisible } from './champ-visible.ts'
import type { CoucheTraces } from '../core/constellations.ts'
import type { EntreeDessin } from './dessine-ciel.ts'
import { TOUR_DEG } from '../core/unites.ts'
import { K } from '../registry/constants.ts'
import { RAYON_MIN_ETOILE_PX, rayonEtoileCielPx } from './apparence-objets.ts'

/** Échantillonnage en azimut du cercle d'horizon. */
const PAS_AZIMUT_HORIZON_DEG = 3


/**
 * T-0110 — la calotte englobante d'un jeu de points : direction moyenne, et écart angulaire
 * maximal à cette direction.
 *
 * `null` quand la direction moyenne ne veut rien dire — un grand cercle, dont les points
 * s'annulent deux à deux. Aucune calotte ne borne alors le jeu : il ne se rejette jamais.
 */
export function calotte(points: readonly Vec3[]): ChampVisible | null {
  let sx = 0
  let sy = 0
  let sz = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
    sz += p.z
  }
  const norme = Math.hypot(sx, sy, sz)
  if (norme === 0) return null
  const centre: Vec3 = { x: sx / norme, y: sy / norme, z: sz / norme }
  let cosMin = 1
  for (const p of points) {
    const cos = centre.x * p.x + centre.y * p.y + centre.z * p.z
    if (cos < cosMin) cosMin = cos
  }
  return {
    centre,
    rayonDeg: angleDeCosDeg(cosMin),
  }
}

/**
 * T-0110 — les calottes des couches de repérage, calculées une fois.
 *
 * Frontières, figures et astérismes sont une géométrie J2000 FIXE : elle ne bouge ni au zoom
 * ni au défilement, et sa calotte non plus. Sans cet écart préalable, une vue à 15° de champ
 * projetait quand même les 1 400 sommets des 88 frontières pour n'en garder qu'une poignée —
 * le même défaut que la bande de §3.7, sur la couche d'à côté. La clé est le tableau lui-même :
 * les couches sont construites une fois au chargement du paquet et ne se réallouent pas.
 */
const calottesMemo = new WeakMap<object, readonly (ChampVisible | null)[]>()

function calottesDe<T>(
  jeu: readonly T[],
  points: (element: T) => readonly Vec3[],
): readonly (ChampVisible | null)[] {
  const connu = calottesMemo.get(jeu)
  if (connu !== undefined) return connu
  const calculees = jeu.map((element) => calotte(points(element)))
  calottesMemo.set(jeu, calculees)
  return calculees
}

/** Compose le chemin sans le peindre : au tracé du ciel de le remplir, au cadre de le découper. */
function cheminLignes(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  polylignes: readonly (readonly Vec3[])[],
  champ?: ChampVisible | null,
): void {
  const p = pointEcran()
  // La calotte n'est calculée que si l'appelant demande l'écart : le contour du cadre est
  // rebâti à chaque image, mémoriser sa calotte remplirait la table sans rien gagner.
  const calottes = champ == null ? null : calottesDe(polylignes, (ligne) => ligne)
  ctx.beginPath()
  for (let i = 0; i < polylignes.length; i++) {
    const ligne = polylignes[i]!
    const englobe = calottes?.[i]
    if (champ != null && englobe != null && horsDuChamp(champ, englobe.centre, englobe.rayonDeg)) {
      continue
    }
    let enchaine = false
    for (const point of ligne) {
      if (!projecteur.projetteEn(point.x, point.y, point.z, p)) {
        enchaine = false
        continue
      }
      if (enchaine) ctx.lineTo(p.xPx, p.yPx)
      else ctx.moveTo(p.xPx, p.yPx)
      enchaine = true
    }
  }
}

export function traceLignes(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  polylignes: readonly (readonly Vec3[])[],
  champ?: ChampVisible | null,
): void {
  cheminLignes(ctx, projecteur, polylignes, champ)
  ctx.stroke()
}

/**
 * §3.5 — chemin fermé du contour du cadre matériel, composé mais NON peint.
 *
 * Exporté pour la passe de filé (§9.3) : elle découpe le canevas sur ce chemin avant
 * d'y déposer son rendu. Le contour est calculé une seule fois, ici, avec le projecteur de la
 * scène — §3.3 interdit qu'un second code de projection existe quelque part.
 */
export function cheminCadre(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  cadre: Cadre,
  matriceCiel: Mat3,
): void {
  const contour = contourCadreJ2000(cadre, matriceCiel)
  cheminLignes(ctx, projecteur, [[...contour, contour[0]!]])
}

/**
 * T-0373 — un segment de figure n'a que deux sommets, et la portée en laisse projeter qui sont
 * loin derrière l'observateur. Quand l'arc qui les joint passe derrière la visée, son image est
 * le GRAND arc d'un cercle qui fait le tour de l'écran ; la corde droite, elle, traverse le
 * ciel. Le milieu de l'arc tranche : sur le petit arc, il tombe dans le disque dont la corde
 * est le diamètre ; sur le grand, hors de ce disque — ou nulle part, s'il frôle l'antipode.
 */
function arcDevant(
  projecteur: Projecteur,
  va: Vec3,
  vb: Vec3,
  a: PointEcranMut,
  b: PointEcranMut,
  m: PointEcranMut,
): boolean {
  const sx = va.x + vb.x
  const sy = va.y + vb.y
  const sz = va.z + vb.z
  const norme = Math.sqrt(sx * sx + sy * sy + sz * sz)
  if (norme <= Number.EPSILON) return false
  if (!projecteur.projetteEn(sx / norme, sy / norme, sz / norme, m)) return false
  const dx = m.xPx - (a.xPx + b.xPx) / 2
  const dy = m.yPx - (a.yPx + b.yPx) / 2
  const demiCordeCarree = ((a.xPx - b.xPx) ** 2 + (a.yPx - b.yPx) ** 2) / 4
  return dx * dx + dy * dy <= demiCordeCarree
}

/** T-0376 — retrait d'un trait avant l'étoile qu'il relie, proportionnel à son disque. */
export function margeFigurePx(magV: number | null): number {
  const rayon = magV === null ? RAYON_MIN_ETOILE_PX : rayonEtoileCielPx(magV)
  return rayon * K('MARGE_FIGURE_RAYONS')
}

/**
 * Le segment `a → b` raccourci de `margeA` côté `a` et `margeB` côté `b`, en
 * `[xa, ya, xb, yb]` ; `null` quand les deux étoiles sont trop proches pour qu'il en reste
 * un trait.
 */
export function retraitAuxEtoiles(
  a: PointEcranMut,
  b: PointEcranMut,
  margeA: number,
  margeB: number,
): readonly [number, number, number, number] | null {
  const dx = b.xPx - a.xPx
  const dy = b.yPx - a.yPx
  const longueur = Math.hypot(dx, dy)
  if (longueur <= margeA + margeB) return null
  const ux = dx / longueur
  const uy = dy / longueur
  return [a.xPx + ux * margeA, a.yPx + uy * margeA, b.xPx - ux * margeB, b.yPx - uy * margeB]
}

export function traceSegments(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  couches: readonly CoucheTraces[],
  champ: ChampVisible | null,
): void {
  const a = pointEcran()
  const b = pointEcran()
  const m = pointEcran()
  // L'écart se fait par CONSTELLATION, pas par segment : une figure est compacte, et sa
  // calotte rejette ses vingt segments d'un seul produit scalaire.
  const calottes =
    champ === null
      ? null
      : calottesDe(couches, (couche) =>
          couche.segments.flatMap((segment) => [segment.a, segment.b]),
        )
  ctx.beginPath()
  for (let i = 0; i < couches.length; i++) {
    const couche = couches[i]!
    const englobe = calottes?.[i]
    if (champ !== null && englobe != null && horsDuChamp(champ, englobe.centre, englobe.rayonDeg)) {
      continue
    }
    for (const segment of couche.segments) {
      if (!projecteur.projetteEn(segment.a.x, segment.a.y, segment.a.z, a)) continue
      if (!projecteur.projetteEn(segment.b.x, segment.b.y, segment.b.z, b)) continue
      if (!arcDevant(projecteur, segment.a, segment.b, a, b, m)) continue
      const bouts = retraitAuxEtoiles(a, b, margeFigurePx(segment.magA), margeFigurePx(segment.magB))
      if (bouts === null) continue
      ctx.moveTo(bouts[0], bouts[1])
      ctx.lineTo(bouts[2], bouts[3])
    }
  }
  ctx.stroke()
}

/**
 * Cercle d'horizon à 0° et points cardinaux, dans le repère du site.
 *
 * Le projecteur arrive en paramètre, et c'est le projecteur BRUT : c'est un repère de lecture,
 * pas un objet posé sur le sol. Filtré comme le reste, le cercle disparaîtrait derrière chaque
 * colline du relief (§4.1) — la crête, elle, est tracée par le sol qui la porte.
 */
export function traceHorizon(entree: EntreeDessin, couleur: string, projecteur: Projecteur): void {
  const { ctx } = entree
  const versJ2000 = transpose(entree.matriceCiel)
  const points: Vec3[] = []
  for (let az = 0; az <= TOUR_DEG; az += PAS_AZIMUT_HORIZON_DEG) {
    points.push(applique(versJ2000, versVecteur(az, 0)))
  }
  ctx.strokeStyle = couleur
  ctx.lineWidth = 1
  traceLignes(ctx, projecteur, [points])

  ctx.fillStyle = couleur
  const cardinaux: readonly (readonly [number, string])[] = [
    [0, 'N'],
    [90, 'E'],
    [180, 'S'],
    [270, 'O'],
  ]
  const p = pointEcran()
  for (const [az, nom] of cardinaux) {
    const v = applique(versJ2000, versVecteur(az, 0))
    if (projecteur.projetteEn(v.x, v.y, v.z, p)) ctx.fillText(nom, p.xPx, p.yPx)
  }
}
