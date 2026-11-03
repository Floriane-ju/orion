/**
 * T-0099 — crépuscule brightens the fond de ciel. Three checks:
 *  1. TABLE — Patat 2006 domain respected at both edges, polynomial never extended: peak at
 *     18,3° depression, then descends;
 *  2. RACCORD — contribution reaches zero by itself before nuit astronomique, no jump, stays
 *     zero at any night depth;
 *  3. USER view — limiting magnitude follows effective fond, hue doesn't drift, high-latitude
 *     summer night rendered, not black.
 */

import { describe, expect, it } from 'vitest'
import { Body } from 'astronomy-engine'
import { positionCorps, type Site } from '../src/core/ephem.ts'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { nanolamberts } from '../src/core/moon.ts'
import {
  brillanceCrepusculeNl,
  adaptationEcran,
  composantesFond,
  sbEffectifRendu,
  sbZenithAvecCrepuscule,
} from '../src/core/fond-ciel-rendu.ts'
import { magnitudeRendue } from '../src/core/projection.ts'
import {
  CREPUSCULE_V,
  DEPRESSION_FIN_CREPUSCULE_DEG,
  DEPRESSION_MIN_TABLE_DEG,
  SB_NUIT_SITE_REFERENCE_MAG,
  SOURCE_CREPUSCULE,
  sbCrepusculeZenith,
} from '../src/registry/crepuscule.ts'
import { interpoleBortle, M_LIM_OEIL_PLANCHER } from '../src/registry/bortle.ts'
import { K } from '../src/registry/constants.ts'

const ZENITH_DEG = 90
const HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG = -K('HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG')
const SB_B1 = interpoleBortle(1).sb
const SB_B8 = interpoleBortle(8).sb
const FOV_DEG = 60

describe('la table du crépuscule', () => {
  it('cite sa source et ses bornes, et interdit l’extrapolation', () => {
    expect(SOURCE_CREPUSCULE).toContain('Patat')
    expect(SOURCE_CREPUSCULE).toContain('2006')
    expect(SOURCE_CREPUSCULE).toContain('extrapolation interdite')
    expect(DEPRESSION_MIN_TABLE_DEG).toBe(CREPUSCULE_V.zetaMinDeg - ZENITH_DEG)
  })

  /**
   * Raccord ≠ table edge: it is the root of μ(ζ) = Paranal night background. Paper: night
   * level reached near ζ = 105°-106° (15°-16° depression); root must fall inside, else one of
   * the two figures is misread.
   */
  it('finit là où la source dit que la nuit commence, entre 15° et 16°', () => {
    expect(DEPRESSION_FIN_CREPUSCULE_DEG).toBeGreaterThan(15)
    expect(DEPRESSION_FIN_CREPUSCULE_DEG).toBeLessThan(16)
    const fin = sbCrepusculeZenith(DEPRESSION_FIN_CREPUSCULE_DEG - 1e-9)
    expect(fin?.value).toBeCloseTo(SB_NUIT_SITE_REFERENCE_MAG, 6)
  })

  it('plafonne au bord bas de la table et le déclare, au lieu de prolonger', () => {
    const bord = sbCrepusculeZenith(DEPRESSION_MIN_TABLE_DEG)
    expect(bord).not.toBeNull()
    expect(bord?.value).toBeCloseTo(CREPUSCULE_V.a0, 10)
    expect(bord?.borne).toBe('AUCUNE')
    // Civil twilight, Sun still above horizon: same value, declared bound.
    for (const depression of [DEPRESSION_MIN_TABLE_DEG - 1e-9, 0, -5]) {
      const sous = sbCrepusculeZenith(depression)
      expect(sous?.value).toBeCloseTo(CREPUSCULE_V.a0, 10)
      expect(sous?.borne).toBe('CIEL_PLUS_CLAIR')
    }
  })

  it('refuse de répondre au-delà du crépuscule, et pour une entrée non finie', () => {
    expect(sbCrepusculeZenith(DEPRESSION_FIN_CREPUSCULE_DEG)).toBeNull()
    expect(sbCrepusculeZenith(Number.NaN)).toBeNull()
  })
})

describe('la contribution du crépuscule', () => {
  it('est exactement nulle dès la nuit astronomique, et le reste', () => {
    expect(HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG).toBeGreaterThan(DEPRESSION_FIN_CREPUSCULE_DEG)
    for (const depression of [HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG, 20, 40, 90]) {
      expect(brillanceCrepusculeNl(depression)).toBe(0)
    }
    // Fond returns to site's exactly, to the pixel: not a neighbouring rounding.
    expect(
      sbEffectifRendu({
        sbSiteMag: SB_B1,
        hauteurDeg: ZENITH_DEG,
        depressionSolaireDeg: HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG,
      }),
    ).toBe(sbEffectifRendu({ sbSiteMag: SB_B1, hauteurDeg: ZENITH_DEG }))
  })

  /**
   * Polynomial peaks at 18,3° depression then DESCENDS: extended, it gives twilight sky at
   * full night. Guards against "fixing" the guard-rail to widen the domain.
   */
  it('ne réapparaît pas au-delà du sommet du polynôme', () => {
    const { a1, a2 } = CREPUSCULE_V
    const sommet = DEPRESSION_MIN_TABLE_DEG + -a1 / (2 * a2)
    expect(sommet).toBeGreaterThan(DEPRESSION_FIN_CREPUSCULE_DEG)
    expect(brillanceCrepusculeNl(sommet + 5)).toBe(0)
  })

  it('croît quand le Soleil remonte, sans saut au raccord', () => {
    const pas = 0.1
    let precedent = 0
    for (let depression = DEPRESSION_FIN_CREPUSCULE_DEG; depression >= 0; depression -= pas) {
      const b = brillanceCrepusculeNl(depression)
      expect(b).toBeGreaterThanOrEqual(precedent)
      precedent = b
    }
    // Continuity at raccord: both sides, gap to darkest table site fond < 0.01 mag, invisible
    // while sliding cursor.
    const juste = sbZenithAvecCrepuscule(SB_B1, DEPRESSION_FIN_CREPUSCULE_DEG - 1e-2)
    expect(SB_B1 - juste).toBeLessThan(0.01)
    expect(SB_B1 - juste).toBeGreaterThan(0)
  })

  /**
   * Crépuscule = ATMOSPHERIC glow: adds to site's fond, doesn't replace it. City sky stays
   * brighter than mountain pass at same depression.
   */
  it('s’ajoute au site en nanolamberts, sans jamais l’assombrir', () => {
    for (const depression of [6, 10, 14]) {
      const bCrepuscule = brillanceCrepusculeNl(depression)
      expect(bCrepuscule).toBeGreaterThan(0)
      expect(nanolamberts(sbZenithAvecCrepuscule(SB_B1, depression))).toBeCloseTo(
        nanolamberts(SB_B1) + bCrepuscule,
        6,
      )
      expect(sbZenithAvecCrepuscule(SB_B8, depression)).toBeLessThan(
        sbZenithAvecCrepuscule(SB_B1, depression),
      )
    }
  })
})

describe('ce que l’utilisateur voit', () => {
  /**
   * Ticket criterion: at Sun −6°, realistic view shows a handful of stars. Effective fond
   * falls below Bortle table bottom — T-0357: limiting magnitude follows Schaefer threshold,
   * BELOW table edge, and SAYS so (precedent T-0100).
   */
  it('à Soleil −6°, plafonne la magnitude limite sous le bord de table et le déclare', () => {
    const sb = sbZenithAvecCrepuscule(SB_B1, 6)
    expect(sb).toBeLessThan(interpoleBortle(9).sb)
    const rendue = magnitudeRendue(FOV_DEG, sb, true)
    expect(rendue.value).toBeLessThan(M_LIM_OEIL_PLANCHER)
    expect(rendue.flags).toContain('HORS_DOMAINE')
    expect(rendue.note).toContain('plus clair que Bortle 9')
    // Full night at same site: scene shows far more stars.
    expect(magnitudeRendue(FOV_DEG, SB_B1, true).value).toBeGreaterThan(rendue.value)
  })

  it('ne fait pas virer la teinte du fond tant que l’œil n’a pas à s’adapter', () => {
    const chroma = [
      K('CHROMA_FOND_CIEL_R'),
      K('CHROMA_FOND_CIEL_V'),
      K('CHROMA_FOND_CIEL_B'),
    ] as const
    for (const depression of [12, 20]) {
      const sb = sbZenithAvecCrepuscule(SB_B1, depression)
      expect(adaptationEcran(sb)).toBe(1)
      const composantes = composantesFond(sb)
      const facteur = composantes[1] / chroma[1]
      for (let i = 0; i < 3; i++) expect(composantes[i]).toBeCloseTo(facteur * chroma[i]!, 12)
    }
  })

  it('au crépuscule civil, le zénith reste sous la luminance du jour et bleuit', () => {
    const sb = sbZenithAvecCrepuscule(SB_B1, 6)
    expect(adaptationEcran(sb)).toBeLessThan(1)
    const [r, v, b] = composantesFond(sb)
    // T-0372 — partial adaptation: ceiling is the day's, not twilight's.
    expect(b).toBeLessThan(K('LUMINANCE_ECRAN_ZENITH_ADAPTE'))
    // Bluer than night: red loses to blue.
    expect(r / b).toBeLessThan(K('CHROMA_FOND_CIEL_R'))
    expect(v / b).toBeLessThan(K('CHROMA_FOND_CIEL_V'))
  })

  /**
   * Ticket degraded case: high-latitude summer night. At 50° Sun reaches −16,6° at midnight —
   * nuit astronomique null, but depression already past measured twilight end: contribution
   * null, fond = site's. Neither black nor absent. At 58°, NAUTICAL twilight is permanent,
   * contribution never cancels: fond brighter all night.
   */
  it('rend la nuit d’été à haute latitude sans fond noir ni valeur absente', () => {
    const solstice = new Date('2026-06-21T12:00:00Z')
    const depressionAuMilieuDeNuit = (latitudeDeg: number): number => {
      const site: Site = { latitudeDeg, longitudeDeg: 0, altitudeM: 100 }
      const nuit = fenetreNocturne(site, solstice)
      expect(nuit.etat).toBe('PAS_DE_NUIT_ASTRONOMIQUE')
      const milieu = nuit.milieuNuitVrai
      expect(milieu).not.toBeNull()
      return -positionCorps(Body.Sun, milieu!, site).hauteurDeg
    }

    const a50 = depressionAuMilieuDeNuit(50)
    expect(a50).toBeLessThan(HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG)
    const sb50 = sbZenithAvecCrepuscule(SB_B1, a50)
    expect(Number.isFinite(sb50)).toBe(true)
    expect(composantesFond(sb50)[1]).toBeGreaterThan(0)

    const a58 = depressionAuMilieuDeNuit(58)
    expect(a58).toBeLessThan(DEPRESSION_FIN_CREPUSCULE_DEG)
    expect(brillanceCrepusculeNl(a58)).toBeGreaterThan(0)
    expect(sbZenithAvecCrepuscule(SB_B1, a58)).toBeLessThan(SB_B1)
  })
})
