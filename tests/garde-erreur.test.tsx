/**
 * T-0210 — black screen impossible. No error boundary: a render throw unmounted the whole
 * React tree → blank page (456° latitude did it).
 * T-0279 — cause (English library sentence) → console, not screen.
 *
 * Class not rendered: React doesn't activate error boundaries in server rendering (project's
 * only renderer, `environment: 'node'`). Two halves checked apart: the switch, the fallback.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EcranInterrompu, GardeErreur } from '../src/ui/GardeErreur.tsx'

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
