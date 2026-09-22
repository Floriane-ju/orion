/**
 * T-0122 — l'icône est un glyphe de police, pas une image : ce qui peut casser n'est pas un
 * rendu mais un contrat. Trois choses le tiennent, et une seule suffit à afficher « CLOSE »
 * dans un bouton si elle lâche : la ligature n'est pas altérée par la casse ni par le suivi,
 * la police est livrée avec l'artefact, et le glyphe n'est pas annoncé comme du texte.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Icone } from '../src/ui/Icone.tsx'

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

/** Le corps de la règle `.icone`, sans les accolades. */
function reglePointIcone(): string {
  const debut = CSS.indexOf('.icone {')
  expect(debut).toBeGreaterThan(-1)
  return CSS.slice(debut, CSS.indexOf('}', debut))
}

/** Le corps de la `@font-face` de la police d'icônes — T-0191 en a livré d'autres. */
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
    // Sans cela, un bouton « Fermer le panneau » s'annonce « Fermer le panneau close ».
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
    // `--suivi-micro` et les capitales sont la grammaire des libellés de T-0113 : une icône
    // posée dans l'un d'eux en hérite.
    const regle = reglePointIcone()
    expect(regle).toMatch(/text-transform:\s*none/)
    expect(regle).toMatch(/letter-spacing:\s*normal/)
  })

  it('trace les glyphes à l’épaisseur 300, plus fine que le nominal de la police', () => {
    expect(reglePointIcone()).toMatch(/font-variation-settings:[^;]*'wght'\s*300/)
  })

  it('nomme la famille par le jeton, jamais en dur', () => {
    expect(reglePointIcone()).toMatch(/font-family:\s*var\(--police-icone\)/)
  })

  it('embarque le fichier de police plutôt que d’aller le chercher (§12.2, §13.1)', () => {
    const face = faceIcone()
    const source = /src:\s*url\('([^']+)'\)/.exec(face)?.[1]
    expect(source).toBeDefined()
    expect(source).not.toMatch(/^https?:/)
    // Le chemin est relatif à `src/ui/` : il doit désigner un fichier réellement versionné.
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
 * T-0215 — LA RÈGLE EXISTAIT, RIEN NE LA TENAIT.
 *
 * `.claude/rules/orion.md` interdit déjà « un caractère Unicode décoratif posé à la place
 * d'un glyphe » ; `pastilles.test.tsx` le vérifiait pour un seul composant. Trois caractères
 * y échappaient dans le schéma de pointage de §8.4 — « ✛ », « ● » et « ★ » —, rendus dans la
 * police de TEXTE : ni la grille optique, ni la graisse, ni l'alignement du reste, et un
 * dessin qui variait d'un poste à l'autre selon la police de repli disponible.
 *
 * Ce qui est interdit est le caractère qui DESSINE : formes géométriques, dingbats, symboles
 * divers, emoji. Ce qui reste permis est le caractère qui SE LIT dans une phrase — « → »,
 * « × », « − », « ° », « Δ », « · » sont de la typographie, pas des icônes, et les proscrire
 * obligerait à poser un glyphe au milieu d'un mot.
 */
describe('T-0215 — aucun caractère Unicode à la place d’un glyphe', () => {
  /** Formes géométriques, symboles divers, dingbats, emoji. Pas les flèches ni les opérateurs. */
  const DESSINS =
    /[\u{25A0}-\u{25FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F300}-\u{1FAFF}]/u

  it('dans aucun composant de l’interface', () => {
    const racine = join(import.meta.dirname, '..', 'src', 'ui')
    for (const fichier of readdirSync(racine)) {
      if (!fichier.endsWith('.tsx') && !fichier.endsWith('.ts')) continue
      // Les commentaires CITENT les caractères proscrits pour dire qu'ils le sont.
      const source = readFileSync(join(racine, fichier), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      const trouve = DESSINS.exec(source)
      expect(trouve?.[0], `${fichier} — « ${trouve?.[0]} » doit passer par <Icone>`).toBeUndefined()
    }
  })
})

/**
 * T-0215 — l'alerte porte son signe par le BALISAGE, plus par la feuille.
 *
 * `.cause::before` posait « ⚠ » en `content` : une seconde façon d'afficher une icône dans un
 * projet qui n'en autorise qu'une, et un second endroit à toucher le jour où l'épaisseur des
 * glyphes change. Ce qui se vérifie ici est que ce chemin ne rouvre pas — ni par un `content`
 * qui dessine, ni par un appel direct à la police d'icônes ailleurs que dans `.icone`.
 */
describe('T-0215 — une seule façon d’afficher une icône', () => {
  it('ne pose aucun glyphe en `content` dans la feuille', () => {
    // « · » reste permis : c'est un séparateur de liste, il se lit dans une phrase.
    const DESSINS =
      /[\u{25A0}-\u{25FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F300}-\u{1FAFF}]/u
    for (const [, valeur] of CSS.matchAll(/content:\s*'([^']*)'/g)) {
      expect(DESSINS.exec(valeur!)?.[0], `content: '${valeur}'`).toBeUndefined()
    }
  })

  it('ne nomme la police d’icônes que dans `.icone`', () => {
    // Deux occurrences légitimes, et deux seulement : la déclaration du jeton, et la règle
    // qui l'applique. Une troisième serait un second style d'icône hors de portée d'`Icone`.
    const REGLES = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect([...REGLES.matchAll(/var\(--police-icone\)/g)]).toHaveLength(1)
    expect(reglePointIcone()).toContain('var(--police-icone)')
  })

  /**
   * T-0287 — DEUX GLYPHES NE SE TOUCHENT PAS.
   *
   * Le schéma de pointage posait `<Icone nom="circle" />` puis `<Icone nom="star" />` sans
   * rien entre eux. Le navigateur façonne le texte à travers la frontière de deux `<span>`
   * qui se suivent : la police y a lu « circles » — une ligature qui existe —, et les trois
   * lettres restantes se sont affichées en toutes lettres. Le défaut n'était visible qu'à
   * l'écran, avec la police réelle, donc invisible à toute la suite.
   *
   * Ce qui est interdit n'est pas ce couple-là : c'est l'adjacence, qui refait le même
   * accident avec n'importe quel autre nom dont un préfixe est aussi une ligature. Deux
   * icônes séparées par un texte, une espace ou un élément ne posent pas de problème.
   */
  it('ne colle jamais deux glyphes l’un contre l’autre', () => {
    const racine = join(import.meta.dirname, '..', 'src', 'ui')
    // Deux glyphes que rien ne sépare : collés, séparés d'un simple retour à la ligne, ou
    // rendus par deux conditions qui se suivent. Une espace `{' '}`, un mot ou les deux
    // branches d'un ternaire séparent bel et bien, et restent permis.
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
