/**
 * §6.4 — facilité note as pastilles; contract, not rendering. Guards: count from registry, not
 * literal; glyphs via icon font, not "●"; accessible name on wrapper, else screen reader says
 * "circle" 5× mid-sentence.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Pastilles } from '../src/ui/Pastilles.tsx'
import { K } from '../src/registry/constants.ts'

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')
const MAX = K('FACILITE_NOTE_MAX')

/** Occurrences of a class in rendered markup. */
function compte(html: string, classe: string): number {
  return html.split(`facilite-${classe}`).length - 1
}

describe('composant Pastilles', () => {
  it('rend autant d’emplacements que l’échelle du registre en porte', () => {
    for (let note = 0; note <= MAX; note += 1) {
      const html = renderToStaticMarkup(<Pastilles note={note} libelle="test" />)
      expect(compte(html, 'pleine') + compte(html, 'vide'), `note ${note}`).toBe(MAX)
    }
  })

  it('remplit exactement autant de pastilles que la note', () => {
    for (let note = 0; note <= MAX; note += 1) {
      const html = renderToStaticMarkup(<Pastilles note={note} libelle="test" />)
      expect(compte(html, 'pleine'), `note ${note}`).toBe(note)
      expect(compte(html, 'vide'), `note ${note}`).toBe(MAX - note)
    }
  })

  it('passe par la police d’icônes, jamais par un caractère Unicode décoratif', () => {
    const html = renderToStaticMarkup(<Pastilles note={3} libelle="accessible" />)
    expect(html).toContain('circle')
    expect(html).not.toContain('●')
    expect(html).not.toContain('○')
  })

  it('distingue plein et vide par le REMPLISSAGE, pas par la seule teinte', () => {
    // Shade not countable at this size. If the two classes stopped differing on `FILL` axis, 4/5
    // pastilles unreadable (first-delivery defect: same ligature look).
    const fill = (classe: string): string => {
      const debut = CSS.indexOf(`.facilite-${classe} {`)
      expect(debut, classe).toBeGreaterThan(-1)
      const regle = CSS.slice(debut, CSS.indexOf('}', debut))
      // T-0331 — axis set by `--icone-remplissage`; absent → `.icone` falls back to 0.
      return /--icone-remplissage:\s*(\d)/.exec(regle)?.[1] ?? '0'
    }
    expect(fill('pleine')).toBe('1')
    expect(fill('vide')).toBe('0')
  })

  it('nomme la note sur l’enveloppe et cache les glyphes', () => {
    const html = renderToStaticMarkup(<Pastilles note={4} libelle="confortable" />)
    expect(html).toContain('role="img"')
    expect(html).toContain(`aria-label="facilité 4 sur ${MAX}, confortable"`)
    // A named pastille would be announced in English 5×.
    expect(compte(html, 'pleine') + compte(html, 'vide')).toBe(MAX)
    expect(html.split('aria-hidden="true"').length - 1).toBe(MAX)
  })

  it('porte la cause d’écart sur une note 0 : un zéro muet ne dit pas quel levier tirer', () => {
    const html = renderToStaticMarkup(
      <Pastilles note={0} libelle="hors de portée" cause="Taille hors du cadre de ce capteur." />,
    )
    expect(html).toContain('title="Taille hors du cadre de ce capteur."')
    expect(html).toContain('Taille hors du cadre de ce capteur.')
  })

  it('n’ajoute pas d’infobulle vide quand il n’y a pas de cause', () => {
    expect(renderToStaticMarkup(<Pastilles note={5} libelle="idéale" />)).not.toContain('title=')
  })

  it('laisse la forme du glyphe à `.icone` : seules teinte et taille vivent dans `.facilite`', () => {
    expect(CSS).toContain('.facilite-pleine')
    expect(CSS).toContain('.facilite-vide')
    const regle = CSS.slice(CSS.indexOf('.facilite .icone {'))
    expect(regle.slice(0, regle.indexOf('}'))).not.toContain('font-family')
  })
})
