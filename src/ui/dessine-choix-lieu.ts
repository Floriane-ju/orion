/**
 * §4.1, §12.5 — site map paint: embedded fond, OSM tiles over it when present, saisi site
 * (T-0363, T-0364).
 * Fond painted every frame even under tiles: missing tile (offline, slow) shows coasts, not a hole.
 * Fond city names only without tiles (OSM ones carry their own).
 * Teintes: scène `palette`, none new. Map fond = planétarium sol/horizon, frontières = its
 * frontières, site pin = pointage parcours (just-placed thing), ringed with fond.
 */

import { cotePixelsMonde, pixelMonde, type Lieu } from '../core/mercator.ts'
import type { FondCarte } from '../data/fond-carte.ts'
import { tuileVisible } from '../data/tuiles-carte.ts'
import { C } from '../registry/lieu-carte.ts'
import { encadre } from '../core/unites.ts'
import { palette } from './couleurs.ts'
import { POLICE_LABEL } from './libelles-cibles.ts'
import type { VueCarte } from './choix-lieu-calcul.ts'

/** Site pin: tip = lieu, head readable above tiles. */
const HAUT_EPINGLE_PX = 24
const RAYON_TETE_PX = 8
const RAYON_OEIL_PX = 3
const EPAISSEUR_LISERE_PX = 2
const RAYON_VILLE_PX = 2
const JOUR_NOM_VILLE_PX = 5

export interface EntreeCarteLieu {
  readonly largeur: number
  readonly hauteur: number
  readonly vue: VueCarte
  readonly fond: FondCarte
  /** Tile if ready; else null, request already sent. */
  readonly tuile: (z: number, x: number, y: number) => CanvasImageSource | null
  readonly site: Lieu | null
  readonly modeNuit: boolean
}

/** Paints map; returns painted tiles count (decides OSM credit). */
export function dessineCarteLieu(ctx: CanvasRenderingContext2D, e: EntreeCarteLieu): number {
  const teintes = palette(e.modeNuit)
  const m = cotePixelsMonde(e.vue.zoom, C('COTE_TUILE_CARTE_PX'))
  const ox = e.largeur / 2 - e.vue.x * m
  const oy = e.hauteur / 2 - e.vue.y * m
  // Map repeats in width: as many world copies as shown.
  const copies: number[] = []
  for (let k = Math.ceil((-ox - m) / m); k <= Math.floor((e.largeur - ox) / m); k++) copies.push(k)

  ctx.fillStyle = teintes.fond
  ctx.fillRect(0, 0, e.largeur, e.hauteur)

  // ponytail: all paths every frame (80,000 points); cull by box if drag stutters.
  const trace = (traces: readonly Float64Array[]) => {
    ctx.beginPath()
    for (const k of copies) {
      const dx = ox + k * m
      for (const t of traces) {
        ctx.moveTo((t[0] ?? 0) * m + dx, (t[1] ?? 0) * m + oy)
        for (let i = 2; i < t.length; i += 2) ctx.lineTo((t[i] ?? 0) * m + dx, (t[i + 1] ?? 0) * m + oy)
      }
    }
  }
  trace(e.fond.terres)
  ctx.fillStyle = teintes.sol
  ctx.fill('evenodd')
  ctx.strokeStyle = teintes.horizon
  ctx.lineWidth = 1
  ctx.stroke()
  trace(e.fond.frontieres)
  ctx.strokeStyle = teintes.frontieres
  ctx.stroke()

  const peintes = dessineTuiles(ctx, e, ox, oy)
  if (peintes === 0) dessineVilles(ctx, e, m, ox, oy, copies, teintes.texte)
  if (e.site !== null) dessineSite(ctx, e.site, m, ox, oy, copies, teintes.parcours, teintes.fond)
  return peintes
}

function dessineTuiles(
  ctx: CanvasRenderingContext2D,
  e: EntreeCarteLieu,
  ox: number,
  oy: number,
): number {
  const z = encadre(Math.round(e.vue.zoom), C('ZOOM_CARTE_MIN'), C('ZOOM_CARTE_MAX'))
  const s = C('COTE_TUILE_CARTE_PX') * 2 ** (e.vue.zoom - z)
  let peintes = 0
  for (let ty = Math.floor(-oy / s); ty * s + oy < e.hauteur; ty++) {
    for (let tx = Math.floor(-ox / s); tx * s + ox < e.largeur; tx++) {
      const t = tuileVisible(z, tx, ty)
      const image = t === null ? null : e.tuile(z, t.x, t.y)
      if (image === null) continue
      // Pixel-rounded: else a fond seam shows between neighbour tiles.
      const x0 = Math.floor(tx * s + ox)
      const y0 = Math.floor(ty * s + oy)
      ctx.drawImage(image, x0, y0, Math.ceil((tx + 1) * s + ox) - x0, Math.ceil((ty + 1) * s + oy) - y0)
      peintes++
    }
  }
  return peintes
}

function dessineVilles(
  ctx: CanvasRenderingContext2D,
  e: EntreeCarteLieu,
  m: number,
  ox: number,
  oy: number,
  copies: readonly number[],
  teinte: string,
): void {
  ctx.fillStyle = teinte
  ctx.font = POLICE_LABEL
  ctx.textBaseline = 'middle'
  for (const v of e.fond.villes) {
    if (v.zoomMin > e.vue.zoom) continue
    for (const k of copies) {
      const x = v.x * m + ox + k * m
      const y = v.y * m + oy
      if (x < 0 || x > e.largeur || y < 0 || y > e.hauteur) continue
      ctx.beginPath()
      ctx.arc(x, y, RAYON_VILLE_PX, 0, 2 * Math.PI)
      ctx.fill()
      ctx.fillText(v.nom, x + JOUR_NOM_VILLE_PX, y)
    }
  }
}

/**
 * T-0363 — pin not reticle: thin cross lost on busy OSM tile. Tip touches lieu; fond lisere
 * detaches it, day and night.
 */
function dessineSite(
  ctx: CanvasRenderingContext2D,
  site: Lieu,
  m: number,
  ox: number,
  oy: number,
  copies: readonly number[],
  teinte: string,
  lisere: string,
): void {
  const p = pixelMonde(site.latitudeDeg, site.longitudeDeg, 0, 1)
  // Two tangents tip→head: angle at centre between tip and each.
  const ecart = Math.acos(RAYON_TETE_PX / (HAUT_EPINGLE_PX - RAYON_TETE_PX))
  const bas = Math.PI / 2
  for (const k of copies) {
    const x = p.x * m + ox + k * m
    const y = p.y * m + oy
    const cy = y - HAUT_EPINGLE_PX + RAYON_TETE_PX
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.arc(x, cy, RAYON_TETE_PX, bas + ecart, bas - ecart)
    ctx.closePath()
    ctx.fillStyle = teinte
    ctx.fill()
    ctx.lineWidth = EPAISSEUR_LISERE_PX
    ctx.strokeStyle = lisere
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, cy, RAYON_OEIL_PX, 0, 2 * Math.PI)
    ctx.fillStyle = lisere
    ctx.fill()
  }
  ctx.lineWidth = 1
}
