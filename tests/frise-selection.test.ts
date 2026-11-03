/**
 * T-0419 — frise is draggable: double-click leaves no selection, else next drag starts from it
 * and browser drops it as image instead of scrolling time.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

it('coupe la sélection sur toute la frise', () => {
  const debut = CSS.indexOf('\n.nuit-frise {\n  user-select')
  expect(debut).toBeGreaterThan(-1)
  expect(CSS.slice(debut, CSS.indexOf('}', debut))).toContain('user-select: none')
})
