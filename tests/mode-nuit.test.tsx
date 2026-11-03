/**
 * §11.1 — Mode nuit, §11.2 — night consultation ergonomics.
 * PRD acceptance = stylesheet property: no pixel with non-zero green/blue. Checks: (1) night
 * palette writes pure red only; (2) NO colour hardcoded elsewhere in sheet, else it survives
 * the switch.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import {
  appliqueModeNuit,
  BoutonModeNuit,
  libelleBascule,
  toucheBasculeModeNuit,
} from '../src/ui/ModeNuit.tsx'
import { RACCOURCIS_CLAVIER } from '../src/ui/planetarium-gestes.ts'
import { ETAT_INITIAL, litEtatPersiste } from '../src/data/mode-nuit.ts'
import { Mention } from '../src/ui/Mention.tsx'
import { K } from '../src/registry/constants.ts'
import { etatScene } from '../src/ui/scene-etat.ts'
import { POLICE_SCENE, palette, type PaletteCiel } from '../src/ui/couleurs.ts'

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

/** Night palette block, isolated from rest of sheet. */
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
 * Tokens of a palette block, resolved: `var(--x)` → `--x`'s value, `color-mix(in srgb,
 * var(--a) P%, var(--b))` → `#rrggbb`. Neutral/accent shades derive from origin; their
 * RENDERED colour must hold.
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
 * T-0409 — light palette rewrites only its origins + what can't be deduced: its tokens = first
 * block's, recomputed under its overrides.
 */
const SELECTEUR_JOUR_CLAIR = ":root[data-jour-clair='true']:not([data-mode-nuit='true']) {"
function blocJourClair(): string {
  const debut = CSS.indexOf(SELECTEUR_JOUR_CLAIR)
  expect(debut, 'aucun bloc de palette claire').toBeGreaterThan(-1)
  return CSS.slice(debut, CSS.indexOf('}', debut))
}
const paletteClaire = (): Readonly<Record<string, string>> =>
  jetonsDuBloc(
    CSS.slice(CSS.indexOf(':root {'), CSS.indexOf('}', CSS.indexOf(':root {'))) + blocJourClair(),
  )

/**
 * 0-255 channels of a palette value: `#rrggbb` or `rgb(N 0 0)`. Palette written at nominal
 * luminance factor (mask applies factor on top) → as-is = best case, where threshold must hold.
 */
function canaux(valeur: string): readonly [number, number, number] {
  const court = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(valeur)
  if (court) return [1, 2, 3].map((i) => parseInt(court[i]!.repeat(2), 16)) as [number, number, number]
  const hex = /^#([0-9a-f]{6})$/i.exec(valeur)
  if (hex) {
    const canal = (i: number): number => parseInt(hex[1]!.slice(i, i + 2), 16)
    return [canal(0), canal(2), canal(4)]
  }
  const rouge = /^rgb\((\d+) 0 0\)$/.exec(valeur)
  expect(rouge, `valeur de palette illisible : ${valeur}`).not.toBeNull()
  return [Number(rouge![1]), 0, 0]
}

/** WCAG 2.2 relative luminance, https://www.w3.org/TR/WCAG22/#dfn-relative-luminance. */
function luminance(valeur: string): number {
  const lineaire = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, v, b] = canaux(valeur)
  return 0.2126 * lineaire(r / 255) + 0.7152 * lineaire(v / 255) + 0.0722 * lineaire(b / 255)
}

/** WCAG 2.2 contrast ratio, https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio. */
function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (clair + 0.05) / (sombre + 0.05)
}

/** Rule body, designated by selector at line start. */
function regle(selecteur: string): string {
  // Alone, or heading a grouped selector list (T-0337).
  const seul = CSS.indexOf(`\n${selecteur} {`)
  const debut = seul > -1 ? seul : CSS.indexOf(`\n${selecteur},\n`)
  expect(debut, selecteur).toBeGreaterThan(-1)
  return CSS.slice(debut, CSS.indexOf('}', debut))
}

describe('palette du mode nuit §11.1', () => {
  it('n’écrit que du rouge pur : canaux vert et bleu strictement nuls', () => {
    for (const valeur of declarationsCouleur(blocModeNuit())) {
      const noir = /^#000(000)?$/.test(valeur)
      const rougePur = /^rgb\(\s*(calc\(.*\)|\d+)\s+0\s+0\s*\)$/.test(valeur)
      expect(noir || rougePur, valeur).toBe(true)
    }
  })

  /**
   * T-0185 — independent of any inventory: a full-screen layer multiplies each pixel by
   * (255, 0, 0). Whatever is painted below (canvas, photo, native ornament) loses green and blue.
   */
  it('pose sur toute la page un masque qui annule le vert et le bleu', () => {
    const masque = CSS.slice(
      CSS.indexOf(":root[data-mode-nuit='true'] body::after {"),
      CSS.indexOf('}', CSS.indexOf(":root[data-mode-nuit='true'] body::after {")),
    )
    expect(masque).toMatch(/position:\s*fixed;/)
    expect(masque).toMatch(/inset:\s*0;/)
    expect(masque).toMatch(/mix-blend-mode:\s*multiply;/)
    expect(masque).toMatch(/pointer-events:\s*none;/)
    expect(masque).toMatch(/z-index:\s*var\(--plan-masque\);/)
    expect(masque).toMatch(/background:\s*var\(--masque-nuit\);/)
    // Full red at luminance factor: only place the slider acts.
    expect(paletteDeNuit()['masque-nuit']).toBe('rgb(calc(var(--luminance-nuit) * 255) 0 0)')
  })

  it('n’applique la luminance que par le masque, qui atteint aussi le canevas', () => {
    const { 'masque-nuit': _masque, ...jetons } = paletteDeNuit()
    for (const [jeton, valeur] of Object.entries(jetons)) {
      expect(valeur, jeton).not.toContain('--luminance-nuit')
    }
  })

  it('n’utilise pas la couche du haut, que le masque ne recouvrirait pas', () => {
    const dossier = join(import.meta.dirname, '..', 'src', 'ui')
    for (const fichier of readdirSync(dossier).filter((f) => /\.tsx?$/.test(f))) {
      const texte = readFileSync(join(dossier, fichier), 'utf8')
      expect(texte, fichier).not.toMatch(/showModal\(|showPopover\(|\bpopover=|<dialog\b/)
    }
  })

  it('couvre toutes les variables de couleur du thème par défaut', () => {
    const parDefaut = CSS.slice(CSS.indexOf(':root {'), CSS.indexOf('}', CSS.indexOf(':root {')))
    const variables = (texte: string): readonly string[] =>
      [...texte.matchAll(/--([a-z-]+):/g)].map((m) => m[1]!)
    // Measurement variables: no colour, nothing to repaint red.
    const mesures = ['cible-clic']
    const couleursParDefaut = variables(parDefaut).filter((v) => !mesures.includes(v))
    const couleursNuit = variables(blocModeNuit())
    for (const variable of couleursParDefaut) {
      expect(couleursNuit, variable).toContain(variable)
    }
  })

  it('inclut le jeton --bordure-controle en mode nuit', () => {
    // T-0186 — new control-reserved token must be pure red.
    const couleursNuit = jetonsDuBloc(blocModeNuit())
    expect(couleursNuit, '--bordure-controle manquant').toHaveProperty('bordure-controle')
    const valeur = couleursNuit['bordure-controle']!
    expect(valeur, valeur).toMatch(/^rgb\(\d+ 0 0\)$/)
  })

  it('n’écrit aucune couleur en dur hors des blocs de palette', () => {
    // After the night palette block = sheet proper: variables only; a hardcoded colour would
    // survive mode nuit.
    // Anchor on FIRST occurrence (palette): since §6.4 the sheet has component rules under this
    // selector too; anchoring on the last would only sweep the file's end.
    const apresPalettes = CSS.slice(CSS.indexOf(":root[data-mode-nuit='true']"))
    const corps = apresPalettes.slice(apresPalettes.indexOf('}') + 1)
    expect(corps).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(corps).not.toMatch(/\brgba?\(/)
    expect(corps).not.toMatch(/\bhsla?\(/)
  })

  it('garde la frise de la nuit dans la palette sombre, même de jour', () => {
    // T-0409 — frise = piece of sky: doesn't whiten with UI. Its island copies default palette;
    // a deriving colour would make two frises.
    // T-0422 — at night too: day-only, island was removed at sunset and frise inherited root
    // fade (lightened then came back).
    const selecteur = ":root:not([data-mode-nuit='true']) .nuit-frise {"
    const debut = CSS.indexOf(selecteur)
    expect(debut, 'aucun îlot sombre pour la frise').toBeGreaterThan(-1)
    expect(debut).toBeLessThan(CSS.indexOf(":root[data-mode-nuit='true']"))
    const ilot = jetonsDuBloc(CSS.slice(debut, CSS.indexOf('}', debut)))
    const parDefaut = paletteParDefaut()
    for (const jeton of Object.keys(parDefaut).filter((j) => j !== 'cible-clic')) {
      expect(ilot[jeton], `--${jeton}`).toBe(parDefaut[jeton])
    }
  })

  it('écarte la palette claire dès que le mode nuit est actif', () => {
    // T-0409 — by selector, not block order: one light token winning = red no longer total.
    expect(blocJourClair()).toMatch(/color-scheme:\s*light/)
    expect(CSS.indexOf(SELECTEUR_JOUR_CLAIR)).toBeLessThan(CSS.indexOf(":root[data-mode-nuit='true']"))
  })

  it('prévoit une transition progressive plutôt qu’un basculement brutal', () => {
    expect(CSS).toMatch(/transition:\s*background-color/)
  })

  it('fond chaque jeton que la palette claire réécrit, et non le seul fond de page', () => {
    // T-0409 — unregistered token doesn't interpolate: jumps, cards flip under a gliding
    // background. Registered `<color>` glides, every `color-mix` shade with it.
    const debut = CSS.lastIndexOf('\n:root {')
    const fondu = /transition:\s*([^;]+);/.exec(CSS.slice(debut, CSS.indexOf('\n}', debut)))?.[1] ?? ''
    for (const jeton of [...blocJourClair().matchAll(/--([a-z-]+):/g)].map((m) => m[1]!)) {
      expect(CSS, `--${jeton} non enregistré`).toMatch(
        new RegExp(`@property --${jeton} \\{[^}]*syntax: '<color>'`),
      )
      expect(fondu, `--${jeton} hors du fondu`).toContain(`--${jeton} var(--fondu-nuit)`)
    }
  })

  it('ne fait jamais porter l’information par la seule couleur', () => {
    // Alert also told by SHAPE: thick side bar + a sign.
    // T-0215 — sign was "⚠" as sheet `content` (text font); now markup via `Icone`, checked
    // there. Bar stays a sheet property.
    for (const ton of ['cause', 'erreur'] as const) {
      const html = renderToStaticMarkup(<Mention ton={ton}>refus</Mention>)
      expect(html, ton).toContain('warning')
      expect(html, ton).toContain('mention-signe')
    }
    expect(CSS).toMatch(/border-left-width: var\(--trait-marque\)/)
  })

  it('ne pose le signe que sur ce qui alerte', () => {
    // Plain state ≠ alert: giving it the sign reads as refusal, and §11.1 loses what tells
    // them apart once colour goes red.
    for (const ton of ['etat', 'tracee-source'] as const) {
      expect(renderToStaticMarkup(<Mention ton={ton}>lecture</Mention>), ton).not.toContain(
        'mention-signe',
      )
    }
  })
})

/**
 * T-0070 — colours the browser paints itself. Leak test reads the sheet: blind to what isn't
 * written there. Focus ring, selection, caret, accent colour, scrollbars default to blue = a
 * §11.1 leak. Checks they're declared from palette tokens (so they flip red).
 */
/**
 * Scène paints UI objects (matériel cadre, pointage route) on a canvas the sheet can't reach.
 * Hue copied in `couleurs.ts`: pinned here to its token, both modes.
 */
describe('la scène reprend les jetons de l’interface', () => {
  const rvb = (valeur: string): string => `rgb(${canaux(valeur).join(' ')})`
  /** Canvas writes `rgb(r g b)` or `#rrggbb`: compared in same form. */
  const scene = (valeur: string): string => (valeur.startsWith('rgb(') ? valeur : rvb(valeur))
  const liens: readonly (readonly [keyof PaletteCiel, string])[] = [
    ['fond', 'fond'],
    ['cadre', 'accent'],
    ['parcours', 'texte'],
    ['lune', 'texte'],
  ]
  /** T-0330 — day only: at night scène lowers bodies under the UI. */
  const liensDeJour: readonly (readonly [keyof PaletteCiel, string])[] = [
    ['corps', 'avertissement'],
    ['cadreCible', 'avertissement'],
  ]
  /**
   * T-0330 — scène-own graduations, declared in `couleurs.ts` + README. A hue absent from the
   * 3 lists fails: must choose.
   */
  const horsKit: readonly (keyof PaletteCiel)[] = [
    'figures',
    'frontieres',
    'asterismes',
    'horizon',
    'courbes',
    'sol',
    'solJour',
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
  /** WCAG 2.4.11 "Focus Appearance" threshold. */
  const CONTRASTE_FOCUS_MINIMAL = 3

  /** 2nd `:root` block: browser-painted colours. */
  function blocNavigateur(): string {
    const debut = CSS.lastIndexOf('\n:root {')
    expect(debut, 'aucun bloc :root pour les couleurs du navigateur').toBeGreaterThan(
      CSS.indexOf(':root {'),
    )
    return CSS.slice(debut, CSS.indexOf('}', debut))
  }

  /** Tokens cited by a declaration: `var(--x) var(--y)` → ['x', 'y']. */
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

  /** Token colouring the focus ring. */
  function jetonFocus(): string {
    // T-0331 — thickness is a token too (`--trait-focus`): only COLOUR matters here.
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
    // Ring detached from element border, else they merge.
    expect(regle(':focus-visible')).toMatch(/outline-offset:/)
    // `outline: none` somewhere = keyboard navigation invisible there.
    expect(CSS).not.toMatch(/outline:\s*(none|0)\b/)
  })

  it('rentre l’anneau du canevas, que la scène rognerait', () => {
    expect(valeurDe(regle('.planetarium:focus-visible'), 'outline-offset')).toMatch(/^-|\*\s*-\d/)
  })

  it('donne à l’anneau ≥ 3:1 sur toutes les surfaces, à luminance nominale', () => {
    for (const palette of [paletteParDefaut(), paletteClaire()]) {
      const anneau = palette[jetonFocus()]!
      for (const surface of ['fond', 'surface', 'surface-haute']) {
        expect(contraste(anneau, palette[surface]!), surface).toBeGreaterThanOrEqual(
          CONTRASTE_FOCUS_MINIMAL,
        )
      }
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
      // Colour not written by token would survive the switch.
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
 * T-0304 — native markup controls, one by one.
 * T-0070 held a 5-declaration list: what wasn't there (link blue, placeholder grey) leaked
 * unseen. List now DERIVED from components: each control kind in `src/ui/*.tsx` needs its
 * rule; unknown kind fails until one is written.
 */
describe('surfaces natives du balisage — T-0304', () => {
  const DOSSIER_UI = join(import.meta.dirname, '..', 'src', 'ui')
  const BALISAGE = readdirSync(DOSSIER_UI)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => readFileSync(join(DOSSIER_UI, f), 'utf8'))
    .join('\n')
  const SANS_COMMENTAIRES = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

  /** Body of rule whose selector is exactly `selecteur`. */
  function corps(selecteur: string): string {
    const debut = SANS_COMMENTAIRES.indexOf(`\n${selecteur} {`)
    expect(debut, selecteur).toBeGreaterThan(-1)
    return SANS_COMMENTAIRES.slice(debut, SANS_COMMENTAIRES.indexOf('}', debut))
  }

  const colorePar = (bloc: string, propriete: string): void => {
    const valeur = new RegExp(`(?:^|[\\s;{])${propriete}:\\s*([^;]+);`).exec(bloc)?.[1]
    expect(valeur, propriete).toMatch(/^var\(--[a-z-]+\)$/)
  }
  const retire = (selecteur: string): void => {
    const debut = SANS_COMMENTAIRES.search(new RegExp(`${selecteur.replace(/[[\]()]/g, '\\$&')}[,\\s{]`))
    expect(debut, selecteur).toBeGreaterThan(-1)
    const bloc = SANS_COMMENTAIRES.slice(debut, SANS_COMMENTAIRES.indexOf('}', debut))
    expect(bloc, selecteur).toMatch(/appearance:\s*none/)
  }

  /** What each control kind requires of the sheet to paint nothing off-palette. */
  const EXIGENCES: Readonly<Record<string, () => void>> = {
    a: () => colorePar(corps('a'), 'color'),
    placeholder: () => colorePar(corps('::placeholder'), 'color'),
    select: () => {
      colorePar(corps('option'), 'color')
      colorePar(corps('option'), 'background')
    },
    option: () => colorePar(corps('option'), 'color'),
    textarea: () => expect(corps('textarea')).toMatch(/resize:\s*none/),
    'input:button': () => {},
    'input:text': () => {},
    'input:checkbox': () => expect(corps("input[type='checkbox']")).toMatch(/appearance:\s*none/),
    // T-0405 — parc radio never painted: covering zone draws the check.
    'input:radio': () => expect(corps('.parc-choix > input')).toMatch(/appearance:\s*none[\s\S]*opacity:\s*0/),
    'input:search': () => retire("input[type='search']::-webkit-search-cancel-button"),
    'input:number': () => {
      retire("input[type='number']::-webkit-inner-spin-button")
      expect(corps("input[type='number']")).toMatch(/appearance:\s*textfield/)
    },
    'input:file': () => expect(corps('.bouton-fichier input')).toMatch(/display:\s*none/),
  }

  const sortes = new Set([
    ...[...BALISAGE.matchAll(/<(a|select|option|textarea)\b/g)].map((m) => m[1]!),
    ...[...BALISAGE.matchAll(/\bplaceholder=/g)].map(() => 'placeholder'),
    ...[...BALISAGE.matchAll(/<input\b[^>]*?\btype="([a-z-]+)"/g)].map((m) => `input:${m[1]!}`),
  ])

  it('connaît chaque sorte de contrôle natif présente dans le balisage', () => {
    expect([...sortes].filter((s) => !(s in EXIGENCES))).toEqual([])
  })

  it.each([...sortes].filter((s) => s in EXIGENCES))('%s ne peint rien hors palette', (sorte) => {
    EXIGENCES[sorte]!()
  })

  it('cerne les commandes flottantes du filet des contrôles, qui tient 3:1', () => {
    // Rail, mode nuit, info = controls: WCAG 1.4.11 holds them at 3:1; `--bordure` reached only
    // 1,42:1 at night.
    expect(corps('.bouton-glyphe-flottant')).toMatch(/border:.*var\(--bordure-controle\)/)
    expect(SANS_COMMENTAIRES).not.toMatch(/\.tiroir-nuit > summary \{[^}]*var\(--bordure\)/)
  })
})

/**
 * T-0071 — text contrast, recomputed each run from `styles.css`: any regressing token fails.
 * Calc, pure-red cap and collapse to 2 % floor are written beside the palette, in the sheet.
 */
describe('contraste du texte — WCAG 2.2 AA', () => {
  /** AA threshold for body text. Labels are 0,85 rem: never "large text". */
  const CONTRASTE_TEXTE_MINIMAL = 4.5

  const JETONS_TEXTE = ['texte', 'attenue', 'alerte'] as const
  /** `--bordure` = stroke, not glyph: outside text threshold. */
  const JETONS_FOND = ['fond', 'surface', 'surface-haute', 'surface-survol', 'fond-alerte'] as const

  for (const [mode, palette] of [
    ['normal', paletteParDefaut],
    ['clair', paletteClaire],
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
    for (const jetons of [paletteParDefaut(), paletteClaire(), paletteDeNuit()]) {
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
    // 5,25:1 cap glues --attenue to --texte: order remains, invisible. Secondary text then told
    // by size, and weight where 2 states share it.
    const nuit = paletteDeNuit()
    expect(luminance(nuit['attenue']!)).toBeLessThan(luminance(nuit['texte']!))
    // T-0194 — size from typographic scale: checked = a rank is assigned, not the literal form.
    // T-0215 — label rank moved from `label` to `.libelle`: `label` orders layout only, no
    // longer restyles the wrapped control.
    for (const selecteur of ['.libelle', '.etat']) {
      expect(regle(selecteur), selecteur).toMatch(/font-size: var\(--texte-[a-z]+\)/)
    }
    expect(regle('.onglet.actif')).toMatch(/font-weight: var\(--graisse-forte\)/)
  })
})

/**
 * T-0186 — non-text contrast (control borders). WCAG 2.2 1.4.11: 3:1 between the boundary
 * identifying a UI component (field, button, tiroir) and its surface. Token
 * `--bordure-controle` reserved for controls; `--bordure` stays on containers (cards), exempt.
 * Mode nuit at nominal factor: same threshold; under factor, gap = T-0071's (collapse to 2 %).
 */
describe('contraste des bordures de controle - WCAG 2.2 1.4.11', () => {
  const CONTRASTE_BORDURE_MINIMAL = 3

  const JETONS_BORDURE_CONTROLE = ['bordure-controle'] as const
  const JETONS_FOND = ['fond', 'surface', 'surface-haute', 'surface-survol', 'fond-alerte'] as const

  for (const [mode, palette] of [
    ['normal', paletteParDefaut],
    ['clair', paletteClaire],
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
    // New `--bordure-controle` must not degrade text contrast: ≥ 4,5:1 (AA) on every surface.
    const CONTRASTE_TEXTE_MINIMAL = 4.5
    const JETONS_TEXTE = ['texte', 'attenue', 'alerte'] as const
    const JETONS_FOND = ['fond', 'surface', 'surface-haute', 'surface-survol', 'fond-alerte'] as const

    for (const [mode, palette] of [
      ['normal', paletteParDefaut],
      ['clair', paletteClaire],
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
    // --bordure no longer on controls (input, select, .tiroir > summary); stays on container
    // edges exempt from 1.4.11.

    // Check --bordure-controle is on controls. Selector 'input,' has no direct brace: followed
    // by 'select {'.
    // T-0215 — search on the sheet WITHOUT COMMENTS: a prose note citing "input, select" came
    // before the rule and made the wrong block read (same as `echelles.test.ts`).
    const sansCommentaires = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const debut = sansCommentaires.indexOf('input,')
    expect(debut).toBeGreaterThan(-1)
    const regleInput = sansCommentaires.slice(debut, sansCommentaires.indexOf('}', debut))
    expect(regleInput).toMatch(/border.*var\(--bordure-controle\)/)

    const regleTiroir = regle('.tiroir > summary')
    expect(regleTiroir).toMatch(/border.*var\(--bordure-controle\)/)

    // Check --bordure remains on rubriques.
    const regleCarte = regle('section:not([class])')
    expect(regleCarte).toMatch(/border.*var\(--bordure\)/)
  })
})

describe('ergonomie de consultation nocturne §11.2', () => {
  it('donne aux cibles de clic la taille d’un usage ganté', () => {
    expect(CSS).toMatch(/--cible-clic:\s*44px/)
    for (const selecteur of ['button,']) {
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
    // Local storage outside trust perimeter: half-corrupted state must not reach the palette
    // (§12.3).
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

      // T-0140 — `typeDalle`, `autoActivation` written by earlier versions: no longer read,
      // must not contaminate reloaded state.
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
    // T-0332 — any painting property, not only text and background.
    expect(ecran).not.toMatch(
      /style="[^"]*(?:color|background|border|fill|stroke|outline|box-shadow)[^"]*"/,
    )
  })

  it('expose le réglage du mode nuit et la limite des dalles LCD', () => {
    expect(ecran).toContain('Activer le mode nuit')
    expect(ecran).toMatch(/écran LCD/)
    expect(ecran).toMatch(/mode nuit/i)
  })

  // T-0140 — tiroir carries only what is decided: no retinal physiology, panel-type input,
  // auto switch.
  it('ne rend ni l’explication du rouge, ni les réglages retirés', () => {
    expect(ecran).not.toMatch(/bâtonnets/)
    expect(ecran).not.toContain('Type de dalle')
    expect(ecran).not.toContain('Activation automatique')
    expect(ecran).not.toContain('Au crépuscule nautique')
  })
})

/**
 * T-0072 — `prefers-reduced-motion` (WCAG 2.3.3). Apparent conflict: §11.1 bans abrupt switch
 * and flash, system preference asks no imposed motion. Compromise in sheet (luminance fade
 * kept, duration cut), checked here: a deleted rule breaks no render.
 */
describe('mouvement réduit — WCAG 2.3.3', () => {
  /** `@media (prefers-reduced-motion: reduce)` block, closing brace included. */
  function blocMouvementReduit(): string {
    const debut = CSS.search(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(debut, 'aucune règle prefers-reduced-motion dans la feuille').toBeGreaterThan(-1)
    return CSS.slice(debut, CSS.indexOf('\n}', debut) + 2)
  }

  /** `@media (prefers-reduced-motion: no-preference)` block, closing brace included. */
  function blocMouvementAccepte(): string {
    const debut = CSS.search(/@media\s*\(prefers-reduced-motion:\s*no-preference\)/)
    return debut === -1 ? '' : CSS.slice(debut, CSS.indexOf('\n}', debut) + 2)
  }

  it('raccourcit la transition du mode nuit sans la supprimer', () => {
    const bloc = blocMouvementReduit()
    const durees = [...bloc.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]))
    expect(durees.length, 'la préférence ne redéfinit aucune durée').toBeGreaterThan(0)
    // T-0331 — nominal duration is a token: its first declaration is the nominal one.
    const nominale = Number(/--fondu-nuit:\s*(\d+)ms/.exec(CSS)?.[1])
    for (const duree of durees) {
      // Zero = the abrupt switch §11.1 bans.
      expect(duree, `${duree}ms`).toBeGreaterThan(0)
      expect(duree, `${duree}ms`).toBeLessThan(nominale)
    }
  })

  it('ne laisse aucune autre animation s’imposer', () => {
    // Nothing moves outside the switch fade: no keyframes, smooth scroll, nor transition on a
    // position property.
    // `no-preference` block removed from count, the sole relaxation: IMPOSED on nobody (motion-
    // accepting settings only). Everything outside stays under the strict rule.
    const accepte = blocMouvementAccepte()
    const impose = accepte === '' ? CSS : CSS.replace(accepte, '')

    expect(impose).not.toMatch(/@keyframes/)
    expect(impose).not.toMatch(/\banimation(-name)?:/)
    expect(impose).not.toMatch(/scroll-behavior:\s*smooth/)
    const transitions = [...impose.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]!)
    // T-0409 — registered colour token that glides = fade, not movement.
    for (const declaration of transitions) {
      expect(declaration, declaration).toMatch(/^(background-color|color|--[a-z-]+)\b/)
    }
  })

  it('n’accepte de mouvement que déclenché par un geste, jamais au repos', () => {
    // The open door above must not become a catch-all. Under `no-preference`, animation answers
    // an interaction: transition on base rule (else return is abrupt), a gesture state changes
    // the value and must exist somewhere in the sheet.
    const accepte = blocMouvementAccepte()
    if (accepte === '') return

    expect(accepte).not.toMatch(/@keyframes/)
    expect(accepte).not.toMatch(/\banimation(-name)?:/)

    // T-0325 — opening a `<details>` on click = gesture: `[open]` carries it. Removed from
    // selector to find the animating base rule's.
    // Same for Panorama: `[data-absente='true']` changes only at mode switch.
    // Same for Filtre button: `[data-ouvert='false']` changes only on its click.
    const ETATS = ['[open]', "[data-absente='true']", "[data-ouvert='false']"]
    const sansEtat = (sel: string): string => ETATS.reduce((s, etat) => s.replaceAll(etat, ''), sel)
    const gestes = [
      ...CSS.matchAll(
        /^[^{}\n]*(?::(?:hover|focus)|\[open\]|\[data-absente='true'\]|\[data-ouvert='false'\])[^{}\n]*\{/gm,
      ),
    ].map((m) => sansEtat(m[0]))
    const animes = [...accepte.matchAll(/^ {2}([^\s{][^{\n]*)\{/gm)].map((m) => m[1]!.trim())
    expect(animes.length, 'le bloc n’anime rien').toBeGreaterThan(0)
    for (const selecteur of animes) {
      expect(
        gestes.some((geste) => geste.includes(sansEtat(selecteur))),
        `${selecteur} s’anime sans geste qui le déclenche`,
      ).toBe(true)
    }
  })

  it('n’anime le curseur temporel que sur demande explicite', () => {
    // §11.2 — no unsolicited animation. Scrolling is never the start state: can't start by
    // itself, stays selectable under the preference.
    expect(etatScene().temps.modeTemps).not.toBe('DEFILEMENT')
  })
})

/** T-0375 — switch is one gesture, nothing stays lit at night. */
describe('bascule du mode nuit — T-0375', () => {
  const rendu = (actif: boolean): string =>
    renderToStaticMarkup(
      <BoutonModeNuit etat={{ ...ETAT_INITIAL, actif }} surChangement={() => {}} />,
    )

  it('bascule depuis un bouton, pas depuis un tiroir', () => {
    const html = rendu(false)
    const bouton = html.slice(html.indexOf('<button'), html.indexOf('</button>'))
    expect(bouton).toContain('bouton-mode-nuit')
    expect(html.indexOf('bouton-mode-nuit')).toBeLessThan(html.indexOf('<details'))
  })

  it('annonce l’action produite, pas l’état courant', () => {
    expect(libelleBascule(false)).toEqual({ icone: 'dark_mode', nom: 'Activer le mode nuit' })
    expect(libelleBascule(true)).toEqual({ icone: 'light_mode', nom: 'Désactiver le mode nuit' })
    // Name changing with state excludes `aria-pressed` (announced twice).
    expect(rendu(true)).toContain('Désactiver le mode nuit')
    expect(rendu(true)).not.toContain('aria-pressed')
  })

  it('garde la luminance à deux gestes du mode actif', () => {
    const html = rendu(true)
    const tiroir = html.slice(html.indexOf('<details'))
    expect(tiroir).toContain('aria-label="Luminance du mode nuit"')
  })

  it('bascule à la touche N, jamais en saisie ni avec un modificateur', () => {
    expect(toucheBasculeModeNuit('n', false, false)).toBe(true)
    expect(toucheBasculeModeNuit('N', false, false)).toBe(true)
    expect(toucheBasculeModeNuit('n', false, true)).toBe(false)
    expect(toucheBasculeModeNuit('n', true, false)).toBe(false)
    expect(toucheBasculeModeNuit('m', false, false)).toBe(false)
    expect(RACCOURCIS_CLAVIER).toContain('N mode nuit')
  })
})

describe('aucun aplat allumé la nuit — T-0375', () => {
  const SANS_COMMENTAIRES = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  const NUIT = ":root[data-mode-nuit='true'] "
  const APLAT = /(?:^|[\s;])background(?:-color)?:\s*var\(--texte\)\s*;/

  /** What keeps flat fill at night, and why: tiny surface, or the information itself. */
  const EXCEPTIONS: Readonly<Record<string, string>> = {
    '::selection': 'transitoire : n’existe que le temps d’un geste de sélection',
    "input[type='checkbox']:checked": 'une case de 1,1 rem, seul signe de l’état coché',
    '.parc-choix:has(> input:checked)::before': 'un rond de 1,1 rem, seul signe de l’objectif monté',
    '.curseur:hover .curseur-rail': 'un trait de deux pixels, sous la main',
    '.curseur:active .curseur-rail': 'un trait de deux pixels, sous la main',
    '.curseur:focus-visible .curseur-rail': 'un trait de deux pixels, au focus',
    '.curseur-pouce': 'le pouce : un demi-rem, la valeur réglée',
    '.curseur-accroche': 'un trait d’un pixel',
    '.nuit-repere.majeur::before': 'une graduation de deux pixels',
    '.nuit-curseur': 'un filet de trois pixels, le maintenant de la frise',
    '.lune-moitie': 'la part éclairée de la Lune : c’est l’information',
    '.lune-gibbeuse .lune-terminateur': 'la part éclairée de la Lune : c’est l’information',
  }

  /** Sheet rules, selectors split; `@media` blocks leave their rules. */
  const regles = [...SANS_COMMENTAIRES.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selecteurs: m[1]!.split(',').map((x) => x.trim()),
    corps: m[2]!,
  }))
  const eteinteLaNuit = (selecteur: string): boolean =>
    regles.some(
      (r) => r.selecteurs.includes(NUIT + selecteur) && /background/.test(r.corps) && !APLAT.test(r.corps),
    )

  it('éteint ou justifie chaque aplat de --texte', () => {
    const allumes = regles
      .filter((r) => APLAT.test(r.corps))
      .flatMap((r) => r.selecteurs)
      .filter((sel) => !sel.startsWith(NUIT))
      .filter((sel) => !(sel in EXCEPTIONS) && !eteinteLaNuit(sel))
    expect(allumes).toEqual([])
  })

  it('éteint l’état enfoncé des bascules flottantes et le jour de la frise', () => {
    expect(eteinteLaNuit(".bouton-glyphe-flottant[aria-pressed='true']")).toBe(true)
    expect(eteinteLaNuit('.phase-jour')).toBe(true)
  })
})
