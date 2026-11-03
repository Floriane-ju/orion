/**
 * T-0147 — hover bulle. Two contracts can break, not a pixel. A11y: bulle links its text to the
 * control and NAMES or DESCRIBES it, never both — button keeping its `aria-label` announces
 * twice. Charte: bulle = app surface → everything drawing it goes through tokens, with a max
 * width, else it becomes the browser tooltip it replaces.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Bulle } from '../src/ui/Bulle.tsx'

const RACINE = join(import.meta.dirname, '..', 'src')
const CSS = readFileSync(join(RACINE, 'ui', 'styles.css'), 'utf8')

/** Body of a rule, braces stripped. */
function regle(selecteur: string): string {
  const debut = CSS.indexOf(`${selecteur} {`)
  expect(debut, selecteur).toBeGreaterThan(-1)
  return CSS.slice(debut, CSS.indexOf('}', debut))
}

/** Content of an `@supports` block, braces matched. */
function supports(condition: string): string {
  const entete = `@supports ${condition} {`
  const debut = CSS.indexOf(entete)
  expect(debut, entete).toBeGreaterThan(-1)
  let profondeur = 0
  for (let i = debut + entete.length - 1; i < CSS.length; i += 1) {
    if (CSS[i] === '{') profondeur += 1
    if (CSS[i] === '}') {
      profondeur -= 1
      if (profondeur === 0) return CSS.slice(debut + entete.length, i)
    }
  }
  throw new Error(`bloc @supports non refermé : ${condition}`)
}

/** All app sources, to check what is NO LONGER in them. */
function sources(): readonly string[] {
  return readdirSync(RACINE, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f) => readFileSync(join(RACINE, f), 'utf8'))
}

describe('composant Bulle', () => {
  it('relie son texte au contrôle : la bulle DÉCRIT par défaut', () => {
    const html = renderToStaticMarkup(
      <Bulle texte="Magnitude apparente">
        <abbr>mag</abbr>
      </Bulle>,
    )
    const id = /role="tooltip"[^>]*id="([^"]+)"|id="([^"]+)"[^>]*role="tooltip"/.exec(html)
    const cle = id?.[1] ?? id?.[2]
    expect(cle).toBeDefined()
    expect(html).toContain(`aria-describedby="${cle}"`)
    expect(html).not.toContain('aria-labelledby')
  })

  it('NOMME le contrôle quand il n’a qu’un glyphe, sans le décrire en plus', () => {
    // Button named by its bulle AND an `aria-label` announces twice: label leaves the button,
    // doesn't add to it.
    const html = renderToStaticMarkup(
      <Bulle texte="Fermer le panneau" nomme>
        <button type="button">×</button>
      </Bulle>,
    )
    expect(html).toContain('aria-labelledby=')
    expect(html).not.toContain('aria-describedby')
    expect(html).not.toContain('aria-label=')
  })

  it('expose le texte comme bulle, pas comme texte courant', () => {
    const html = renderToStaticMarkup(
      <Bulle texte="Reculer vite" nomme>
        <button type="button">‹‹</button>
      </Bulle>,
    )
    expect(html).toContain('role="tooltip"')
    expect(html).toContain('Reculer vite')
  })

  it('déplie la bulle du côté demandé, en haut par défaut', () => {
    const parDefaut = renderToStaticMarkup(
      <Bulle texte="x">
        <abbr>y</abbr>
      </Bulle>,
    )
    expect(parDefaut).toContain('data-place="haut"')
    const gauche = renderToStaticMarkup(
      <Bulle texte="x" place="gauche">
        <abbr>y</abbr>
      </Bulle>,
    )
    expect(gauche).toContain('data-place="gauche"')
  })

  it('donne à chaque bulle un identifiant distinct', () => {
    const html = renderToStaticMarkup(
      <>
        <Bulle texte="a">
          <abbr>a</abbr>
        </Bulle>
        <Bulle texte="b">
          <abbr>b</abbr>
        </Bulle>
      </>,
    )
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('style de la bulle — charte T-0113 et §11.1', () => {
  it('borne sa largeur par un jeton : une infobulle est une phrase, pas un paragraphe', () => {
    expect(regle('.bulle')).toMatch(/max-width:\s*var\(--bulle-large\)/)
    expect(CSS).toMatch(/--bulle-large:\s*[\d.]+rem;/)
  })

  it('n’écrit aucune couleur en dur : elle bascule au rouge avec le reste', () => {
    const couleurs = /(background|color|border):[^;]+;/g
    for (const declaration of regle('.bulle').match(couleurs) ?? []) {
      expect(declaration, declaration).toContain('var(--')
    }
  })

  it('garde le filet d’un pixel et les angles vifs de la charte', () => {
    const corps = regle('.bulle')
    expect(corps).toMatch(/border:\s*var\(--trait\)/)
    expect(corps).not.toMatch(/border-radius/)
  })

  it('rend le texte lisible : casse et suivi neutralisés, retour à la ligne autorisé', () => {
    const corps = regle('.bulle')
    expect(corps).toMatch(/text-transform:\s*none/)
    expect(corps).toMatch(/letter-spacing:\s*0/)
    expect(corps).toMatch(/white-space:\s*normal/)
  })

  it('s’ouvre au clavier autant qu’à la souris (§11.2)', () => {
    expect(CSS).toContain('.bulle-ancre:has(:focus-visible) > .bulle')
    expect(CSS).toContain('.bulle-ancre:hover > .bulle')
  })

  it('se referme quand la souris quitte un bouton qu’elle vient de cliquer (T-0240)', () => {
    // A click focuses the button: `:focus-within` would hold bulle open off hover.
    expect(CSS).not.toContain('.bulle-ancre:focus-within')
  })

  it('ne vole pas le survol qui la maintient ouverte', () => {
    expect(regle('.bulle')).toMatch(/pointer-events:\s*none/)
  })
})

describe('la bulle ne sort pas de l’écran', () => {
  const PLACES = ['haut', 'bas', 'gauche', 'droite'] as const

  it('donne à chaque bulle un nom d’ancre à elle', () => {
    // Two same-name anchors → every bulle attaches to the last: placement right on the first,
    // wrong elsewhere.
    const html = renderToStaticMarkup(
      <>
        <Bulle texte="a">
          <abbr>a</abbr>
        </Bulle>
        <Bulle texte="b">
          <abbr>b</abbr>
        </Bulle>
      </>,
    )
    const noms = [...html.matchAll(/--bulle-ancre-nom:\s*(--[^;"]+)/g)].map((m) => m[1])
    expect(noms).toHaveLength(2)
    expect(new Set(noms).size).toBe(2)
    for (const nom of noms) expect(nom, nom).toMatch(/^--[a-zA-Z0-9-]+$/)
  })

  it('rattache la bulle à son ancre plutôt qu’au flux, sinon un panneau qui défile la rogne', () => {
    // `.lateral-corps` is `overflow-y: auto`: `position: absolute` bulle is cut there. Only
    // `position: fixed` escapes ancestor clipping.
    expect(regle('.bulle-ancre')).toMatch(/anchor-name:\s*var\(--bulle-ancre-nom\)/)
    const ancre = supports('(anchor-name: --a)')
    expect(ancre).toMatch(/position:\s*fixed/)
    expect(ancre).toMatch(/position-anchor:\s*var\(--bulle-ancre-nom\)/)
  })

  it('laisse le navigateur rabattre la bulle de chaque côté qui déborde', () => {
    const ancre = supports('(anchor-name: --a)')
    for (const place of PLACES) {
      const debut = ancre.indexOf(`[data-place='${place}']`)
      expect(debut, place).toBeGreaterThan(-1)
      expect(ancre.slice(debut, ancre.indexOf('}', debut)), place).toMatch(
        /position-try-fallbacks:\s*[^;]+,/,
      )
    }
  })

  it('nomme chaque repli invoqué, sinon le rabattement ne fait rien', () => {
    const invoques = new Set(
      [...supports('(anchor-name: --a)').matchAll(/(--bulle-cale-[a-z]+)/g)].map((m) => m[1]!),
    )
    expect(invoques.size).toBeGreaterThan(0)
    for (const repli of invoques) expect(CSS, repli).toContain(`@position-try ${repli} {`)
  })

  it('occupe la largeur disponible plutôt que celle du contrôle', () => {
    // With `center` on the cross axis, bulle would be as wide as a 36 px chevron.
    const ancre = supports('(anchor-name: --a)')
    expect(ancre).not.toMatch(/position-area:[^;]*\bcenter\b/)
    expect([...ancre.matchAll(/position-area:[^;]+;/g)]).toHaveLength(PLACES.length)
    for (const declaration of ancre.matchAll(/position-area:([^;]+);/g)) {
      expect(declaration[1], declaration[0]).toContain('span-all')
    }
  })

  it('garde un placement lisible là où le navigateur ne sait pas ancrer', () => {
    const repli = supports('not (anchor-name: --a)')
    for (const place of PLACES) expect(repli, place).toContain(`[data-place='${place}']`)
    expect(repli).toMatch(/var\(--bulle-jour\)/)
  })
})

describe('l’infobulle du navigateur a disparu de l’interface', () => {
  it('ne laisse plus aucun attribut `title` : le navigateur ne peint plus de survol', () => {
    for (const source of sources()) {
      expect(source).not.toMatch(/\stitle=\{/)
      expect(source).not.toMatch(/\stitle="/)
    }
  })
})
