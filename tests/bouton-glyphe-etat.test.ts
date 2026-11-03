/**
 * T-0303 — §11.1: a toggle's state never rides on hue alone (mode nuit = all red).
 * Contract on the stylesheet: FILL axis = effect on; `eteinte` (effect suspended) goes hollow
 * even when pressed, else it reads as an active toggle in grayscale.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

/** `--icone-remplissage` declared by the exact selector, or null when the rule is absent. */
function remplissage(selecteur: string): string | null {
  const debut = CSS.indexOf(`${selecteur} {`)
  if (debut === -1) return null
  const regle = CSS.slice(debut, CSS.indexOf('}', debut))
  return /--icone-remplissage:\s*(\d)/.exec(regle)?.[1] ?? null
}

describe('grammaire d’état des bascules', () => {
  it('remplit le glyphe d’une bascule enfoncée', () => {
    expect(remplissage(".bouton-glyphe[aria-pressed='true'] > .icone")).toBe('1')
  })

  it('creuse le glyphe d’une bascule enfoncée mais éteinte : la forme, pas la teinte', () => {
    expect(remplissage(".bouton-glyphe.eteinte[aria-pressed='true'] > .icone")).toBe('0')
  })

  it('déclare la règle éteinte après la règle enfoncée, pour qu’elle l’emporte', () => {
    expect(CSS.indexOf(".bouton-glyphe.eteinte[aria-pressed='true'] > .icone {")).toBeGreaterThan(
      CSS.indexOf(".bouton-glyphe[aria-pressed='true'] > .icone {"),
    )
  })
})
