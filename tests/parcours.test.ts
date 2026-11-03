/**
 * §8.4 / T-0324 — framing shows a whole pointage route.
 * Rendered calotte CONTAINS the route; derived field fits on screen.
 * Too narrow: a step (the one sought) leaves canvas. Too wide: cadre matériel shrinks to a point,
 * loses remaining-distance info.
 * No hardcoded coords: assertions recomputed from engine separations + projection.
 */

import { describe, expect, it } from 'vitest'
import {
  cadrageParcours,
  cartePointage,
  etapesParcours,
  type Ancrage,
  type CartePointage,
  type EtapeParcours,
} from '../src/core/pointage.ts'
import { fovPourRayonDeg, projecteur, type Vue } from '../src/core/projection.ts'
import { cielInstantane } from '../src/core/horloges.ts'
import { separationEquatorialeDeg, versVecteur } from '../src/core/mat3.ts'
import { viseeVersVue } from '../src/ui/scene-lecture.ts'
import { K } from '../src/registry/constants.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const DATE = new Date('2026-08-15T22:00:00Z')
const DEG_PAR_HEURE = 15
/** Wide §3.2-like canvas: exposes vertical-field trap. */
const LARGEUR = 1920
const HAUTEUR = 1080

function etape(ordre: number, adH: number, decDeg: number): EtapeParcours {
  return { ordre, adH, decDeg, nom: '' }
}

/** Radius needed to contain all points from rendered centre. */
function rayonNecessaireDeg(
  centre: { readonly adDeg: number; readonly decDeg: number },
  etapes: readonly EtapeParcours[],
  adCibleH: number,
  decCibleDeg: number,
): number {
  const points = [
    ...etapes.map((e) => [e.adH, e.decDeg] as const),
    [adCibleH, decCibleDeg] as const,
  ]
  return Math.max(
    ...points.map(([adH, decDeg]) =>
      separationEquatorialeDeg(centre.adDeg / DEG_PAR_HEURE, centre.decDeg, adH, decDeg),
    ),
  )
}

/**
 * Route as the scene paints it (`dessineParcours` projection). Only assertion proving it fits.
 */
function pointsEcran(
  etapes: readonly EtapeParcours[],
  adCibleH: number,
  decCibleDeg: number,
): readonly { readonly xPx: number; readonly yPx: number }[] {
  const cadrage = cadrageParcours(etapes, adCibleH, decCibleDeg)
  const ciel = cielInstantane(SITE, DATE)
  const { azimutDeg, hauteurDeg } = viseeVersVue(cadrage.adDeg, cadrage.decDeg, ciel.matrice)
  const base: Vue = {
    mode: 'MODE_PLANETARIUM',
    fovDeg: K('FOV_INITIAL_DEG'),
    largeurPx: LARGEUR,
    hauteurPx: HAUTEUR,
    azimutDeg,
    hauteurDeg,
    rotationDeg: 0,
  }
  const vue: Vue = {
    ...base,
    fovDeg: fovPourRayonDeg(base, cadrage.rayonDeg * K('MARGE_CADRAGE_PARCOURS')),
  }
  const proj = projecteur(vue, ciel.matrice)
  const tous = [
    ...etapes.map((e) => [e.adH, e.decDeg] as const),
    [adCibleH, decCibleDeg] as const,
  ]
  // Draw-pass path: equatorial J2000, never alt/az (trap B3).
  return tous.map(([adH, decDeg]) => {
    const point = proj.projette(versVecteur(adH * DEG_PAR_HEURE, decDeg))
    if (point === null) throw new Error('le trajet n’est pas projetable dans ce cadrage')
    return point
  })
}

describe('§8.4 — la calotte rendue contient le trajet', () => {
  it('a pour rayon la plus grande séparation au centre, sans marge', () => {
    const etapes = [etape(1, 20.5, 45), etape(2, 20.9, 44.2), etape(3, 21.2, 44.6)]
    const cadrage = cadrageParcours(etapes, 21.4, 44.5)
    expect(cadrage.rayonDeg).toBeCloseTo(rayonNecessaireDeg(cadrage, etapes, 21.4, 44.5), 9)
  })

  it('laisse chaque point du trajet à l’intérieur du rayon rendu', () => {
    const etapes = [etape(1, 5.5, -10), etape(2, 6.1, -6.5), etape(3, 6.4, -3)]
    const cadrage = cadrageParcours(etapes, 6.8, -1.2)
    expect(rayonNecessaireDeg(cadrage, etapes, 6.8, -1.2)).toBeLessThanOrEqual(
      cadrage.rayonDeg + 1e-9,
    )
  })
})

describe('§8.4 — le centre est une direction, pas une moyenne d’angles', () => {
  it('ne part pas à l’opposé du trajet quand il traverse 24 h → 0 h', () => {
    // Circumpolar route crosses RA origin: arithmetic mean ≈ 12 h (opposite sky) → route leaves
    // view.
    const etapes = [etape(1, 23.6, 72), etape(2, 23.9, 73), etape(3, 0.3, 74)]
    const cadrage = cadrageParcours(etapes, 0.7, 74.5)
    expect(cadrage.rayonDeg).toBeLessThan(separationEquatorialeDeg(23.6, 72, 0.7, 74.5))
  })

  it('tombe à égale distance du départ et de la cible quand il n’y a qu’un saut', () => {
    const etapes = [etape(1, 10, 20)]
    const cadrage = cadrageParcours(etapes, 11, 20)
    const versDepart = separationEquatorialeDeg(cadrage.adDeg / DEG_PAR_HEURE, cadrage.decDeg, 10, 20)
    const versCible = separationEquatorialeDeg(cadrage.adDeg / DEG_PAR_HEURE, cadrage.decDeg, 11, 20)
    expect(versDepart).toBeCloseTo(versCible, 9)
  })
})

/**
 * Trap E2: a sensor (canvas) has TWO dimensions. `fovDeg` = horizontal; §3.2 canvas 2× wider than
 * tall → width-sized field pushes vertical-dominant routes out the top.
 */
describe('§3.3 — le champ fait tenir le trajet sur le bord le plus proche', () => {
  it('garde un trajet à dominante verticale dans le canevas', () => {
    const etapes = [etape(1, 20, 30), etape(2, 20, 36), etape(3, 20, 42)]
    for (const { xPx, yPx } of pointsEcran(etapes, 20, 48)) {
      expect(xPx).toBeGreaterThanOrEqual(0)
      expect(xPx).toBeLessThanOrEqual(LARGEUR)
      expect(yPx).toBeGreaterThanOrEqual(0)
      expect(yPx).toBeLessThanOrEqual(HAUTEUR)
    }
  })

  it('garde un trajet à dominante horizontale dans le canevas', () => {
    const etapes = [etape(1, 18, 30), etape(2, 18.5, 30.2), etape(3, 19, 30.1)]
    for (const { xPx, yPx } of pointsEcran(etapes, 19.5, 30)) {
      expect(xPx).toBeGreaterThanOrEqual(0)
      expect(xPx).toBeLessThanOrEqual(LARGEUR)
      expect(yPx).toBeGreaterThanOrEqual(0)
      expect(yPx).toBeLessThanOrEqual(HAUTEUR)
    }
  })

  it('laisse la marge du registre entre le trajet et le bord', () => {
    const etapes = [etape(1, 20, 30), etape(2, 20, 36), etape(3, 20, 42)]
    const marges = pointsEcran(etapes, 20, 48).map(({ yPx }) =>
      Math.min(yPx, HAUTEUR - yPx),
    )
    // Margin: "fits" ≠ "touches edges".
    expect(Math.min(...marges)).toBeGreaterThan(0)
  })
})

describe('§8.4 — le mode carte directe n’a qu’une étape, et se cadre quand même', () => {
  it('rend un rayon et un champ finis et non nuls pour un seul ancrage', () => {
    const etapes = [etape(1, 15.2, 30.4)]
    const cadrage = cadrageParcours(etapes, 15.35, 30.1)
    expect(cadrage.rayonDeg).toBeGreaterThan(0)
    const vue: Vue = {
      mode: 'MODE_PLANETARIUM',
      fovDeg: K('FOV_INITIAL_DEG'),
      largeurPx: LARGEUR,
      hauteurPx: HAUTEUR,
      azimutDeg: 180,
      hauteurDeg: 45,
      rotationDeg: 0,
    }
    const fov = fovPourRayonDeg(vue, cadrage.rayonDeg * K('MARGE_CADRAGE_PARCOURS'))
    expect(Number.isFinite(fov)).toBe(true)
    expect(fov).toBeGreaterThan(0)
  })
})

/**
 * §8.4 — stars forming the route: 1 pointage step in carte directe, hop graph in cheminement.
 * `CartePointage`'s two arrays are exclusive; the type doesn't enforce it.
 */
describe('§8.4 — le trajet prend les sauts, ou l’ancrage principal, jamais les deux', () => {
  /** Route uses only AD, δ, nom, rang. */
  function ancrage(adH: number, decDeg: number, nom: string, principal: boolean): Ancrage {
    return {
      adH,
      decDeg,
      magV: 4,
      nom,
      xCadre: 0,
      yCadre: 0,
      xDisque: 0,
      yDisque: 0,
      deltaAdH: 0,
      deltaDecDeg: 0,
      separationDeg: 0,
      principal,
    }
  }
  const ANCRAGES: readonly Ancrage[] = [
    ancrage(1, 10, 'faible', false),
    ancrage(2, 20, 'brillante', true),
  ]
  const SAUTS = [
    { ordre: 1, adH: 3, decDeg: 30, magV: 2, nom: 'départ', distanceDeg: 0 },
    { ordre: 2, adH: 4, decDeg: 31, magV: 5, nom: 'relais', distanceDeg: 4 },
  ]
  function carte(partiel: Partial<CartePointage>): CartePointage {
    return {
      mode: 'CHEMINEMENT',
      ancrages: [],
      sauts: [],
      angleOrientationDeg: { value: 0 } as CartePointage['angleOrientationDeg'],
      xNord: 0,
      yNord: 0,
      deltaAdH: 0,
      deltaDecDeg: 0,
      message: '',
      ...partiel,
    }
  }

  it('prend les sauts quand il y en a, dans leur ordre', () => {
    const etapes = etapesParcours(carte({ sauts: SAUTS }))
    expect(etapes.map((e) => e.nom)).toEqual(['départ', 'relais'])
    expect(etapes.map((e) => e.ordre)).toEqual([1, 2])
  })

  it('ne relie jamais les ancrages entre eux : ce sont des confirmations, pas des étapes', () => {
    const etapes = etapesParcours(carte({ mode: 'CARTE_DIRECTE', ancrages: ANCRAGES }))
    expect(etapes).toHaveLength(1)
    expect(etapes[0]!.nom).toBe('brillante')
  })

  it('se replie sur le plus brillant disponible quand aucun ancrage n’est principal', () => {
    const sansPrincipal = ANCRAGES.map((a) => ({ ...a, principal: false }))
    const etapes = etapesParcours(carte({ mode: 'CARTE_DIRECTE', ancrages: sansPrincipal }))
    expect(etapes).toHaveLength(1)
    expect(etapes[0]!.nom).toBe(sansPrincipal[0]!.nom)
  })

  it('ne propose rien quand la carte n’a ni saut ni ancrage', () => {
    expect(etapesParcours(carte({}))).toHaveLength(0)
  })

  it('sort bien un trajet de la carte que le moteur produit vraiment', () => {
    const etoiles = Array.from({ length: 12 }, (_, i) => ({
      adDeg: 314.75 + ((i % 4) - 1.5),
      decDeg: 44.52 + (Math.floor(i / 4) - 1),
      magV: 2 + i / 4,
      bv: 0,
    }))
    const reelle = cartePointage({
      site: SITE,
      date: DATE,
      adCibleH: 314.75 / DEG_PAR_HEURE,
      decCibleDeg: 44.52,
      fovHDeg: 11.38,
      fovLDeg: 17.02,
      mLimOeil: 6.05,
      etoiles,
      nommees: [],
    })
    const etapes = etapesParcours(reelle)
    expect(etapes.length).toBeGreaterThan(0)
    expect(cadrageParcours(etapes, 314.75 / DEG_PAR_HEURE, 44.52).rayonDeg).toBeGreaterThan(0)
  })
})
