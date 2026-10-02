import { describe, expect, it } from 'vitest'
import {
  cibleMarquee,
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

describe('cibleMarquee — T-0283', () => {
  const CIBLE = { designation: 'B144' } as ObjetCielProfond

  it('marque la cible tant que sa fiche est ouverte', () => {
    expect(cibleMarquee('CIEL_PROFOND', 'FICHE', CIBLE)).toBe(CIBLE)
  })

  it('efface le repère au retour à la liste, et en Panorama', () => {
    expect(cibleMarquee('CIEL_PROFOND', 'LISTE', CIBLE)).toBeNull()
    expect(cibleMarquee('PANORAMA', 'FICHE', CIBLE)).toBeNull()
  })
})
