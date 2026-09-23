/**
 * T-0194 — les deux échelles de `styles.css`, et le retour d'état des contrôles.
 *
 * La feuille garantit déjà qu'aucune COULEUR n'y est écrite en dur (`mode-nuit.test.tsx`) :
 * c'est ce qui rend le basculement de §11.1 total. Les écarts et les tailles de texte
 * relèvent de la même mécanique et n'avaient pas la même garantie — d'où vingt et une
 * valeurs d'espacement et treize corps de texte, dont cinq tenaient dans un dixième de rem.
 *
 * Ce qui est vérifié ici n'est pas une valeur mais une DISCIPLINE : un écart ou un corps de
 * texte ajouté demain doit citer un pas de l'échelle, pas en inventer un seizième. Le test
 * lit le texte de la feuille, comme ses voisins, parce qu'une règle de style ne casse aucun
 * rendu quand elle dérive — elle se contente de désaligner l'interface d'un pixel à la fois.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

/** La feuille moins ses commentaires : une valeur citée en prose n'est pas une déclaration. */
const REGLES = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

/** Les déclarations d'une propriété, valeur brute, hors blocs de commentaire. */
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
    // `-1px` fait exception : ce n'est pas un écart mais la ruse qui sort
    // `.scene-description` du flux visuel sans la sortir de l'arbre d'accessibilité.
    for (const valeur of declarations(ESPACEMENT)) {
      if (valeur === '-1px') continue
      expect(valeur, valeur).not.toMatch(/(?<![\w.-])[0-9]*\.?[0-9]+(rem|px|em)\b/)
    }
  })

  it('garde les gabarits hors de l’échelle : ils mesurent des objets, pas de l’air', () => {
    // Un pas d'espacement qui dimensionnerait une barre ou une carte ferait dépendre la
    // hauteur de la coque du grain des marges — deux réglages qui n'ont rien à voir.
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
    // Deux exceptions, déclarées dans la feuille : `.icone` porte la taille d'un GLYPHE, pas
    // d'un texte, et `.tracee-plage` se règle en `em` sur ce qui la contient.
    const corps = [
      ...declarations(/^\s*font-size:\s*([^;]+);/gm),
      ...declarations(/^\s*font:\s*([^;]+);/gm).map((v) => v.split('/')[0]!),
    ]
    const derogations = ['1.25rem', '0.85em']
    for (const valeur of corps) {
      if (derogations.includes(valeur)) continue
      expect(valeur, valeur).toMatch(/^var\(--texte-[a-z]+\)$/)
    }
  })
})

/**
 * T-0215 — le suivi relève de la même discipline que le corps et l'écart.
 *
 * §11.1 confisque la luminance comme moyen de hiérarchie ; il reste la taille et la CASSE, et
 * la casse ne se lit qu'espacée. Le suivi est donc le second étage de la hiérarchie, et il
 * était le seul des trois à n'avoir aucune garantie : trois valeurs sur six étaient écrites
 * en dur dans leur règle, invisibles à toute comparaison.
 */
describe('T-0215 — l’échelle de suivi', () => {
  const SUIVI = /^\s*letter-spacing:\s*([^;]+);/gm

  it('ne laisse aucun suivi écrit en dur', () => {
    // `normal` et `0` ne sont pas des valeurs de l'échelle : ce sont les deux façons de
    // l'ANNULER, là où un texte hérite du suivi d'un libellé parent qui n'est pas le sien.
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
 * T-0215 — LE MICRO-LIBELLÉ, le style de texte le plus fréquent de l'interface.
 *
 * C'est la grammaire de T-0113 : ce qui NOMME — l'étiquette d'un champ, l'en-tête d'une
 * colonne, l'onglet, le résumé d'un tiroir, le détail d'un score — se distingue de ce qui
 * VAUT par sa casse et son suivi, puisque §11.1 ne laisse pas assez de luminance pour
 * l'étager autrement. Le motif est écrit neuf fois, et ses quatre valeurs sont déjà des
 * jetons : ce qui peut dériver n'est pas une valeur, c'est la dixième règle qui en oublierait
 * un et produirait un libellé presque semblable.
 *
 * T-0323 — elles étaient dix : le détail de score du plan de nuit portait la dixième, et le
 * plan ne détaille plus son score.
 *
 * Les neuf règles ne sont PAS regroupées en une seule. Les regrouper les déplacerait dans la
 * cascade — un onglet actif, un tiroir ouvert et un survol reposent chacun sur l'ordre de la
 * feuille pour surcharger leur couleur. Vingt-sept lignes gagnées contre neuf réordonnance-
 * ments dans une feuille dont toute la discipline est que rien ne bouge en silence : la
 * garantie vaut mieux ici que la concision.
 */
describe('T-0215 — le micro-libellé', () => {
  /** Les corps de règle qui portent la taille du micro-libellé et la casse. */
  function reglesMicro(): readonly (readonly [string, string])[] {
    return [...REGLES.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, sel, corps]) => [sel!.split('\n').join(' ').trim(), corps!] as const)
      .filter(
        ([, corps]) =>
          corps.includes('font-size: var(--texte-micro)') &&
          corps.includes('text-transform: uppercase'),
      )
  }

  it('en compte huit, et sait lesquelles', () => {
    expect(reglesMicro()).toHaveLength(8)
  })

  it('n’en laisse aucune oublier le suivi ni la couleur qui vont avec', () => {
    // Les quatre valeurs tiennent ensemble ou ne tiennent pas : un libellé en capitales sans
    // suivi se lit comme un mot tapé en majuscules, et rendu en --texte il pèse autant que la
    // valeur qu'il annonce — c'est exactement la hiérarchie que §11.1 confisque par ailleurs.
    for (const [selecteur, corps] of reglesMicro()) {
      expect(corps, selecteur).toContain('letter-spacing: var(--suivi-micro)')
      expect(corps, selecteur).toContain('color: var(--attenue)')
    }
  })
})

describe('T-0194 — le retour d’état des contrôles', () => {
  /** Ce qui se clique, se tire ou se saisit : tout doit répondre au geste de la même façon. */
  const CONTROLES = [
    'button',
    '.bouton-fichier',
    '.onglet',
    '.tiroir > summary',
    '.terme-detail summary',
    '.tracee summary',
    '.carte-entete',
    '.cible-ligne',
    '.compteur',
    'input',
    'select',
  ] as const

  /** Le corps de la règle qui porte la transition d'état. */
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
    // Onze commandes en portaient un, trois seulement répondaient à l'appui : un contrôle
    // muet sous la souris ne se distingue pas d'une lecture.
    // Une ligne de sélecteur, qu'elle ferme la liste (`{`) ou la continue (`,`).
    const survols = [...CSS.matchAll(/^[^{}\n]*:hover[^{}\n]*[,{]$/gm)].map((m) => m[0])
    for (const selecteur of CONTROLES) {
      expect(
        survols.some((s) => s.includes(selecteur)),
        `${selecteur} ne dit rien au survol`,
      ).toBe(true)
    }
  })

  it('raccourcit le fondu sous mouvement réduit sans le supprimer', () => {
    // La surcharge doit suivre la valeur nominale dans la feuille : un jeton se résout à
    // l'ordre du texte, et le même bloc placé avant serait réécrit par elle.
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
    // Un bouton désactivé qui répond au survol promet un clic qui n'aura pas lieu.
    expect(CSS).toMatch(/button:not\(:disabled\):hover/)
    expect(CSS).toMatch(/button:not\(:disabled\):active/)
  })
})

/**
 * T-0215 — UN CONTENEUR NE RESTYLE PAS CE QU'IL NE POSSÈDE PAS.
 *
 * `label` portait la casse et le suivi du micro-libellé. Or un `<label>` ENVELOPPE son
 * contrôle : le style descendait sur l'`<input>`, sur le `<select>`, sur la bulle de glose, et
 * — sans que rien ne l'arrête — sur le message de refus, qui se rendait donc en capitales
 * espacées. La règle `.etat` dit pourtant l'inverse en toutes lettres : « appliquées à une
 * explication, elles la rendent illisible ». Les contrôles s'en défendaient par une
 * annulation ; l'explication, non.
 *
 * Le style vit maintenant sur `.libelle`, un enfant nommé. Ce qui se vérifie ici est que le
 * défaut ne revient pas : ni par `label`, ni par un champ qui oublierait la classe.
 */
describe('T-0215 — le libellé ne déborde pas sur son contrôle', () => {
  it('ne laisse à `label` que la disposition', () => {
    const corps = REGLES.slice(REGLES.indexOf('\nlabel {'), REGLES.indexOf('}', REGLES.indexOf('\nlabel {')))
    for (const propriete of ['font-size', 'letter-spacing', 'text-transform', 'color']) {
      expect(corps, propriete).not.toContain(`${propriete}:`)
    }
  })

  it('ne laisse aucun `<label>` sans son libellé nommé', () => {
    // Deux exceptions, et elles portent leur propre style de texte : `.interrupteur` est une
    // PHRASE et non une étiquette, `.bouton-fichier` est un bouton déguisé en label.
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
 * T-0216 — le rythme vertical d'une section.
 *
 * L'écart entre deux champs ne vivait que sur `.champs`, dont le `gap` ne joue qu'entre les
 * enfants de sa grille : tout ce que le balisage posait à côté d'elle retombait à zéro, tout
 * ce qu'il y posait avec une marge propre montait à une fois et demie. La feuille porte
 * maintenant l'écart sur les frères de la section ; ce qui reste à tenir est la CONVENTION qui
 * va avec — une grille de champs ne contient que des champs.
 *
 * Elle ne se tient pas toute seule : deux sections du même fichier appliquaient deux règles
 * opposées, et rien ne les départageait. C'est ce test qui départage.
 */
describe('T-0216 — le rythme vertical d’une section', () => {
  /** Le corps de chaque grille `.champs`, délimité par l'indentation de sa balise ouvrante. */
  function grilles(source: string): readonly string[] {
    const blocs: string[] = []
    // T-0234 — `[^"]*` : une grille modifiée (`champs paire`) reste une grille de champs, et
    // un motif exact l'aurait laissée échapper à la convention sans que rien ne le dise.
    for (const m of source.matchAll(/^([ ]*)<div className="champs[^"]*">$/gm)) {
      const debut = m.index + m[0].length + 1
      const fin = source.indexOf(`\n${m[1]!}</div>`, debut)
      blocs.push(source.slice(debut, fin))
    }
    return blocs
  }

  /** Les grilles de tout le dossier, avec le fichier d'où elles viennent. */
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
    // Un message ajoute sa marge propre au `gap` — les marges ne fusionnent pas en grille —
    // et devient la seule chose du panneau à un écart double. Un interrupteur et un bouton,
    // eux, deviennent des cellules à côté d'un champ, alors qu'ils n'en sont pas un.
    const INTRUS = ['<Mention', '<Interrupteur', '<button', 'className="etat"']
    for (const [fichier, grille] of toutesLesGrilles()) {
      for (const intrus of INTRUS) {
        expect(grille, `${fichier} — ${intrus} dans une grille de champs`).not.toContain(intrus)
      }
    }
  })

  it('ne laisse aucune grille vide', () => {
    // Une grille sans champ occupe quand même une place dans le rythme de la section.
    for (const [fichier, grille] of toutesLesGrilles()) {
      expect(/<Champ|<label/.test(grille), `${fichier} — une grille sans aucun champ`).toBe(true)
    }
  })

  it('donne à la grille et aux frères le même pas', () => {
    // Deux pas différents rendraient l'écart dépendant de ce qui est dans la grille — le
    // défaut même que ce ticket ferme.
    const pas = (motif: RegExp) => REGLES.slice(REGLES.search(motif)).match(/var\(--pas-\d\)/)![0]
    expect(pas(/\.champs \{/)).toBe(pas(/section:not\(\[class\]\) > \* \+ \*/))
  })
})
