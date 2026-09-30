/**
 * §4.1, T-0359 — la région peinte est celle que le prédicat désigne, pixel par pixel.
 *
 * Le balayage supposait qu'un rayon partant du centre ne traverse la frontière qu'une fois.
 * Un relief réel sous un champ de 300° le dément : le rayon qui monte passe au ciel, puis
 * repasse sous le sol derrière l'observateur. Ses deux bouts étant du même côté, il était peint
 * d'un seul tenant — le V noir qui mangeait le ciel.
 */

import { describe, expect, it } from 'vitest'
import { cielInstantane } from '../src/core/horloges.ts'
import { projecteur, type Vue } from '../src/core/projection.ts'
import { masqueDepuisRelief, masquePlat, NB_AZIMUTS } from '../src/core/site.ts'
import { sousLeSol, type TestSol } from '../src/core/sol.ts'
import { frontiereEcran, polygonesRegion } from '../src/ui/balayage-ecran.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const ciel = cielInstantane(SITE, new Date('2026-09-30T14:15:00Z'))

/** Un relief synthétique : une chaîne au sud-est, un plancher de quelques degrés ailleurs. */
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

/** Boîte englobante de chaque polygone : hors d'elle, son enroulement est nul. */
function avecBoites(polygones: readonly Polygone[]) {
  return polygones.map((poly) => ({
    poly,
    xMin: Math.min(...poly.map(([x]) => x)),
    xMax: Math.max(...poly.map(([x]) => x)),
    yMin: Math.min(...poly.map(([, y]) => y)),
    yMax: Math.max(...poly.map(([, y]) => y)),
  }))
}

/** Enroulement cumulé sur tous les polygones : le point est-il peint ? */
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
 * Pixels mal peints LOIN de la frontière : à plus de 3 px de tout pixel de l'autre côté. Le bord
 * lui-même peut hésiter d'un pixel ; une bande de ciel au milieu du relief, non.
 */
function ecart(v: Vue, dedans: TestSol): number {
  const proj = projecteur(v, ciel.matrice)
  const polygones = avecBoites(polygonesRegion(frontiereEcran(proj, dedans)))
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

  // Un relief dentelé : une crête en dents de scie qui monte vers le sud. Un rayon qui la longe
  // la traverse plusieurs fois, et d'un rayon au suivant le nombre de traversées change.
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

  // Visée haute sous un grand champ : l'horizon est un cercle, et sur ses flancs la crête est
  // VERTICALE à l'écran. Un balayage en colonnes la longeait au lieu de la couper, et chaque
  // dent y changeait le nombre de traversées : le bord se peignait en marches (T-0371). Le
  // relief est crénelé sur tout le tour, d'un degré à l'autre, comme un relevé Terrain Tiles.
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
