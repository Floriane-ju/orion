/**
 * §10.1 — glossaire contextuel.
 *
 * Le glossaire est indexé sur l'interface, pas sur un lexique : aucun terme affiché ne peut
 * être absent du glossaire. Cette inclusion-là est garantie par le typage — un libellé se
 * rend par sa clé de glossaire, et une clé absente ne compile pas. Ce test vérifie ce que
 * le typage ne peut pas voir : la forme des entrées.
 */

import { describe, expect, it } from 'vitest'
import { GLOSSAIRE, type TermeGlossaire } from '../src/registry/glossaire.ts'

const MOTS_MAX_GLOSE = 20
const PHRASES_MIN = 1
const PHRASES_MAX = 4

function mots(texte: string): number {
  return texte.trim().split(/\s+/).length
}

function phrases(texte: string): number {
  return texte.split(/[.!?]+/).filter((p) => p.trim() !== '').length
}

describe('glossaire §10.1', () => {
  const entrees = Object.entries(GLOSSAIRE)

  it('couvre les termes affichés par le contrat d’entrée', () => {
    expect(entrees.length).toBeGreaterThan(0)
  })

  it('tient la glose en une phrase, majuscule en tête', () => {
    for (const [cle, entree] of entrees) {
      if (entree.glose === undefined) continue
      expect(mots(entree.glose), cle).toBeLessThanOrEqual(MOTS_MAX_GLOSE)
      expect(entree.glose.charAt(0), cle).toBe(entree.glose.charAt(0).toLocaleUpperCase('fr'))
    }
  })

  it('explique, quand elle explique, en une à quatre phrases', () => {
    for (const [cle, entree] of entrees) {
      if (entree.explication === undefined) continue
      expect(phrases(entree.explication), cle).toBeGreaterThanOrEqual(PHRASES_MIN)
      expect(phrases(entree.explication), cle).toBeLessThanOrEqual(PHRASES_MAX)
    }
  })

  it('dit la conséquence, quand il y en a une, en une phrase', () => {
    for (const [cle, entree] of entrees) {
      if (entree.consequence === undefined) continue
      expect(entree.consequence.trim(), cle).not.toBe('')
      expect(phrases(entree.consequence), cle).toBe(1)
    }
  })

  it('trace chaque terme jusqu’à sa section du PRD', () => {
    for (const [cle, entree] of entrees) {
      expect(entree.libelle.trim(), cle).not.toBe('')
      expect(entree.sections.length, cle).toBeGreaterThan(0)
      for (const section of entree.sections) {
        expect(section, cle).toMatch(/^\d+(\.\d+)?$/)
      }
    }
  })

  it('refuse à la compilation un terme affiché sans définition', () => {
    // @ts-expect-error — c'est le garde-fou de §10.1 : un libellé sans entrée casse le build.
    const absent: TermeGlossaire = 'terme-sans-definition'
    expect(GLOSSAIRE[absent as TermeGlossaire]).toBeUndefined()
  })
})
