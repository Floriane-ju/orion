/**
 * §6.1 focale idéale · §6.2 verdict de cadrage. Reference values: Annexe A + PRD acceptance
 * criteria. Edge-case thread: a cible is écartée with its cause, never with a software
 * recadrage proposal.
 */

import { describe, expect, it } from 'vitest'
import {
  ficheCadrage,
  focaleIdeale,
  REFUS_RECADRAGE_LOGICIEL,
} from '../src/core/cadrage.ts'
import { profilOptique } from '../src/core/optics.ts'
import { BOITIER_REFERENCE, capteurEffectif } from '../src/data/equipment.ts'

const REFERENCE = {
  focaleMm: 120,
  ouvertureN: 2.8,
  ...capteurEffectif(BOITIER_REFERENCE, 'FULL_FRAME'),
}
const OPTIQUE = profilOptique(REFERENCE)
describe('verdict de cadrage §6.2', () => {
  const cadre = (tailleMajArcmin: number, tailleMinArcmin?: number, posAngDeg?: number) =>
    ficheCadrage({
      fovHDeg: OPTIQUE.fovHDeg.value,
      echApx: OPTIQUE.echApx.value,
      capteurHMm: REFERENCE.capteurHMm,
      tailleMajArcmin,
      ...(tailleMinArcmin === undefined ? {} : { tailleMinArcmin }),
      ...(posAngDeg === undefined ? {} : { posAngDeg }),
    })

  it('classe M31 en cadrage large et exploite son grand axe', () => {
    const fiche = cadre(190, 60, 35)
    expect(fiche.remplissage.value).toBeCloseTo(0.278, 3)
    expect(fiche.verdict).toBe('CADRAGE_LARGE')
    expect(fiche.faisable).toBe(true)
    expect(fiche.angleBoitierDeg).toBe(35)
    expect(fiche.noteOrientation).toMatch(/35°/)
  })

  it('exige une mosaïque et chiffre le facteur sur le temps total', () => {
    const fiche = cadre(900, 600)
    expect(fiche.verdict).toBe('MOSAIQUE_REQUISE')
    expect(fiche.nTuiles?.value).toBeGreaterThan(1)
    expect(fiche.nTuiles?.note).toMatch(/fois plus de temps/)
  })

  it('signale l’absence d’angle de position au lieu d’en afficher un arbitraire', () => {
    const fiche = cadre(190, 60)
    expect(fiche.angleBoitierDeg).toBeNull()
    expect(fiche.noteOrientation).toMatch(/orientation inconnue/)
  })

  it('refuse le verdict « faisable » à une cible de 44 px, cause et focale à l’appui', () => {
    // M84: 6.5’ = 0.108° — 0.95 % of champ, 44 px diameter (§6.1).
    const fiche = cadre(6.5, 6.5)
    expect(fiche.diamPx.value).toBeCloseTo(44, 0)
    expect(fiche.faisable).toBe(false)
    expect(fiche.verdict).toBe('HORS_DOMAINE')
    expect(fiche.cause).toMatch(/0.95 % du cadre/)
    expect(fiche.cause).toMatch(/44 px/)
    expect(fiche.focaleIdealeMm).toBeDefined()
  })

  it('ne propose jamais de compenser par un recadrage logiciel', () => {
    const fiche = cadre(6.5, 6.5)
    expect(fiche.cause).toContain(REFUS_RECADRAGE_LOGICIEL)
    expect(fiche.focaleIdealeMm?.note).toContain(REFUS_RECADRAGE_LOGICIEL)
    expect(REFUS_RECADRAGE_LOGICIEL).toMatch(/n’ajoute pas de détail/)
  })

  it('nomme toujours une cause quand la cible est écartée', () => {
    for (const taille of [6.5, 30, 60]) {
      const fiche = cadre(taille, taille)
      if (!fiche.faisable) expect(fiche.cause?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('focale nécessaire §6.1', () => {
  it('encadre la focale de M84 par la fenêtre C-05', () => {
    // PRD says "ordre de 4 200 mm", bound of a one-third champ fill. Retained value aims at 42 %,
    // window middle; plage covers both.
    const focale = focaleIdeale(6.5 / 60, REFERENCE.capteurHMm)
    expect(focale.value).toBeCloseTo(5309, 0)
    expect(focale.range?.[0]).toBeCloseTo(4213, 0)
    expect(focale.range?.[1]).toBeCloseTo(6320, 0)
    expect(focale.formula.id).toBe('FOCALE_IDEALE')
  })
})
