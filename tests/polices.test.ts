/**
 * T-0191 — §12.2: a font token never names a family the repo doesn't ship.
 * CSP (§13.1, `default-src 'self'`) forbids third-party origins: family without file never loads,
 * system fallback becomes nominal, no test notices (text readable).
 * Guard: first family of each stack = design's; needs its `@font-face`; each `@font-face` points
 * to an existing file.
 */

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nombre } from '../src/registry/ecriture.ts'
import { litWoff2 } from './woff2.ts'

const DOSSIER_UI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui')
const FEUILLE = readFileSync(join(DOSSIER_UI, 'styles.css'), 'utf8')

/** First family of each `--police-*` token = the charte's. */
function famillesDeLaCharte(): readonly { readonly jeton: string; readonly famille: string }[] {
  return [...FEUILLE.matchAll(/--(police-[\w-]+):\s*'([^']+)'/g)].map((m) => ({
    jeton: `--${m[1]!}`,
    famille: m[2]!,
  }))
}

/** Stylesheet `@font-face`s: family + file path relative to `src/ui`. */
function facesDeclarees(): readonly { readonly famille: string; readonly url: string }[] {
  return [...FEUILLE.matchAll(/@font-face\s*\{([^}]*)\}/g)].flatMap(([, corps]) => {
    const famille = /font-family:\s*'([^']+)'/.exec(corps!)?.[1]
    const url = /url\('([^']+)'\)/.exec(corps!)?.[1]
    return famille === undefined || url === undefined ? [] : [{ famille, url }]
  })
}

describe('polices livrées (§12.2)', () => {
  it('chaque jeton nomme d’abord une famille qui a sa @font-face', () => {
    const declarees = new Set(facesDeclarees().map((f) => f.famille))
    const jetons = famillesDeLaCharte()
    // A regex finding nothing would pass: require tokens seen.
    expect(jetons.length).toBeGreaterThanOrEqual(3)
    for (const { jeton, famille } of jetons) {
      expect({ jeton, famille, declaree: declarees.has(famille) }).toEqual({
        jeton,
        famille,
        declaree: true,
      })
    }
  })

  it('chaque @font-face pointe un fichier versionné et non vide', () => {
    const faces = facesDeclarees()
    expect(faces.length).toBeGreaterThanOrEqual(3)
    for (const { famille, url } of faces) {
      const chemin = join(DOSSIER_UI, url)
      expect({ famille, url, octets: statSync(chemin).size > 0 }).toEqual({
        famille,
        url,
        octets: true,
      })
    }
  })

  it('cite la licence de chaque police à côté du fichier', () => {
    const licences = readFileSync(join(DOSSIER_UI, '..', 'fonts', 'LICENCES.md'), 'utf8')
    for (const { famille } of facesDeclarees()) {
      expect(licences, famille).toContain(famille)
    }
  })

  it('les éléments à police de navigateur héritent de la charte (T-0329)', () => {
    // `code`, `kbd`, `samp`, `pre` get `font-family: monospace` from UA sheet: without reset a
    // formula renders in Menlo, not --police-mono.
    const regle = [...FEUILLE.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(
      ([, , corps]) => /font:\s*inherit/.test(corps!),
    )
    const selecteurs = new Set(
      (regle?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim()),
    )
    for (const element of ['code', 'kbd', 'samp', 'pre']) {
      expect({ element, herite: selecteurs.has(element) }).toEqual({ element, herite: true })
    }
  })
})

/** Non-ASCII chars written outside comments in `src/`: what the screen can display. */
function caracteresDesSources(dossier: string): ReadonlyMap<string, string> {
  const trouves = new Map<string, string>()
  for (const entree of readdirSync(dossier, { withFileTypes: true, recursive: true })) {
    if (!entree.isFile() || !/\.(tsx?|css)$/.test(entree.name)) continue
    const chemin = join(entree.parentPath, entree.name)
    // ponytail: `//` also cuts a URL inside a string → loses chars to verify, never invents any.
    const code = readFileSync(chemin, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const c of code) if (c.codePointAt(0)! > 0x7f && !trouves.has(c)) trouves.set(c, chemin)
  }
  return trouves
}

describe('couverture de la mono (T-0389)', () => {
  const faces = facesDeclarees().filter((f) => f.famille === 'IBM Plex Mono')
  const fontes = faces.map((f) => ({ ...f, fonte: litWoff2(join(DOSSIER_UI, f.url)) }))
  const couverts = new Set(fontes.flatMap((f) => [...f.fonte.points]))

  it('chaque caractère écrit dans les sources a son glyphe dans une fonte livrée', () => {
    const sources = caracteresDesSources(join(DOSSIER_UI, '..'))
    // Greek + typographic minus included, else test sees nothing.
    expect(sources.has('δ') && sources.has('−')).toBe(true)
    const manquants = [...sources]
      .filter(([c]) => !couverts.has(c.codePointAt(0)!))
      .map(([c, chemin]) => `${c} U+${c.codePointAt(0)!.toString(16).toUpperCase()} (${chemin})`)
    expect(manquants).toEqual([])
  })

  it('le séparateur de milliers et les lettres de Bayer sont couverts', () => {
    // Neither written in sources: `Intl` produces one, binary catalogues carry the others.
    const separateur = nombre(13132).replace(/\d/g, '')
    const bayer = String.fromCodePoint(...Array.from({ length: 25 }, (_, i) => 0x3b1 + i))
    for (const c of separateur + bayer) expect([c, couverts.has(c.codePointAt(0)!)]).toEqual([c, true])
  })

  it('la couverture a la chasse de Plex : une colonne reste alignée', () => {
    const chasses = new Set(fontes.map((f) => f.fonte.chasse))
    expect(fontes.length).toBeGreaterThan(3)
    expect([...chasses]).toEqual([0.6])
  })

  it('la plage unicode-range ne promet que des glyphes présents dans le fichier', () => {
    const plages = [...FEUILLE.matchAll(/@font-face\s*\{([^}]*)\}/g)].flatMap(([, corps]) => {
      const url = /url\('([^']+)'\)/.exec(corps!)?.[1]
      const plage = /unicode-range:\s*([^;]+);/.exec(corps!)?.[1]
      return url === undefined || plage === undefined ? [] : [{ url, plage }]
    })
    expect(plages.length).toBeGreaterThan(0)
    for (const { url, plage } of plages) {
      const { points } = litWoff2(join(DOSSIER_UI, url))
      for (const morceau of plage.split(',')) {
        const [debut, fin = debut] = morceau.trim().replace('U+', '').split('-')
        for (let c = parseInt(debut!, 16); c <= parseInt(fin!, 16); c++) {
          expect([url, c.toString(16), points.has(c)]).toEqual([url, c.toString(16), true])
        }
      }
    }
  })
})
