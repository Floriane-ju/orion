/**
 * §11.1 — Mode nuit, et §11.2 — ergonomie de consultation nocturne.
 *
 * Le critère d'acceptation du PRD est une propriété de la feuille de style, pas une
 * impression visuelle : aucun pixel ne doit présenter de composante verte ou bleue non
 * nulle. Deux conditions le garantissent et sont vérifiées ici —
 *
 *   1. la palette du mode nuit n'écrit que du rouge pur ;
 *   2. AUCUNE couleur n'est écrite en dur ailleurs dans la feuille, sans quoi elle
 *      survivrait au basculement.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { appliqueModeNuit } from '../src/ui/ModeNuit.tsx'
import { ETAT_INITIAL, litEtatPersiste } from '../src/data/mode-nuit.ts'
import { Mention } from '../src/ui/Mention.tsx'
import { K } from '../src/registry/constants.ts'
import { etatScene } from '../src/ui/scene-etat.ts'
import { POLICE_SCENE, palette, type PaletteCiel } from '../src/ui/couleurs.ts'

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

/** Le bloc de palette du mode nuit, isolé du reste de la feuille. */
function blocModeNuit(): string {
  const debut = CSS.indexOf(":root[data-mode-nuit='true']")
  expect(debut).toBeGreaterThan(-1)
  return CSS.slice(debut, CSS.indexOf('}', debut))
}

function declarationsCouleur(bloc: string): readonly string[] {
  return bloc
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.startsWith('--') && ligne.includes(':'))
    .map((ligne) => ligne.slice(ligne.indexOf(':') + 1).replace(';', '').trim())
}

/**
 * Les jetons d'un bloc de palette, avec leur valeur résolue : `var(--x)` prend la valeur de
 * `--x`, et `color-mix(in srgb, var(--a) P%, var(--b))` est calculé en `#rrggbb` — les nuances
 * du neutre et de l'accent dérivent de leur origine, et c'est leur couleur RENDUE qui doit tenir.
 */
function jetonsDuBloc(bloc: string): Readonly<Record<string, string>> {
  const bruts: Record<string, string> = Object.fromEntries(
    [...bloc.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  )
  const resous = (valeur: string): string => {
    const reference = /^var\(--([a-z-]+)\)$/.exec(valeur)
    if (reference) return resous(bruts[reference[1]!]!)
    const melange =
      /^color-mix\(in srgb,\s*var\(--([a-z-]+)\)\s+([\d.]+)%,\s*var\(--([a-z-]+)\)\)$/.exec(valeur)
    if (!melange) return valeur
    const part = Number(melange[2]) / 100
    const [a, b] = [canaux(resous(bruts[melange[1]!]!)), canaux(resous(bruts[melange[3]!]!))]
    const octet = (i: number): string =>
      Math.round(a[i]! * part + b[i]! * (1 - part))
        .toString(16)
        .padStart(2, '0')
    return `#${octet(0)}${octet(1)}${octet(2)}`
  }
  return Object.fromEntries(Object.keys(bruts).map((nom) => [nom, resous(bruts[nom]!)]))
}

const paletteParDefaut = (): Readonly<Record<string, string>> =>
  jetonsDuBloc(CSS.slice(CSS.indexOf(':root {'), CSS.indexOf('}', CSS.indexOf(':root {'))))

const paletteDeNuit = (): Readonly<Record<string, string>> => jetonsDuBloc(blocModeNuit())

/**
 * Les canaux 0-255 d'une valeur de palette, AU FACTEUR DE LUMINANCE NOMINAL : `#rrggbb`, ou
 * `rgb(calc(var(--luminance-nuit) * N) 0 0)` — le facteur multiplie toute la palette, donc
 * le lire à 1 revient à mesurer le meilleur cas, celui où le seuil doit tenir.
 */
function canaux(valeur: string): readonly [number, number, number] {
  const court = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(valeur)
  if (court) return [1, 2, 3].map((i) => parseInt(court[i]!.repeat(2), 16)) as [number, number, number]
  const hex = /^#([0-9a-f]{6})$/i.exec(valeur)
  if (hex) {
    const canal = (i: number): number => parseInt(hex[1]!.slice(i, i + 2), 16)
    return [canal(0), canal(2), canal(4)]
  }
  const rouge = /^rgb\(\s*calc\(var\(--luminance-nuit\)\s*\*\s*(\d+)\)\s+0\s+0\s*\)$/.exec(valeur)
  expect(rouge, `valeur de palette illisible : ${valeur}`).not.toBeNull()
  return [Number(rouge![1]), 0, 0]
}

/** Luminance relative WCAG 2.2, https://www.w3.org/TR/WCAG22/#dfn-relative-luminance. */
function luminance(valeur: string): number {
  const lineaire = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, v, b] = canaux(valeur)
  return 0.2126 * lineaire(r / 255) + 0.7152 * lineaire(v / 255) + 0.0722 * lineaire(b / 255)
}

/** Ratio de contraste WCAG 2.2, https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio. */
function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (clair + 0.05) / (sombre + 0.05)
}

/** Le corps d'une règle, désignée par son sélecteur en début de ligne. */
function regle(selecteur: string): string {
  // Seul, ou en tête d'une liste de sélecteurs groupés (T-0337).
  const seul = CSS.indexOf(`\n${selecteur} {`)
  const debut = seul > -1 ? seul : CSS.indexOf(`\n${selecteur},\n`)
  expect(debut, selecteur).toBeGreaterThan(-1)
  return CSS.slice(debut, CSS.indexOf('}', debut))
}

describe('palette du mode nuit §11.1', () => {
  it('n’écrit que du rouge pur : canaux vert et bleu strictement nuls', () => {
    for (const valeur of declarationsCouleur(blocModeNuit())) {
      const noir = /^#000(000)?$/.test(valeur)
      const rougePur = /^rgb\(\s*calc\(.*\)\s+0\s+0\s*\)$/.test(valeur)
      expect(noir || rougePur, valeur).toBe(true)
    }
  })

  it('couvre toutes les variables de couleur du thème par défaut', () => {
    const parDefaut = CSS.slice(CSS.indexOf(':root {'), CSS.indexOf('}', CSS.indexOf(':root {')))
    const variables = (texte: string): readonly string[] =>
      [...texte.matchAll(/--([a-z-]+):/g)].map((m) => m[1]!)
    // Les variables de mesure — pas de couleur, rien à repeindre en rouge.
    const mesures = ['cible-clic']
    const couleursParDefaut = variables(parDefaut).filter((v) => !mesures.includes(v))
    const couleursNuit = variables(blocModeNuit())
    for (const variable of couleursParDefaut) {
      expect(couleursNuit, variable).toContain(variable)
    }
  })

  it('inclut le jeton --bordure-controle en mode nuit', () => {
    // T-0186 - le nouveau jeton reserve aux controles doit etre defini en rouge pur.
    const couleursNuit = jetonsDuBloc(blocModeNuit())
    expect(couleursNuit, '--bordure-controle manquant').toHaveProperty('bordure-controle')
    const valeur = couleursNuit['bordure-controle']!
    expect(valeur, valeur).toMatch(/^rgb\(\s*calc\(var\(--luminance-nuit\)\s*\*\s*\d+\)\s+0\s+0\s*\)$/)
  })

  it('n’écrit aucune couleur en dur hors des blocs de palette', () => {
    // Tout ce qui suit le bloc de palette nocturne est la feuille proprement dite : elle ne
    // doit référencer que des variables. Une couleur en dur y survivrait au mode nuit.
    //
    // L'ancrage est la PREMIÈRE occurrence, celle de la palette : depuis §6.4 la feuille porte
    // aussi des règles de composant sous ce sélecteur, et s'ancrer sur la dernière ne ferait
    // plus balayer que la fin du fichier.
    const apresPalettes = CSS.slice(CSS.indexOf(":root[data-mode-nuit='true']"))
    const corps = apresPalettes.slice(apresPalettes.indexOf('}') + 1)
    expect(corps).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(corps).not.toMatch(/\brgba?\(/)
    expect(corps).not.toMatch(/\bhsla?\(/)
  })

  it('prévoit une transition progressive plutôt qu’un basculement brutal', () => {
    expect(CSS).toMatch(/transition:\s*background-color/)
  })

  it('ne fait jamais porter l’information par la seule couleur', () => {
    // Une alerte se distingue aussi par sa FORME : une barre latérale épaisse, et un signe.
    //
    // T-0215 — le signe était « ⚠ » posé en `content` par la feuille, donc rendu dans la
    // police de texte. Il vient maintenant du balisage, par `Icone` : c'est là qu'il se
    // vérifie. La barre, elle, reste une propriété de la feuille.
    for (const ton of ['cause', 'erreur'] as const) {
      const html = renderToStaticMarkup(<Mention ton={ton}>refus</Mention>)
      expect(html, ton).toContain('warning')
      expect(html, ton).toContain('mention-signe')
    }
    expect(CSS).toMatch(/border-left-width: var\(--trait-marque\)/)
  })

  it('ne pose le signe que sur ce qui alerte', () => {
    // Un état simple n'est pas une alerte : lui donner le signe le ferait lire comme un refus,
    // et §11.1 perdrait ce qui distingue les deux une fois la couleur passée au rouge.
    for (const ton of ['etat', 'tracee-source'] as const) {
      expect(renderToStaticMarkup(<Mention ton={ton}>lecture</Mention>), ton).not.toContain(
        'mention-signe',
      )
    }
  })
})

/**
 * T-0070 — les couleurs que le navigateur peint tout seul.
 *
 * Le test de fuite ci-dessus lit la feuille de style : il ne peut rien voir de ce qui n'y
 * est pas écrit. L'anneau de focus, la sélection, le caret, la couleur d'accent et les
 * ascenseurs sont dans ce cas — bleus par défaut, donc une fuite §11.1 invisible au test.
 * Ce bloc vérifie qu'ils sont déclarés, et déclarés depuis les jetons de la palette : c'est
 * ce qui les fait basculer au rouge avec le reste.
 */
/**
 * La scène peint des objets d'interface — le cadre du matériel, le parcours de pointage — sur un
 * canevas que la feuille n'atteint pas. Leur teinte est recopiée dans `couleurs.ts` : ce test
 * est ce qui la tient à son jeton, dans les deux modes.
 */
describe('la scène reprend les jetons de l’interface', () => {
  const rvb = (valeur: string): string => `rgb(${canaux(valeur).join(' ')})`
  /** Le canevas écrit `rgb(r g b)` ou `#rrggbb` : les deux se comparent sous la même forme. */
  const scene = (valeur: string): string => (valeur.startsWith('rgb(') ? valeur : rvb(valeur))
  const liens: readonly (readonly [keyof PaletteCiel, string])[] = [
    ['fond', 'fond'],
    ['cadre', 'accent'],
    ['parcours', 'texte'],
  ]
  /** T-0330 — de jour seulement : la nuit, la scène abaisse les corps sous l'interface. */
  const liensDeJour: readonly (readonly [keyof PaletteCiel, string])[] = [['corps', 'avertissement']]
  /**
   * T-0330 — graduations propres à la scène, déclarées comme telles dans `couleurs.ts` et le
   * README. Une teinte absente des trois listes fait échouer le test : elle doit choisir.
   */
  const horsKit: readonly (keyof PaletteCiel)[] = [
    'figures',
    'frontieres',
    'asterismes',
    'horizon',
    'sol',
    'voieLactee',
    'texte',
  ]

  it.each(liens)('%s suit --%s, le jour comme la nuit', (repere, jeton) => {
    expect(scene(palette(false)[repere])).toBe(rvb(paletteParDefaut()[jeton]!))
    expect(scene(palette(true)[repere])).toBe(rvb(paletteDeNuit()[jeton]!))
  })

  it.each(liensDeJour)('%s suit --%s de jour', (repere, jeton) => {
    expect(scene(palette(false)[repere])).toBe(rvb(paletteParDefaut()[jeton]!))
  })

  it('chaque teinte de la scène est liée à un jeton ou déclarée hors kit', () => {
    const classees = new Set([...liens, ...liensDeJour].map(([r]) => r).concat(horsKit))
    expect(Object.keys(palette(false)).filter((r) => !classees.has(r as keyof PaletteCiel))).toEqual(
      [],
    )
  })

  it('écrit ses textes dans la famille de l’interface', () => {
    const famille = /--police-mono:\s*([^;]+);/.exec(CSS)?.[1]?.replace(/\s+/g, ' ')
    expect(POLICE_SCENE).toBe(famille)
  })
})

describe('focus et couleurs du navigateur — T-0070', () => {
  /** Seuil WCAG 2.4.11 « Focus Appearance » pour l'indicateur de focus. */
  const CONTRASTE_FOCUS_MINIMAL = 3

  /** Le second bloc `:root` : celui qui pose les couleurs peintes par le navigateur. */
  function blocNavigateur(): string {
    const debut = CSS.lastIndexOf('\n:root {')
    expect(debut, 'aucun bloc :root pour les couleurs du navigateur').toBeGreaterThan(
      CSS.indexOf(':root {'),
    )
    return CSS.slice(debut, CSS.indexOf('}', debut))
  }

  /** Les jetons cités par une déclaration : `var(--x) var(--y)` → ['x', 'y']. */
  function jetonsCites(declaration: string): readonly string[] {
    return [...declaration.matchAll(/var\(--([a-z-]+)\)/g)].map((m) => m[1]!)
  }

  function valeurDe(bloc: string, propriete: string): string {
    const trouve = new RegExp(`\\b${propriete}:\\s*([^;]+);`).exec(bloc)
    expect(trouve, `${propriete} absent`).not.toBeNull()
    return trouve![1]!
  }

  const jetonsDeNuit = (): readonly string[] =>
    [...blocModeNuit().matchAll(/--([a-z-]+):/g)].map((m) => m[1]!)

  /** Le jeton qui colore l'anneau de focus. */
  function jetonFocus(): string {
    // T-0331 — l'épaisseur est un jeton aussi (`--trait-focus`) : seule la COULEUR compte ici.
    const cites = jetonsCites(valeurDe(regle(':focus-visible'), 'outline')).filter(
      (j) => j !== 'trait-focus',
    )
    expect(cites, 'l’anneau de focus n’est pas coloré par un jeton').toHaveLength(1)
    return cites[0]!
  }

  it('trace un anneau de focus explicite, et n’en supprime aucun', () => {
    expect(valeurDe(regle(':focus-visible'), 'outline')).toMatch(
      /^var\(--trait-focus\) solid var\(--[a-z-]+\)$/,
    )
    // Un anneau détaché de la bordure de l'élément, sans quoi il s'y confond.
    expect(regle(':focus-visible')).toMatch(/outline-offset:/)
    // `outline: none` quelque part rendrait le parcours au clavier invisible à cet endroit.
    expect(CSS).not.toMatch(/outline:\s*(none|0)\b/)
  })

  it('rentre l’anneau du canevas, que la scène rognerait', () => {
    expect(valeurDe(regle('.planetarium:focus-visible'), 'outline-offset')).toMatch(/^-|\*\s*-\d/)
  })

  it('donne à l’anneau ≥ 3:1 sur toutes les surfaces, à luminance nominale', () => {
    const palette = paletteParDefaut()
    const anneau = palette[jetonFocus()]!
    for (const surface of ['fond', 'surface', 'surface-haute']) {
      expect(contraste(anneau, palette[surface]!), surface).toBeGreaterThanOrEqual(
        CONTRASTE_FOCUS_MINIMAL,
      )
    }
  })

  it('déclare les couleurs que le navigateur peindrait en bleu', () => {
    const declarations = [
      ...['accent-color', 'caret-color', 'scrollbar-color'].map((propriete) => [
        propriete,
        valeurDe(blocNavigateur(), propriete),
      ]),
      ['::selection background', valeurDe(regle('::selection'), 'background')],
      ['::selection color', valeurDe(regle('::selection'), 'color')],
    ] as const
    for (const [nom, valeur] of declarations) {
      const cites = jetonsCites(valeur)
      expect(cites.length, `${nom} : ${valeur}`).toBeGreaterThan(0)
      // Une couleur écrite autrement que par un jeton survivrait au basculement.
      expect(valeur.replace(/var\(--[a-z-]+\)/g, '').trim(), nom).toBe('')
      for (const jeton of cites) {
        expect(jetonsDeNuit(), `${nom} → --${jeton}`).toContain(jeton)
      }
    }
  })

  it('colore l’anneau de focus depuis un jeton repeint en rouge la nuit', () => {
    expect(jetonsDeNuit()).toContain(jetonFocus())
  })
})

/**
 * T-0071 — le contraste du texte, recalculé depuis la feuille.
 *
 * Le seuil est une propriété des jetons, pas une impression visuelle : il se recalcule à
 * chaque exécution depuis `styles.css`, et tout jeton qui régresse fait échouer ce test.
 * Le calcul, le plafond du rouge pur et l'effondrement au plancher de 2 % sont écrits à
 * côté de la palette, dans la feuille.
 */
describe('contraste du texte — WCAG 2.2 AA', () => {
  /** Seuil AA du texte courant. Les libellés sont à 0,85 rem : jamais du « texte large ». */
  const CONTRASTE_TEXTE_MINIMAL = 4.5

  const JETONS_TEXTE = ['texte', 'attenue', 'alerte'] as const
  /** `--bordure` est un trait, pas un glyphe : il ne relève pas du seuil de texte. */
  const JETONS_FOND = ['fond', 'surface', 'surface-haute', 'surface-survol', 'fond-alerte'] as const

  for (const [mode, palette] of [
    ['normal', paletteParDefaut],
    ['nuit', paletteDeNuit],
  ] as const) {
    it(`donne ≥ 4,5:1 à tout texte sur toute surface, en mode ${mode}`, () => {
      const jetons = palette()
      for (const texte of JETONS_TEXTE) {
        for (const fond of JETONS_FOND) {
          expect(
            contraste(jetons[texte]!, jetons[fond]!),
            `--${texte} sur --${fond}`,
          ).toBeGreaterThanOrEqual(CONTRASTE_TEXTE_MINIMAL)
        }
      }
    })
  }

  it('lit l’encre d’une barre de titre sur son aplat, au repos comme au survol', () => {
    for (const jetons of [paletteParDefaut(), paletteDeNuit()]) {
      for (const [encre, aplat] of [
        ['barre-encre', 'barre-fond'],
        ['barre-survol-encre', 'barre-survol'],
      ] as const) {
        expect(contraste(jetons[encre]!, jetons[aplat]!), `--${encre} sur --${aplat}`)
          .toBeGreaterThanOrEqual(CONTRASTE_TEXTE_MINIMAL)
      }
    }
  })

  it('garde la hiérarchie du texte secondaire, que la luminance ne porte plus', () => {
    // Le plafond de 5,25:1 colle --attenue à --texte : l'ordre subsiste mais ne se voit
    // plus. Ce qui distingue le texte secondaire est donc sa taille, et sa graisse là où
    // deux états partagent la même.
    const nuit = paletteDeNuit()
    expect(luminance(nuit['attenue']!)).toBeLessThan(luminance(nuit['texte']!))
    // T-0194 — la taille vient désormais de l'échelle typographique : ce qui est vérifié
    // reste qu'un rang lui est assigné, pas la forme littérale du nombre.
    // T-0215 — le rang du libellé a quitté `label` pour `.libelle` : `label` n'ordonne plus
    // que la disposition, et ne restyle plus le contrôle qu'il enveloppe.
    for (const selecteur of ['.libelle', '.etat']) {
      expect(regle(selecteur), selecteur).toMatch(/font-size: var\(--texte-[a-z]+\)/)
    }
    expect(regle('.onglet.actif')).toMatch(/font-weight: var\(--graisse-forte\)/)
  })
})

/**
 * T-0186 - le contraste des elements non textuels (bordures de controle).
 *
 * WCAG 2.2 critere 1.4.11 exige 3:1 entre la limite visuelle qui identifie un composant
 * d'interface (champ, bouton, tiroir) et la surface qui la porte. Le jeton `--bordure-controle`
 * est reserve aux controles ; `--bordure` reste sur les conteneurs (cartes) qui en sont exempts.
 *
 * En mode nuit, au facteur nominal, le meme seuil doit tenir. Sous le facteur, l'ecart est
 * celui de T-0071 (effondrement au plancher de 2 %).
 */
describe('contraste des bordures de controle - WCAG 2.2 1.4.11', () => {
  const CONTRASTE_BORDURE_MINIMAL = 3

  const JETONS_BORDURE_CONTROLE = ['bordure-controle'] as const
  const JETONS_FOND = ['fond', 'surface', 'surface-haute', 'surface-survol', 'fond-alerte'] as const

  for (const [mode, palette] of [
    ['normal', paletteParDefaut],
    ['nuit', paletteDeNuit],
  ] as const) {
    it(`donne >= 3:1 aux bordures de controle sur toute surface, en mode ${mode}`, () => {
      const jetons = palette()
      for (const bordure of JETONS_BORDURE_CONTROLE) {
        for (const fond of JETONS_FOND) {
          expect(
            contraste(jetons[bordure]!, jetons[fond]!),
            `--${bordure} sur --${fond}`,
          ).toBeGreaterThanOrEqual(CONTRASTE_BORDURE_MINIMAL)
        }
      }
    })
  }

  it('ne degrade pas le contraste du texte', () => {
    // Valider que le nouveau jeton --bordure-controle n'a pas degrade le contraste du texte
    // qui doit rester >= 4,5:1 (AA) sur toute surface.
    const CONTRASTE_TEXTE_MINIMAL = 4.5
    const JETONS_TEXTE = ['texte', 'attenue', 'alerte'] as const
    const JETONS_FOND = ['fond', 'surface', 'surface-haute', 'surface-survol', 'fond-alerte'] as const

    for (const [mode, palette] of [
      ['normal', paletteParDefaut],
      ['nuit', paletteDeNuit],
    ] as const) {
      const jetons = palette()
      for (const texte of JETONS_TEXTE) {
        for (const fond of JETONS_FOND) {
          expect(
            contraste(jetons[texte]!, jetons[fond]!),
            `${mode} - --${texte} sur --${fond}`,
          ).toBeGreaterThanOrEqual(CONTRASTE_TEXTE_MINIMAL)
        }
      }
    }
  })

  it('conserve le jeton --bordure pour les conteneurs (cartes), exempt par 1.4.11', () => {
    // --bordure n'est plus sur les controles (input, select, .tiroir > summary) mais reste
    // sur les bords de conteneurs ou il ne releve pas du critere 1.4.11.

    // Verifier que --bordure-controle est sur les controles
    // Le selecteur 'input,' n'a pas d'accolade directe - il est suivi de 'select {'
    //
    // T-0215 — la recherche porte sur la feuille SANS SES COMMENTAIRES : une note de prose
    // qui cite « input, select » se plaçait avant la règle et faisait lire le mauvais bloc.
    // C'est la convention des autres tests de feuille (`echelles.test.ts`).
    const sansCommentaires = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const debut = sansCommentaires.indexOf('input,')
    expect(debut).toBeGreaterThan(-1)
    const regleInput = sansCommentaires.slice(debut, sansCommentaires.indexOf('}', debut))
    expect(regleInput).toMatch(/border.*var\(--bordure-controle\)/)

    const regleTiroir = regle('.tiroir > summary')
    expect(regleTiroir).toMatch(/border.*var\(--bordure-controle\)/)

    // Verifier que --bordure subsiste sur les cartes
    const regleCarte = regle('.carte')
    expect(regleCarte).toMatch(/border.*var\(--bordure\)/)
  })
})

describe('ergonomie de consultation nocturne §11.2', () => {
  it('donne aux cibles de clic la taille d’un usage ganté', () => {
    expect(CSS).toMatch(/--cible-clic:\s*44px/)
    for (const selecteur of ['button,', '.tracee summary', '.terme-detail summary']) {
      const index = CSS.indexOf(selecteur)
      expect(index, selecteur).toBeGreaterThan(-1)
      expect(CSS.slice(index, CSS.indexOf('}', index))).toMatch(/min-height: var\(--cible-clic\)/)
    }
  })

  it('rend le plan imprimable en masquant ce qui n’est pas le plan', () => {
    expect(CSS).toMatch(/@media print/)
  })
})

describe('état du mode nuit §11.1', () => {
  it('démarre inactif, à luminance nominale', () => {
    expect(ETAT_INITIAL.actif).toBe(false)
    expect(ETAT_INITIAL.luminance).toBe(1)
    expect(litEtatPersiste()).toStrictEqual(ETAT_INITIAL)
  })

  it('ignore les champs de forme inattendue d’un stockage abîmé', () => {
    // Le stockage local est hors du périmètre de confiance : un état à moitié corrompu
    // ne doit pas se propager jusqu'à la palette (§12.3).
    const stocke = (valeur: string) => {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: { getItem: () => valeur, setItem: () => undefined },
      })
    }
    try {
      stocke('{ ceci n’est pas du JSON')
      expect(litEtatPersiste()).toStrictEqual(ETAT_INITIAL)

      stocke(JSON.stringify({ actif: 'oui', luminance: 'sombre', intrus: true }))
      expect(litEtatPersiste()).toStrictEqual(ETAT_INITIAL)

      // T-0140 — `typeDalle` et `autoActivation` sont écrits par les versions antérieures :
      // ils ne sont plus lus, et leur présence ne doit pas contaminer l'état relu.
      stocke(JSON.stringify({ actif: true, luminance: 12, typeDalle: 'OLED' }))
      expect(litEtatPersiste()).toStrictEqual({ ...ETAT_INITIAL, actif: true })

      stocke(
        JSON.stringify({
          actif: true,
          luminance: 0.4,
          typeDalle: 'LCD',
          autoActivation: 'AU_CREPUSCULE',
        }),
      )
      expect(litEtatPersiste()).toStrictEqual({ actif: true, luminance: 0.4 })
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage
    }
  })

  it('ne s’applique pas hors navigateur, sans lever d’erreur', () => {
    expect(() => appliqueModeNuit(ETAT_INITIAL)).not.toThrow()
  })

  it('borne la luminance à un plancher d’environ 2 % du nominal', () => {
    expect(K('LUMINANCE_PLANCHER_MODE_NUIT')).toBeCloseTo(0.02, 6)
  })
})

describe('interface rendue', () => {
  const ecran = renderToStaticMarkup(<App />)

  it('n’écrit aucune couleur en ligne dans le balisage', () => {
    expect(ecran).not.toMatch(/style="[^"]*(?:color|background)[^"]*"/)
  })

  it('expose le réglage du mode nuit et la limite des dalles LCD', () => {
    expect(ecran).toContain('Activer le mode nuit')
    expect(ecran).toMatch(/écran LCD/)
    expect(ecran).toMatch(/mode nuit/i)
  })

  // T-0140 — le tiroir ne porte que ce qui se décide : ni physiologie rétinienne, ni saisie
  // du type de dalle, ni bascule automatique.
  it('ne rend ni l’explication du rouge, ni les réglages retirés', () => {
    expect(ecran).not.toMatch(/bâtonnets/)
    expect(ecran).not.toContain('Type de dalle')
    expect(ecran).not.toContain('Activation automatique')
    expect(ecran).not.toContain('Au crépuscule nautique')
  })
})

/**
 * T-0072 — `prefers-reduced-motion` (WCAG 2.3.3).
 *
 * Deux exigences se contredisent en apparence : §11.1 interdit le basculement brutal et le
 * flash, la préférence système demande qu'aucun mouvement ne s'impose. Le compromis est écrit
 * dans la feuille — fondu de luminance conservé, durée coupée — et vérifié ici, parce qu'une
 * règle de style supprimée par mégarde ne casse aucun rendu.
 */
describe('mouvement réduit — WCAG 2.3.3', () => {
  /** Le bloc `@media (prefers-reduced-motion: reduce)`, accolade fermante comprise. */
  function blocMouvementReduit(): string {
    const debut = CSS.search(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(debut, 'aucune règle prefers-reduced-motion dans la feuille').toBeGreaterThan(-1)
    return CSS.slice(debut, CSS.indexOf('\n}', debut) + 2)
  }

  /** Le bloc `@media (prefers-reduced-motion: no-preference)`, accolade fermante comprise. */
  function blocMouvementAccepte(): string {
    const debut = CSS.search(/@media\s*\(prefers-reduced-motion:\s*no-preference\)/)
    return debut === -1 ? '' : CSS.slice(debut, CSS.indexOf('\n}', debut) + 2)
  }

  it('raccourcit la transition du mode nuit sans la supprimer', () => {
    const bloc = blocMouvementReduit()
    const durees = [...bloc.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]))
    expect(durees.length, 'la préférence ne redéfinit aucune durée').toBeGreaterThan(0)
    // T-0331 — la durée nominale est un jeton : sa première déclaration est la nominale.
    const nominale = Number(/--fondu-nuit:\s*(\d+)ms/.exec(CSS)?.[1])
    for (const duree of durees) {
      // Zéro rendrait le basculement brutal que §11.1 interdit.
      expect(duree, `${duree}ms`).toBeGreaterThan(0)
      expect(duree, `${duree}ms`).toBeLessThan(nominale)
    }
  })

  it('ne laisse aucune autre animation s’imposer', () => {
    // Rien ne bouge en dehors du fondu de bascule : ni image clé, ni défilement lissé,
    // ni transition sur une propriété de position.
    //
    // Le bloc `no-preference` est retiré du décompte, et c'est le seul assouplissement : ce
    // qu'il contient ne s'IMPOSE à personne, puisqu'il ne s'applique qu'aux réglages qui
    // acceptent le mouvement. Tout ce qui vit hors de ce bloc reste tenu à la règle stricte.
    const accepte = blocMouvementAccepte()
    const impose = accepte === '' ? CSS : CSS.replace(accepte, '')

    expect(impose).not.toMatch(/@keyframes/)
    expect(impose).not.toMatch(/\banimation(-name)?:/)
    expect(impose).not.toMatch(/scroll-behavior:\s*smooth/)
    const transitions = [...impose.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]!)
    for (const declaration of transitions) {
      expect(declaration, declaration).toMatch(/^(background-color|color)\b/)
    }
  })

  it('n’accepte de mouvement que déclenché par un geste, jamais au repos', () => {
    // La porte ouverte ci-dessus ne doit pas devenir un fourre-tout. Ce qui s'anime sous
    // `no-preference` s'anime en réponse à une interaction : la transition est portée par la
    // règle de base — sinon le retour serait brutal — mais c'est un état de geste qui change
    // la valeur, et cet état doit exister quelque part dans la feuille.
    const accepte = blocMouvementAccepte()
    if (accepte === '') return

    expect(accepte).not.toMatch(/@keyframes/)
    expect(accepte).not.toMatch(/\banimation(-name)?:/)

    // T-0325 — ouvrir un `<details>` au clic est un geste aussi : l'état `[open]` en porte la
    // trace. Il se retire du sélecteur pour retrouver celui de la règle de base qui s'anime.
    const gestes = [...CSS.matchAll(/^[^{}\n]*(?::(?:hover|focus)|\[open\])[^{}\n]*\{/gm)].map(
      (m) => m[0].replaceAll('[open]', ''),
    )
    const animes = [...accepte.matchAll(/^ {2}([^\s{][^{\n]*)\{/gm)].map((m) => m[1]!.trim())
    expect(animes.length, 'le bloc n’anime rien').toBeGreaterThan(0)
    for (const selecteur of animes) {
      expect(
        gestes.some((geste) => geste.includes(selecteur.replaceAll('[open]', ''))),
        `${selecteur} s’anime sans geste qui le déclenche`,
      ).toBe(true)
    }
  })

  it('n’anime le curseur temporel que sur demande explicite', () => {
    // §11.2 — aucune animation non sollicitée. Le défilement n'est jamais l'état de départ :
    // il ne peut donc pas démarrer de lui-même, et reste choisissable sous la préférence.
    expect(etatScene().temps.modeTemps).not.toBe('DEFILEMENT')
  })
})
