/**
 * T-0341 — chaque terme du glossaire est cité par l'interface, chaque formule par un moteur.
 *
 * `glossaire.ts` n'admet un terme que s'il apparaît dans une sortie ; `formulas.ts` n'existe
 * que pour que §10.2 déplie ce que les moteurs tracent. Une entrée que personne ne cite est
 * une définition qui dérive en silence : le test lit les sources et nomme l'orpheline.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GLOSSAIRE } from '../src/registry/glossaire.ts'
import { FORMULES } from '../src/registry/formulas.ts'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function sources(dossier: string): readonly string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory()) return sources(chemin)
    return /\.tsx?$/.test(nom) ? [chemin] : []
  })
}

/** Tout le code, sauf le fichier qui déclare : une entrée ne se cite pas elle-même. */
function codeHors(declarant: string): string {
  return sources(SRC)
    .filter((f) => !f.endsWith(declarant))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')
}

const cite = (code: string, cle: string): boolean => new RegExp(`['"\`]${cle}['"\`]`).test(code)

describe('T-0341 — le registre ne garde que ce qui est cité', () => {
  it('chaque terme du glossaire est cité hors du glossaire', () => {
    const code = codeHors('glossaire.ts')
    expect(Object.keys(GLOSSAIRE).filter((cle) => !cite(code, cle))).toEqual([])
  })

  it('chaque formule non documentaire est citée par un moteur', () => {
    const code = codeHors('formulas.ts')
    const orphelines = Object.entries(FORMULES)
      .filter(([, f]) => !('documentaire' in f))
      .map(([id]) => id)
      .filter((id) => !cite(code, id))
    expect(orphelines).toEqual([])
  })
})
