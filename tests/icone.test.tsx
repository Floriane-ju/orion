/**
 * T-0122 — icon = font glyph, not image: contract, not render. 3 holds (any failure shows
 * "CLOSE" in a button): ligature unaltered by case/suivi, font shipped with artefact, glyph
 * not announced as text.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Icone, attendsPoliceIcones } from '../src/ui/Icone.tsx'

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

/** Body of `.icone` rule, no braces. */
function reglePointIcone(): string {
  const debut = CSS.indexOf('.icone {')
  expect(debut).toBeGreaterThan(-1)
  return CSS.slice(debut, CSS.indexOf('}', debut))
}

/** Body of icon font `@font-face` (T-0191 shipped others). */
function faceIcone(): string {
  const faces = [...CSS.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, corps]) => corps!)
  const face = faces.find((corps) => corps.includes("'Material Symbols Sharp'"))
  expect(face).toBeDefined()
  return face!
}

describe('composant Icone', () => {
  it('rend la ligature demandée dans la classe de style commune', () => {
    const html = renderToStaticMarkup(<Icone nom="close" />)
    expect(html).toContain('close')
    expect(html).toMatch(/class="icone"/)
  })

  it('cache le glyphe aux lecteurs d’écran quand le contrôle porte déjà son libellé', () => {
    // Else "Fermer le panneau" button announces "Fermer le panneau close".
    expect(renderToStaticMarkup(<Icone nom="close" />)).toContain('aria-hidden="true"')
  })

  it('redevient une image nommée quand elle porte seule l’information', () => {
    const html = renderToStaticMarkup(<Icone nom="visibility_off" libelle="Cible masquée" />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Cible masquée"')
    expect(html).not.toContain('aria-hidden')
  })

  it('accepte une classe supplémentaire sans perdre le style de base', () => {
    expect(renderToStaticMarkup(<Icone nom="close" classe="lateral-fermer" />)).toMatch(
      /class="icone lateral-fermer"/,
    )
  })
})

describe('style des icônes §11.1', () => {
  it('neutralise la casse et le suivi, sans quoi la ligature ne se forme plus', () => {
    // `--suivi-micro` + capitals = T-0113 label grammar: an icon inside inherits it.
    const regle = reglePointIcone()
    expect(regle).toMatch(/text-transform:\s*none/)
    expect(regle).toMatch(/letter-spacing:\s*normal/)
  })

  it('trace les glyphes à l’épaisseur 300, plus fine que le nominal de la police', () => {
    expect(reglePointIcone()).toMatch(/font-variation-settings:[^;]*'wght'\s*var\(--icone-graisse,\s*300\)/)
  })

  it('nomme la famille par le jeton, jamais en dur', () => {
    expect(reglePointIcone()).toMatch(/font-family:\s*var\(--police-icone\)/)
  })

  it('embarque le fichier de police plutôt que d’aller le chercher (§12.2, §13.1)', () => {
    const face = faceIcone()
    const source = /src:\s*url\('([^']+)'\)/.exec(face)?.[1]
    expect(source).toBeDefined()
    expect(source).not.toMatch(/^https?:/)
    // Path relative to `src/ui/`: must point to a really versioned file.
    expect(() =>
      readFileSync(join(import.meta.dirname, '..', 'src', 'ui', source!)),
    ).not.toThrow()
  })

  it('déclare la famille du fichier sous le nom que le jeton référence', () => {
    const famille = /--police-icone:\s*([^;]+);/.exec(CSS)?.[1]?.trim()
    expect(famille).toBeDefined()
    expect(faceIcone()).toContain(`font-family: ${famille}`)
  })
})

/**
 * T-0215 — THE RULE EXISTED, NOTHING HELD IT.
 * `.claude/rules/orion.md` bans decorative Unicode in place of a glyph; `pastilles.test.tsx`
 * checked one component. 3 chars escaped in §8.4 pointage diagram — "✛", "●", "★" — rendered
 * in TEXT font: no optical grid/weight/alignment, drawing varied per machine (fallback font).
 * Banned: chars that DRAW (geometric shapes, dingbats, misc symbols, emoji). Allowed: chars
 * that READ in a sentence ("→", "×", "−", "°", "Δ", "·"): typography; banning would force a
 * glyph mid-word.
 */
describe('T-0215 — aucun caractère Unicode à la place d’un glyphe', () => {
  /** Geometric shapes, misc symbols, dingbats, emoji; not arrows/operators. */
  const DESSINS =
    /[\u{25A0}-\u{25FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F300}-\u{1FAFF}]/u

  it('dans aucun composant de l’interface', () => {
    const racine = join(import.meta.dirname, '..', 'src', 'ui')
    for (const fichier of readdirSync(racine)) {
      if (!fichier.endsWith('.tsx') && !fichier.endsWith('.ts')) continue
      // Comments QUOTE the banned chars to say they are banned.
      const source = readFileSync(join(racine, fichier), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      const trouve = DESSINS.exec(source)
      expect(trouve?.[0], `${fichier} — « ${trouve?.[0]} » doit passer par <Icone>`).toBeUndefined()
    }
  })
})

/**
 * T-0215 — alert carries its sign via MARKUP, not the stylesheet.
 * `.cause::before` set "⚠" as `content`: a 2nd way to show an icon, a 2nd place to touch on
 * glyph weight change. Keeps that path closed: no drawing `content`, no direct icon-font call
 * outside `.icone`.
 */
describe('T-0215 — une seule façon d’afficher une icône', () => {
  it('ne pose aucun glyphe en `content` dans la feuille', () => {
    // "·" allowed: list separator, reads in a sentence.
    const DESSINS =
      /[\u{25A0}-\u{25FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F300}-\u{1FAFF}]/u
    for (const [, valeur] of CSS.matchAll(/content:\s*'([^']*)'/g)) {
      expect(DESSINS.exec(valeur!)?.[0], `content: '${valeur}'`).toBeUndefined()
    }
  })

  it('ne nomme la police d’icônes que dans `.icone`', () => {
    // Two legit occurrences: token declaration + rule applying it. A third = 2nd icon style
    // out of `Icone` reach.
    const REGLES = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect([...REGLES.matchAll(/var\(--police-icone\)/g)]).toHaveLength(1)
    expect(reglePointIcone()).toContain('var(--police-icone)')
  })

  /**
   * T-0287 — TWO GLYPHS MUST NOT TOUCH.
   * Pointage diagram put `<Icone nom="circle" />` then `<Icone nom="star" />` adjacent.
   * Browser shapes text across adjacent `<span>`: font read "circles" (a real ligature), 3
   * leftover letters showed as text. Visible only on screen with real font.
   * Banned = adjacency, not that pair: same accident with any name whose prefix is a ligature.
   * Icons separated by text, space or element are fine.
   */
  it('ne colle jamais deux glyphes l’un contre l’autre', () => {
    const racine = join(import.meta.dirname, '..', 'src', 'ui')
    // Two glyphs nothing separates: stuck, a newline apart, or two consecutive conditions.
    // `{' '}`, a word or both ternary branches separate: allowed.
    const ADJACENTES = /<Icone\b[^>]*\/>\s*\}?\s*(?:\{\s*[^{}'"`]*&&\s*)?<Icone\b/
    for (const fichier of readdirSync(racine)) {
      if (!fichier.endsWith('.tsx')) continue
      const source = readFileSync(join(racine, fichier), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      expect(ADJACENTES.exec(source)?.[0], fichier).toBeUndefined()
    }
  })

  it('ne laisse aucune phrase d’alerte se poser sans passer par `Mention`', () => {
    const racine = join(import.meta.dirname, '..', 'src')
    for (const dossier of ['', 'ui']) {
      const chemin = join(racine, dossier)
      for (const fichier of readdirSync(chemin, { withFileTypes: true })) {
        if (!fichier.isFile() || !fichier.name.endsWith('.tsx')) continue
        if (fichier.name === 'Mention.tsx') continue
        const source = readFileSync(join(chemin, fichier.name), 'utf8')
        expect(source, fichier.name).not.toMatch(/<p[^>]*className="(cause|erreur)"/)
        expect(source, fichier.name).not.toMatch(/<p[^>]*className=\{[^}]*'(cause|erreur)'/)
      }
    }
  })
})

/**
 * T-0300 — `font-display: block` hides text only ~3 s. Icon font = 8,8 Mo: on slow first launch
 * it arrives later, bar showed "light_mode MODE NUIT" for 18 s. Glyph stays hidden until font
 * loaded, no time limit.
 */
describe('T-0300 — une ligature ne s’affiche jamais en clair', () => {
  it('masque `.icone` tant que la racine ne porte pas `icones-pretes`', () => {
    const REGLES = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(REGLES).toMatch(/:root:not\(\.icones-pretes\)\s+\.icone\s*\{\s*visibility:\s*hidden;?\s*\}/)
  })

  it('pose `icones-pretes` une fois la police chargée, et pas avant', async () => {
    let charge: () => void = () => {}
    const demandes: string[] = []
    const classes = new Set<string>()
    const doc = {
      documentElement: { classList: { add: (c: string) => classes.add(c) } },
      fonts: {
        load: (police: string) => {
          demandes.push(police)
          return new Promise<void>((resoudre) => (charge = resoudre))
        },
      },
    }
    const attente = attendsPoliceIcones(doc, "'Material Symbols Sharp'")
    expect(demandes).toEqual(["1em 'Material Symbols Sharp'"])
    expect(classes.has('icones-pretes')).toBe(false)
    charge()
    await attente
    expect(classes.has('icones-pretes')).toBe(true)
  })
})
