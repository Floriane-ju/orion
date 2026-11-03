/**
 * §6.3 — détectabilité, four verdicts. PRD's three reference cases checked by calc, not
 * memorised: M57 is 18× brighter per arcsec² than a Bortle 4,5 sky though 5 mag fainter than
 * M31 in integrated magnitude; M33, brighter than M57 in magnitude, is 7× fainter than that
 * same sky background.
 */

import { describe, expect, it } from 'vitest'
import {
  detectabilite,
  gainInstrumental,
  rapportAuFondDeCiel,
} from '../src/core/detectability.ts'
import { seuilContraste, TABLE_CONTRASTE } from '../src/registry/contrast.ts'
import { profilOptique } from '../src/core/optics.ts'
import { BOITIER_REFERENCE, capteurEffectif } from '../src/data/equipment.ts'

const OPTIQUE = profilOptique({
  focaleMm: 120,
  ouvertureN: 2.8,
  ...capteurEffectif(BOITIER_REFERENCE, 'FULL_FRAME'),
})

/** Reference site: Bortle 4,5 → SB 20,95 mag/arcsec², naked-eye m_lim 6,05. */
const CIEL = { sbCiel: 20.95, mLimOeil: 6.05, dMm: OPTIQUE.dMm.value }

describe('brillance de surface §6.3', () => {
  it('retrouve les trois cas de référence du PRD', () => {
    const m57 = detectabilite({ mInt: 8.8, aArcmin: 1.4, bArcmin: 1.0, typeObjet: 'NEB_PLANETAIRE', ...CIEL })
    const m31 = detectabilite({ mInt: 3.4, aArcmin: 190, bArcmin: 60, typeObjet: 'GALAXIE', ...CIEL })
    const m33 = detectabilite({ mInt: 5.7, aArcmin: 71, bArcmin: 42, typeObjet: 'GALAXIE', ...CIEL })

    expect(m57.sbObj.value).toBeCloseTo(17.79, 2)
    expect(m57.deltaSb.value).toBeCloseTo(3.16, 2)
    expect(m31.sbObj.value).toBeCloseTo(22.17, 2)
    expect(m31.deltaSb.value).toBeCloseTo(-1.22, 2)
    // PRD writes 23,02: it is 23,0164 with rounded factor 8,63. Engine computes π/4 × 3600
    // instead of copying: 23,0148; gap 0,002 mag.
    expect(m33.sbObj.value).toBeCloseTo(23.02, 1)
    expect(m33.sbObj.value).toBeCloseTo(23.0148, 3)
    expect(m33.deltaSb.value).toBeCloseTo(-2.07, 1)
  })

  it('mesure le signal de M33 à sept fois plus faible que le fond de ciel', () => {
    const m33 = detectabilite({ mInt: 5.7, aArcmin: 71, bArcmin: 42, typeObjet: 'GALAXIE', ...CIEL })
    expect(rapportAuFondDeCiel(m33.deltaSb.value!)).toBeCloseTo(6.7, 1)
    expect(m33.explication).toMatch(/7 fois plus pâle/)
  })
})

describe('les quatre verdicts §6.3', () => {
  it('rend M33 en photo seulement, avec l’explication de la magnitude trompeuse', () => {
    const m33 = detectabilite({ mInt: 5.7, aArcmin: 71, bArcmin: 42, typeObjet: 'GALAXIE', ...CIEL })
    expect(m33.verdict).toBe('PHOTO_SEULE')
    expect(m33.explication).toMatch(/invisible à l’œil/)
    expect(m33.explication).toMatch(/une longue pose le fera apparaître/)
  })

  it('garde M31 à l’œil nu et M57 aux jumelles', () => {
    const m31 = detectabilite({ mInt: 3.4, aArcmin: 190, bArcmin: 60, typeObjet: 'GALAXIE', ...CIEL })
    const m57 = detectabilite({ mInt: 8.8, aArcmin: 1.4, bArcmin: 1.0, typeObjet: 'NEB_PLANETAIRE', ...CIEL })
    expect(m31.verdict).toBe('OEIL_NU')
    expect(m57.verdict).toBe('JUMELLES')
  })

  it('n’augmente jamais la brillance de surface : seule la taille apparente joue', () => {
    // Two very different diameters, same ΔSB: threshold tied to apparent size changes, never
    // contrast itself.
    const petit = detectabilite({ mInt: 9, aArcmin: 10, bArcmin: 10, typeObjet: 'GALAXIE', ...CIEL, dMm: 30 })
    const grand = detectabilite({ mInt: 9, aArcmin: 10, bArcmin: 10, typeObjet: 'GALAXIE', ...CIEL, dMm: 300 })
    expect(grand.deltaSb.value).toBeCloseTo(petit.deltaSb.value!, 6)
    expect(gainInstrumental(300)).toBeGreaterThan(gainInstrumental(30))
  })

  it('module la tolérance à la Lune par le type d’objet', () => {
    const emission = detectabilite({ mInt: 6, aArcmin: 60, bArcmin: 40, typeObjet: 'EMISSION', ...CIEL })
    const galaxie = detectabilite({ mInt: 6, aArcmin: 60, bArcmin: 40, typeObjet: 'GALAXIE', ...CIEL })
    expect(emission.toleranceLune).toBe('FORTE')
    expect(emission.conseilType).toMatch(/bi-bande/)
    expect(galaxie.toleranceLune).toBe('FAIBLE')
    expect(galaxie.conseilType).toMatch(/aucun filtre n’aide/)
  })

  it('ne pénalise pas une cible pour une Lune sous l’horizon, et le dit', () => {
    const galaxie = detectabilite({
      mInt: 6,
      aArcmin: 60,
      bArcmin: 40,
      typeObjet: 'GALAXIE',
      ...CIEL,
      lune: { altitudeDeg: -12 },
    })
    expect(galaxie.noteLune).toMatch(/Lune couchée : aucune gêne/)
    const sansLune = detectabilite({ mInt: 6, aArcmin: 60, bArcmin: 40, typeObjet: 'GALAXIE', ...CIEL })
    expect(galaxie.deltaSb.value).toBe(sansLune.deltaSb.value)
  })

  it('n’estime rien pour un objet sans magnitude au catalogue', () => {
    const inconnu = detectabilite({ mInt: null, aArcmin: 12, bArcmin: 8, typeObjet: 'GALAXIE', ...CIEL })
    expect(inconnu.sbObj.value).toBeNull()
    expect(inconnu.deltaSb.value).toBeNull()
    expect(inconnu.verdict).toBeNull()
    expect(inconnu.sbObj.flags).toContain('DONNEE_MANQUANTE')
    expect(inconnu.explication).toMatch(/absente du catalogue/)
  })

  it('n’évalue aucun verdict visuel quand le fond de ciel sort de la table', () => {
    const horsTable = detectabilite({
      mInt: 3.4,
      aArcmin: 190,
      bArcmin: 60,
      typeObjet: 'GALAXIE',
      sbCiel: 20.95,
      mLimOeil: null,
      dMm: CIEL.dMm,
    })
    expect(horsTable.verdict).toBe('PHOTO_SEULE')
    expect(horsTable.mLimInstr.value).toBeNull()
    expect(horsTable.mLimInstr.note).toMatch(/non évaluée/)
  })
})

describe('table de contraste §6.3', () => {
  it('n’extrapole pas : ponctuel en dessous, plateau au-delà', () => {
    expect(seuilContraste(0.5)).toBeNull()
    const plateau = TABLE_CONTRASTE[TABLE_CONTRASTE.length - 1]!
    expect(seuilContraste(plateau.tailleArcmin * 10)).toBe(plateau.seuilDeltaSb)
  })

  it('abaisse le seuil quand la taille apparente augmente', () => {
    expect(seuilContraste(30)!).toBeLessThan(seuilContraste(3)!)
  })
})
