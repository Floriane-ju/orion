/**
 * T-0196 — §6.3, §11.1 : la légende est dérivée de la table des apparences, pas recopiée.
 *
 * Le test ne compare aucune couleur écrite à la main — ce serait recopier ce qu'on prétend
 * vérifier. Il contrôle la RELATION : autant de lignes que de teintes distinctes, chaque type
 * nommé une fois, et la teinte peinte est celle que `apparence-objets` rend pour ce type.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LIGNES_LEGENDE, LegendeCouleurs } from '../src/ui/LegendeCouleurs.tsx'
import { APPARENCE_OBJET, teintesReference } from '../src/ui/apparence-objets.ts'
import { LIBELLE_TYPE_OBJET } from '../src/ui/libelles-objet.ts'
import type { TypeObjet } from '../src/data/deepsky.ts'

const TYPES = Object.keys(APPARENCE_OBJET) as readonly TypeObjet[]

/** Les deux témoins de la section « forme » n'appartiennent à aucune famille. */
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
    // T-0325 — plus un : le chevron de l'accordéon qui porte la légende, décoratif lui aussi.
    const CHEVRON_ACCORDEON = 1
    expect(html.match(/aria-hidden="true"/g) ?? []).toHaveLength(
      teintesDistinctes() + TEMOINS_DE_FORME + CHEVRON_ACCORDEON,
    )
    expect(html).not.toContain('aria-label')
  })

  // La coque interdit la couleur en ligne (voir `mode-nuit.test.tsx`) : deux sources de teinte
  // pour un même objet finiraient par diverger. La légende peint donc par feuille.
  it('n’écrit aucune couleur dans un attribut de style', () => {
    const html = renderToStaticMarkup(<LegendeCouleurs modeNuit={true} />)
    expect(html).not.toMatch(/style="[^"]*(?:color|background)[^"]*"/)
  })

  /**
   * La scène pique d'une croix l'objet dont le catalogue ignore les DIMENSIONS, quel que soit
   * son type (`dessine-ciel.ts` : `geometrieMarqueur` rendant `null`). La légende doit énoncer
   * cette règle-là, et non laisser croire que la croix désigne un type.
   */
  it('énonce la croix comme une règle de forme, pas comme un type', () => {
    const html = renderToStaticMarkup(<LegendeCouleurs modeNuit={false} />)
    expect(html).toContain('Forme')
    expect(html).toContain('taille inconnue')
    // Une croix par ligne indéterminée, plus celle de la section « forme ».
    const indeterminees = LIGNES_LEGENDE.filter((l) => l.croix)
    expect(indeterminees).toHaveLength(1)
    expect(indeterminees[0]!.types).toStrictEqual(['INCONNU', 'AUTRE'])
    expect(html.match(/legende-croix/g) ?? []).toHaveLength(2)
  })

  /**
   * Le fourre-tout portait le vert des galaxies, au contour près : deux disques que l'œil ne
   * sépare pas, et une légende qui promettait une distinction absente de la scène.
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
