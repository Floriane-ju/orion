import { describe, expect, it } from 'vitest'
import {
  ciblesMarquees,
  enAvantScene,
  poseCadreAffichee,
  type MaterielFile,
} from '../src/ui/planetarium-materiel.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'

// L'optique est opaque pour la règle : seule son identité compte.
const MATERIEL = { optique: {} } as unknown as MaterielFile

describe('poseCadreAffichee — T-0377', () => {
  it('peint la carte en Panorama quand la bascule est cochée et le matériel connu', () => {
    expect(poseCadreAffichee('PANORAMA', true, MATERIEL)).toBe(MATERIEL.optique)
  })

  it('ne peint jamais la carte en ciel profond, même cochée', () => {
    expect(poseCadreAffichee('CIEL_PROFOND', true, MATERIEL)).toBeNull()
  })

  it('ne peint rien sans bascule ou sans matériel', () => {
    expect(poseCadreAffichee('PANORAMA', false, MATERIEL)).toBeNull()
    expect(poseCadreAffichee('PANORAMA', true, undefined)).toBeNull()
  })
})

describe('ciblesMarquees — T-0283', () => {
  const CIBLE = { designation: 'B144' } as ObjetCielProfond
  const PLAN = [{ designation: 'M31' }, { designation: 'M42' }] as ObjetCielProfond[]

  it('marque la cible tant que sa fiche est ouverte', () => {
    expect(ciblesMarquees('CIEL_PROFOND', 'FICHE', CIBLE, PLAN)).toEqual([CIBLE])
  })

  it('efface le repère au retour à la liste, et en Panorama', () => {
    expect(ciblesMarquees('CIEL_PROFOND', 'LISTE', CIBLE, PLAN)).toEqual([])
    expect(ciblesMarquees('PANORAMA', 'FICHE', CIBLE, PLAN)).toEqual([])
  })

  it('sur « Mon plan », marque chaque cible photographiée cette nuit', () => {
    expect(ciblesMarquees('PLAN', 'FICHE', CIBLE, PLAN)).toEqual(PLAN)
  })
})

describe('enAvantScene — onglet « Mon plan »', () => {
  const FILTRE: ReadonlySet<string> = new Set(['NGC 7000'])
  const PLAN = [{ designation: 'M31' }, { designation: 'M42' }] as ObjetCielProfond[]

  it('sur « Mon plan », seules les cibles du plan restent en pleine lumière', () => {
    expect(enAvantScene('PLAN', FILTRE, PLAN)).toEqual(new Set(['M31', 'M42']))
  })

  it('un plan vide estompe tout le ciel profond', () => {
    expect(enAvantScene('PLAN', null, [])).toEqual(new Set())
  })

  it('ailleurs, les filtres du catalogue décident', () => {
    expect(enAvantScene('CIEL_PROFOND', FILTRE, PLAN)).toBe(FILTRE)
    expect(enAvantScene('PANORAMA', null, PLAN)).toBeNull()
  })
})
