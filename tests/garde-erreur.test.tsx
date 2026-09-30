/**
 * T-0210 — l'écran noir n'est plus une issue possible.
 *
 * L'application se montait sans aucune frontière d'erreur : une levée en rendu démontait
 * l'arbre React entier, et la page devenait vide sans rien dire. C'est ce qu'une latitude de
 * 456° produisait.
 *
 * T-0279 — la cause, phrase anglaise de bibliothèque, part à la console et non à l'écran.
 *
 * La classe elle-même ne se rend pas ici : React n'active pas les frontières d'erreur au rendu
 * serveur, et c'est le seul rendu dont ce projet dispose (`environment: 'node'`). Ses deux
 * moitiés se vérifient séparément — la bascule, et l'écran de repli.
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
