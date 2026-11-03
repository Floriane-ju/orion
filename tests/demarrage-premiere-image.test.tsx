/**
 * T-0296 — what main thread no longer does at startup. Two properties only the coque shows:
 *  - catalogues start DURING saisie re-read: `useCatalogues` is called above the wait, so its
 *    effect is scheduled by first render ("Lecture des données enregistrées…"), not the next.
 *  - Ciel profond mode: Panorama preview index not built. T-0398: no longer built in any
 *    React render, built where filé pass paints (`file-index.ts`).
 * `fake-indexeddb` holds re-read pending: without DB the saisie restores nothing and coque
 * jumps straight to full screen.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { App } from '../src/App.tsx'
import type { Etoile } from '../src/data/catalog.ts'
import { useParametresFile } from '../src/ui/planetarium-panorama.ts'
import { indexFile } from '../src/ui/file-index.ts'
import { etatSeance } from '../src/ui/seance-etat.ts'
import { construitIndex } from '../src/core/index-ciel.ts'
import * as donnees from '../src/ui/app-donnees.ts'

vi.mock('../src/core/index-ciel.ts', async (importeReel) => {
  const reel = await importeReel<typeof import('../src/core/index-ciel.ts')>()
  return { ...reel, construitIndex: vi.fn(reel.construitIndex) }
})

/** Minimal catalogue: only whether it is indexed matters. */
const ETOILES: readonly Etoile[] = Object.freeze([
  { adDeg: 10, decDeg: 20, magV: 2, bv: 0.1 },
  { adDeg: 200, decDeg: -30, magV: 4, bv: 0.6 },
])

describe('T-0296 — les catalogues partent avec la relecture de la saisie', () => {
  it('demande les catalogues dès le rendu qui annonce la relecture', () => {
    const catalogues = vi.spyOn(donnees, 'useCatalogues')
    const ecran = renderToStaticMarkup(<App />)

    expect(ecran).toContain('Lecture des données enregistrées')
    expect(catalogues).toHaveBeenCalled()
    catalogues.mockRestore()
  })
})

describe('T-0296 — l’index de Panorama n’est construit qu’en Panorama', () => {
  function SondeParametres() {
    const parametres = useParametresFile({
      mode: etatSeance().mode,
      seance: etatSeance(),
      materiel: undefined,
    })
    return <p>{parametres.current === null ? 'aucun' : 'des paramètres'}</p>
  }

  it('la passe de filé indexe un catalogue une seule fois, quel que soit le nombre d’images', () => {
    vi.mocked(construitIndex).mockClear()
    const premiere = indexFile(ETOILES)
    expect(premiere.indexReel.nombreEtoiles).toBe(ETOILES.length)
    expect(indexFile(ETOILES)).toEqual(premiere)
    // Real catalogue then semis: two builds, none at next frame.
    expect(construitIndex).toHaveBeenCalledTimes(2)
  })

  it('le mode Ciel profond de la séance n’indexe rien du tout', () => {
    expect(etatSeance().mode).toBe('CIEL_PROFOND')
    vi.mocked(construitIndex).mockClear()
    expect(renderToStaticMarkup(<SondeParametres />)).toContain('aucun')
    expect(construitIndex).not.toHaveBeenCalled()
  })
})
