/**
 * §8.4 — le trajet de pointage peint à même le ciel, T-0324.
 *
 * §8.4 promet au mode CHEMINEMENT une « séquence de vignettes de champ, orientées selon l'heure
 * et le lieu ». La scène en est la version qui n'a besoin d'aucune vignette : elle EST déjà le
 * champ, orienté par l'heure et le lieu, et elle sait projeter n'importe quel couple équatorial.
 * Reste à y poser le trajet — c'est tout ce que fait ce module.
 *
 * Le rang est peint avec le nom, jamais seul : dans le noir, « 2 » ne se retrouve pas au ciel,
 * « 2 · Alnitak » si. Et ce texte ne passe PAS par le budget de labels de §3.4 — sous le
 * parcours il n'y a rien d'autre à arbitrer, et un nom de repère qui saute au gré du budget ne
 * serait plus un repère.
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


/** Le trajet se lit comme un chemin à suivre, le cadre comme un contour : l'un tirète, l'autre non. */
const TIRET_PX = 8
const JOUR_TIRET_PX = 6
const EPAISSEUR_TRAIT_PX = 2
/** Assez large pour cercler une étoile du fond sans la cacher : c'est un repère, pas un masque. */
const RAYON_ETAPE_PX = 7
/** Écart du texte au cercle, pour qu'il ne morde ni le trait ni l'étoile qu'il désigne. */
const JOUR_TEXTE_PX = 5


/** T-0287 — une cellule vide se lit comme un défaut d'affichage, pas comme une étoile anonyme. */

interface PointParcours {
  readonly xPx: number
  readonly yPx: number
}

/**
 * Peint le trajet par-dessus tout le reste : segments, étapes nommées, puis la cible.
 *
 * Les points hors canevas sont gardés pour le tracé — un segment dont une extrémité sort de
 * l'écran doit quand même partir dans la bonne direction — et seuls leurs cercles et leurs noms
 * sont omis. Un point que la projection refuse (derrière l'observateur) coupe le trait : relier
 * deux extrémités qui n'ont pas de position dessinerait une corde à travers la scène.
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

  // --- Les segments, du départ à la cible ----------------------------------
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

  // --- Les étapes : un cercle, son rang et son nom --------------------------
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

  // --- La cible, en dernier : c'est là qu'on arrive -------------------------
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

/** Un point équatorial du trajet à l'écran, `null` quand la projection le refuse. */
function projette(
  projecteur: Projecteur,
  adH: number,
  decDeg: number,
): PointParcours | null {
  const v = versVecteur(adH * DEG_PAR_HEURE, decDeg)
  return projecteur.projette(v)
}
