/**
 * T-0298 — le mode nuit s'applique avant le premier pixel de contenu.
 *
 * `main.tsx` ne s'importe pas sous `node` (il monte React sur le DOM) : on lit son texte,
 * comme `csp.test.ts` lit `vite.config.ts`. Ce qui compte est l'ordre — la palette posée
 * avant `createRoot`, donc avant l'écran « Lecture des données enregistrées… ».
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MAIN = readFileSync(join(import.meta.dirname, '..', 'src', 'main.tsx'), 'utf8')
const INDEX = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8')

describe('T-0298 — le mode nuit persisté précède le premier rendu', () => {
  it('pose l’état persisté sur le document avant de monter React', () => {
    const applique = MAIN.indexOf('appliqueModeNuit(litEtatPersiste())')
    expect(applique).toBeGreaterThan(-1)
    expect(applique).toBeLessThan(MAIN.indexOf('createRoot('))
  })

  it('n’ajoute aucun script en ligne à la page (CSP `script-src \'self\'`)', () => {
    const scripts = [...INDEX.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    for (const [, attributs, corps] of scripts) {
      expect(attributs).toMatch(/\bsrc=/)
      expect(corps!.trim()).toBe('')
    }
  })
})
