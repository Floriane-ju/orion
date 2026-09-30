/**
 * §6.4 — la vue de l'image de cible : alternative textuelle, absence silencieuse, mode nuit.
 *
 * La suite tourne en environnement `node`, sans DOM : les effets React ne s'exécutent pas.
 * C'est exactement la condition à vérifier ici — au premier rendu, aucune image n'est encore
 * résolue, et ce rendu-là ne doit poser NI cadre vide, NI gabarit, NI message. Le chemin
 * réseau lui-même est couvert par `imagerie-cible.test.ts`, où le service est bouchonné.
 *
 * Le traitement nocturne est vérifié sur la feuille de style, comme tout §11.1 : une règle
 * supprimée par mégarde ne casse aucun rendu, elle laisse seulement fuir du vert et du bleu.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { decodeObjets, type ObjetCielProfond } from '../src/data/deepsky.ts'
import { ImageCible, VignetteCible, alternativeCible } from '../src/ui/ImageCible.tsx'
import { LIBELLE_TYPE_OBJET, nomCommun } from '../src/ui/libelles-objet.ts'
import { paquet } from './fixtures.ts'

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

const CATALOGUE: readonly ObjetCielProfond[] = decodeObjets({
  enregistrements: paquet('openngc-1.bin'),
  chaines: paquet('openngc-noms-1.bin'),
})

/** Le corps d'une règle, désignée par son sélecteur en début de ligne. */
function regle(selecteur: string): string {
  const debut = CSS.indexOf(`\n${selecteur} {`)
  expect(debut, selecteur).toBeGreaterThan(-1)
  return CSS.slice(debut, CSS.indexOf('}', debut))
}

describe('alternative textuelle §6.4', () => {
  it('décrit l’objet, jamais le média', () => {
    for (const objet of CATALOGUE.slice(0, 500)) {
      const texte = alternativeCible(objet)
      expect(texte, objet.designation).toContain(objet.designation)
      expect(texte, objet.designation).toContain(LIBELLE_TYPE_OBJET[objet.type])
      // « image de M31 » n'apprend rien à qui ne voit pas l'image.
      expect(texte.toLowerCase(), objet.designation).not.toContain('image')
      expect(texte.toLowerCase(), objet.designation).not.toContain('photo')
      expect(texte.toLowerCase(), objet.designation).not.toContain('vignette')
    }
  })

  it('donne le nom commun quand le catalogue en porte un', () => {
    const nomme = CATALOGUE.find((o) => nomCommun(o) !== '')
    expect(nomme).toBeDefined()
    expect(alternativeCible(nomme!)).toContain(nomCommun(nomme!))
  })
})

describe('absence d’image §12.5', () => {
  const objet = CATALOGUE[0]!

  it('ne pose aucun cadre vide sur la fiche tant qu’il n’y a rien à montrer', () => {
    expect(renderToStaticMarkup(<ImageCible objet={objet} cadre={null} />)).toBe('')
  })

  // T-0166 — la vignette de liste est la seule exception, et pour une raison de géométrie :
  // sa case doit exister avant l'image, sinon l'arrivée de celle-ci décale toute la ligne.
  it('réserve la case de la vignette et y pose un glyphe, pas une image', () => {
    const rendu = renderToStaticMarkup(<VignetteCible objet={objet} />)
    expect(rendu).toContain('cible-vignette-vide')
    // Rien n'est téléchargé pour une case en attente : elle n'émet aucune requête.
    expect(rendu).not.toContain('<img')
    expect(rendu).toContain('icone')
  })

  it('ne fait pas annoncer la case en attente : la ligature reste masquée', () => {
    const rendu = renderToStaticMarkup(<VignetteCible objet={objet} />)
    expect(rendu).toContain('aria-hidden="true"')
    expect(rendu).not.toMatch(/aria-label|role="img"/)
  })

  it('ne rend rien du tout sans objet : la vignette d’une ligne vide n’est pas un gabarit', () => {
    expect(renderToStaticMarkup(<ImageCible objet={null} cadre={null} />)).toBe('')
  })

  it('ne signale l’absence par aucun message', () => {
    const rendu = renderToStaticMarkup(<ImageCible objet={objet} cadre={null} />)
    expect(rendu).not.toMatch(/erreur|indisponible|introuvable/i)
  })
})

describe('lisibilité en mode nuit §11.1', () => {
  it('laisse au masque plein écran le rougissement de l’image, sans fondu propre', () => {
    // Le masque (T-0185) multiplie toute la page, photos comprises. Un `filter: hue-rotate`
    // laisserait fuir ; un second fondu sur l'image doublerait l'atténuation.
    expect(CSS).not.toMatch(/filter:\s*[^;]*hue-rotate/)
    expect(CSS.match(/mix-blend-mode:\s*multiply/g)).toHaveLength(1)
  })

  it('garde à la vignette de liste la hauteur d’une cible de clic', () => {
    // Sans hauteur fixe, une ligne avec image sauterait par rapport à celles sans.
    expect(regle('.cible-vignette')).toMatch(/height: var\(--cible-clic\)/)
  })
})

// ---------------------------------------------------------------------------
// §6.2 — le cadre du capteur sur l'image
// ---------------------------------------------------------------------------

describe('cadre du capteur §6.2', () => {
  it('pose l’encart sur l’image, pas à côté', () => {
    // Sans `position: relative` sur le conteneur, l'encart se placerait par rapport à la
    // page : il quitterait l'image sans qu'aucun test ne le remarque.
    expect(regle('.image-cible-vue')).toMatch(/position: relative/)
    expect(regle('.image-cible-encart')).toMatch(/position: absolute/)
  })

  it('ne pose aucun cadre sur la grande image : une seule façon de lire le cadrage', () => {
    // Un rectangle en surimpression changeait de nature selon la cible — tantôt un cadre dans
    // l'image, tantôt une image dans le cadre — et demandait un autre geste pour la même
    // question. L'encart y répond seul.
    expect(CSS).not.toContain('image-cible-cadre')
  })

  it('trace le cadre par un jeton de palette, donc en rouge la nuit', () => {
    expect(regle('.image-cible-encart')).toMatch(/border:[^;]*var\(--[a-z-]+\)/)
  })

  it('rend l’encart opaque : deux champs superposés ne se lisent pas', () => {
    // L'encart est une AUTRE vue, à une autre échelle. Sans fond, la grande image transparaît
    // dans ses marges et plus rien ne dit où finit l'objet réduit.
    expect(regle('.image-cible-encart')).toMatch(/background:\s*var\(--[a-z-]+\)/)
  })

  it('laisse l’encart recevoir le pointeur : c’est ce qui l’agrandit', () => {
    expect(regle('.image-cible-encart')).not.toMatch(/pointer-events: none/)
  })

  it('agrandit l’encart au survol sans rien déplacer dans la page', () => {
    // La vue ne change pas de taille et l'encart y est en position absolue : seule sa largeur
    // grandit. Une règle qui toucherait à la vue elle-même décalerait le texte de la fiche.
    const survol = regle('.image-cible-encart:hover')
    expect(survol).toMatch(/width:/)
    expect(regle('.image-cible-vue')).not.toMatch(/:hover/)
  })

  it('laisse voir la vue autour de l’encart agrandi, sans la recouvrir', () => {
    // L'encart reste opaque — deux échelles superposées DANS le cadre ne se lisent pas — mais
    // rien ne peint par-dessus le reste de la vue : ce qui dépasse rappelle de quel champ le
    // cadre est découpé.
    expect(regle('.image-cible-encart:hover')).not.toMatch(/box-shadow/)
  })

  it('n’anime l’agrandissement que si la préférence système accepte le mouvement', () => {
    // WCAG 2.3.3 : une animation déclenchée par l'interaction doit pouvoir être coupée. Ici
    // elle n'est pas raccourcie sous préférence, elle n'est pas DÉCLARÉE — l'agrandissement
    // redevient instantané. Une transition écrite sur la règle de base s'imposerait à tous.
    expect(regle('.image-cible-encart')).not.toMatch(/transition/)
    expect(regle('.image-cible-encart:hover')).not.toMatch(/transition/)

    const debut = CSS.indexOf('@media (prefers-reduced-motion: no-preference)')
    expect(debut, 'aucun bloc de mouvement accepté').toBeGreaterThan(-1)
    const bloc = CSS.slice(debut, CSS.indexOf('\n}', debut))
    expect(bloc).toMatch(/transition:\s*width/)
    expect(bloc).toContain('.image-cible-encart')
  })

  it('dit que l’agrandissement est le champ du capteur, pas un zoom sur l’image', () => {
    // La mention n'existe qu'au survol : elle se vérifie sur la feuille de style, comme tout
    // ce que le rendu statique ne peut pas atteindre.
    expect(regle('.image-cible-encart-mention')).toMatch(/opacity: 0/)
    expect(regle('.image-cible-encart:hover .image-cible-encart-mention')).toMatch(/opacity: 1/)
  })


  it('coupe la cible qui déborde du cadre, c’est ce qui donne l’image d’une mosaïque', () => {
    expect(regle('.image-cible-encart')).toMatch(/overflow: hidden/)
  })

})
