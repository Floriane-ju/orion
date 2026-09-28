/**
 * T-0338 — chaque couche reste à sa place : calcul pur dans `src/core/`, persistance dans
 * `src/data/`, React dans `src/ui/`.
 *
 * Ce qui est vérifié est ce qui casse la règle en pratique : un module de calcul qui dépend
 * d'un composant, un moteur qui touche au stockage, un composant qui lit le stockage lui-même,
 * une table partagée qu'on pourrait muter.
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

/** Les imports exécutés : un `import type` ne crée aucune dépendance à l'exécution. */
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
