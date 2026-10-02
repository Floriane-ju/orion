import { describe, expect, it } from 'vitest'
import { poseCadreAffichee, type MaterielFile } from '../src/ui/planetarium-materiel.ts'

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
