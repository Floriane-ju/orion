/**
 * T-0288 — l'impression rend une feuille de terrain lisible (§11.2).
 *
 * La suite tourne sous `node`, sans moteur de mise en page : on lit le bloc `@media print`
 * de la feuille. Ce qui compte : ce qui se clique ne sort pas, et l'encre est noire sur le
 * papier quel que soit le mode.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/** Le bloc `@media print`, accolades équilibrées. */
function blocImpression(): string {
  const debut = CSS.indexOf('@media print {')
  expect(debut).toBeGreaterThan(-1)
  let profondeur = 0
  for (let i = CSS.indexOf('{', debut); i < CSS.length; i++) {
    if (CSS[i] === '{') profondeur++
    if (CSS[i] === '}' && --profondeur === 0) return CSS.slice(debut, i + 1)
  }
  throw new Error('bloc @media print non fermé')
}

/** Les sélecteurs des règles du bloc qui déclarent `display: none`. */
function masques(bloc: string): ReadonlySet<string> {
  const corps = bloc.slice(bloc.indexOf('{') + 1)
  return new Set(
    [...corps.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /display:\s*none/.test(m[2]!))
      .flatMap((m) => m[1]!.split(',').map((s) => s.trim())),
  )
}

/** Valeur de `--fond` dans le premier bloc qui commence par `selecteur {`. */
function fond(selecteur: string): string {
  const debut = CSS.indexOf(`${selecteur} {`)
  const bloc = CSS.slice(debut, CSS.indexOf('}', debut))
  return /--fond:\s*([^;]+);/.exec(bloc)![1]!.trim()
}

describe('T-0288 — la feuille imprimée', () => {
  it('ne contient ni rail, ni frise, ni bouton, ni zone d’export', () => {
    const caches = masques(blocImpression())
    for (const s of [
      '.coque-rail',
      '.panneau-nuit',
      '.coque-nuit',
      '.etape-pointage',
      '.actions',
      'section:has(> .plan-export)',
    ]) {
      expect(caches, s).toContain(s)
    }
  })

  it('imprime toute l’encre en `--fond`, sans aplat, dans les deux modes', () => {
    const bloc = blocImpression()
    expect(bloc).toMatch(/color:\s*var\(--fond\)\s*!important/)
    expect(bloc).toMatch(/background:\s*transparent\s*!important/)
    // Le masque rouge de la nuit multiplie chaque pixel : il ne doit pas teinter le papier.
    expect(masques(bloc)).toContain(":root[data-mode-nuit='true'] body::after")
  })

  it('`--fond` est le noir pur dans les deux palettes : contraste maximal sur papier blanc', () => {
    expect(fond(':root')).toBe('#000000')
    expect(fond(":root[data-mode-nuit='true']")).toBe('#000000')
  })
})
