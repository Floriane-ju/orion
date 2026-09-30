/**
 * §4.1 — la vue de la carte du site : où elle regarde, à quel zoom, et quel lieu est sous un
 * pixel (T-0363).
 *
 * La vue est rangée en coordonnées Mercator normalisées — le monde fait 1 de côté — : un
 * glisser ou un zoom n'ont pas à repasser par des degrés, et l'aller-retour ne dérive pas.
 * Le zoom est continu : le pincement l'est, et les tuiles se peignent à l'échelle.
 */

import { cotePixelsMonde, lieuDePixel, pixelMonde, type Lieu } from '../core/mercator.ts'
import { TOUR_DEG, encadre, ramene } from '../core/unites.ts'
import { C } from '../registry/lieu-carte.ts'
import { nombre } from '../registry/ecriture.ts'

export interface VueCarte {
  /** Centre de la carte, dans le monde normalisé [0 ; 1[. */
  readonly x: number
  readonly y: number
  readonly zoom: number
}

const cote = (): number => C('COTE_TUILE_CARTE_PX')
const monde = (zoom: number): number => cotePixelsMonde(zoom, cote())

export function vueCentreeSur(latDeg: number, lonDeg: number, zoom: number): VueCarte {
  const p = pixelMonde(latDeg, lonDeg, 0, 1)
  return Object.freeze({ x: p.x, y: encadre(p.y, 0, 1), zoom })
}

/** La carte suit le doigt : glisser de (dx, dy) pixels déplace le centre à l'opposé. */
export function deplaceVue(vue: VueCarte, dx: number, dy: number): VueCarte {
  const m = monde(vue.zoom)
  return Object.freeze({
    x: ramene(vue.x - dx / m, 1),
    y: encadre(vue.y - dy / m, 0, 1),
    zoom: vue.zoom,
  })
}

/** Zoome de `crans` niveaux autour du pixel (px, py), qui reste sous le curseur. */
export function zoomeVue(
  vue: VueCarte,
  crans: number,
  px: number,
  py: number,
  largeur: number,
  hauteur: number,
): VueCarte {
  const zoom = encadre(vue.zoom + crans, C('ZOOM_CARTE_MIN'), C('ZOOM_CARTE_MAX'))
  const ox = px - largeur / 2
  const oy = py - hauteur / 2
  // Le point sous le curseur, avant et après : le centre bouge de leur écart.
  const ancreX = vue.x + ox / monde(vue.zoom)
  const ancreY = vue.y + oy / monde(vue.zoom)
  return Object.freeze({
    x: ramene(ancreX - ox / monde(zoom), 1),
    y: encadre(ancreY - oy / monde(zoom), 0, 1),
    zoom,
  })
}

/** Le lieu sous le pixel (px, py) d'une carte de `largeur` × `hauteur`. */
export function lieuSous(
  vue: VueCarte,
  px: number,
  py: number,
  largeur: number,
  hauteur: number,
): Lieu {
  const m = monde(vue.zoom)
  return lieuDePixel(vue.x * m + px - largeur / 2, vue.y * m + py - hauteur / 2, vue.zoom, cote())
}

/**
 * Autant de décimales qu'un pixel en distingue, pas davantage : un clic à 400 m par pixel
 * n'a pas six chiffres de précision à écrire dans le champ.
 */
export function decimalesPourZoom(zoom: number): number {
  return Math.max(0, Math.ceil(Math.log10(monde(zoom) / TOUR_DEG)))
}

/** Écrit à la française, comme on le taperait : `nombreDeTexte` relit la virgule. */
export function ecritLieu(lieu: Lieu, zoom: number): { latitude: string; longitude: string } {
  const d = decimalesPourZoom(zoom)
  return { latitude: nombre(lieu.latitudeDeg, d), longitude: nombre(lieu.longitudeDeg, d) }
}
