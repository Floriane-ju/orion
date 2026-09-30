/**
 * §4.1, §12.5 — ce que la carte du site peint : le fond embarqué, les tuiles OSM par-dessus
 * quand elles sont là, le site saisi (T-0363, T-0364).
 *
 * Le fond est peint à chaque image, même sous des tuiles : une tuile qui manque — réseau
 * coupé, service lent — laisse voir les côtes au lieu d'un trou. Les noms de villes du fond ne
 * se peignent que sans tuile : celles d'OSM portent déjà les leurs.
 *
 * Teintes : celles de la scène (`palette`), aucune nouvelle. Le fond de carte se lit comme le
 * sol et l'horizon du planétarium, les frontières comme ses frontières, l'épingle du site comme
 * le parcours de pointage — ce qu'on vient de poser — cerclée du fond.
 */

import { cotePixelsMonde, pixelMonde, type Lieu } from '../core/mercator.ts'
import type { FondCarte } from '../data/fond-carte.ts'
import { tuileVisible } from '../data/tuiles-carte.ts'
import { C } from '../registry/lieu-carte.ts'
import { encadre } from '../core/unites.ts'
import { palette } from './couleurs.ts'
import { POLICE_LABEL } from './libelles-cibles.ts'
import type { VueCarte } from './choix-lieu-calcul.ts'

/** L'épingle du site : sa pointe est le lieu, sa tête se lit au-dessus des tuiles. */
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
  /** La tuile si elle est prête ; sinon null, et sa demande est partie. */
  readonly tuile: (z: number, x: number, y: number) => CanvasImageSource | null
  readonly site: Lieu | null
  readonly modeNuit: boolean
}

/** Peint la carte ; rend le nombre de tuiles peintes, qui décide du crédit OSM. */
export function dessineCarteLieu(ctx: CanvasRenderingContext2D, e: EntreeCarteLieu): number {
  const teintes = palette(e.modeNuit)
  const m = cotePixelsMonde(e.vue.zoom, C('COTE_TUILE_CARTE_PX'))
  const ox = e.largeur / 2 - e.vue.x * m
  const oy = e.hauteur / 2 - e.vue.y * m
  // La carte se répète en largeur : autant de copies du monde que la carte en montre.
  const copies: number[] = []
  for (let k = Math.ceil((-ox - m) / m); k <= Math.floor((e.largeur - ox) / m); k++) copies.push(k)

  ctx.fillStyle = teintes.fond
  ctx.fillRect(0, 0, e.largeur, e.hauteur)

  // ponytail: tous les tracés à chaque image (80 000 points) ; élaguer par boîte si le glisser saccade.
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
      // Arrondi au pixel : sans lui, un liseré du fond passe entre deux tuiles voisines.
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
 * T-0363 — une épingle plutôt qu'un réticule : sur une tuile OSM chargée de routes et de noms,
 * une croix fine s'y perd. La pointe touche le lieu ; un liseré au fond de carte la détache de
 * ce qu'elle recouvre, le jour comme la nuit.
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
  // Les deux tangentes de la pointe à la tête : l'angle au centre entre la pointe et chacune.
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
