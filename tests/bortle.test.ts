/** §2.2 — acceptance criteria for Bortle table + fond de ciel. */

import { describe, expect, it } from 'vitest'
import { BortleHorsTableError, interpoleBortle } from '../src/registry/bortle.ts'
import { fondDeCiel, FondDeCielIndeterminableError } from '../src/core/fond-ciel.ts'

describe('table Bortle §2.2', () => {
  it('interpole entre les lignes 4 et 5 pour un Bortle de 4,5', () => {
    const ligne = interpoleBortle(4.5)
    expect(ligne.sb).toBeCloseTo(20.95, 10)
    expect(ligne.mLimOeil).toBeCloseTo(6.05, 10)
  })

  it('refuse toute valeur hors [1 ; 9] plutôt que d’extrapoler', () => {
    // Linear extrapolation gave 23.4 mag/arcsec² at Bortle 1: physically impossible.
    expect(() => interpoleBortle(0.9)).toThrow(BortleHorsTableError)
    expect(() => interpoleBortle(9.1)).toThrow(BortleHorsTableError)
    expect(() => interpoleBortle(Number.NaN)).toThrow(BortleHorsTableError)
  })

  it('rend les ancrages du socle sans les déformer', () => {
    expect(interpoleBortle(4).sb).toBe(21.3)
    expect(interpoleBortle(8).sb).toBe(18.5)
  })
})

describe('fond de ciel §2.2, §4.1', () => {
  it('fait prévaloir le SQM mesuré sur le Bortle déclaré', () => {
    const ciel = fondDeCiel({ sqmMesure: 21.1, bortleDeclare: 6 })
    expect(ciel.sourceSb).toBe('SQM_MESURE')
    expect(ciel.sbCiel.value).toBe(21.1)
    // 21.1 falls between rows 4 (SB 21.3 → 6.3) and 5 (SB 20.6 → 5.8):
    // fraction 0.2857 → 6.3 − 0.2857 × 0.5 = 6.157.
    expect(ciel.mLimOeil.value).toBeCloseTo(6.157, 3)
  })

  it('demande confirmation pour un SQM plus sombre que le fond de ciel naturel', () => {
    const ciel = fondDeCiel({ sqmMesure: 23.0 })
    expect(ciel.confirmationRequise).toMatch(/plus noir que le ciel le plus noir connu/)
    // Outside table domain: no limiting magnitude extrapolated.
    expect(ciel.mLimOeil.value).toBeNull()
    expect(ciel.mLimOeil.flags).toContain('DONNEE_MANQUANTE')
  })

  it('accepte la même valeur une fois confirmée', () => {
    expect(fondDeCiel({ sqmMesure: 23.0, sqmConfirme: true }).confirmationRequise).toBeUndefined()
  })

  it('refuse de deviner sans aucune source', () => {
    expect(() => fondDeCiel({})).toThrow(FondDeCielIndeterminableError)
  })

  it('trace chaque sortie jusqu’à sa formule', () => {
    const ciel = fondDeCiel({ bortleDeclare: 4.5 })
    expect(ciel.sbCiel.formula.section).toBe('2.2')
    expect(ciel.sbCiel.formula.expression).toContain('SB')
    expect(ciel.sbCiel.inputs.bortle).toBe(4.5)
  })
})
