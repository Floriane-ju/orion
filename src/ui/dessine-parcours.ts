/**
 * §8.4 — pointage path painted on the sky itself, T-0324.
 * §8.4 promises CHEMINEMENT mode a « sequence of field thumbnails, oriented by time and place ».
 * Scène needs no thumbnail: it IS the field, already oriented, projects any equatorial pair. Only
 * the path remains to place — all this module does.
 * Rank painted with name, never alone: in the dark « 2 » can't be found on sky, « 2 · Alnitak »
 * can. Text skips §3.4 label budget — nothing to arbitrate under parcours, and a repère name
 * jumping with budget wouldn't be a repère.
 */

import type { Projecteur } from '../core/projection.ts'
import { versVecteur } from '../core/mat3.ts'
import { type PaletteCiel } from './couleurs.ts'
import { HAUTEUR_LABEL_PX, POLICE_LABEL } from './libelles-cibles.ts'
import { peintCroix } from './marqueur-objet.ts'
import type { ParcoursScene } from './scene-etat.ts'
import { SANS_NOM } from '../registry/libelles.ts'
import { DEG_PAR_HEURE, TOUR_RAD } from '../core/unites.ts'
import { horsCanevas } from './champ-visible.ts'


/** Path reads as a way to follow, cadre as an outline: one dashed, other not. */
const TIRET_PX = 8
const JOUR_TIRET_PX = 6
const EPAISSEUR_TRAIT_PX = 2
/** Wide enough to ring a fond star without hiding it: a repère, not a mask. */
const RAYON_ETAPE_PX = 7
/** Gap text↔circle, so it bites neither stroke nor designated star. */
const JOUR_TEXTE_PX = 5


/** T-0287 — an empty cell reads as a display glitch, not an anonymous star. */

interface PointParcours {
  readonly xPx: number
  readonly yPx: number
}

/**
 * Paints path over everything: segments, named steps, then cible.
 * Off-canvas points kept for the stroke (a segment with an end off-screen must leave in the right
 * direction), only their circles and names omitted. A point projection refuses (behind observer)
 * cuts the line: joining two position-less ends would draw a chord across scène.
 */
export function dessineParcours(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  parcours: ParcoursScene,
  teintes: PaletteCiel,
): void {
  const points = parcours.etapes.map((etape) =>
    projette(projecteur, etape.adH, etape.decDeg),
  )
  const cible = projette(projecteur, parcours.adCibleH, parcours.decCibleDeg)

  const ancienneFonte = ctx.font
  ctx.strokeStyle = teintes.parcours
  ctx.fillStyle = teintes.parcours
  ctx.lineWidth = EPAISSEUR_TRAIT_PX

  // --- Segments, start → cible ---
  ctx.setLineDash([TIRET_PX, JOUR_TIRET_PX])
  ctx.beginPath()
  let precedent: PointParcours | null = null
  for (const point of [...points, cible]) {
    if (point === null) {
      precedent = null
      continue
    }
    if (precedent === null) ctx.moveTo(point.xPx, point.yPx)
    else ctx.lineTo(point.xPx, point.yPx)
    precedent = point
  }
  ctx.stroke()
  ctx.setLineDash([])

  // --- Steps: circle, rank, name ---
  ctx.font = POLICE_LABEL
  const largeur = projecteur.vue.largeurPx
  const hauteur = projecteur.vue.hauteurPx
  for (const [index, point] of points.entries()) {
    if (point === null) continue
    if (horsCanevas(point, largeur, hauteur)) continue
    const etape = parcours.etapes[index]!
    ctx.beginPath()
    ctx.arc(point.xPx, point.yPx, RAYON_ETAPE_PX, 0, TOUR_RAD)
    ctx.stroke()
    const nom = etape.nom === '' ? SANS_NOM : etape.nom
    ctx.fillText(
      `${etape.ordre} · ${nom}`,
      point.xPx + RAYON_ETAPE_PX + JOUR_TEXTE_PX,
      point.yPx + HAUTEUR_LABEL_PX / 2,
    )
  }

  // --- Cible, last: where we arrive ---
  if (cible !== null) {
    peintCroix(ctx, cible.xPx, cible.yPx, teintes.parcours)
    ctx.fillText(
      parcours.designation,
      cible.xPx + RAYON_ETAPE_PX + JOUR_TEXTE_PX,
      cible.yPx + HAUTEUR_LABEL_PX / 2,
    )
  }

  ctx.lineWidth = 1
  ctx.font = ancienneFonte
}

/** Equatorial path point on screen; `null` when projection refuses it. */
function projette(
  projecteur: Projecteur,
  adH: number,
  decDeg: number,
): PointParcours | null {
  const v = versVecteur(adH * DEG_PAR_HEURE, decDeg)
  return projecteur.projette(v)
}
