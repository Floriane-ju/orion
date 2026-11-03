/**
 * T-0189 — Échap closes bubble and drawers (WCAG 2.2, 1.4.13, "disclosure" pattern). Tests
 * priority rule, not a DOM event: open glose dismissed BEFORE the drawer holding it, else one
 * key closes both and user loses the drawer being read. DOM wiring = `addEventListener` on
 * document; decision carries the test, as for planétarium keyboard (T-0069).
 * Rest of contract in stylesheet: bubble stays hoverable and persistent — dismissing must not
 * remove `:hover` / `:focus-visible` from anchor.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cibleEchap, tiroirsAFermer } from '../src/ui/gere-echap.ts'

const RACINE = join(import.meta.dirname, '..', 'src')
const CSS = readFileSync(join(RACINE, 'ui', 'styles.css'), 'utf8')

describe('T-0189 — ce qu’Échap ferme', () => {
  it('congédie la bulle avant le tiroir qui la porte', () => {
    expect(cibleEchap('Escape', true, true)).toBe('BULLE')
  })

  it('referme le tiroir quand aucune bulle n’est ouverte', () => {
    expect(cibleEchap('Escape', false, true)).toBe('TIROIR')
  })

  it('congédie la bulle ouverte hors de tout tiroir', () => {
    expect(cibleEchap('Escape', true, false)).toBe('BULLE')
  })

  it('ne ferme rien quand rien n’est ouvert', () => {
    expect(cibleEchap('Escape', false, false)).toBe('RIEN')
  })

  it('ne répond qu’à Échap', () => {
    for (const touche of ['Enter', ' ', 'ArrowDown', 'Tab', 'esc', 'Escape ']) {
      expect(cibleEchap(touche, true, true), touche).toBe('RIEN')
    }
  })
})

describe('T-0189 — la bulle reste survolable et persistante', () => {
  it('son ouverture tient toujours au survol et au focus de l’ancre, sans JavaScript', () => {
    expect(CSS).toContain('.bulle-ancre:hover > .bulle')
    expect(CSS).toContain('.bulle-ancre:has(:focus-visible) > .bulle')
  })

  it('page info ouverte, une bulle cachée sous son voile n’absorbe pas Échap', () => {
    const echap = readFileSync(join(RACINE, 'ui', 'gere-echap.ts'), 'utf8')
    expect(echap).toContain("ancreOuverte(doc.querySelector('.page-info:target') ?? doc)")
  })

  it('le composant ne pose aucune écoute : l’écoute est unique, sur le document', () => {
    const bulle = readFileSync(join(RACINE, 'ui', 'Bulle.tsx'), 'utf8')
    expect(bulle).not.toContain('addEventListener')
    expect(bulle).not.toContain('useEffect')
    const app = readFileSync(join(RACINE, 'App.tsx'), 'utf8')
    expect(app).toContain('installeEchap(document)')
  })
})

describe('T-0189 — les trois tiroirs sont couverts par la même règle', () => {
  it('aucun tiroir ne garde sa propre écoute d’Échap', () => {
    for (const fichier of ['BarreHaut.tsx', 'MenuReglages.tsx', 'Verification.tsx']) {
      const source = readFileSync(join(RACINE, 'ui', fichier), 'utf8')
      expect(source, fichier).not.toContain("'Escape'")
    }
  })

  /**
   * T-0215 — class no longer written at call site, built in `Tiroir`. Old assertion quoted
   * literal strings of two files: enumerated drawers, missed the fourth (`tiroir-legende`),
   * would miss the fifth. Now holds by CONSTRUCTION: one place builds `<details class="tiroir">`.
   */
  it('bâtit la classe que l’écoute reconnaît, en un seul endroit', () => {
    const tiroir = readFileSync(join(RACINE, 'ui', 'Tiroir.tsx'), 'utf8')
    expect(tiroir).toContain('<details')
    expect(tiroir).toContain('`tiroir tiroir-${modificateur}`')
  })

  it('ne laisse aucun tiroir se bâtir hors de ce composant', () => {
    for (const fichier of readdirSync(join(RACINE, 'ui'))) {
      if (!fichier.endsWith('.tsx') || fichier === 'Tiroir.tsx') continue
      const source = readFileSync(join(RACINE, 'ui', fichier), 'utf8')
      expect(source, fichier).not.toMatch(/className=(["'`])tiroir[\s"'`]/)
    }
  })
})

describe('T-0262 — un geste hors du tiroir le referme', () => {
  const nuit = { nom: 'nuit', enfants: ['case', 'curseur'] }
  const autre = { nom: 'autre', enfants: ['bouton'] }
  const contient = (cible: string) => (t: typeof nuit) => t.enfants.includes(cible)

  it('garde ouvert le tiroir où tombe le geste', () => {
    expect(tiroirsAFermer([nuit], contient('curseur'))).toEqual([])
  })

  it('referme le tiroir quand le geste tombe ailleurs — scène, autre bouton', () => {
    expect(tiroirsAFermer([nuit], contient('canevas'))).toEqual([nuit])
    expect(tiroirsAFermer([nuit, autre], contient('bouton'))).toEqual([nuit])
  })

  it('est installée une fois, sur le document', () => {
    const app = readFileSync(join(RACINE, 'App.tsx'), 'utf8')
    expect(app).toContain('installeFermetureDehors(document)')
  })
})
