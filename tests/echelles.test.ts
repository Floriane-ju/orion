/**
 * T-0194 — the two `styles.css` scales, control state feedback. Sheet already guarantees no
 * hard-coded COLOUR (`mode-nuit.test.tsx`): makes §11.1 toggle total. Spacing and text sizes
 * share the mechanism but lacked the guarantee (21 spacing values, 13 text sizes, 5 within a
 * tenth of rem). Checks a DISCIPLINE: new spacing/text size must cite a scale step, not
 * invent a sixteenth. Reads sheet text like neighbours: a drifting style rule breaks no
 * render, just misaligns the UI a pixel at a time.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { adoucit } from '../src/ui/horizon-transition.ts'

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

/** Sheet minus comments: a value quoted in prose is not a declaration. */
const REGLES = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

/** Declarations of a property, raw value, comment blocks excluded. */
function declarations(motif: RegExp): readonly string[] {
  return [...REGLES.matchAll(motif)].map((m) => m[1]!.trim())
}

describe('T-0194 — l’échelle d’espacement', () => {
  const ESPACEMENT =
    /^\s*(?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block|inline-start))?:\s*([^;]+);/gm

  it('déclare sept pas, et rien entre eux', () => {
    const pas = [...CSS.matchAll(/^ {2}--pas-(\d): ([^;]+);/gm)].map((m) => m[2]!)
    expect(pas).toEqual(['0.125rem', '0.25rem', '0.5rem', '0.75rem', '1rem', '1.5rem', '2rem'])
  })

  it('ne laisse aucun écart écrit en dur dans une propriété d’espacement', () => {
    // `-1px` = exception: not spacing but the trick taking `.scene-description` out of visual
    // flow while staying in the accessibility tree.
    for (const valeur of declarations(ESPACEMENT)) {
      if (valeur === '-1px') continue
      expect(valeur, valeur).not.toMatch(/(?<![\w.-])[0-9]*\.?[0-9]+(rem|px|em)\b/)
    }
  })

  /**
   * T-0332 — gaps of previous test: logical end properties, position offsets, screen units,
   * single-line rules, and the `-1px` exception that held for every rule. `%` allowed:
   * `top: 50%` centres, measures no air.
   */
  it('tient aussi les propriétés logiques, les décalages et les unités d’écran', () => {
    const PROPRIETE =
      /^(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|translate|scroll-padding|scroll-margin)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$/
    const UNITE = /(?<![\w.-])[0-9]*\.?[0-9]+(rem|px|em|vw|vh|dvh|svh|ch)\b/
    const fautes: string[] = []
    for (const [, selecteur, corps] of REGLES.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const declaration of corps!.split(';')) {
        const [propriete, ...reste] = declaration.split(':')
        const nom = propriete?.trim() ?? ''
        const valeur = reste.join(':').trim()
        if (!PROPRIETE.test(nom) || !UNITE.test(valeur)) continue
        if (valeur === '-1px' && selecteur!.trim() === '.scene-description') continue
        fautes.push(`${selecteur!.trim()} { ${nom}: ${valeur} }`)
      }
    }
    expect(fautes).toEqual([])
  })

  it('garde les gabarits hors de l’échelle : ils mesurent des objets, pas de l’air', () => {
    // Spacing step sizing a bar or card would tie coque height to margin grain: unrelated settings.
    for (const jeton of ['barre-haut', 'lateral', 'carte-large', 'bulle-large']) {
      const valeur = new RegExp(`--${jeton}: ([^;]+);`).exec(CSS)?.[1]
      expect(valeur, jeton).toMatch(/^[\d.]+rem$/)
    }
  })
})

describe('T-0194 — l’échelle typographique', () => {
  it('déclare six rangs, strictement décroissants', () => {
    const rangs = [...CSS.matchAll(/^ {2}--texte-[a-z]+: ([\d.]+)rem;/gm)].map((m) =>
      Number(m[1]),
    )
    expect(rangs).toHaveLength(6)
    for (let i = 1; i < rangs.length; i += 1) {
      expect(rangs[i]!, `rang ${i}`).toBeLessThan(rangs[i - 1]!)
    }
  })

  it('ne laisse aucun corps de texte écrit en dur', () => {
    // Two exceptions declared in sheet: `.icone` carries a GLYPH size, not text; `.tracee-plage`
    // is set in `em` on its container.
    const corps = [
      ...declarations(/^\s*font-size:\s*([^;]+);/gm),
      ...declarations(/^\s*font:\s*([^;]+);/gm).map((v) => v.split('/')[0]!),
    ]
    const derogations = ['1.25rem', '0.85em']
    for (const valeur of corps) {
      if (derogations.includes(valeur)) continue
      // `inherit` writes no size: hands over to the containing rule (T-0329).
      expect(valeur, valeur).toMatch(/^(?:var\(--texte-[a-z]+\)|inherit)$/)
    }
  })
})

/**
 * T-0215 — suivi follows same discipline as text size and spacing. §11.1 confiscates
 * luminance as hierarchy; size and CASE remain, and case reads only when spaced. Suivi =
 * second hierarchy tier, only one of three with no guarantee: 3 of 6 values hard-coded in
 * their rule, invisible to any comparison.
 */
describe('T-0215 — l’échelle de suivi', () => {
  const SUIVI = /^\s*letter-spacing:\s*([^;]+);/gm

  it('ne laisse aucun suivi écrit en dur', () => {
    // `normal` and `0` aren't scale values: the two ways to CANCEL it, where text inherits a
    // parent label's suivi.
    for (const valeur of declarations(SUIVI)) {
      if (valeur === 'normal' || valeur === '0') continue
      expect(valeur, valeur).toMatch(/^var\(--suivi-[a-z]+\)$/)
    }
  })

  it('nomme chaque pas par son rôle, jamais par son rang', () => {
    const noms = [...CSS.matchAll(/^ {2}--suivi-([a-z]+): ([\d.]+em);/gm)].map((m) => m[1]!)
    expect(noms).toEqual(['micro', 'titre', 'marque', 'saisie', 'horaire', 'etape'])
  })
})

/**
 * T-0215 — THE MICRO-LIBELLÉ, most frequent text style of UI. T-0113 grammar: what NAMES
 * (field label, column header, tab, drawer summary, score detail) is told from what HOLDS A
 * VALUE by case + suivi, since §11.1 leaves too little luminance to tier otherwise. Pattern
 * written nine times, its four values already tokens: what can drift is the sixth rule
 * forgetting one → near-identical label.
 * T-0323 — were ten: night-plan score detail was the tenth; plan no longer details score.
 * The five rules are NOT merged: merging moves them in cascade — active tab, open drawer,
 * hover each rely on sheet order to override colour. 18 lines saved vs five reorderings in a
 * sheet where nothing moves silently: guarantee > concision.
 */
describe('T-0215 — le micro-libellé', () => {
  /** Rule bodies carrying the micro-libellé size and case. */
  function reglesMicro(): readonly (readonly [string, string])[] {
    return [...REGLES.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, sel, corps]) => [sel!.split('\n').join(' ').trim(), corps!] as const)
      .filter(
        ([, corps]) =>
          // T-0332 — shorthand `font:` and rank `--texte-mini` count too.
          /font(?:-size)?:\s*var\(--texte-(?:micro|mini)\)/.test(corps) &&
          corps.includes('text-transform: uppercase'),
      )
  }

  /**
   * The two uppercase micro-size texts that are NOT labels, kept in `--texte`: a button is a
   * command, must read active; a slider legend names detent's accroche threshold — a reading,
   * not a field label.
   */
  const PAS_DES_LIBELLES = ['button, .bouton-fichier', '.curseur-legende']

  it('en compte sept, et sait lesquelles', () => {
    expect(reglesMicro()).toHaveLength(7)
  })

  it('n’en laisse aucune oublier le suivi ni la couleur qui vont avec', () => {
    // Four values hold together or not: uppercase label without suivi reads as shouted typing,
    // and in --texte weighs as much as the value it announces — the hierarchy §11.1 confiscates.
    for (const [selecteur, corps] of reglesMicro()) {
      expect(corps, selecteur).toContain('letter-spacing: var(--suivi-micro)')
      if (PAS_DES_LIBELLES.includes(selecteur.replace(/\s+/g, ' '))) continue
      expect(corps, selecteur).toContain('color: var(--attenue)')
    }
  })
})

describe('T-0194 — le retour d’état des contrôles', () => {
  /** What is clicked, dragged or typed: all must answer the gesture alike. */
  const CONTROLES = [
    'button',
    '.bouton-fichier',
    '.onglet',
    '.tiroir > summary',
    '.cible-ligne',
    '.compteur',
    'input',
    'select',
  ] as const

  /** Body of the rule carrying the state transition. */
  function regleDuFondu(): string {
    const debut = CSS.indexOf('  transition: background-color var(--fondu-etat)')
    expect(debut, 'aucune transition d’état dans la feuille').toBeGreaterThan(-1)
    return CSS.slice(CSS.lastIndexOf('\n\n', debut), CSS.indexOf('}', debut))
  }

  it('fait passer chaque contrôle par le même fondu', () => {
    const regle = regleDuFondu()
    for (const selecteur of CONTROLES) {
      expect(regle, selecteur).toContain(`\n${selecteur},`)
    }
  })

  it('n’anime que des couleurs : §11.2 refuse qu’un contrôle se déplace sous le doigt', () => {
    const proprietes = /transition: ([^;]+);/.exec(regleDuFondu())![1]!
    for (const part of proprietes.split(',')) {
      expect(part.trim(), part).toMatch(/^(background|border)-color|^color\b/)
    }
  })

  it('annonce chaque contrôle au survol', () => {
    // Eleven commands had one, three answered press: a control mute under mouse reads as a reading.
    // Selector line, closing the list (`{`) or continuing it (`,`).
    const survols = [...CSS.matchAll(/^[^{}\n]*:hover[^{}\n]*[,{]$/gm)].map((m) => m[0])
    for (const selecteur of CONTROLES) {
      expect(
        survols.some((s) => s.includes(selecteur)),
        `${selecteur} ne dit rien au survol`,
      ).toBe(true)
    }
  })

  it('raccourcit le fondu sous mouvement réduit sans le supprimer', () => {
    // Override must follow nominal value in sheet: a token resolves in text order; same block
    // earlier would be overwritten.
    const nominale = Number(/--fondu-etat: (\d+)ms;/.exec(CSS)![1])
    const surcharge = [...CSS.matchAll(/--fondu-etat: (\d+)ms;/g)].map((m) => m.index!)
    expect(surcharge, 'aucune surcharge sous mouvement réduit').toHaveLength(2)
    expect(surcharge[1]!).toBeGreaterThan(surcharge[0]!)

    const reduite = Number(
      /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{\s*--fondu-etat: (\d+)ms;/.exec(
        CSS,
      )![1],
    )
    expect(reduite).toBeGreaterThan(0)
    expect(reduite).toBeLessThan(nominale)
  })

  it('n’allume pas une commande éteinte', () => {
    // Disabled button answering hover promises a click that will not happen.
    expect(CSS).toMatch(/button:not\(:disabled\):hover/)
    expect(CSS).toMatch(/button:not\(:disabled\):active/)
  })
})

/**
 * T-0215 — A CONTAINER DOES NOT RESTYLE WHAT IT DOES NOT OWN. `label` carried micro-libellé
 * case + suivi. A `<label>` WRAPS its control: style flowed onto `<input>`, `<select>`, glose
 * bubble and — unstopped — the refusal message, rendered in spaced capitals. `.etat` rule
 * says the opposite ("appliquées à une explication, elles la rendent illisible"); controls
 * cancelled it, the explanation didn't. Style now on `.libelle`, a named child. Checks the
 * default doesn't return: not via `label`, not via a field forgetting the class.
 */
describe('T-0215 — le libellé ne déborde pas sur son contrôle', () => {
  it('ne laisse à `label` que la disposition', () => {
    const corps = REGLES.slice(REGLES.indexOf('\nlabel {'), REGLES.indexOf('}', REGLES.indexOf('\nlabel {')))
    for (const propriete of ['font-size', 'letter-spacing', 'text-transform', 'color']) {
      expect(corps, propriete).not.toContain(`${propriete}:`)
    }
  })

  it('ne laisse aucun `<label>` sans son libellé nommé', () => {
    // Two exceptions with own text style: `.interrupteur` = a PHRASE, not a label;
    // `.bouton-fichier` = a button disguised as label.
    const SANS_LIBELLE = ['interrupteur', 'bouton-fichier']
    const racine = join(import.meta.dirname, '..', 'src', 'ui')
    for (const fichier of readdirSync(racine)) {
      if (!fichier.endsWith('.tsx')) continue
      const source = readFileSync(join(racine, fichier), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      for (const [balise] of source.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)) {
        if (SANS_LIBELLE.some((classe) => balise.includes(classe))) continue
        expect(balise, `${fichier} — un <label> sans <span className="libelle">`).toContain(
          'className="libelle',
        )
      }
    }
  })
})

/**
 * T-0216 — vertical rhythm of a section. Gap between two fields lived only on `.champs`,
 * whose `gap` acts only between its grid children: siblings beside it fell to zero, those
 * with own margin rose to 1.5×. Sheet now puts gap on section siblings; remaining is the
 * CONVENTION: a field grid holds only fields. Not self-holding: two sections of one file
 * applied opposite rules, nothing arbitrated. This test arbitrates.
 */
describe('T-0216 — le rythme vertical d’une section', () => {
  /** Body of each `.champs` grid, delimited by the indentation of its opening tag. */
  function grilles(source: string): readonly string[] {
    const blocs: string[] = []
    // T-0234 — `[^"]*`: a modified grid (`champs paire`) stays a field grid; exact pattern
    // would escape the convention silently.
    for (const m of source.matchAll(/^([ ]*)<div className="champs[^"]*">$/gm)) {
      const debut = m.index + m[0].length + 1
      const fin = source.indexOf(`\n${m[1]!}</div>`, debut)
      blocs.push(source.slice(debut, fin))
    }
    return blocs
  }

  /** Grids of the whole folder, with source file. */
  function toutesLesGrilles(): readonly (readonly [string, string])[] {
    const racine = join(import.meta.dirname, '..', 'src', 'ui')
    const paires: (readonly [string, string])[] = []
    for (const fichier of readdirSync(racine)) {
      if (!fichier.endsWith('.tsx')) continue
      const source = readFileSync(join(racine, fichier), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      for (const grille of grilles(source)) paires.push([fichier, grille] as const)
    }
    return paires
  }

  it('ne laisse dans la grille rien d’autre que des champs nommés', () => {
    // A message adds its own margin to `gap` (margins don't collapse in a grid) → only
    // double-gap thing in panel. A switch and a button become cells beside a field though not
    // one.
    const INTRUS = ['<Mention', '<Interrupteur', '<button', 'className="etat"']
    for (const [fichier, grille] of toutesLesGrilles()) {
      for (const intrus of INTRUS) {
        expect(grille, `${fichier} — ${intrus} dans une grille de champs`).not.toContain(intrus)
      }
    }
  })

  it('ne laisse aucune grille vide', () => {
    // A fieldless grid still takes a place in section rhythm.
    for (const [fichier, grille] of toutesLesGrilles()) {
      expect(/<Champ|<label/.test(grille), `${fichier} — une grille sans aucun champ`).toBe(true)
    }
  })

  it('donne à la grille et aux frères le même pas', () => {
    // Two different steps would make gap depend on grid content: the defect this ticket closes.
    const pas = (motif: RegExp) => REGLES.slice(REGLES.search(motif)).match(/var\(--pas-\d\)/)![0]
    expect(pas(/\.champs \{/)).toBe(pas(/section:not\(\[class\]\) > \* \+ \*/))
  })
})

/**
 * T-0331 — line-height, weight, duration, stacking each have a scale. Same rule as spacing
 * and sizes: hard-coded value in a rule = bug. Only tokens and `@font-face` (which DESCRIBE
 * shipped files) may write a number.
 */
describe('T-0331 — les échelles de souffle, de graisse, de durée et de pile', () => {
  /** Sheet without comments, `@font-face` and token declarations. */
  const REGLES_SEULES = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@font-face\s*\{[^}]*\}/g, '')
    .replace(/^\s*--[\w-]+:[^;]*;/gm, '')

  it('aucun interlignage écrit en dur', () => {
    const fautes = [
      ...[...REGLES_SEULES.matchAll(/line-height:\s*([^;]+);/g)].map((m) => m[1]!),
      ...[...REGLES_SEULES.matchAll(/font:[^;/]*\/([^\s;]+)/g)].map((m) => m[1]!),
    ].filter((v) => !/^var\(--interligne-[a-z]+\)$/.test(v))
    expect(fautes).toEqual([])
  })

  it('aucune graisse écrite en dur, et chaque graisse a son fichier', () => {
    const fautes = [...REGLES_SEULES.matchAll(/font-weight:\s*([^;]+);/g)]
      .map((m) => m[1]!)
      .filter((v) => !/^var\(--graisse-[a-z]+\)$/.test(v))
    expect(fautes).toEqual([])
    const livrees = new Set(
      [...CSS.matchAll(/@font-face\s*\{[^}]*font-weight:\s*(\d+);/g)].map((m) => Number(m[1])),
    )
    const graisses = [...CSS.matchAll(/--graisse-[a-z]+:\s*(\d+);/g)].map((m) => Number(m[1]))
    expect(graisses.length).toBeGreaterThanOrEqual(4)
    for (const g of graisses) expect({ g, livree: livrees.has(g) }).toEqual({ g, livree: true })
  })

  it('aucune durée d’animation écrite en dur', () => {
    const fautes = [...REGLES_SEULES.matchAll(/\b\d+m?s\b/g)].map((m) => m[0])
    expect(fautes).toEqual([])
  })

  it('tout empilement cite un rang de la pile', () => {
    const fautes = [...REGLES_SEULES.matchAll(/z-index:\s*([^;]+);/g)]
      .map((m) => m[1]!)
      .filter((v) => !/^var\(--plan-[a-z]+\)$/.test(v))
    expect(fautes).toEqual([])
    // Bubble sits above all its containers: highest rank of UI. Only night-mode mask (T-0185)
    // exceeds it: it filters the UI, isn't part of it.
    const rangs = [...CSS.matchAll(/--plan-([a-z]+):\s*(\d+);/g)].map((m) => [m[1]!, Number(m[2])] as const)
    const rang = (nom: string): number | undefined => rangs.find(([n]) => n === nom)?.[1]
    const interface_ = rangs.filter(([nom]) => nom !== 'masque').map(([, r]) => r)
    expect(rang('bulle')).toBe(Math.max(...interface_))
    expect(rang('masque')).toBeGreaterThan(rang('bulle')!)
  })
})

describe('T-0376 — les noms peints sur la scène', () => {
  it('ne dépassent pas le corps du texte de l’interface', async () => {
    const { HAUTEUR_LABEL_PX } = await import('../src/ui/libelles-cibles.ts')
    const corpsRem = Number(/--texte-corps: ([\d.]+)rem;/.exec(CSS)![1])
    const remPx = 16
    expect(HAUTEUR_LABEL_PX).toBeLessThanOrEqual(corpsRem * remPx)
  })
})

describe('T-0391 — une seule courbe d’accélération', () => {
  it('aucune transition n’écrit sa courbe en dur : toutes citent --courbe', () => {
    const enDur = [...REGLES.matchAll(/\b(?:ease(?:-in|-out|-in-out)?|linear(?!-)|steps\(|cubic-bezier\()/g)]
      .map((m) => m[0])
    // Only permitted cubic-bezier is the token definition.
    expect(enDur).toEqual(['cubic-bezier('])
    expect(REGLES).toMatch(/--courbe: cubic-bezier\(/)
  })

  it('--courbe est le smoothstep du canevas', () => {
    const [x1, y1, x2, y2] = /--courbe: cubic-bezier\(([^)]+)\)/
      .exec(REGLES)![1]!
      .split(',')
      .map(Number) as [number, number, number, number]
    const bezier = (a: number, b: number, t: number): number =>
      3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      // x(t) = t within 1e-4: time progress reads directly as ordinate.
      expect(bezier(x1, x2, t)).toBeCloseTo(t, 3)
      expect(bezier(y1, y2, t)).toBeCloseTo(adoucit(t), 6)
    }
  })
})
