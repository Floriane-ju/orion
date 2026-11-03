/**
 * T-0298 — mode nuit applies before first pixel of content.
 * `main.tsx` not importable under `node` (mounts React on DOM) → text read, like `csp.test.ts`
 * reads `vite.config.ts`. Order: palette set before `createRoot`, so before the "Lecture des
 * données enregistrées…" screen.
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
