/**
 * T-0191 — §12.2 : un jeton de police ne nomme pas une famille que le dépôt ne livre pas.
 *
 * La CSP (§13.1, `default-src 'self'`) interdit toute origine tierce : une famille nommée
 * sans fichier ne se charge jamais, et le repli système devient le rendu nominal — sans
 * qu'aucun test ne s'en aperçoive, puisque le texte reste lisible. Le garde-fou est donc
 * ici : la première famille de chaque pile est celle du dessin, elle doit avoir sa
 * `@font-face`, et chaque `@font-face` doit pointer un fichier qui existe.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOSSIER_UI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui')
const FEUILLE = readFileSync(join(DOSSIER_UI, 'styles.css'), 'utf8')

/** La première famille citée par chaque jeton `--police-*` : celle que la charte veut voir. */
function famillesDeLaCharte(): readonly { readonly jeton: string; readonly famille: string }[] {
  return [...FEUILLE.matchAll(/--(police-[\w-]+):\s*'([^']+)'/g)].map((m) => ({
    jeton: `--${m[1]!}`,
    famille: m[2]!,
  }))
}

/** Les `@font-face` de la feuille : famille déclarée et chemin de fichier, relatif à `src/ui`. */
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
    // Le test ne vaut que s'il voit les jetons : une regex qui ne trouve rien passerait.
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
    // `code`, `kbd`, `samp` et `pre` reçoivent `font-family: monospace` de la feuille du
    // navigateur : sans remise, une formule s'écrit en Menlo au lieu de --police-mono.
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
