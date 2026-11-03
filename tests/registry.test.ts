/**
 * §2.1 — 1st acceptance criterion: no non-trivial numeric value outside registry in compute
 * engines. Automated from Lot 0, else added later it fails everywhere and gets disabled.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { K, REGISTRE } from '../src/registry/constants.ts'
import { FORMULES } from '../src/registry/formulas.ts'
import { dependDUnOrdreDeGrandeur, trace } from '../src/core/traced.ts'

const DOSSIER_MOTEURS = join(import.meta.dirname, '..', 'src', 'core')
const DOSSIER_REGISTRE = join(import.meta.dirname, '..', 'src', 'registry')
const DOSSIER_UI = join(import.meta.dirname, '..', 'src', 'ui')

/**
 * Numbers tolerated in an engine: indexing/comparison integers, time/angle/percent conversions,
 * definitional spherical-geometry values. Everything else from registry.
 */
const TRIVIAUX = new Set([0, 1, 2, 3, 24, 60, 90, 100, 180, 360, 1000, 3600, 60000])

function sansCommentairesNiChaines(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
}

function litterauxNumeriques(source: string): number[] {
  const nettoye = sansCommentairesNiChaines(source)
  const trouves = nettoye.match(/(?<![\w.])\d+(?:_\d+)*(?:\.\d+)?(?:e-?\d+)?/gi) ?? []
  return trouves.map((brut) => Number(brut.replace(/_/g, '')))
}

describe('registre §2.1', () => {
  it('ne laisse aucune constante numérique non triviale dans les moteurs', () => {
    const fautifs: string[] = []
    for (const fichier of readdirSync(DOSSIER_MOTEURS).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(join(DOSSIER_MOTEURS, fichier), 'utf8')
      for (const valeur of litterauxNumeriques(source)) {
        if (!TRIVIAUX.has(valeur)) fautifs.push(`${fichier} : ${valeur}`)
      }
    }
    expect(fautifs).toEqual([])
  })

  it('est gelé : aucun ajustement à l’exécution', () => {
    expect(Object.isFrozen(REGISTRE)).toBe(true)
    expect(() => {
      // @ts-expect-error — write forbidden on purpose
      REGISTRE.ROTATION_CIEL_DEG_H = null
    }).toThrow()
  })

  it('porte source et tolérance sur chaque entrée', () => {
    for (const [id, entree] of Object.entries(REGISTRE)) {
      expect(entree.source, id).not.toBe('')
      expect(entree.unite, id).toBeTypeOf('string')
      expect(entree.sections.length, id).toBeGreaterThan(0)
    }
  })

  it('refuse de servir une constante dépréciée', () => {
    // Linear field approx gives 205.7° at 10 mm: no engine may consume it (§5.1, Annexe C).
    expect(() => K('DEG_PAR_RADIAN_APPROX')).toThrow(/dépréciée/)
  })

  it('marque comme ordre de grandeur les constantes dont la tolérance le dit', () => {
    for (const entree of Object.values(REGISTRE)) {
      if (entree.tolerance === 'ordre de grandeur') {
        expect(entree.ordreDeGrandeur, entree.libelle).toBe(true)
      }
    }
  })

  it('propage l’ordre de grandeur au résultat qui consomme la constante', () => {
    // C-07 = field ceiling, not a measure: dependent output displays as a range, never exact
    // (§2.1, last criterion).
    const approximatif = trace({
      value: K('PLAFOND_POSE_SANS_AUTOGUIDAGE_S'),
      formula: 'MASSE_AIR',
      constants: ['PLAFOND_POSE_SANS_AUTOGUIDAGE_S'],
      range: [180, 300],
    })
    expect(dependDUnOrdreDeGrandeur(approximatif)).toBe(true)
    expect(approximatif.range).toEqual([180, 300])

    const exact = trace({ value: 1, formula: 'MASSE_AIR', constants: ['ROTATION_CIEL_DEG_H'] })
    expect(dependDUnOrdreDeGrandeur(exact)).toBe(false)
  })
})

describe('sources des tables du registre §2.1', () => {
  /**
   * A declared source nobody displays = broken promise: it states the validity limit of a table the
   * user acts on. Each SOURCE_TABLE_* must reach the screen, all by the same path, else
   * traceability reads three ways (T-0062).
   * T-0228 — that path = `SOURCES` table, not a style class repeated in 3 panels (3 sentences under
   * their values, re-read at every target, arbitrating nothing); now in the "info" drawer. A
   * declared source the table doesn't cite reaches no screen: test names it.
   */
  const declare = (fichier: string): readonly string[] => [
    ...readFileSync(join(DOSSIER_REGISTRE, fichier), 'utf8').matchAll(
      /export const (SOURCE_TABLE_\w+)/g,
    ),
  ].map((m) => m[1]!)

  const sourcesDeclarees = readdirSync(DOSSIER_REGISTRE)
    .filter((f) => f.endsWith('.ts'))
    .flatMap(declare)

  const table = readFileSync(join(DOSSIER_REGISTRE, 'sources.ts'), 'utf8')
  const citees = new Set(table.match(/SOURCE_TABLE_\w+/g) ?? [])

  it('déclare au moins une source par table', () => {
    expect(sourcesDeclarees.length).toBeGreaterThan(0)
  })

  it('cite chaque source déclarée dans la table des sources', () => {
    const orphelines = [...new Set(sourcesDeclarees)].filter((nom) => !citees.has(nom))
    expect(orphelines).toEqual([])
  })

  it('T-0228 — aucun panneau ne les réaffiche au contact des valeurs', () => {
    const ui = readdirSync(DOSSIER_UI)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => readFileSync(join(DOSSIER_UI, f), 'utf8'))
      .join('\n')
    expect(ui.match(/SOURCE_TABLE_\w+/g)).toBeNull()
  })
})

describe('formulaire Annexe B', () => {
  it('donne une expression et une section à chaque formule', () => {
    for (const [id, formule] of Object.entries(FORMULES)) {
      expect(formule.expression, id).not.toBe('')
      expect(formule.section, id).toMatch(/^\d+(\.\d+)?$/)
    }
  })
})
