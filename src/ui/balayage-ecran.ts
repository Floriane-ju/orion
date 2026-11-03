/**
 * Sky region boundary searched IN SCREEN SPACE — geometry shared by ground (§4.1) and horizon halo
 * (T-0098).
 * Meshing the half-sphere is a trap: aim's antipode enters the mesh when looking above the
 * boundary, projection sends it to infinity; neighbouring vertices land on both sides of canvas
 * and the chord between sweeps the image. No distance cap closes it: antipode between two meshes
 * revives it at some aim heights only.
 * Here the screen is gridded, each node answers "is this pixel inside?" via `Projecteur.inverse`
 * + a direction predicate: no singularity, no approximation. Cell with diverging corners = crossed
 * by boundary: crossing on each side refined by dichotomy, cell cut by marching squares.
 * Why grid, not columns: columns assumed a roughly horizontal ridge on screen. High aim under wide
 * field, horizon is a circle: on its flanks ridge is VERTICAL, a column runs along it instead of
 * cutting; crossing count changes column to column at each relief tooth → stepped edge. A cell has
 * no privileged direction.
 * Querying every fine node cost 4× the old sweep: grid walked in coarse blocks first, only blocks
 * the boundary crosses descend to fine cells. A region smaller than a block, far from any other
 * boundary, is lost: few-pixel relief spike, harmless.
 */

import type { Projecteur } from '../core/projection.ts'
import type { TestSol } from '../core/sol.ts'

export interface FinesseBalayage {
  /** Fine cell side, px: the edge chord over a relief tooth. */
  readonly pasMaillePx: number
  /** Coarse block side, px, whole cells; crossings closer than it (between 2 corners) merge. */
  readonly pasBlocPx: number
  /** Dichotomies per crossing: places boundary under half a pixel. */
  readonly dichotomies: number
}

/** Ground edge fineness: a ridge underlined by a stroke, seen to the pixel. */
export const BALAYAGE_FIN: FinesseBalayage = Object.freeze({
  pasMaillePx: 4,
  pasBlocPx: 16,
  dichotomies: 5,
})

type Point = readonly [number, number]

export interface FrontiereEcran {
  /** Region, as polygons touching by edges without overlap. */
  readonly polygones: readonly (readonly Point[])[]
  /** Boundary, as segments: each crosses one cell. */
  readonly segments: readonly (readonly [Point, Point])[]
}

/** Searches region defined by `dedans`, cell by cell. */
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

  // Nodes queried on demand: -1 unknown, 0 outside, 1 inside.
  const noeuds = new Int8Array((nx + 1) * (ny + 1)).fill(-1)
  const noeud = (i: number, j: number): boolean => {
    const k = j * (nx + 1) + i
    if (noeuds[k] === -1) noeuds[k] = pixelDedans(px(i), py(j)) ? 1 : 0
    return noeuds[k] === 1
  }

  /**
   * Boundary point on edge from node (i, j) to neighbour (si, sj), always searched from the
   * lower-rank node: edge shared by two cells, crossing paid once.
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
  // Blocks to descend to fine cells: diverging corners, then step by step any neighbour a node of
  // the shared edge contradicts (boundary bulges between two corners; a whole painted block would
  // cut it).
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
  // Fully-inside cells: painted as row bands, not one by one (thousands of allocated squares cost
  // more than the predicate).
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
   * Marching squares: corners walked clockwise, each side change inserts its crossing. Saddle (two
   * diagonal inside corners): walk links the inside corners; arbitrary, only consistent everywhere.
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
      // Top-left corner inside: boundary goes around the two outside corners.
      segments.push([a, b], [c, d])
    } else {
      segments.push([b, c], [d, a])
    }
  }

  return { polygones, segments }
}

/** Paints the region, opaque. */
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
