/**
 * T-0278 — aucune phrase ne décrit un comportement que le produit n'a pas.
 *
 * Les cinq textes qui ont motivé ce ticket disaient tous quelque chose de vérifiable, et tous
 * étaient faux : une pause du transport que le mode nuit ne fait pas (T-0136), un catalogue à
 * charger qui n'existe pas (hors MVP, §12.2), un tiret que la liste n'affiche jamais, un filtre
 * annoncé à l'envers de ce qu'il coupe, et une région « Matériel » disparue avec T-0197.
 *
 * Une phrase fausse ne casse rien : elle survit à toutes les suites. Celle-ci est donc une
 * LISTE NOIRE — chaque entrée porte la raison pour laquelle le texte est faux, et son retour,
 * même reformulé ailleurs, refait échouer la suite. Elle s'examine sur le texte LU, tags
 * retirés : un nom de prop (`gaiaCharge`) n'est pas une promesse faite à l'utilisateur.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { bornesZoom, etatProfondeur } from '../src/core/projection.ts'
import { AIDE_MATERIEL_INCOMPLET } from '../src/ui/Inconnu.tsx'
import { majCatalogue, reinitialiseCatalogue } from '../src/ui/catalogue-etat.ts'
import { ouvreCarte, reinitialiseCoque } from '../src/ui/coque-etat.ts'
import { reinitialiseScene } from '../src/ui/scene-etat.ts'
import { poseMode, reinitialiseSeance } from '../src/ui/seance-etat.ts'

interface Interdit {
  readonly motif: RegExp
  readonly pourquoi: string
}

const INTERDITS: readonly Interdit[] = [
  {
    motif: /en pause en mode nuit/i,
    pourquoi:
      'T-0136 — le mode nuit ne change QUE les couleurs : le curseur temporel continue d’avancer.',
  },
  {
    motif: /Gaia/,
    pourquoi: 'Le paquet Gaia est hors MVP (§12.2) : aucun texte ne peut demander de le charger.',
  },
  {
    motif: /dans Matériel/i,
    pourquoi: 'T-0197 — le matériel n’est plus une région nommée : ce sont les cartes Boîtier et Optique.',
  },
  {
    motif: /un tiret\s*:/i,
    pourquoi: 'La liste RETIRE la lecture non évaluée au lieu d’afficher un tiret.',
  },
  {
    motif: /qui tiennent dans votre cadre/i,
    pourquoi:
      'Le filtre écarte surtout les objets TROP PETITS : la phrase annonçait l’inverse de son effet.',
  },
  {
    motif: /aucun objet de ce nom/i,
    pourquoi:
      'T-0281 — la recherche vide n’établit pas l’absence de l’objet : « NGC 224 » ne trouvait rien alors que M31 porte ce numéro. Le message dit sur quoi la recherche porte.',
  },
]

/**
 * Le texte que l'utilisateur LIT : les attributs et les noms de classes n'en font pas partie.
 *
 * Le registre de constantes en sort, comme les colonnes `verbatim` sortent du filet de T-0275 :
 * c'est l'inventaire de §12.5, qui décrit des constantes et leur source — dont C-26, dérivée
 * d'un paquet que le MVP ne livre pas. Il ne promet aucun geste, il documente une valeur.
 */
function texteLu(html: string): string {
  return html
    .replace(/<table class="registre"[\s\S]*?<\/table>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/g, ' ')
}

function verifie(texte: string, surface: string): void {
  for (const { motif, pourquoi } of INTERDITS) {
    expect(motif.test(texte), `${surface} — ${pourquoi}`).toBe(false)
  }
}

function ecran(): string {
  return texteLu(renderToStaticMarkup(<App />))
}

afterEach(() => {
  reinitialiseCatalogue()
  reinitialiseScene()
  reinitialiseSeance()
  reinitialiseCoque()
})

describe('T-0278 — les surfaces rendues ne promettent rien de faux', () => {
  it('l’écran au démarrage : barres, tiroir du mode nuit, matériel, catalogue', () => {
    verifie(ecran(), 'démarrage')
  })

  it('le catalogue, portée complète comme portée photographiable', () => {
    majCatalogue({ photographiablesSeules: false })
    verifie(ecran(), 'catalogue, portée complète')
    majCatalogue({ photographiablesSeules: true })
    verifie(ecran(), 'catalogue, portée photographiable')
  })

  it('le plan de la nuit et le panneau du filé', () => {
    ouvreCarte('PLAN')
    verifie(ecran(), 'plan de la nuit')
    poseMode('PANORAMA')
    verifie(ecran(), 'panorama')
  })

  it('les refus de matériel incomplet, qui ne passent par aucun composant', () => {
    verifie(AIDE_MATERIEL_INCOMPLET, 'aide matériel incomplet')
  })

  it('les causes de la projection, affichées en bulle et en survol', () => {
    verifie(bornesZoom(false, 'MODE_PLANETARIUM').cause ?? '', 'plancher de zoom')
    verifie(etatProfondeur(5, 9, null, false).cause ?? '', 'catalogue épuisé')
  })
})

describe('T-0281 — la recherche sans résultat ne conclut pas sur le ciel', () => {
  it('ne dit pas qu’aucun objet ne porte ce nom, elle dit ce qu’elle a cherché', () => {
    majCatalogue({ recherche: 'zzzzzz', photographiablesSeules: false })
    const texte = ecran()
    verifie(texte, 'catalogue, recherche sans résultat')
    expect(texte).toContain('noms d’usage')
  })
})

describe('T-0278 — la liste dit ce que son filtre fait réellement', () => {
  it('nomme les deux bornes de taille et le nombre d’objets écartés comme trop petits', () => {
    majCatalogue({ photographiablesSeules: true })
    const texte = ecran()
    // Les deux bornes, dans l'ordre où le filtre les applique : « de X’ à Y’ ».
    expect(texte).toMatch(/de\s+\d+’\s+à\s+\d+’/)
    expect(texte).toMatch(/écarté?s?\s+comme\s+trop\s+petits?/)
  })
})
