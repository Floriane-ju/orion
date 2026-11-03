/**
 * T-0210 — black screen impossible. No error boundary: a render throw unmounted the whole
 * React tree → blank page (456° latitude did it).
 * T-0279 — cause (English library sentence) → console, not screen.
 *
 * Class not rendered: React doesn't activate error boundaries in server rendering (project's
 * only renderer, `environment: 'node'`). Two halves checked apart: the switch, the fallback.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Coque } from '../src/ui/Coque.tsx'
import { EcranInterrompu, GardeErreur, RegionInterrompue } from '../src/ui/GardeErreur.tsx'
import { gardeImage } from '../src/ui/garde-image.ts'
import { B } from '../src/registry/budgets.ts'

const COQUE_SOURCE = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'Coque.tsx'), 'utf8')

describe('T-0279 — aucune exception brute à l’écran', () => {
  it('toute levée, chaîne comprise — le cas d’astronomy-engine — bascule sur l’écran de repli', () => {
    expect(GardeErreur.getDerivedStateFromError()).toEqual({ interrompu: true })
  })

  const markup = renderToStaticMarkup(<EcranInterrompu />)

  it('dit en français ce qui s’est passé au lieu de laisser la page vide', () => {
    expect(markup).toContain('Le calcul s’est interrompu')
    expect(markup).not.toMatch(/out of range|Error|undefined/)
  })

  it('se signale aux technologies d’assistance', () => {
    expect(markup).toContain('role="alert"')
  })

  it('offre une sortie, et dit que rien n’est perdu', () => {
    expect(markup).toContain('<button')
    expect(markup).toContain('Recharger')
    expect(markup).toContain('intactes')
  })
})

describe('tant que rien ne lève, la garde est transparente', () => {
  it('rend ses enfants tels quels', () => {
    expect(
      renderToStaticMarkup(
        <GardeErreur>
          <p>le ciel</p>
        </GardeErreur>,
      ),
    ).toBe('<p>le ciel</p>')
  })
})

describe('T-0310 — une région éteinte, pas l’application', () => {
  const markup = renderToStaticMarkup(<RegionInterrompue region="le panneau de séance" reprend={() => {}} />)

  it('nomme la région touchée et dit que le reste fonctionne', () => {
    expect(markup).toContain('Le panneau de séance ne s’affiche plus')
    expect(markup).toContain('Le reste de l’application fonctionne')
    expect(markup).toContain('role="alert"')
  })

  it('offre de réessayer la région seule', () => {
    expect(markup).toContain('Réessayer')
  })

  it('chaque région de la coque a sa propre garde', () => {
    const coque = renderToStaticMarkup(
      <Coque
        topbar={<i>barre</i>}
        temps={<i>temps</i>}
        scene={<i>ciel</i>}
        cartes={<i>cartes</i>}
        lateral={<i>panneau</i>}
        visee={<i>visée</i>}
        page={<i>page</i>}
      />,
    )
    // Boundaries are transparent while nothing throws: every region renders.
    for (const region of ['barre', 'temps', 'ciel', 'cartes', 'panneau', 'visée', 'page']) {
      expect(coque).toContain(`<i>${region}</i>`)
    }
    expect(COQUE_SOURCE.match(/<GardeErreur region=/g)?.length).toBe(7)
  })
})

describe('T-0310 — une levée dans le dessin du ciel', () => {
  const sansConsole = (): (() => void) => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    return () => erreur.mockRestore()
  }

  it('retente une image, puis s’arrête et le dit une seule fois', () => {
    const restaure = sansConsole()
    const arrete = vi.fn()
    let appels = 0
    const image = gardeImage(
      () => {
        appels += 1
        throw new Error('dessin')
      },
      B('REPRISES_RENDU'),
      arrete,
    )
    for (let ts = 0; ts < 30; ts += 1) image(ts)
    restaure()
    expect(appels).toBe(B('REPRISES_RENDU') + 1)
    expect(arrete).toHaveBeenCalledTimes(1)
  })

  it('une image réussie remet la reprise à zéro : un incident passager ne coupe pas le ciel', () => {
    const restaure = sansConsole()
    const arrete = vi.fn()
    let n = 0
    const image = gardeImage(
      () => {
        n += 1
        if (n % 2 === 1) throw new Error('passager')
      },
      B('REPRISES_RENDU'),
      arrete,
    )
    for (let ts = 0; ts < 30; ts += 1) image(ts)
    restaure()
    expect(arrete).not.toHaveBeenCalled()
  })
})
