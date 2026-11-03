/**
 * §6.4 — target image view: text alternative, silent absence, mode nuit.
 * Env `node`, no DOM → effects don't run; that's the condition: first render, no image
 * resolved → NO empty frame/template/message. Network path: `imagerie-cible.test.ts`.
 * Night treatment checked on the stylesheet (§11.1): a deleted rule breaks no render, only
 * leaks green and blue.
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

/** Rule body, designated by selector at line start. */
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
    // "image de M31" tells nothing to someone who can't see the image.
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

  // T-0166 — list thumbnail = sole exception (geometry): box must exist before the image, else
  // arrival shifts the row.
  it('réserve la case de la vignette et y pose un glyphe, pas une image', () => {
    const rendu = renderToStaticMarkup(<VignetteCible objet={objet} />)
    expect(rendu).toContain('cible-vignette-vide')
    // Pending box: no request.
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
    // Mask (T-0185) multiplies whole page incl. photos. `filter: hue-rotate` would leak; a 2nd
    // fade on the image would double attenuation.
    expect(CSS).not.toMatch(/filter:\s*[^;]*hue-rotate/)
    expect(CSS.match(/mix-blend-mode:\s*multiply/g)).toHaveLength(1)
  })

  it('garde à la vignette de carte une forme fixe, garnie ou non', () => {
    // T-0378 — without fixed aspect ratio, a card with image jumps vs its neighbour.
    expect(regle('.cible-vignette')).toMatch(/aspect-ratio: 1;/)
  })
})

// ---------------------------------------------------------------------------
// §6.2 — capteur frame on the image
// ---------------------------------------------------------------------------

describe('cadre du capteur §6.2', () => {
  it('pose l’encart sur l’image, pas à côté', () => {
    // Without `position: relative` on container, inset positions vs page: leaves image, no
    // test notices.
    expect(regle('.image-cible-vue')).toMatch(/position: relative/)
    expect(regle('.image-cible-encart')).toMatch(/position: absolute/)
  })

  it('ne pose aucun cadre sur la grande image : une seule façon de lire le cadrage', () => {
    // Overlay rectangle changed nature per target (frame in image / image in frame) and needed
    // another gesture for same question. Inset answers alone.
    expect(CSS).not.toContain('image-cible-cadre')
  })

  it('trace le cadre par un jeton de palette, donc en rouge la nuit', () => {
    expect(regle('.image-cible-encart')).toMatch(/border:[^;]*var\(--[a-z-]+\)/)
  })

  it('rend l’encart opaque : deux champs superposés ne se lisent pas', () => {
    // Inset = ANOTHER view at another scale. No background → big image shows through margins,
    // nothing says where the reduced object ends.
    expect(regle('.image-cible-encart')).toMatch(/background:\s*var\(--[a-z-]+\)/)
  })

  it('laisse l’encart recevoir le pointeur : c’est ce qui l’agrandit', () => {
    expect(regle('.image-cible-encart')).not.toMatch(/pointer-events: none/)
  })

  it('agrandit l’encart au survol sans rien déplacer dans la page', () => {
    // View keeps its size, inset absolute: only its width grows. A rule touching the view
    // would shift fiche text.
    const survol = regle('.image-cible-encart:hover')
    expect(survol).toMatch(/width:/)
    expect(regle('.image-cible-vue')).not.toMatch(/:hover/)
  })

  it('laisse voir la vue autour de l’encart agrandi, sans la recouvrir', () => {
    // Inset opaque (two scales overlaid IN the frame unreadable); nothing paints over the rest
    // of the view: overflow recalls which field the frame is cut from.
    expect(regle('.image-cible-encart:hover')).not.toMatch(/box-shadow/)
  })

  it('n’anime l’agrandissement que si la préférence système accepte le mouvement', () => {
    // WCAG 2.3.3: interaction-triggered animation must be stoppable. Not shortened under
    // preference but not DECLARED: enlargement instant. A transition on base rule applies to all.
    expect(regle('.image-cible-encart')).not.toMatch(/transition/)
    expect(regle('.image-cible-encart:hover')).not.toMatch(/transition/)

    const debut = CSS.indexOf('@media (prefers-reduced-motion: no-preference)')
    expect(debut, 'aucun bloc de mouvement accepté').toBeGreaterThan(-1)
    const bloc = CSS.slice(debut, CSS.indexOf('\n}', debut))
    expect(bloc).toMatch(/transition:\s*width/)
    expect(bloc).toContain('.image-cible-encart')
  })

  it('dit que l’agrandissement est le champ du capteur, pas un zoom sur l’image', () => {
    // Mention only on hover: checked on stylesheet (static render can't reach).
    expect(regle('.image-cible-encart-mention')).toMatch(/opacity: 0/)
    expect(regle('.image-cible-encart:hover .image-cible-encart-mention')).toMatch(/opacity: 1/)
  })


  it('coupe la cible qui déborde du cadre, c’est ce qui donne l’image d’une mosaïque', () => {
    expect(regle('.image-cible-encart')).toMatch(/overflow: hidden/)
  })

})
