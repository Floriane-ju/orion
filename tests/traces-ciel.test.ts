/**
 * §3.3 — un segment de figure qui passe derrière l'observateur ne se trace pas en travers de
 * l'écran. Ses deux sommets peuvent rester projetables (portée de plusieurs diagonales) alors
 * que l'arc qui les joint frôle l'antipode : la corde droite traversait alors tout le ciel.
 */

import { describe, expect, it } from 'vitest'
import { pointEcran, projecteur, type Vue } from '../src/core/projection.ts'
import { IDENTITE, versVecteur } from '../src/core/mat3.ts'
import { traceSegments } from '../src/ui/traces-ciel.ts'
import type { CoucheTraces } from '../src/core/constellations.ts'

const VUE: Vue = {
  mode: 'MODE_PLANETARIUM',
  fovDeg: 150,
  largeurPx: 1920,
  hauteurPx: 1080,
  azimutDeg: 0,
  hauteurDeg: 0,
  rotationDeg: 0,
}

function ctxEspion() {
  const traits: number[] = []
  const ctx = {
    beginPath() {},
    moveTo() {},
    lineTo() {
      traits.push(1)
    },
    stroke() {},
  } as unknown as CanvasRenderingContext2D
  return { ctx, traits }
}

function couche(a: [number, number], b: [number, number]): CoucheTraces {
  return {
    code: 'TST',
    nom: 'Test',
    segments: [{ a: versVecteur(...a), b: versVecteur(...b) }],
    centre: null,
  }
}

describe('traceSegments', () => {
  const proj = projecteur(VUE, IDENTITE)

  it('ne trace pas un segment dont l’arc passe par l’antipode de la visée', () => {
    const c = couche([180, 10], [180, -10])
    const seg = c.segments[0]!
    // Prémisse : les deux sommets sont projetables, seule la corde est fausse.
    expect(proj.projetteEn(seg.a.x, seg.a.y, seg.a.z, pointEcran())).toBe(true)
    expect(proj.projetteEn(seg.b.x, seg.b.y, seg.b.z, pointEcran())).toBe(true)
    const { ctx, traits } = ctxEspion()
    traceSegments(ctx, proj, [c], null)
    expect(traits).toHaveLength(0)
  })

  it('ne trace pas un segment qui contourne l’antipode sans le toucher', () => {
    const c = couche([170, 8], [190, 8])
    const { ctx, traits } = ctxEspion()
    traceSegments(ctx, proj, [c], null)
    expect(traits).toHaveLength(0)
  })

  it('trace un segment devant l’observateur', () => {
    const { ctx, traits } = ctxEspion()
    traceSegments(ctx, proj, [couche([0, 5], [0, -5])], null)
    expect(traits).toHaveLength(1)
  })
})
