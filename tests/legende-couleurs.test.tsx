/**
 * T-0196 — §6.3, §11.1: légende derived from appearance table, not copied.
 * Checks the RELATION, not hand-written colours: rows = distinct hues, each type named once,
 * painted hue = what `apparence-objets` returns for that type.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LIGNES_LEGENDE, LegendeCouleurs } from '../src/ui/LegendeCouleurs.tsx'
import { APPARENCE_OBJET, teintesReference } from '../src/ui/apparence-objets.ts'
import { LIBELLE_TYPE_OBJET } from '../src/ui/libelles-objet.ts'
import type { TypeObjet } from '../src/data/deepsky.ts'

const TYPES = Object.keys(APPARENCE_OBJET) as readonly TypeObjet[]

/** The two "forme" section witnesses belong to no family. */
const TEMOINS_DE_FORME = 2

function teintesDistinctes(): number {
  const cles = TYPES.map(
    (t) => `${APPARENCE_OBJET[t].radiant.join()}|${APPARENCE_OBJET[t].bord.join()}`,
  )
  return new Set(cles).size
}

describe('T-0196 — la légende des couleurs du ciel profond', () => {
  it('donne une ligne par teinte distincte, pas une par type', () => {
    expect(LIGNES_LEGENDE).toHaveLength(teintesDistinctes())
    expect(teintesDistinctes()).toBeLessThan(TYPES.length)
  })

  it('nomme chaque type du catalogue exactement une fois', () => {
    const html = renderToStaticMarkup(<LegendeCouleurs modeNuit={false} />)
    for (const type of TYPES) {
      const libelle = LIBELLE_TYPE_OBJET[type]
      expect(html.split(libelle).length - 1, libelle).toBe(1)
    }
  })

  it('peint le témoin de la teinte que le marqueur porte, mode par mode', () => {
    for (const modeNuit of [false, true]) {
      const html = renderToStaticMarkup(<LegendeCouleurs modeNuit={modeNuit} />)
      const teintes = teintesReference(modeNuit)
      for (const type of TYPES) expect(html).toContain(teintes[type].bord)
    }
  })

  it('ne laisse pas la couleur porter seule : les témoins sont décoratifs', () => {
    const html = renderToStaticMarkup(<LegendeCouleurs modeNuit={false} />)
    // T-0325 — one more: accordion chevron carrying the légende, decorative too.
    const CHEVRON_ACCORDEON = 1
    expect(html.match(/aria-hidden="true"/g) ?? []).toHaveLength(
      teintesDistinctes() + TEMOINS_DE_FORME + CHEVRON_ACCORDEON,
    )
    expect(html).not.toContain('aria-label')
  })

  // Shell forbids inline colour (`mode-nuit.test.tsx`): 2 hue sources for one object would
  // diverge. Légende paints via stylesheet.
  it('n’écrit aucune couleur dans un attribut de style', () => {
    const html = renderToStaticMarkup(<LegendeCouleurs modeNuit={true} />)
    expect(html).not.toMatch(/style="[^"]*(?:color|background)[^"]*"/)
  })

  /**
   * Scène draws a cross on objects with no catalogue DIMENSIONS, any type (`dessine-ciel.ts`:
   * `geometrieMarqueur` → `null`). Légende must state that rule, not suggest a type.
   */
  it('énonce la croix comme une règle de forme, pas comme un type', () => {
    const html = renderToStaticMarkup(<LegendeCouleurs modeNuit={false} />)
    expect(html).toContain('Forme')
    expect(html).toContain('taille inconnue')
    // One cross per indeterminate row + the "forme" section's.
    const indeterminees = LIGNES_LEGENDE.filter((l) => l.croix)
    expect(indeterminees).toHaveLength(1)
    expect(indeterminees[0]!.types).toStrictEqual(['INCONNU', 'AUTRE'])
    expect(html.match(/legende-croix/g) ?? []).toHaveLength(2)
  })

  /**
   * Catch-all carried galaxies' green, outline aside: 2 discs indistinguishable, légende
   * promising a distinction absent from scène.
   */
  it('donne aux types indéterminés une teinte qui n’est celle d’aucune famille', () => {
    for (const indetermine of ['INCONNU', 'AUTRE'] as const) {
      for (const type of TYPES) {
        if (type === 'INCONNU' || type === 'AUTRE') continue
        expect(APPARENCE_OBJET[indetermine].radiant, type).not.toStrictEqual(
          APPARENCE_OBJET[type].radiant,
        )
      }
    }
  })
})
