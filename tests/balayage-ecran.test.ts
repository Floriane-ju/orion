/**
 * §4.1, T-0359 — painted region = the one the predicate designates, pixel by pixel.
 * Sweep assumed a ray from centre crosses frontière once. Real relief under a 300° champ refutes
 * it: rising ray reaches sky, then dips under sol behind observer. Both ends on same side →
 * painted whole = black V eating the sky.
 */

import { describe, expect, it } from 'vitest'
import { cielInstantane } from '../src/core/horloges.ts'
import { projecteur, type Vue } from '../src/core/projection.ts'
import { masqueDepuisRelief, masquePlat, NB_AZIMUTS } from '../src/core/site.ts'
import { sousLeSol, type TestSol } from '../src/core/sol.ts'
import { frontiereEcran } from '../src/ui/balayage-ecran.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const ciel = cielInstantane(SITE, new Date('2026-09-30T14:15:00Z'))

/** Synthetic relief: a chain to the south-east, a few degrees of floor elsewhere. */
const RELIEF = masqueDepuisRelief(
  Array.from({ length: NB_AZIMUTS }, (_, az) => 4 + 16 * Math.max(0, Math.sin(((az - 60) * Math.PI) / 180))),
)

function vue(fovDeg: number, hauteurDeg: number): Vue {
  return {
    mode: 'MODE_PLANETARIUM',
    fovDeg,
    largeurPx: 800,
    hauteurPx: 450,
    azimutDeg: 256,
    hauteurDeg,
    rotationDeg: 0,
    decalageCentreXPx: -90,
  }
}

type Polygone = readonly (readonly [number, number])[]

/** Bounding box of each polygon: outside it, its winding is zero. */
function avecBoites(polygones: readonly Polygone[]) {
  return polygones.map((poly) => ({
    poly,
    xMin: Math.min(...poly.map(([x]) => x)),
    xMax: Math.max(...poly.map(([x]) => x)),
    yMin: Math.min(...poly.map(([, y]) => y)),
    yMax: Math.max(...poly.map(([, y]) => y)),
  }))
}

/** Cumulative winding over all polygons: is the point painted? */
function peint(polygones: ReturnType<typeof avecBoites>, x: number, y: number): boolean {
  let enroulement = 0
  for (const { poly, xMin, xMax, yMin, yMax } of polygones) {
    if (x < xMin || x > xMax || y < yMin || y > yMax) continue
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i]!
      const [x2, y2] = poly[(i + 1) % poly.length]!
      if (y1 <= y && y2 > y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0) enroulement++
      else if (y1 > y && y2 <= y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0) enroulement--
    }
  }
  return enroulement !== 0
}

/**
 * Pixels mis-painted FAR from frontière: >3 px from any pixel on the other side. Edge may waver
 * by a pixel; a sky band mid-relief may not.
 */
function ecart(v: Vue, dedans: TestSol): number {
  const proj = projecteur(v, ciel.matrice)
  const polygones = avecBoites(frontiereEcran(proj, dedans).polygones)
  const vrai = (x: number, y: number): boolean => {
    const d = proj.inverse(x, y)
    return dedans(d.x, d.y, d.z)
  }
  const MARGE = 3
  let faux = 0
  for (let y = 4; y < v.hauteurPx - 4; y += 3) {
    for (let x = 4; x < v.largeurPx - 4; x += 3) {
      const attendu = vrai(x, y)
      if (peint(polygones, x, y) === attendu) continue
      const loinDuBord = [-MARGE, 0, MARGE].every((dy) =>
        [-MARGE, 0, MARGE].every((dx) => vrai(x + dx, y + dy) === attendu),
      )
      if (loinDuBord) faux++
    }
  }
  return faux
}

describe('balayage en espace écran', () => {
  for (const [fov, hauteur] of [
    [60, 9],
    [120, 20],
    [300, 9],
    [300, -10],
    [300, 45],
  ] as const) {
    it(`peint le sol d’un relief réel là où il est, champ ${fov}°, visée à ${hauteur}°`, () => {
      expect(ecart(vue(fov, hauteur), sousLeSol(RELIEF, ciel.matrice))).toBe(0)
    })
  }

  // Jagged relief: sawtooth ridge rising south. A ray along it crosses it several times, count
  // changes ray to ray.
  const DENTELE = masqueDepuisRelief(
    Array.from({ length: NB_AZIMUTS }, (_, az) =>
      az > 150 && az < 250 ? 2 + (250 - az) / 5 + ((az * 7) % 11) / 3 : 1 + (az % 5) / 4,
    ),
  )
  for (const [fov, azimut, hauteur] of [
    [120, 200, 10],
    [180, 230, 5],
    [220, 250, 15],
    [300, 256, 9],
  ] as const) {
    it(`peint un relief dentelé sans bande de ciel, champ ${fov}°, azimut ${azimut}°`, () => {
      const v = { ...vue(fov, hauteur), azimutDeg: azimut }
      expect(ecart(v, sousLeSol(DENTELE, ciel.matrice))).toBe(0)
    })
  }

  // High visée under wide champ: horizon = circle, on its flanks ridge is VERTICAL on screen.
  // Column sweep ran along it instead of cutting it, each tooth changed crossing count → edge
  // painted in steps (T-0371). Relief crenellated all round, degree to degree, like a Terrain
  // Tiles survey.
  const CRENELE = masqueDepuisRelief(
    Array.from({ length: NB_AZIMUTS }, (_, az) => 3 + 4 * Math.abs(Math.sin(az * 0.7)) + ((az * 7) % 11) / 4),
  )
  for (const [fov, azimut, hauteur] of [
    [150, 25, 57],
    [200, 25, 57],
    [200, 25, 75],
  ] as const) {
    it(`peint une crête verticale à l’écran sans marches, champ ${fov}°, visée à ${hauteur}°`, () => {
      const v = { ...vue(fov, hauteur), azimutDeg: azimut }
      expect(ecart(v, sousLeSol(CRENELE, ciel.matrice))).toBe(0)
    })
  }

  it('peint l’horizon plat comme avant, même visée plongeante à 300°', () => {
    expect(ecart(vue(300, -10), sousLeSol(masquePlat(), ciel.matrice))).toBe(0)
  })
})
