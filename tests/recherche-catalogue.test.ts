/**
 * T-0052 — chercher un objet du catalogue par son nom.
 *
 * Le catalogue est forgé ici : ce qui est vérifié est la règle de recherche — quoi se
 * cherche, dans quel ordre les réponses viennent — pas le contenu d'OpenNGC. Le seul point
 * qui touche le vrai catalogue est la portée : elle ne s'arrête pas au plafond de rendu.
 */

import { describe, expect, it } from 'vitest'
import { chercheCatalogue } from '../src/core/recherche-catalogue.ts'
import { decodeObjets, type ObjetCielProfond } from '../src/data/deepsky.ts'
import { NOMS_FR } from '../src/registry/noms-fr.ts'
import { objetGalaxie as objet, paquet } from './fixtures.ts'

const M45 = objet({
  designation: 'M45',
  nomsCommuns: 'Pléiades|Mel022',
  type: 'AMAS_OUVERT',
  vMag: 1.6,
})
const M31 = objet({ designation: 'M31', nomsCommuns: 'Andromède|NGC0224', vMag: 3.4 })
const IC0434 = objet({ designation: 'IC0434', vMag: 12.1 })

const CATALOGUE = [IC0434, M31, M45]

function designations(objets: readonly ObjetCielProfond[]): readonly string[] {
  return objets.map((o) => o.designation)
}

describe('chercheCatalogue — la désignation et les noms communs', () => {
  it('trouve par désignation', () => {
    expect(designations(chercheCatalogue(CATALOGUE, 'M45', 10))).toEqual(['M45'])
  })

  it('trouve par nom commun, casse et accents ignorés', () => {
    expect(designations(chercheCatalogue(CATALOGUE, 'pleiades', 10))).toEqual(['M45'])
    expect(designations(chercheCatalogue(CATALOGUE, 'PLÉIADES', 10))).toEqual(['M45'])
  })

  it('cherche chacun des noms communs, pas seulement le premier', () => {
    expect(designations(chercheCatalogue(CATALOGUE, 'NGC0224', 10))).toEqual(['M31'])
    expect(designations(chercheCatalogue(CATALOGUE, 'Mel022', 10))).toEqual(['M45'])
  })

  it('trouve sur une occurrence interne', () => {
    expect(designations(chercheCatalogue(CATALOGUE, 'romède', 10))).toEqual(['M31'])
  })

  it('ne rend rien sur une saisie vide ou blanche', () => {
    expect(chercheCatalogue(CATALOGUE, '', 10)).toEqual([])
    expect(chercheCatalogue(CATALOGUE, '   ', 10)).toEqual([])
  })
})

describe('chercheCatalogue — l’ordre des réponses', () => {
  it('met un préfixe devant une occurrence interne, même moins brillant', () => {
    const catalogue = [
      objet({ designation: 'INTERNE', nomsCommuns: 'grande nébuleuse', vMag: 2 }),
      objet({ designation: 'PREFIXE', nomsCommuns: 'nébuleuse du Voile', vMag: 9 }),
    ]
    expect(designations(chercheCatalogue(catalogue, 'nébuleuse', 10))).toEqual([
      'PREFIXE',
      'INTERNE',
    ])
  })

  it('à rang égal, le plus brillant d’abord', () => {
    // Trois préfixes « M » : l'ordre ne peut venir que de la magnitude.
    const catalogue = [M31, M45]
    expect(designations(chercheCatalogue(catalogue, 'M', 10))).toEqual(['M45', 'M31'])
  })

  it('un objet sans magnitude ne passe pas devant un objet qui en a une', () => {
    const catalogue = [
      objet({ designation: 'NGC0001', vMag: null }),
      objet({ designation: 'NGC0002', vMag: 14 }),
    ]
    expect(designations(chercheCatalogue(catalogue, 'NGC', 10))).toEqual(['NGC0002', 'NGC0001'])
  })
})

describe('chercheCatalogue — la portée n’est pas le rendu', () => {
  it('plafonne le nombre de résultats rendus', () => {
    const catalogue = Array.from({ length: 50 }, (_, i) =>
      objet({ designation: `NGC${i}`, vMag: i }),
    )
    expect(chercheCatalogue(catalogue, 'NGC', 5)).toHaveLength(5)
  })

  it('cherche au-delà du plafond : un objet en fin de catalogue reste atteignable', () => {
    const catalogue = [
      ...Array.from({ length: 500 }, (_, i) => objet({ designation: `IC${i}` })),
      M45,
    ]
    expect(designations(chercheCatalogue(catalogue, 'M45', 10))).toEqual(['M45'])
  })
})

/**
 * T-0281 — ici, et ici seulement, le VRAI catalogue.
 *
 * Ce que le ticket reproche n'est pas une règle de tri, c'est un écart entre ce que
 * l'utilisateur tape et ce que les amonts écrivent : « NGC 224 » contre « NGC0224 »,
 * « andromède » contre « Andromeda Galaxy ». Un catalogue forgé ne peut pas le montrer —
 * il porterait déjà l'orthographe qu'on veut vérifier.
 */
const REEL: readonly ObjetCielProfond[] = [
  ...decodeObjets({
    enregistrements: paquet('openngc-1.bin'),
    chaines: paquet('openngc-noms-1.bin'),
  }),
  ...decodeObjets({
    enregistrements: paquet('deepsky-1.bin'),
    chaines: paquet('deepsky-noms-1.bin'),
  }),
]

function premier(saisie: string): string | undefined {
  return chercheCatalogue(REEL, saisie, 10)[0]?.designation
}

describe('T-0281 — la saisie n’a pas à imiter l’orthographe du catalogue', () => {
  it('ignore l’espacement, la casse, les tirets et les zéros de cadrage', () => {
    for (const saisie of ['NGC 224', 'NGC224', 'ngc0224', 'NGC-224']) {
      expect(premier(saisie), saisie).toBe('M31')
    }
    expect(premier('M 42')).toBe('M42')
  })

  it('ne retire le zéro qu’en tête d’un groupe : « M100 » n’est pas « M1 »', () => {
    expect(premier('M100')).toBe('M100')
  })
})

describe('T-0281 — §6.4 : les noms français atteignent leur objet', () => {
  it('rend l’objet attendu en premier', () => {
    expect(premier('andromède')).toBe('M31')
    expect(premier('nébuleuse d’Orion')).toBe('M42')
    expect(premier('amérique du nord')).toBe('NGC7000')
  })

  it('« dentelles du cygne » rend les deux arcs du Voile', () => {
    const trouves = designations(chercheCatalogue(REEL, 'dentelles du cygne', 10))
    expect(trouves).toContain('NGC6960')
    expect(trouves).toContain('NGC6992')
  })

  /**
   * Une clé fautive ne casse rien : elle rend un nom introuvable en silence. Le test la nomme.
   */
  it('ne nomme aucun objet absent du catalogue', () => {
    const connues = new Set(REEL.map((o) => o.designation))
    expect(Object.keys(NOMS_FR).filter((d) => !connues.has(d))).toEqual([])
  })
})
