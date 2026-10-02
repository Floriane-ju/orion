/**
 * §3.3 — un segment de figure qui passe derrière l'observateur ne se trace pas en travers de
 * l'écran. Ses deux sommets peuvent rester projetables (portée de plusieurs diagonales) alors
 * que l'arc qui les joint frôle l'antipode : la corde droite traversait alors tout le ciel.
 */

import { describe, expect, it } from 'vitest'
import { pointEcran, projecteur, type Vue } from '../src/core/projection.ts'
import { IDENTITE, versVecteur } from '../src/core/mat3.ts'
import { margeFigurePx, traceSegments } from '../src/ui/traces-ciel.ts'
import { rayonEtoileCielPx } from '../src/ui/apparence-objets.ts'
import { K } from '../src/registry/constants.ts'
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
  const bouts: [number, number][] = []
  const ctx = {
    beginPath() {},
    moveTo(x: number, y: number) {
      bouts.push([x, y])
    },
    lineTo(x: number, y: number) {
      bouts.push([x, y])
      traits.push(1)
    },
    stroke() {},
  } as unknown as CanvasRenderingContext2D
  return { ctx, traits, bouts }
}

function couche(
  a: [number, number],
  b: [number, number],
  magA: number | null = null,
  magB: number | null = null,
): CoucheTraces {
  return {
    code: 'TST',
    nom: 'Test',
    segments: [{ a: versVecteur(...a), b: versVecteur(...b), magA, magB }],
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

describe('T-0376 — le trait s’arrête avant l’étoile', () => {
  const proj = projecteur(VUE, IDENTITE)

  it('retire chaque bout d’une marge proportionnelle au rayon de son étoile', () => {
    const magBrillante = K('MAG_REFERENCE_RAYON')
    const magFaible = magBrillante + 4
    const c = couche([0, 5], [0, -5], magBrillante, magFaible)
    const seg = c.segments[0]!
    const a = pointEcran()
    const b = pointEcran()
    proj.projetteEn(seg.a.x, seg.a.y, seg.a.z, a)
    proj.projetteEn(seg.b.x, seg.b.y, seg.b.z, b)
    const { ctx, bouts } = ctxEspion()
    traceSegments(ctx, proj, [c], null)
    const [debut, fin] = bouts
    const ecartA = Math.hypot(debut![0] - a.xPx, debut![1] - a.yPx)
    const ecartB = Math.hypot(fin![0] - b.xPx, fin![1] - b.yPx)
    expect(ecartA).toBeCloseTo(rayonEtoileCielPx(magBrillante) * K('MARGE_FIGURE_RAYONS'), 6)
    expect(ecartB).toBeCloseTo(rayonEtoileCielPx(magFaible) * K('MARGE_FIGURE_RAYONS'), 6)
    // Hors du disque, des deux côtés : c'est ce que la marge doit garantir.
    expect(ecartA).toBeGreaterThan(rayonEtoileCielPx(magBrillante))
    expect(ecartB).toBeGreaterThan(rayonEtoileCielPx(magFaible))
  })

  it('ne trace rien quand deux étoiles sont plus proches que leurs marges', () => {
    const { ctx, traits } = ctxEspion()
    const pas = 1e-4
    traceSegments(ctx, proj, [couche([0, 0], [0, pas], 0, 0)], null)
    expect(traits).toHaveLength(0)
  })

  it('donne la marge du plancher à une étoile que le paquet ne nomme pas', () => {
    expect(margeFigurePx(null)).toBeCloseTo(K('RAYON_MIN_ETOILE_PX') * K('MARGE_FIGURE_RAYONS'), 9)
  })
})
