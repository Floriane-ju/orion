/**
 * §3.3, §6.2, §11.1 — le marqueur d'un objet du ciel profond : sa taille, son orientation, sa
 * couleur.
 *
 * La taille attendue est CALCULÉE sur place avec `echelleProjection` et `rayonProjete`, jamais
 * recopiée : un nombre en dur ici ne vérifierait plus la formule de projection, il vérifierait
 * qu'on a bien recopié le nombre.
 */

import { describe, expect, it } from 'vitest'
import { cielInstantane } from '../src/core/horloges.ts'
import { DEG } from '../src/core/mat3.ts'
import {
  echelleProjection,
  projecteur,
  rayonProjete,
  type Vue,
} from '../src/core/projection.ts'
import { versSpherique } from '../src/core/mat3.ts'
import { TYPES_OBJET, type ObjetCielProfond } from '../src/data/deepsky.ts'
import { interpoleBortle } from '../src/registry/bortle.ts'
import { APPARENCE_OBJET, teintesObjets } from '../src/ui/apparence-objets.ts'
import { geometrieMarqueur } from '../src/ui/marqueur-objet.ts'
import { MARQUEUR_OBJET_PX } from '../src/ui/libelles-cibles.ts'
import {
  composantesDeCss,
  LUMINANCE_FOND_REFERENCE,
  luminanceFondRealiste,
  luminanceRelative,
  rapportContraste,
} from '../src/ui/couleurs.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const DATE = new Date('2026-08-15T22:00:00Z')
const LARGEUR = 960
const HAUTEUR = 540
const ARCMIN_PAR_DEG = 60

const MATRICE = cielInstantane(SITE, DATE).matrice

function vue(modifs: Partial<Vue> = {}): Vue {
  return {
    mode: 'MODE_PLANETARIUM',
    fovDeg: 60,
    largeurPx: LARGEUR,
    hauteurPx: HAUTEUR,
    azimutDeg: 180,
    hauteurDeg: 45,
    rotationDeg: 0,
    ...modifs,
  }
}

/** Un objet posé pile au centre du champ : c'est là que la projection est la plus simple. */
function objetAuCentre(v: Vue, dims: Partial<ObjetCielProfond> = {}): ObjetCielProfond {
  const centre = versSpherique(projecteur(v, MATRICE).inverse(v.largeurPx / 2, v.hauteurPx / 2))
  return {
    designation: 'M31',
    nomsCommuns: '',
    adDeg: centre.longitudeDeg,
    decDeg: centre.latitudeDeg,
    type: 'GALAXIE',
    majAxArcmin: 190,
    minAxArcmin: 60,
    posAngDeg: 35,
    vMag: 3.4,
    bMag: null,
    surfBr: null,
    ...dims,
  }
}

function geometrieAuCentre(v: Vue, dims: Partial<ObjetCielProfond> = {}) {
  return geometrieMarqueur(
    projecteur(v, MATRICE),
    objetAuCentre(v, dims),
    v.largeurPx / 2,
    v.hauteurPx / 2,
  )
}

/** Le demi-axe attendu : R(θ) × échelle, la formule de §3.3 et rien d'autre. */
function demiAxeAttenduPx(v: Vue, axeArcmin: number): number {
  const theta = (axeArcmin / 2 / ARCMIN_PAR_DEG) * DEG
  return echelleProjection(v) * rayonProjete(v.mode, theta)
}

describe('taille du marqueur d’objet §6.2', () => {
  it('donne au grand axe la taille que la projection lui donne', () => {
    for (const mode of ['MODE_PLANETARIUM', 'MODE_CADRE', 'MODE_FISHEYE'] as const) {
      const v = vue({ mode })
      const geo = geometrieAuCentre(v)
      expect(geo, mode).not.toBeNull()
      expect(geo!.demiGrandPx, mode).toBeCloseTo(demiAxeAttenduPx(v, 190), 0)
      expect(geo!.demiPetitPx, mode).toBeCloseTo(demiAxeAttenduPx(v, 60), 0)
    }
  })

  it('garde l’aplatissement du ciel, pas celui du canevas', () => {
    const geo = geometrieAuCentre(vue())
    expect(geo!.demiPetitPx / geo!.demiGrandPx).toBeCloseTo(60 / 190, 2)
  })

  it('grandit quand on zoome, dans le rapport des champs', () => {
    const large = geometrieAuCentre(vue({ fovDeg: 60 }))!
    const serre = geometrieAuCentre(vue({ fovDeg: 30 }))!
    // Sous le degré, R(θ) est quasi linéaire : le rapport des tailles est celui des champs.
    expect(serre.demiGrandPx / large.demiGrandPx).toBeCloseTo(2, 1)
  })

  it('n’invente aucune taille quand le catalogue n’a pas de grand axe', () => {
    expect(geometrieAuCentre(vue(), { majAxArcmin: null })).toBeNull()
    expect(geometrieAuCentre(vue(), { majAxArcmin: 0 })).toBeNull()
  })

  it('suppose l’objet circulaire quand le petit axe manque, comme §6.2', () => {
    const geo = geometrieAuCentre(vue(), { minAxArcmin: null })!
    expect(geo.demiPetitPx).toBeCloseTo(geo.demiGrandPx, 6)
  })

  it('remonte au plancher de lisibilité sans écraser l’aplatissement', () => {
    // 0,2′ de grand axe à 60° de champ : quelques centièmes de pixel.
    const geo = geometrieAuCentre(vue(), { majAxArcmin: 0.2, minAxArcmin: 0.1 })!
    expect(geo.demiGrandPx).toBeCloseTo(MARQUEUR_OBJET_PX, 6)
    expect(geo.demiPetitPx / geo.demiGrandPx).toBeCloseTo(0.1 / 0.2, 2)
  })
})

describe('orientation du marqueur §6.2', () => {
  /** L'écart d'angle entre deux directions non orientées : une ellipse est symétrique. */
  function ecartRad(a: number, b: number): number {
    const brut = Math.abs(a - b) % Math.PI
    return Math.min(brut, Math.PI - brut)
  }

  it('tourne de 90° quand l’angle de position tourne de 90°', () => {
    const v = vue()
    const nord = geometrieAuCentre(v, { posAngDeg: 0 })!
    const est = geometrieAuCentre(v, { posAngDeg: 90 })!
    expect(ecartRad(nord.rotationRad, est.rotationRad)).toBeCloseTo(Math.PI / 2, 3)
  })

  it('suit la rotation de la vue : le marqueur est solidaire du ciel', () => {
    const droite = geometrieAuCentre(vue())!
    const tournee = geometrieAuCentre(vue({ rotationDeg: 90 }))!
    expect(ecartRad(droite.rotationRad, tournee.rotationRad)).toBeCloseTo(Math.PI / 2, 3)
  })
})

describe('apparence par type §3.3, §11.1', () => {
  const CANAUX = /^rgb\((\d+) (\d+) (\d+)(?: \/ [\d.]+)?\)$/

  function canaux(css: string): readonly [number, number, number] {
    const trouve = CANAUX.exec(css)
    expect(trouve, css).not.toBeNull()
    return [Number(trouve![1]), Number(trouve![2]), Number(trouve![3])]
  }

  it('donne une teinte de radiant et de bord à CHAQUE type du catalogue', () => {
    for (const type of TYPES_OBJET) {
      expect(APPARENCE_OBJET[type], type).toBeDefined()
      const teintes = teintesObjets(false, false, 21)[type]
      expect(teintes.coeur, type).not.toBe(teintes.halo)
      expect(teintes.bord.length, type).toBeGreaterThan(0)
    }
  })

  it('donne à chaque type un dégradé qui se voit : cœur plus clair que bord', () => {
    // Un radiant plus sombre que son bord se peint noir sur noir : l'ellipse perd sa forme,
    // et la forme est ce que le marqueur a à dire.
    for (const type of TYPES_OBJET) {
      const apparence = APPARENCE_OBJET[type]
      const clarte = (o: readonly [number, number, number]) =>
        luminanceRelative(composantesDeCss(`rgb(${o[0]} ${o[1]} ${o[2]})`))
      expect(clarte(apparence.radiant), type).toBeGreaterThanOrEqual(clarte(apparence.bord))
      expect(clarte(apparence.radiant), type).toBeGreaterThan(LUMINANCE_FOND_REFERENCE)
    }
  })

  it('n’écrit aucune composante verte ou bleue en mode nuit, arrêts du dégradé compris', () => {
    const nuit = teintesObjets(true, false, 21)
    for (const type of TYPES_OBJET) {
      for (const css of [nuit[type].coeur, nuit[type].halo, nuit[type].bord]) {
        const [, v, b] = canaux(css)
        expect(v, `${type} ${css}`).toBe(0)
        expect(b, `${type} ${css}`).toBe(0)
      }
    }
  })

  it('l’emporte sur la vue réaliste : le mode nuit ne s’éclaircit pas (§11.1)', () => {
    const sb = interpoleBortle(9).sb
    expect(teintesObjets(true, true, sb)).toEqual(teintesObjets(true, false, sb))
  })

  it('retient chaque bord à son rapport de contraste en vue réaliste', () => {
    for (const bortle of [1, 6, 9]) {
      const sb = interpoleBortle(bortle).sb
      const realiste = teintesObjets(false, true, sb)
      const luminanceFond = luminanceFondRealiste(sb)
      for (const type of TYPES_OBJET) {
        const attendu = rapportContraste(
          luminanceRelative(composantesDeCss(teintesObjets(false, false, sb)[type].bord)),
          LUMINANCE_FOND_REFERENCE,
        )
        const obtenu = rapportContraste(
          luminanceRelative(composantesDeCss(realiste[type].bord)),
          luminanceFond,
        )
        const sature = canaux(realiste[type].bord).some((c) => c === 255)
        expect(obtenu >= attendu * 0.98 || sature, `${type} @ B${bortle}`).toBe(true)
      }
    }
  })
})
