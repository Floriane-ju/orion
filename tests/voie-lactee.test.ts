/**
 * §3.7 — Voie lactée composed as a brightness (T-0101, T-0102, T-0105). Protects a PROPERTY: band
 * fades toward galactic poles, vanishes on polluted sky, by physics — no threshold, convention
 * opacity or cutoff latitude (unlike the tinted layer it replaces).
 */

import { describe, expect, it } from 'vitest'
import { brillanceVoieLacteeNl, sbDepuisNanolamberts } from '../src/core/fond-ciel-rendu.ts'
import { nanolamberts } from '../src/core/moon.ts'
import { bandeRealiste, fondRealiste, luminanceRelative, palette } from '../src/ui/couleurs.ts'
import { SB_PLAFOND_TABLE, SB_PLANCHER_NATUREL } from '../src/registry/bortle.ts'
import { K } from '../src/registry/constants.ts'

const octets = (css: string): readonly number[] => css.slice(4, -1).split(' ').map(Number)

/** Anticentre longitude: weak bound of longitude profile. */
const ANTICENTRE_DEG = 180

/** Sky-background elevation (mag) from the band in this direction. */
const elevationMag = (sbCiel: number, lDeg: number, bDeg: number): number =>
  sbCiel - sbDepuisNanolamberts(nanolamberts(sbCiel) + brillanceVoieLacteeNl(lDeg, bDeg))

describe('brillance de la bande', () => {
  it('vaut la brillance de l’anticentre à l = 180°, b = 0 et décroît avec la latitude', () => {
    expect(brillanceVoieLacteeNl(ANTICENTRE_DEG, 0)).toBeCloseTo(
      nanolamberts(K('SB_VOIE_LACTEE_PLAN_MAG')),
      9,
    )
    let precedente = brillanceVoieLacteeNl(ANTICENTRE_DEG, 0)
    for (let b = 2; b <= 90; b += 2) {
      const courante = brillanceVoieLacteeNl(ANTICENTRE_DEG, b)
      expect(courante).toBeLessThan(precedente)
      precedente = courante
    }
  })

  it('est symétrique : les deux hémisphères galactiques rendent la même brillance', () => {
    for (const b of [5, 17, 43]) {
      expect(brillanceVoieLacteeNl(0, -b)).toBeCloseTo(brillanceVoieLacteeNl(0, b), 12)
    }
  })
})

describe('modulation en longitude — le bulbe (T-0105)', () => {
  it('vaut la brillance du bulbe au centre galactique', () => {
    expect(brillanceVoieLacteeNl(0, 0)).toBeCloseTo(
      nanolamberts(K('SB_VOIE_LACTEE_BULBE_MAG')),
      9,
    )
  })

  it('décroît strictement du centre à l’anticentre, sans bosse ni palier', () => {
    let precedente = brillanceVoieLacteeNl(0, 0)
    for (let l = 5; l <= ANTICENTRE_DEG; l += 5) {
      const courante = brillanceVoieLacteeNl(l, 0)
      expect(courante).toBeLessThan(precedente)
      precedente = courante
    }
  })

  it('est symétrique en longitude : l et 360 − l rendent la même brillance', () => {
    for (const l of [23, 77, 141]) {
      expect(brillanceVoieLacteeNl(360 - l, 0)).toBeCloseTo(brillanceVoieLacteeNl(l, 0), 9)
    }
  })

  it('sépare le bulbe de l’anticentre de plus qu’un cran de Bortle', () => {
    // Ticket: under ½ mag gap non-uniformity wouldn't show, a uniform model would do.
    const ecartBortle = K('SB_VOIE_LACTEE_PLAN_MAG') - K('SB_VOIE_LACTEE_BULBE_MAG')
    expect(ecartBortle).toBeGreaterThanOrEqual(0.5)
  })

  it('deux segments de longitude voisins rendent la même couleur à un 255e près', () => {
    // Fixes PAS_LONGITUDE_BANDE_DEG = 12 in `voie-lactee.ts`: band cut in longitude, a visible
    // colour step between segments reads as a seam. Same criterion as latitude step — NOT met at
    // 18° since exposure tripled (C-38): gap reaches two levels.
    const PAS_SEGMENT_DEG = 12
    for (const sb of [SB_PLANCHER_NATUREL, SB_PLAFOND_TABLE]) {
      const ciel = nanolamberts(sb)
      for (let l = 0; l < 360; l += PAS_SEGMENT_DEG) {
        const a = octets(bandeRealiste(ciel, brillanceVoieLacteeNl(l, 0), false).couleur)
        const b = octets(
          bandeRealiste(ciel, brillanceVoieLacteeNl(l + PAS_SEGMENT_DEG, 0), false).couleur,
        )
        for (let canal = 0; canal < 3; canal++) {
          expect(Math.abs(a[canal]! - b[canal]!)).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('le profil en longitude ne dépend pas de la latitude : il la module, il ne la remplace pas', () => {
    // Bulb / anticentre ratio same at any latitude, else modulation absorbs T-0102's latitude
    // profile instead of multiplying it.
    const rapport = (b: number): number =>
      brillanceVoieLacteeNl(0, b) / brillanceVoieLacteeNl(ANTICENTRE_DEG, b)
    for (const b of [0, 11, 35, 70]) expect(rapport(b)).toBeCloseTo(rapport(0), 9)
  })
})

describe('composition sur le fond de ciel', () => {
  it('à brillance égale, la bande et le fond rendent la même luminance', () => {
    // Chromaticity normalisation: without it band hue decides its contrast and background exposure
    // stops applying to both contributors.
    for (const sb of [SB_PLANCHER_NATUREL, 20.5, SB_PLAFOND_TABLE]) {
      const seuleBande = luminanceRelative(
        octets(bandeRealiste(0, nanolamberts(sb), false).couleur).map((o) => o / 255) as unknown as
          readonly [number, number, number],
      )
      const seulFond = luminanceRelative(
        octets(fondRealiste(sb)).map((o) => o / 255) as unknown as
          readonly [number, number, number],
      )
      // Encoded values: equality on what is painted, ±1 channel rounding.
      expect(seuleBande).toBeCloseTo(seulFond, 2)
    }
  })

  it('la bande est blanc-bleuté, jamais rose : R ≤ V ≤ B, et moins saturée que le fond', () => {
    const [rBande, vBande, bBande] = octets(
      bandeRealiste(0, nanolamberts(SB_PLANCHER_NATUREL), false).couleur,
    )
    expect(rBande!).toBeLessThanOrEqual(vBande!)
    expect(vBande!).toBeLessThanOrEqual(bBande!)
    // Background MORE blue than band: saturation gap → band reads as starlight, not brighter sky.
    const [rFond, , bFond] = octets(fondRealiste(SB_PLANCHER_NATUREL))
    expect(rBande! / bBande!).toBeGreaterThan(rFond! / bFond!)
    // Never interface hue (magenta) again; only galactic-centre reticle + labels (T-0101, decision
    // 2).
    expect(bandeRealiste(nanolamberts(20.5), brillanceVoieLacteeNl(0, 0), false).couleur).not.toBe(
      palette(false).voieLactee,
    )
  })

  it('s’efface en ville et s’impose sur un ciel noir, sans aucun seuil', () => {
    // Bortle 9: band shifts background <0.15 mag anywhere; invisible BY THE MODEL, no branch.
    for (let b = 0; b <= 90; b += 2) {
      for (let l = 0; l < 360; l += 15) {
        expect(elevationMag(SB_PLAFOND_TABLE, l, b)).toBeLessThan(0.15)
      }
    }
    // Darkest table sky: >1 mag in galactic plane, more toward bulb.
    expect(elevationMag(SB_PLANCHER_NATUREL, ANTICENTRE_DEG, 0)).toBeGreaterThan(1)
    expect(elevationMag(SB_PLANCHER_NATUREL, 0, 0)).toBeGreaterThan(
      elevationMag(SB_PLANCHER_NATUREL, ANTICENTRE_DEG, 0),
    )
  })

  it('la part décroît avec la latitude et avec la pollution', () => {
    const part = (sb: number, b: number) =>
      bandeRealiste(nanolamberts(sb), brillanceVoieLacteeNl(ANTICENTRE_DEG, b), false).part
    expect(part(SB_PLANCHER_NATUREL, 0)).toBeGreaterThan(part(SB_PLANCHER_NATUREL, 20))
    expect(part(SB_PLANCHER_NATUREL, 20)).toBeGreaterThan(part(SB_PLANCHER_NATUREL, 60))
    expect(part(SB_PLANCHER_NATUREL, 0)).toBeGreaterThan(part(SB_PLAFOND_TABLE, 0))
  })

  it('mode nuit : la bande ne rend que du rouge', () => {
    const [, v, b] = octets(
      bandeRealiste(nanolamberts(SB_PLANCHER_NATUREL), brillanceVoieLacteeNl(0, 0), true).couleur,
    )
    expect(v).toBe(0)
    expect(b).toBe(0)
  })
})
