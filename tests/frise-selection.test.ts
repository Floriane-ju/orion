/**
 * T-0419 — la frise se tire : un double-clic n'y laisse pas de sélection, sans quoi le glisser
 * suivant part d'elle et le navigateur la dépose comme une image au lieu de faire défiler le temps.
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
