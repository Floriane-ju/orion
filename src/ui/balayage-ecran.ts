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
 * Ici, l'écran est quadrillé, et chaque nœud répond à « ce pixel est-il dedans ? » par
 * `Projecteur.inverse` et un prédicat de direction — question sans singularité ni
 * approximation. Une maille dont les coins divergent est traversée par la frontière : le point
 * de traversée de chaque côté s'affine par dichotomie, et la maille se découpe en carrés
 * marchants (marching squares).
 *
 * Pourquoi un quadrillage et non des colonnes. Des colonnes verticales supposaient la crête à
 * peu près horizontale à l'écran. Visée haute sous un grand champ, l'horizon est un cercle :
 * sur ses flancs la crête est VERTICALE, une colonne la longe au lieu de la couper, et le
 * nombre de traversées change d'une colonne à la suivante sur chaque dent du relief — le bord
 * se peignait en marches. Une maille n'a pas de direction privilégiée : elle coupe la crête de
 * la même façon, quelle que soit son orientation.
 *
 * Interroger chaque nœud fin coûterait quatre fois l'ancien balayage. Le quadrillage se
 * parcourt donc d'abord en blocs grossiers ; seuls les blocs que la frontière traverse
 * descendent à la maille fine. Une région plus petite qu'un bloc, loin de toute autre
 * frontière, est perdue : c'est une pointe de relief de quelques pixels, sans dommage.
 */

import type { Projecteur } from '../core/projection.ts'
import type { TestSol } from '../core/sol.ts'

export interface FinesseBalayage {
  /** Côté d'une maille fine, en pixels : c'est la corde du bord sur une dent du relief. */
  readonly pasMaillePx: number
  /**
   * Côté d'un bloc grossier, en pixels, arrondi à un nombre entier de mailles. Deux traversées
   * plus proches que lui, entre deux coins de bloc, se confondent.
   */
  readonly pasBlocPx: number
  /** Dichotomies par traversée : de quoi placer la frontière sous le demi-pixel. */
  readonly dichotomies: number
}

/** Finesse du bord du sol : c'est une crête soulignée d'un trait, elle se voit au pixel près. */
export const BALAYAGE_FIN: FinesseBalayage = Object.freeze({
  pasMaillePx: 4,
  pasBlocPx: 16,
  dichotomies: 5,
})

type Point = readonly [number, number]

export interface FrontiereEcran {
  /** La région, en polygones qui se touchent par leurs bords sans se recouvrir. */
  readonly polygones: readonly (readonly Point[])[]
  /** La frontière, en segments : chacun traverse une maille. */
  readonly segments: readonly (readonly [Point, Point])[]
}

/** Cherche la région définie par `dedans`, maille par maille. */
export function frontiereEcran(
  projecteur: Projecteur,
  dedans: TestSol,
  finesse: FinesseBalayage = BALAYAGE_FIN,
): FrontiereEcran {
  const largeur = projecteur.vue.largeurPx
  const hauteur = projecteur.vue.hauteurPx
  const { pasMaillePx: pas, dichotomies } = finesse
  const parBloc = Math.max(1, Math.round(finesse.pasBlocPx / pas))
  const nx = Math.ceil(largeur / pas)
  const ny = Math.ceil(hauteur / pas)
  const px = (i: number): number => Math.min(i * pas, largeur)
  const py = (j: number): number => Math.min(j * pas, hauteur)
  const pixelDedans = (x: number, y: number): boolean => {
    const v = projecteur.inverse(x, y)
    return dedans(v.x, v.y, v.z)
  }

  // Nœuds interrogés à la demande : -1 inconnu, 0 dehors, 1 dedans.
  const noeuds = new Int8Array((nx + 1) * (ny + 1)).fill(-1)
  const noeud = (i: number, j: number): boolean => {
    const k = j * (nx + 1) + i
    if (noeuds[k] === -1) noeuds[k] = pixelDedans(px(i), py(j)) ? 1 : 0
    return noeuds[k] === 1
  }

  /**
   * Point où la frontière coupe l'arête du nœud (i, j) à son voisin (si, sj), cherché toujours
   * depuis le nœud de plus petit rang : une arête est partagée par deux mailles, et sa
   * traversée ne se paie qu'une fois.
   */
  const traversees = new Map<number, Point>()
  const traversee = (i: number, j: number, si: number, sj: number): Point => {
    const [ai, aj, bi, bj] = si + sj > i + j ? [i, j, si, sj] : [si, sj, i, j]
    const cle = 2 * (aj * (nx + 1) + ai) + (bj > aj ? 1 : 0)
    const connue = traversees.get(cle)
    if (connue !== undefined) return connue
    const [xa, ya, xb, yb] = [px(ai), py(aj), px(bi), py(bj)]
    const a = noeud(ai, aj)
    let t0 = 0
    let t1 = 1
    for (let d = 0; d < dichotomies; d++) {
      const t = (t0 + t1) / 2
      if (pixelDedans(xa + (xb - xa) * t, ya + (yb - ya) * t) === a) t0 = t
      else t1 = t
    }
    const t = (t0 + t1) / 2
    const point: Point = [xa + (xb - xa) * t, ya + (yb - ya) * t]
    traversees.set(cle, point)
    return point
  }

  const bx = Math.ceil(nx / parBloc)
  const by = Math.ceil(ny / parBloc)
  const borne = (b: number, n: number): number => Math.min(b * parBloc, n)
  const coinsBloc = (u: number, v: number): readonly boolean[] => [
    noeud(borne(u, nx), borne(v, ny)),
    noeud(borne(u + 1, nx), borne(v, ny)),
    noeud(borne(u + 1, nx), borne(v + 1, ny)),
    noeud(borne(u, nx), borne(v + 1, ny)),
  ]
  // Blocs à descendre en maille fine : ceux dont les coins divergent, puis, de proche en proche,
  // tout voisin qu'un nœud de l'arête commune contredit — la frontière y déborde entre deux
  // coins, et le bloc peint d'une pièce la couperait net.
  const fin = new Uint8Array(bx * by)
  const aVoir: number[] = []
  for (let v = 0; v < by; v++) {
    for (let u = 0; u < bx; u++) {
      const coins = coinsBloc(u, v)
      if (coins.some((c) => c !== coins[0])) {
        fin[v * bx + u] = 1
        aVoir.push(v * bx + u)
      }
    }
  }
  const contredit = (u: number, v: number, i0: number, j0: number, i1: number, j1: number): void => {
    if (u < 0 || u >= bx || v < 0 || v >= by || fin[v * bx + u] === 1) return
    const etat = noeud(borne(u, nx), borne(v, ny))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (noeud(i, j) === etat) continue
        fin[v * bx + u] = 1
        aVoir.push(v * bx + u)
        return
      }
    }
  }
  while (aVoir.length > 0) {
    const k = aVoir.pop()!
    const u = k % bx
    const v = (k - u) / bx
    const [i0, i1, j0, j1] = [borne(u, nx), borne(u + 1, nx), borne(v, ny), borne(v + 1, ny)]
    contredit(u, v - 1, i0, j0, i1, j0)
    contredit(u, v + 1, i0, j1, i1, j1)
    contredit(u - 1, v, i0, j0, i0, j1)
    contredit(u + 1, v, i1, j0, i1, j1)
  }

  const polygones: Point[][] = []
  const segments: [Point, Point][] = []
  // Mailles entièrement dedans : elles se peignent en bandes, rangée par rangée, plutôt qu'une
  // à une — des milliers de carrés alloués coûtaient plus que le prédicat lui-même.
  const pleines = new Uint8Array(nx * ny)
  for (let v = 0; v < by; v++) {
    for (let u = 0; u < bx; u++) {
      const affine = fin[v * bx + u] === 1
      if (!affine && !noeud(borne(u, nx), borne(v, ny))) continue
      for (let j = borne(v, ny); j < borne(v + 1, ny); j++) {
        for (let i = borne(u, nx); i < borne(u + 1, nx); i++) {
          if (affine) decoupeMaille(i, j)
          else pleines[j * nx + i] = 1
        }
      }
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (pleines[j * nx + i] !== 1) continue
      const debut = i
      while (i + 1 < nx && pleines[j * nx + i + 1] === 1) i++
      const [x0, y0, x1, y1] = [px(debut), py(j), px(i + 1), py(j + 1)]
      polygones.push([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    }
  }

  /**
   * Carrés marchants : les coins sont parcourus dans le sens horaire, et chaque changement de
   * côté y insère sa traversée. Au col — deux coins dedans en diagonale —, le parcours relie
   * les deux coins dedans : le choix est arbitraire, il n'est que le même partout.
   */
  function decoupeMaille(i: number, j: number): void {
    const cotes = [noeud(i, j), noeud(i + 1, j), noeud(i + 1, j + 1), noeud(i, j + 1)]
    const nbDedans = cotes.filter(Boolean).length
    if (nbDedans === 0) return
    if (nbDedans === 4) {
      pleines[j * nx + i] = 1
      return
    }
    const coins: readonly (readonly [number, number])[] = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]
    const polygone: Point[] = []
    const passages: Point[] = []
    coins.forEach(([ci, cj], k) => {
      const [si, sj] = coins[(k + 1) % 4]!
      const cote = cotes[k]!
      if (cote) polygone.push([px(ci), py(cj)])
      if (cote !== cotes[(k + 1) % 4]) {
        const p = traversee(ci, cj, si, sj)
        polygone.push(p)
        passages.push(p)
      }
    })
    polygones.push(polygone)
    const [a, b, c, d] = passages
    if (a === undefined || b === undefined) return
    if (c === undefined || d === undefined) {
      segments.push([a, b])
    } else if (cotes[0]) {
      // Coin haut-gauche dedans : la frontière contourne les deux coins dehors.
      segments.push([a, b], [c, d])
    } else {
      segments.push([b, c], [d, a])
    }
  }

  return { polygones, segments }
}

/** La région en polygones — ils se touchent par leurs bords : peints d'un seul `fill`, ils ne laissent aucune couture. */
export function polygonesRegion(f: FrontiereEcran): readonly (readonly Point[])[] {
  return f.polygones
}

/** Peint la région, opaque. */
export function remplitRegion(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  f: FrontiereEcran,
  couleur: string,
): void {
  ctx.fillStyle = couleur
  ctx.beginPath()
  for (const polygone of f.polygones) {
    const [premier, ...suite] = polygone
    if (premier === undefined) continue
    ctx.moveTo(premier[0], premier[1])
    for (const [x, y] of suite) ctx.lineTo(x, y)
    ctx.closePath()
  }
  ctx.fill('evenodd')
}
