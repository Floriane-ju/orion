/**
 * T-0397 — le tracé des courbes de niveau sur le sol : seules celles du champ se projettent,
 * et chaque polyligne est UN sous-chemin.
 *
 * Les courbes sont synthétiques : des azimuts et des hauteurs choisis pour tomber dedans ou
 * hors du champ, pas un relief recopié.
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

/** Les ordres du dernier chemin tracé à cette teinte : le sol, lui, se remplit. */
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
    // Une courbe de niveau lissée joint ses points par des arcs : chacun compte comme un trait.
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

/** Une polyligne au ras du sol, d'un azimut à l'autre, au degré. */
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
      // La crête se projette aussi : seules comptent les projections des courbes.
      if (ctx.strokeStyle === 'courbes') projections++
      return brut.projetteEn(...args)
    },
  }
  // Le sol se peint d'abord, avec ses propres projections : seules celles des courbes comptent.
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
    // Plein nord, dans le dos d'une visée plein sud : la ligne s'écarte avant toute projection.
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
    // Un sous-chemin par secteur de crête dans le champ, et au moins un segment par degré.
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
    // Les silhouettes d'abord, la crête ensuite.
    expect(traces()[0]).toEqual({ moveTo: 1, lineTo: 20 })
  })
})
