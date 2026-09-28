/**
 * Frontière d'une région du ciel, cherchée EN ESPACE ÉCRAN — géométrie commune au sol (§4.1)
 * et au halo d'horizon (T-0098).
 *
 * Mailler la demi-sphère concernée paraît plus naturel, et c'est un piège : l'antipode de la
 * visée est dans le maillage dès qu'on regarde au-dessus de la frontière, et la projection l'y
 * envoie à l'infini. Deux sommets voisins tombent alors de part et d'autre du canevas, et la
 * corde qui les relie balaie l'image. Aucun plafond de distance ne clôt ce cas : il suffit que
 * l'antipode tombe entre deux mailles pour que le défaut réapparaisse, à certaines hauteurs de
 * visée seulement.
 *
 * Ici, la scène est balayée en rayons partant du centre du canevas. Sur chaque rayon, la
 * frontière est trouvée par dichotomie sur `Projecteur.inverse` et un prédicat de direction :
 * la question posée est « ce pixel est-il dedans ? », qui n'a ni singularité ni approximation.
 * Un rayon traverse la frontière au plus une fois — un parallèle de hauteur ne coupe un grand
 * cercle qu'une fois par demi-tour — et la région est donc soit le dedans de la courbe
 * obtenue, soit son dehors, selon ce qu'est le centre du canevas.
 *
 * Échantillonner en angle ÉCRAN et non en azimut est ce qui rend le bord exact : le polygone
 * est inscrit sur la courbe telle qu'elle se voit, et son écart n'est plus la corde d'un grand
 * cercle mais celle de la courbe elle-même sur un degré d'écran — de l'ordre du centième de
 * pixel.
 */

import type { Projecteur } from '../core/projection.ts'
import type { TestSol } from '../core/sol.ts'
import { TOUR_RAD } from '../core/unites.ts'

/** La portée du balayage dépasse le coin du canevas : la région ne doit pas s'arrêter dans l'image. */
const MARGE_RAYON = 1.02

export interface FinesseBalayage {
  /** Rayons du balayage. À 240, le polygone s'écarte de la courbe de moins d'un centième de pixel. */
  readonly rayons: number
  /** Dichotomies par rayon : douze passes placent la frontière au tiers de pixel près. */
  readonly dichotomies: number
}

/** Finesse du bord du sol : c'est une crête soulignée d'un trait, elle se voit au pixel près. */
export const BALAYAGE_FIN: FinesseBalayage = Object.freeze({ rayons: 240, dichotomies: 12 })

export interface FrontiereEcran {
  readonly centreX: number
  readonly centreY: number
  readonly largeur: number
  readonly hauteur: number
  /** Rayon de la frontière sur chaque rayon du balayage, en pixels depuis le centre. */
  readonly bords: Float64Array
  /** Rayons où une frontière existe : ailleurs, le polygone se referme hors du canevas. */
  readonly trouvees: Uint8Array
  /** Le centre du canevas est-il dans la région ? Il décide du sens du remplissage. */
  readonly centreDedans: boolean
  readonly rayons: number
}

const angleDe = (f: FrontiereEcran, i: number): number => (i * TOUR_RAD) / f.rayons

export function xDe(f: FrontiereEcran, i: number): number {
  return f.centreX + f.bords[i]! * Math.cos(angleDe(f, i))
}

export function yDe(f: FrontiereEcran, i: number): number {
  return f.centreY + f.bords[i]! * Math.sin(angleDe(f, i))
}

/** Cherche la frontière de la région définie par `dedans`, rayon par rayon. */
export function frontiereEcran(
  projecteur: Projecteur,
  dedans: TestSol,
  finesse: FinesseBalayage = BALAYAGE_FIN,
): FrontiereEcran {
  const largeur = projecteur.vue.largeurPx
  const hauteur = projecteur.vue.hauteurPx
  const centreX = largeur / 2
  const centreY = hauteur / 2
  const rayonMax = (Math.hypot(largeur, hauteur) / 2) * MARGE_RAYON

  const estDedans = (xPx: number, yPx: number): boolean => {
    const v = projecteur.inverse(xPx, yPx)
    return dedans(v.x, v.y, v.z)
  }
  const centreDedans = estDedans(centreX, centreY)

  const { rayons, dichotomies } = finesse
  const bords = new Float64Array(rayons + 1)
  const trouvees = new Uint8Array(rayons + 1)
  for (let i = 0; i <= rayons; i++) {
    const angle = (i * TOUR_RAD) / rayons
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    if (estDedans(centreX + rayonMax * dx, centreY + rayonMax * dy) === centreDedans) {
      // Le rayon est tout entier du même côté : le polygone se referme hors du canevas.
      bords[i] = rayonMax
      continue
    }
    let commeLeCentre = 0
    let autre = rayonMax
    for (let pas = 0; pas < dichotomies; pas++) {
      const milieu = (commeLeCentre + autre) / 2
      if (estDedans(centreX + milieu * dx, centreY + milieu * dy) === centreDedans) {
        commeLeCentre = milieu
      } else {
        autre = milieu
      }
    }
    bords[i] = (commeLeCentre + autre) / 2
    trouvees[i] = 1
  }

  return { centreX, centreY, largeur, hauteur, bords, trouvees, centreDedans, rayons }
}

/** Peint la région, opaque. */
export function remplitRegion(
  ctx: CanvasRenderingContext2D,
  f: FrontiereEcran,
  couleur: string,
): void {
  ctx.fillStyle = couleur
  ctx.beginPath()
  if (!f.centreDedans) {
    // La région est le DEHORS de la courbe : le canevas entier, percé de cette courbe. Le trou
    // est découpé à la règle `evenodd`, qui ne dépend pas du sens de parcours des deux
    // contours — avec `nonzero`, un sens inversé remplirait tout ou rien selon la visée.
    ctx.moveTo(0, 0)
    ctx.lineTo(f.largeur, 0)
    ctx.lineTo(f.largeur, f.hauteur)
    ctx.lineTo(0, f.hauteur)
    ctx.closePath()
  }
  ctx.moveTo(xDe(f, 0), yDe(f, 0))
  for (let i = 1; i <= f.rayons; i++) ctx.lineTo(xDe(f, i), yDe(f, i))
  ctx.closePath()
  ctx.fill('evenodd')
}

/**
 * Souligne la frontière du remplissage. Le trait tracé est le bord LUI-MÊME, et non une
 * seconde polyligne calculée à part : il ne peut donc pas se décoller de ce qu'il souligne.
 */
export function traceFrontiere(
  ctx: CanvasRenderingContext2D,
  f: FrontiereEcran,
  couleur: string,
): void {
  ctx.strokeStyle = couleur
  ctx.lineWidth = 1
  ctx.beginPath()
  let enchaine = false
  for (let i = 0; i <= f.rayons; i++) {
    if (f.trouvees[i] === 0) {
      enchaine = false
      continue
    }
    if (enchaine) ctx.lineTo(xDe(f, i), yDe(f, i))
    else ctx.moveTo(xDe(f, i), yDe(f, i))
    enchaine = true
  }
  ctx.stroke()
}
