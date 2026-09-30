/**
 * §4.1 — la carte du site : ce qu'un clic, un glisser ou un zoom font du lieu (T-0363).
 *
 * Les lieux attendus viennent de la projection elle-même, jamais d'une coordonnée recopiée :
 * ce qui est vérifié, c'est que le point sous le curseur est celui qu'on écrit.
 */

import { describe, expect, it } from 'vitest'
import {
  decimalesPourZoom,
  deplaceVue,
  ecritLieu,
  lieuSous,
  vueCentreeSur,
  zoomeVue,
  type VueCarte,
} from '../src/ui/choix-lieu-calcul.ts'
import { commandeCarteLieu } from '../src/ui/choix-lieu-gestes.ts'
import { C } from '../src/registry/lieu-carte.ts'
import { nombreDeTexte } from '../src/registry/domains.ts'
import { SITE_REFERENCE } from './fixtures.ts'

const { latitudeDeg: LAT, longitudeDeg: LON } = SITE_REFERENCE
const L = 300
const H = 200
const PRECISION = 9

describe('carte de choix du lieu', () => {
  it('le centre de la carte est le lieu sur lequel elle s’ouvre', () => {
    const vue = vueCentreeSur(LAT, LON, C('ZOOM_CARTE_INITIAL'))
    const lieu = lieuSous(vue, L / 2, H / 2, L, H)
    expect(lieu.latitudeDeg).toBeCloseTo(LAT, PRECISION)
    expect(lieu.longitudeDeg).toBeCloseTo(LON, PRECISION)
  })

  it('glisser déplace la carte avec le doigt : le point saisi reste sous lui', () => {
    const vue = vueCentreeSur(LAT, LON, 10)
    const avant = lieuSous(vue, 100, 80, L, H)
    const apres = lieuSous(deplaceVue(vue, 40, -25), 140, 55, L, H)
    expect(apres.latitudeDeg).toBeCloseTo(avant.latitudeDeg, PRECISION)
    expect(apres.longitudeDeg).toBeCloseTo(avant.longitudeDeg, PRECISION)
  })

  it('zoomer garde fixe le point sous le curseur', () => {
    const vue = vueCentreeSur(LAT, LON, 6)
    const avant = lieuSous(vue, 220, 60, L, H)
    const zoomee = zoomeVue(vue, 1.5, 220, 60, L, H)
    expect(zoomee.zoom).toBe(7.5)
    const apres = lieuSous(zoomee, 220, 60, L, H)
    expect(apres.latitudeDeg).toBeCloseTo(avant.latitudeDeg, PRECISION)
    expect(apres.longitudeDeg).toBeCloseTo(avant.longitudeDeg, PRECISION)
  })

  it('borne le zoom', () => {
    const vue = vueCentreeSur(LAT, LON, C('ZOOM_CARTE_MAX'))
    expect(zoomeVue(vue, 5, 0, 0, L, H).zoom).toBe(C('ZOOM_CARTE_MAX'))
    expect(zoomeVue(vue, -99, 0, 0, L, H).zoom).toBe(C('ZOOM_CARTE_MIN'))
  })

  it('traverse l’antiméridien sans sauter', () => {
    const vue = vueCentreeSur(0, 179.9, 8)
    const lieu = lieuSous(deplaceVue(vue, -200, 0), L / 2, H / 2, L, H)
    expect(lieu.longitudeDeg).toBeLessThan(0)
    expect(lieu.longitudeDeg).toBeGreaterThan(-180)
  })

  it('écrit autant de décimales qu’un pixel en distingue', () => {
    const cote = C('COTE_TUILE_CARTE_PX')
    for (const z of [C('ZOOM_CARTE_MIN'), 8, C('ZOOM_CARTE_MAX')]) {
      const degParPixel = 360 / (cote * 2 ** z)
      const d = decimalesPourZoom(z)
      expect(10 ** -d).toBeLessThanOrEqual(degParPixel)
      expect(10 ** -(d - 1)).toBeGreaterThan(degParPixel)
    }
  })

  it('écrit un lieu que le champ relit, sud et ouest compris', () => {
    const d = decimalesPourZoom(8)
    for (const [lat, lon] of [
      [LAT, LON],
      [-LAT, -LON],
    ] as const) {
      const ecrit = ecritLieu({ latitudeDeg: lat, longitudeDeg: lon }, 8)
      expect(nombreDeTexte(ecrit.latitude)).toBeCloseTo(lat, d - 1)
      expect(nombreDeTexte(ecrit.longitude)).toBeCloseTo(lon, d - 1)
    }
  })
})

describe('clavier de la carte du site', () => {
  it('rejoue les gestes : flèches, plus et moins, Entrée pour poser', () => {
    const vue = vueCentreeSur(LAT, LON, 8)
    const droite = commandeCarteLieu('ArrowRight', vue, L, H)
    expect(droite).not.toBe('POSE')
    expect(lieuSous(droite as VueCarte, L / 2, H / 2, L, H).longitudeDeg).toBeGreaterThan(LON)
    const nord = commandeCarteLieu('ArrowUp', vue, L, H) as VueCarte
    expect(lieuSous(nord, L / 2, H / 2, L, H).latitudeDeg).toBeGreaterThan(LAT)
    expect((commandeCarteLieu('+', vue, L, H) as VueCarte).zoom).toBe(8 + C('CRAN_ZOOM_CARTE'))
    expect((commandeCarteLieu('-', vue, L, H) as VueCarte).zoom).toBe(8 - C('CRAN_ZOOM_CARTE'))
    expect(commandeCarteLieu('Enter', vue, L, H)).toBe('POSE')
    expect(commandeCarteLieu('a', vue, L, H)).toBeNull()
  })
})
