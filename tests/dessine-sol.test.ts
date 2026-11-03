/**
 * T-0397 — contour lines drawn on sol: only those in field project, each polyline = ONE
 * subpath. Synthetic curves: azimuths/heights chosen inside/outside field, no copied relief.
 */

import { describe, expect, it } from 'vitest'
import { IDENTITE } from '../src/core/mat3.ts'
import { projecteur, type Vue } from '../src/core/projection.ts'
import { masquePlat } from '../src/core/site.ts'
import { dessineSol } from '../src/ui/dessine-sol.ts'

const VUE: Vue = {
  mode: 'MODE_PLANETARIUM',
  fovDeg: 60,
  largeurPx: 1920,
  hauteurPx: 1080,
  azimutDeg: 180,
  hauteurDeg: 0,
  rotationDeg: 0,
}

/** Orders of the last path drawn in this hue: the sol itself is filled. */
function contexte(teinte = 'courbes'): {
  ctx: CanvasRenderingContext2D
  trace: () => { moveTo: number; lineTo: number }
  traces: () => readonly { moveTo: number; lineTo: number }[]
} {
  let courant = { moveTo: 0, lineTo: 0 }
  let trace = { moveTo: 0, lineTo: 0 }
  const traces: { moveTo: number; lineTo: number }[] = []
  const rien = (): void => undefined
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    beginPath: () => {
      courant = { moveTo: 0, lineTo: 0 }
    },
    moveTo: () => {
      courant.moveTo++
    },
    lineTo: () => {
      courant.lineTo++
    },
    // Smoothed contour joins points by arcs: each counts as a stroke.
    quadraticCurveTo: () => {
      courant.lineTo++
    },
    closePath: rien,
    fill: rien,
    stroke: () => {
      if (ctx.strokeStyle !== teinte) return
      trace = courant
      traces.push(courant)
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, trace: () => trace, traces: () => traces }
}

/** Polyline hugging the ground, azimuth to azimuth, per degree. */
function ligne(deDeg: number, aDeg: number): number[] {
  const points: number[] = []
  for (let az = deDeg; az <= aDeg; az++) points.push((az + 360) % 360, -1)
  return points
}

const TEINTES = { sol: 'sol', courbes: 'courbes', bords: 'bords' }

function trace(...lignes: number[][]): { moveTo: number; lineTo: number; projections: number } {
  const courbesDeg = Float32Array.from(
    lignes.flatMap((l, i) => (i === 0 ? l : [Number.NaN, Number.NaN, ...l])),
  )
  const { ctx, trace } = contexte()
  const brut = projecteur(VUE, IDENTITE)
  let projections = 0
  const compte = {
    ...brut,
    projetteEn: (...args: Parameters<typeof brut.projetteEn>) => {
      // Ridge projects too: only the curves' projections count.
      if (ctx.strokeStyle === 'courbes') projections++
      return brut.projetteEn(...args)
    },
  }
  // Sol painted first with its own projections: only the curves' count.
  const masque = { ...masquePlat(), courbesDeg }
  dessineSol(ctx, compte, IDENTITE, masque, TEINTES)
  projections = 0
  dessineSol(ctx, compte, IDENTITE, masque, TEINTES)
  return { ...trace(), projections }
}

describe('courbes de niveau tracées sur le sol (T-0397)', () => {
  it('trace chaque polyligne d’un seul trait', () => {
    expect(trace(ligne(170, 190))).toMatchObject({ moveTo: 1, lineTo: 20 })
  })

  it('lève le crayon entre deux polylignes', () => {
    expect(trace(ligne(165, 175), ligne(185, 195))).toMatchObject({ moveTo: 2, lineTo: 20 })
  })

  it('ne projette pas une courbe hors du champ', () => {
    // Due north, behind a due-south aim: line leaves before any projection.
    expect(trace(ligne(170, 190), ligne(-10, 10))).toEqual({
      moveTo: 1,
      lineTo: 20,
      projections: 21,
    })
  })
})

describe('crête et silhouettes tracées sur le sol (T-0438)', () => {
  it('souligne le bord du sol de traits continus, sans le hacher en segments d’écran', () => {
    const { ctx, trace } = contexte('bords')
    dessineSol(ctx, projecteur(VUE, IDENTITE), IDENTITE, masquePlat(), TEINTES)
    // One subpath per ridge sector in the field, at least one segment per degree.
    expect(trace().moveTo).toBeLessThanOrEqual(Math.ceil(VUE.fovDeg / 10) + 2)
    expect(trace().lineTo).toBeGreaterThanOrEqual(VUE.fovDeg)
  })

  it('trace les silhouettes à la teinte des bords', () => {
    const haute = { ...VUE, hauteurDeg: 60 }
    const silhouettesDeg = Float32Array.from(
      ligne(170, 190).map((v, i) => (i % 2 === 1 ? haute.hauteurDeg : v)),
    )
    const { ctx, traces } = contexte('bords')
    dessineSol(ctx, projecteur(haute, IDENTITE), IDENTITE, { ...masquePlat(), silhouettesDeg }, TEINTES)
    // Silhouettes first, ridge after.
    expect(traces()[0]).toEqual({ moveTo: 1, lineTo: 20 })
  })
})
