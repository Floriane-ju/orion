/**
 * §3.7 — la Voie lactée composée comme une brillance (T-0101, T-0102, T-0105).
 *
 * Ce que ces tests protègent n'est pas un aspect mais une PROPRIÉTÉ : la bande s'atténue vers
 * les pôles galactiques et s'efface sur un ciel pollué parce que la physique le dit, sans
 * qu'aucun seuil, aucune opacité de convention ni aucune latitude de coupure n'intervienne.
 * C'est ce qui distingue ce rendu du calque teinté qu'il remplace.
 */

import { describe, expect, it } from 'vitest'
import { brillanceVoieLacteeNl, sbDepuisNanolamberts } from '../src/core/fond-ciel-rendu.ts'
import { nanolamberts } from '../src/core/moon.ts'
import { bandeRealiste, fondRealiste, luminanceRelative, palette } from '../src/ui/couleurs.ts'
import { SB_PLAFOND_TABLE, SB_PLANCHER_NATUREL } from '../src/registry/bortle.ts'
import { K } from '../src/registry/constants.ts'

const octets = (css: string): readonly number[] => css.slice(4, -1).split(' ').map(Number)

/** Longitude de l'anticentre : la borne faible du profil en longitude. */
const ANTICENTRE_DEG = 180

/** Élévation du fond de ciel, en magnitudes, apportée par la bande dans cette direction. */
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
    // C'est la raison d'être du ticket : sous une demi-magnitude d'écart, la non-uniformité
    // ne se verrait pas, et un modèle uniforme suffirait.
    const ecartBortle = K('SB_VOIE_LACTEE_PLAN_MAG') - K('SB_VOIE_LACTEE_BULBE_MAG')
    expect(ecartBortle).toBeGreaterThanOrEqual(0.5)
  })

  it('deux segments de longitude voisins rendent la même couleur à un 255e près', () => {
    // C'est ce qui fixe PAS_LONGITUDE_BANDE_DEG = 12 dans `voie-lactee.ts` : la bande y est
    // découpée en longitude, et une marche de couleur visible entre deux segments se lirait
    // comme une couture. Le critère est celui déjà mesuré pour le pas de latitude — et il
    // n'est PAS satisfait à 18° depuis que l'exposition a triplé (C-38), où l'écart passe à
    // deux niveaux.
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
    // Le rapport bulbe / anticentre est le même à toute latitude. Sans cette propriété, la
    // modulation aurait absorbé le profil en latitude de T-0102 au lieu de s'y multiplier.
    const rapport = (b: number): number =>
      brillanceVoieLacteeNl(0, b) / brillanceVoieLacteeNl(ANTICENTRE_DEG, b)
    for (const b of [0, 11, 35, 70]) expect(rapport(b)).toBeCloseTo(rapport(0), 9)
  })
})

describe('composition sur le fond de ciel', () => {
  it('à brillance égale, la bande et le fond rendent la même luminance', () => {
    // C'est le test de la normalisation de la chromaticité : sans elle, la teinte choisie pour
    // la bande déciderait de son contraste, et l'exposition du fond cesserait de valoir pour
    // les deux contributeurs.
    for (const sb of [SB_PLANCHER_NATUREL, 20.5, SB_PLAFOND_TABLE]) {
      const seuleBande = luminanceRelative(
        octets(bandeRealiste(0, nanolamberts(sb), false).couleur).map((o) => o / 255) as unknown as
          readonly [number, number, number],
      )
      const seulFond = luminanceRelative(
        octets(fondRealiste(sb)).map((o) => o / 255) as unknown as
          readonly [number, number, number],
      )
      // Comparaison en valeurs encodées : l'égalité porte sur ce qui est peint, à l'arrondi
      // d'un canal près.
      expect(seuleBande).toBeCloseTo(seulFond, 2)
    }
  })

  it('la bande est blanc-bleuté, jamais rose : R ≤ V ≤ B, et moins saturée que le fond', () => {
    const [rBande, vBande, bBande] = octets(
      bandeRealiste(0, nanolamberts(SB_PLANCHER_NATUREL), false).couleur,
    )
    expect(rBande!).toBeLessThanOrEqual(vBande!)
    expect(vBande!).toBeLessThanOrEqual(bBande!)
    // Le fond penche PLUS vers le bleu que la bande : c'est l'écart de saturation qui fait lire
    // la bande comme de la lumière d'étoiles et non comme un ciel plus clair.
    const [rFond, , bFond] = octets(fondRealiste(SB_PLANCHER_NATUREL))
    expect(rBande! / bBande!).toBeGreaterThan(rFond! / bFond!)
    // Et surtout : plus jamais la teinte d'interface, qui est du magenta. Elle ne sert plus
    // qu'au réticule du centre galactique et aux labels (T-0101, décision 2).
    expect(bandeRealiste(nanolamberts(20.5), brillanceVoieLacteeNl(0, 0), false).couleur).not.toBe(
      palette(false).voieLactee,
    )
  })

  it('s’efface en ville et s’impose sur un ciel noir, sans aucun seuil', () => {
    // Bortle 9 : la bande ne déplace le fond nulle part de plus de 0,15 mag. Invisible PAR LE
    // MODÈLE — il n'y a pas de branche qui l'éteigne.
    for (let b = 0; b <= 90; b += 2) {
      for (let l = 0; l < 360; l += 15) {
        expect(elevationMag(SB_PLAFOND_TABLE, l, b)).toBeLessThan(0.15)
      }
    }
    // Le ciel le plus noir de la table : plus d'une magnitude dans le plan galactique, et
    // davantage encore vers le bulbe.
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
