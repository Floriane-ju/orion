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

/** Les ordres du dernier chemin tracé — celui des courbes : le sol, lui, se remplit. */
function contexte(): { ctx: CanvasRenderingContext2D; trace: () => { moveTo: number; lineTo: number } } {
  let courant = { moveTo: 0, lineTo: 0 }
  let trace = { moveTo: 0, lineTo: 0 }
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
    closePath: rien,
    fill: rien,
    stroke: () => {
      trace = courant
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, trace: () => trace }
}

/** Une polyligne au ras du sol, d'un azimut à l'autre, au degré. */
function ligne(deDeg: number, aDeg: number): number[] {
  const points: number[] = []
  for (let az = deDeg; az <= aDeg; az++) points.push((az + 360) % 360, -1)
  return points
}

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
      projections++
      return brut.projetteEn(...args)
    },
  }
  // Le sol se peint d'abord, avec ses propres projections : seules celles des courbes comptent.
  const masque = { ...masquePlat(), courbesDeg }
  dessineSol(ctx, compte, IDENTITE, masque, { sol: 'sol', courbes: 'courbes' })
  projections = 0
  dessineSol(ctx, compte, IDENTITE, masque, { sol: 'sol', courbes: 'courbes' })
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
