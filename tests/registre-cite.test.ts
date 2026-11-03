/**
 * T-0341 — every glossaire term cited by UI, every formula by an engine.
 * `glossaire.ts` admits a term only if it appears in an output; `formulas.ts` exists only so
 * §10.2 unfolds what engines trace. Uncited entry = silently drifting definition: test reads
 * sources, names the orphan.
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

/** All code except the declaring file: an entry doesn't cite itself. */
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
