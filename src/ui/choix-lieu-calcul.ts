/**
 * §4.1 — site map view: where it looks, zoom, lieu under a pixel (T-0363).
 * View in normalised Mercator coords (world = 1 side): drag/zoom skip degrees, round trip doesn't
 * drift. Zoom continuous (pinch is; tiles painted scaled).
 */

import { cotePixelsMonde, lieuDePixel, pixelMonde, type Lieu } from '../core/mercator.ts'
import { TOUR_DEG, encadre, ramene } from '../core/unites.ts'
import { C } from '../registry/lieu-carte.ts'
import { nombre } from '../registry/ecriture.ts'

export interface VueCarte {
  /** Map centre, in normalised world [0 ; 1[. */
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

/** Map follows the finger: dragging (dx, dy) px moves centre opposite. */
export function deplaceVue(vue: VueCarte, dx: number, dy: number): VueCarte {
  const m = monde(vue.zoom)
  return Object.freeze({
    x: ramene(vue.x - dx / m, 1),
    y: encadre(vue.y - dy / m, 0, 1),
    zoom: vue.zoom,
  })
}

/** Zooms `crans` levels around pixel (px, py), which stays under cursor. */
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
  // Point under cursor before and after: centre moves by their gap.
  const ancreX = vue.x + ox / monde(vue.zoom)
  const ancreY = vue.y + oy / monde(vue.zoom)
  return Object.freeze({
    x: ramene(ancreX - ox / monde(zoom), 1),
    y: encadre(ancreY - oy / monde(zoom), 0, 1),
    zoom,
  })
}

/** Lieu under pixel (px, py) of a `largeur` × `hauteur` map. */
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

/** Decimals a pixel distinguishes: a click at 400 m/px has no six-digit precision. */
export function decimalesPourZoom(zoom: number): number {
  return Math.max(0, Math.ceil(Math.log10(monde(zoom) / TOUR_DEG)))
}

/** French notation, as typed: `nombreDeTexte` rereads the comma. */
export function ecritLieu(lieu: Lieu, zoom: number): { latitude: string; longitude: string } {
  const d = decimalesPourZoom(zoom)
  return { latitude: nombre(lieu.latitudeDeg, d), longitude: nombre(lieu.longitudeDeg, d) }
}
