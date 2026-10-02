/**
 * T-0305 — un champ refusé se distingue de son voisin valide autrement que par la teinte
 * (§11.1 : la nuit, `--alerte` et `--bordure-controle` sont deux rouges), et son message de
 * refus prend la largeur de la grille au lieu de s'empiler dans une demi-colonne.
 *
 * La suite tourne sous `node` : on lit la feuille, comme `echelles.test.ts`.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { ChampDomaine } from '../src/ui/ChampDomaine.tsx'
import { DOMAINES } from '../src/registry/domains.ts'

const REGLES = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/** Les déclarations du premier bloc dont la liste de sélecteurs contient exactement `selecteur`. */
function bloc(selecteur: string): Readonly<Record<string, string>> {
  for (const m of REGLES.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteurs = m[1]!.split(',').map((s) => s.trim())
    if (!selecteurs.includes(selecteur)) continue
    return Object.fromEntries(
      m[2]!
        .split(';')
        .map((d) => d.split(':').map((s) => s.trim()))
        .filter((d) => d.length >= 2 && d[0] !== '')
        .map(([p, ...v]) => [p!, v.join(':')]),
    )
  }
  return {}
}

/** Couleur et épaisseur du filet, avec ce que la règle surcharge sur la règle de base. */
function filet(base: Readonly<Record<string, string>>, sur: Readonly<Record<string, string>> = {}) {
  const [epaisseur, , couleur] = base['border']!.split(/\s+/)
  return {
    couleur: sur['border-color'] ?? sur['border-top-color'] ?? couleur,
    gauche: sur['border-left-width'] ?? epaisseur,
  }
}

describe('T-0305 — un champ refusé se voit', () => {
  it('rend aria-invalid sur une valeur hors domaine, pas sur une valeur valide', () => {
    const d = DOMAINES.focale_mm
    const rien = () => undefined
    const refuse = renderToStaticMarkup(
      createElement(ChampDomaine, { domaine: 'focale_mm', libelle: 'f', valeur: String(d.max + 1), surValeur: rien }),
    )
    const valide = renderToStaticMarkup(
      createElement(ChampDomaine, { domaine: 'focale_mm', libelle: 'f', valeur: String(d.min), surValeur: rien }),
    )
    expect(refuse).toContain('aria-invalid="true"')
    expect(valide).not.toContain('aria-invalid')
  })

  it('peint le filet du champ refusé d’une autre couleur ET d’une autre épaisseur', () => {
    const base = bloc('input')
    const valide = filet(base)
    const refuse = filet(base, bloc("input[aria-invalid='true']"))
    expect(refuse.couleur).toBe('var(--alerte)')
    expect(refuse.couleur).not.toBe(valide.couleur)
    // L'épaisseur porte seule la différence la nuit, où les deux couleurs sont du rouge.
    expect(refuse.gauche).not.toBe(valide.gauche)
  })

  it('reste refusé au survol : la règle suit `input:hover`', () => {
    expect(REGLES.search(/^input\[aria-invalid='true'\]/m)).toBeGreaterThan(REGLES.search(/^input:hover/m))
  })

  it('fait prendre la rangée entière au champ refusé, donc à son message', () => {
    expect(bloc(".champs > label:has(input[aria-invalid='true'])")['grid-column']).toBe('1 / -1')
  })
})
