/**
 * T-0068 — planétarium canvas names + announces itself. Canvas = pixel box: without role/name
 * the central vue doesn't exist for assistive tech. Checks name + description present in static
 * render; above all that the description IS the displayed reading, not a 2nd free sentence
 * able to drift.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { nombre } from '../src/registry/ecriture.ts'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { K } from '../src/registry/constants.ts'
import { etatScene, majVue, reinitialiseScene } from '../src/ui/scene-etat.ts'
import { reinitialiseSeance } from '../src/ui/seance-etat.ts'

const DOSSIER_UI = join(import.meta.dirname, '..', 'src', 'ui')

function ecran(): string {
  return renderToStaticMarkup(<App />)
}

/** Canvas opening tag alone: role and refs live there. */
function baliseCanevas(html: string): string {
  const debut = html.indexOf('<canvas')
  expect(debut).toBeGreaterThan(-1)
  return html.slice(debut, html.indexOf('>', debut))
}

afterEach(() => {
  reinitialiseSeance()
  reinitialiseScene()
})

describe('T-0068 — le canevas porte un rôle et un nom', () => {
  it('se déclare pilotable plutôt que décoratif, et se donne un nom', () => {
    const canevas = baliseCanevas(ecran())
    // T-0069 makes scène drivable: `application`, so arrow keys reach it.
    expect(canevas).toContain('role="application"')
    expect(canevas).toMatch(/aria-label="Planétarium[^"]+"/)
    expect(canevas).toContain('tabindex="0"')
  })

  it('renvoie vers une description effectivement présente dans la page', () => {
    const html = ecran()
    const renvoi = /aria-describedby="([^"]+)"/.exec(baliseCanevas(html))
    expect(renvoi).not.toBeNull()
    expect(html).toContain(`id="${renvoi![1]!}"`)
  })
})

/** Text of a static-render fragment: React tags and separators removed. */
function texteSeul(html: string): string {
  return html.replaceAll('<!-- -->', '').replace(/<[^>]*>/g, '')
}

describe('T-0068 — la description dit ce que la vue montre en ce moment', () => {
  /** Description paragraph text, static-render separators removed. */
  function description(html: string): string {
    const debut = html.indexOf('<p class="scene-description"')
    expect(debut).toBeGreaterThan(-1)
    return html.slice(debut, html.indexOf('</p>', debut)).replaceAll('<!-- -->', '')
  }

  it('nomme la visée, le champ et l’instant', () => {
    const texte = description(ecran())
    const { azimutDeg, hauteurDeg, fovDeg } = etatScene().vue
    expect(texte).toContain(`azimut ${nombre(azimutDeg)}°`)
    expect(texte).toContain(`hauteur ${nombre(hauteurDeg)}°`)
    expect(texte).toContain(`champ ${nombre(fovDeg, 1)}°`)
    expect(texte).toContain('AD')
  })

  it('suit le pointage : elle décrit la vue courante, pas celle du montage', () => {
    majVue({ azimutDeg: 90, fovDeg: K('FOV_MIN_SANS_GAIA_DEG') })
    const texte = description(ecran())
    expect(texte).toContain('azimut 90°')
    expect(texte).toContain(`champ ${nombre(K('FOV_MIN_SANS_GAIA_DEG'), 1)}°`)
  })

  it('énonce les raccourcis du clavier, que le code seul ne dirait à personne (T-0069)', () => {
    // T-0213 — Vue card also showed them in clear; gone with rail, its toggles don't drive visée.
    // Shortcuts stay announced where they apply: canvas description, scène's own.
    expect(description(ecran())).toMatch(/← ↑ ↓ →/)
  })

  it('emprunte les mots de la lecture affichée : une seule phrase, deux endroits', () => {
    majVue({ azimutDeg: 42 })
    const html = ecran()
    const commune = /(visée [^·]+· azimut 42°, hauteur [^·]+· champ [\d,]+°)/.exec(
      description(html),
    )
    expect(commune).not.toBeNull()
    // T-0153 — visée shows same numbers char for char: composed twice → drift at first `toFixed`
    // edit. T-0163 — counters in sentence order: AD, δ, azimut, hauteur, champ (no rotation).
    // T-0411 — moved bottom-left, after scène in DOM.
    const debut = html.indexOf('coque-visee')
    const visee = texteSeul(html.slice(debut, html.indexOf('</div>', debut)))
    const nombres = visee.match(/[\d,]+°/g) ?? []
    expect(nombres.length).toBeGreaterThanOrEqual(5)
    for (const n of nombres.slice(0, 5)) expect(commune![1]!, n).toContain(n)
  })
})

/**
 * Constat A1, discrete side: `aria-label` on a role-less `div` isn't exposed. Good intent, no
 * effect, nothing flags it in review. Rule checked on whole UI, not only `PlanSession` schéma.
 */
describe('T-0068 — aucun `aria-label` inerte dans l’interface', () => {
  const balises = readdirSync(DOSSIER_UI)
    .filter((f) => f.endsWith('.tsx'))
    .flatMap((f) => {
      const source = readFileSync(join(DOSSIER_UI, f), 'utf8')
      return [...source.matchAll(/<(div|span|p|section)\s[^>]*aria-label=[^>]*>/g)].map((m) => ({
        fichier: f,
        balise: m[0],
      }))
    })

  it('donne un rôle à toute balise générique qui se nomme', () => {
    const inertes = balises.filter((b) => !b.balise.includes('role=')).map((b) => b.fichier)
    expect(inertes).toEqual([])
  })
})
