/**
 * T-0068 — le canevas du planétarium se nomme et s'annonce.
 *
 * Un canevas est une boîte de pixels : sans rôle ni nom, la vue centrale de l'application
 * n'existe pas pour une technologie d'assistance. Ce qui se vérifie ici est donc la présence
 * du nom et de la description sur le rendu statique — et surtout le fait que la description
 * soit la lecture affichée, pas une seconde phrase libre de dériver.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { K } from '../src/registry/constants.ts'
import { etatScene, majVue, reinitialiseScene } from '../src/ui/scene-etat.ts'
import { reinitialiseSeance } from '../src/ui/seance-etat.ts'
import { reinitialiseCoque } from '../src/ui/coque-etat.ts'

const DOSSIER_UI = join(import.meta.dirname, '..', 'src', 'ui')

function ecran(): string {
  return renderToStaticMarkup(<App />)
}

/** L'ouvrante du canevas, seule : c'est là que vivent le rôle et les renvois. */
function baliseCanevas(html: string): string {
  const debut = html.indexOf('<canvas')
  expect(debut).toBeGreaterThan(-1)
  return html.slice(debut, html.indexOf('>', debut))
}

afterEach(() => {
  reinitialiseSeance()
  reinitialiseScene()
  reinitialiseCoque()
})

describe('T-0068 — le canevas porte un rôle et un nom', () => {
  it('se déclare pilotable plutôt que décoratif, et se donne un nom', () => {
    const canevas = baliseCanevas(ecran())
    // T-0069 rend la scène pilotable : `application`, pour que les flèches lui parviennent.
    expect(canevas).toContain('role="application"')
    expect(canevas).toMatch(/aria-label="Planétarium[^"]+"/)
    expect(canevas).toContain('tabindex="0"')
  })

  it('renvoie vers une description effectivement présente dans la page', () => {
    const html = ecran()
    const renvoi = /aria-describedby="([^"]+)"/.exec(baliseCanevas(html))
    expect(renvoi).not.toBeNull()
    expect(html).toContain(`id="${renvoi![1]!}"`)
  })
})

/** Le texte d'un fragment de rendu statique : balises et séparateurs de React retirés. */
function texteSeul(html: string): string {
  return html.replaceAll('<!-- -->', '').replace(/<[^>]*>/g, '')
}

describe('T-0068 — la description dit ce que la vue montre en ce moment', () => {
  /** Le texte du paragraphe de description, séparateurs de rendu statique retirés. */
  function description(html: string): string {
    const debut = html.indexOf('<p class="scene-description"')
    expect(debut).toBeGreaterThan(-1)
    return html.slice(debut, html.indexOf('</p>', debut)).replaceAll('<!-- -->', '')
  }

  it('nomme la visée, le champ et l’instant', () => {
    const texte = description(ecran())
    const { azimutDeg, hauteurDeg, fovDeg } = etatScene().vue
    expect(texte).toContain(`azimut ${azimutDeg.toFixed(0)}°`)
    expect(texte).toContain(`hauteur ${hauteurDeg.toFixed(0)}°`)
    expect(texte).toContain(`champ ${fovDeg.toFixed(1)}°`)
    expect(texte).toContain('AD')
  })

  it('suit le pointage : elle décrit la vue courante, pas celle du montage', () => {
    majVue({ azimutDeg: 90, fovDeg: K('FOV_MIN_SANS_GAIA_DEG') })
    const texte = description(ecran())
    expect(texte).toContain('azimut 90°')
    expect(texte).toContain(`champ ${K('FOV_MIN_SANS_GAIA_DEG').toFixed(1)}°`)
  })

  it('énonce les raccourcis du clavier, que le code seul ne dirait à personne (T-0069)', () => {
    // T-0213 — la carte Vue les affichait aussi en clair ; elle a disparu avec le rail, et
    // ses bascules ne pilotent pas la visée. Les raccourcis restent donc annoncés là où ils
    // s'appliquent : la description du canevas, qui est ce que la scène porte en propre.
    expect(description(ecran())).toMatch(/← ↑ ↓ →/)
  })

  it('emprunte les mots de la lecture affichée : une seule phrase, deux endroits', () => {
    majVue({ azimutDeg: 42 })
    const html = ecran()
    const commune = /(visée [^·]+· azimut 42°, hauteur [^·]+· champ [\d.]+°)/.exec(
      description(html),
    )
    expect(commune).not.toBeNull()
    // T-0153 — la barre porte la même phrase, au caractère près : elle a quitté le
    // menu d'information de la barre haute, elle n'a pas été réécrite en chemin.
    // T-0163 — elle l'entrecoupe désormais de compteurs : c'est le TEXTE qui doit coïncider,
    // balises retirées. Composée deux fois, la phrase dériverait au premier `toFixed` retouché.
    const barre = html.slice(html.indexOf('barrehaut-visee'))
    expect(texteSeul(barre)).toContain(commune![1]!.trim())
  })
})

/**
 * Constat A1, versant discret : un `aria-label` posé sur une `div` sans rôle n'est pas exposé.
 * L'intention est bonne, l'effet est nul — et rien ne le signale à la relecture. La règle se
 * vérifie donc sur toute l'interface, pas sur le seul schéma de `PlanSession` qui l'avait.
 */
describe('T-0068 — aucun `aria-label` inerte dans l’interface', () => {
  const balises = readdirSync(DOSSIER_UI)
    .filter((f) => f.endsWith('.tsx'))
    .flatMap((f) => {
      const source = readFileSync(join(DOSSIER_UI, f), 'utf8')
      return [...source.matchAll(/<(div|span|p|section)\s[^>]*aria-label=[^>]*>/g)].map((m) => ({
        fichier: f,
        balise: m[0],
      }))
    })

  it('donne un rôle à toute balise générique qui se nomme', () => {
    const inertes = balises.filter((b) => !b.balise.includes('role=')).map((b) => b.fichier)
    expect(inertes).toEqual([])
  })
})
