import { describe, expect, it } from 'vitest'
import { syntheseFiche, type CalculFiche } from '../src/ui/fiche-synthese.ts'
import type { CreneauFiche } from '../src/ui/fiche-cible-creneau.ts'

const T0 = Date.UTC(2026, 9, 2, 20)
const MS_H = 3_600_000
const instant = (h: number) => new Date(T0 + h * MS_H)

const CALCUL: CalculFiche = { pose: { tAfficheeS: 30 }, integration: { nPoses: { value: 240 } } }
const creneau = (bornes: readonly (readonly [number, number])[]): CreneauFiche =>
  ({
    chiffre: true,
    creneau: { creneaux: bornes.map(([d, f]) => ({ debut: instant(d), fin: instant(f) })) },
  }) as unknown as CreneauFiche

describe('synthèse en tête de fiche — T-0282', () => {
  it('reprend l’étape du plan quand la cible y est inscrite', () => {
    const etape = { tPoseS: 20, nPoses: 90, creneauAlloue: { debut: instant(1), fin: instant(2) } }
    expect(syntheseFiche(CALCUL, creneau([[0, 4]]), etape)).toEqual({
      poseS: etape.tPoseS,
      nPoses: etape.nPoses,
      creneau: etape.creneauAlloue,
      auPlan: true,
    })
  })

  it('répond avec le calcul de la fiche hors du plan, créneau GEM réuni', () => {
    const s = syntheseFiche(CALCUL, creneau([[0, 2], [2.5, 4]]), null)
    expect(s.poseS).toBe(CALCUL.pose!.tAfficheeS)
    expect(s.nPoses).toBe(CALCUL.integration!.nPoses.value)
    expect(s.creneau).toEqual({ debut: instant(0), fin: instant(4) })
    expect(s.auPlan).toBe(false)
  })

  it('ne chiffre rien de ce qui n’est pas calculé', () => {
    const vide = syntheseFiche(
      { pose: null, integration: null },
      { chiffre: false, cause: 'nuit inconnue' },
      null,
    )
    expect(vide).toEqual({ poseS: null, nPoses: null, creneau: null, auPlan: false })
  })
})
