/**
 * §3.3 — a figure segment passing behind observer isn't drawn across screen. Both vertices may
 * stay projectable (range of several diagonals) while the joining arc grazes antipode: straight
 * chord then crossed the whole sky.
 */

import { describe, expect, it } from 'vitest'
import { pointEcran, projecteur, type Vue } from '../src/core/projection.ts'
import { IDENTITE, versVecteur } from '../src/core/mat3.ts'
import { margeFigurePx, traceLignes, traceSegments } from '../src/ui/traces-ciel.ts'
import { projecteurSansSol } from '../src/core/sol.ts'
import { masquePlat } from '../src/core/site.ts'
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
    // Premise: both vertices projectable, only the chord is wrong.
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
    // Outside the disc, both sides: what the margin must guarantee.
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

describe('T-0450 — une ligne du ciel descend jusqu’au sol', () => {
  // Flat sol, sky matrix = identity: site frame and J2000 coincide, below ground ⟺ h < 0.
  const proj = projecteurSansSol(projecteur(VUE, IDENTITE), masquePlat(), IDENTITE)
  // Galactic plane sampled every few degrees: vertices straddle the horizon, none on it.
  const ligne = [4.5, 1.5, -1.5, -4.5].map((h) => versVecteur(10, h))
  const auSol = pointEcran()
  const surHorizon = versVecteur(10, 0)
  proj.projetteEn(surHorizon.x, surHorizon.y, surHorizon.z + 1e-9, auSol)
  const ecartAuSol = ([x, y]: [number, number]): number => Math.hypot(x - auSol.xPx, y - auSol.yPx)

  it('prolonge le trait qui plonge jusqu’au bord du sol', () => {
    const { ctx, bouts } = ctxEspion()
    traceLignes(ctx, proj, [ligne])
    expect(ecartAuSol(bouts.at(-1)!)).toBeLessThan(1 / 2)
  })

  it('fait partir du bord du sol le trait qui en sort', () => {
    const { ctx, bouts } = ctxEspion()
    traceLignes(ctx, proj, [[...ligne].reverse()])
    expect(ecartAuSol(bouts[0]!)).toBeLessThan(1 / 2)
  })
})
