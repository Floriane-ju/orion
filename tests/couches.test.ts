/**
 * T-0338 — layers stay in place: pure calc in `src/core/`, persistence `src/data/`, React
 * `src/ui/`. Checks practical breakers: calc module importing a component, engine touching
 * storage, component reading storage itself, mutable shared table.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIBELLE_TYPE_OBJET } from '../src/ui/libelles-objet.ts'
import { IDENTITE } from '../src/core/mat3.ts'
import { BALAYAGE_FIN } from '../src/ui/balayage-ecran.ts'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function fichiers(dossier: string, filtre: RegExp): readonly [string, string][] {
  return readdirSync(join(SRC, dossier))
    .filter((f) => filtre.test(f))
    .map((f) => [`${dossier}/${f}`, readFileSync(join(SRC, dossier, f), 'utf8')])
}

/** Executed imports: `import type` creates no runtime dependency. */
function importsExecutes(source: string): readonly string[] {
  return [...source.matchAll(/^import (?!type )[^'"]*from '([^']+)'/gm)].map((m) => m[1]!)
}

describe('T-0338 — les couches', () => {
  it('aucun module de calcul ni de données n’exécute un composant', () => {
    const modules = [
      ...fichiers('core', /\.ts$/),
      ...fichiers('data', /\.ts$/),
      ...fichiers('ui', /^app-.*\.ts$/),
    ]
    const fautes = modules.flatMap(([f, src]) =>
      importsExecutes(src).filter((i) => i.endsWith('.tsx')).map((i) => `${f} → ${i}`),
    )
    expect(fautes).toEqual([])
  })

  it('aucun moteur ne touche au stockage ni au réseau', () => {
    const fautes = fichiers('core', /\.ts$/).flatMap(([f, src]) => [
      ...importsExecutes(src)
        .filter((i) => /\/data\/(db|bootstrap|persistence|mode-nuit|imagerie-cible)\.ts$/.test(i))
        .map((i) => `${f} → ${i}`),
      ...(/\b(localStorage|indexedDB|fetch\()/.test(src) ? [`${f} : stockage ou réseau`] : []),
    ])
    expect(fautes).toEqual([])
  })

  it('aucun composant ne lit ni n’écrit le stockage local lui-même', () => {
    const fautes = fichiers('ui', /\.tsx?$/)
      .filter(([, src]) => /\blocalStorage\b/.test(src))
      .map(([f]) => f)
    expect(fautes).toEqual([])
  })

  it('les tables partagées sont gelées', () => {
    for (const table of [LIBELLE_TYPE_OBJET, IDENTITE, BALAYAGE_FIN]) {
      expect(Object.isFrozen(table)).toBe(true)
    }
  })
})
