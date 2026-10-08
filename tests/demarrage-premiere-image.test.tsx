/**
 * T-0296 — ce que le fil principal ne fait plus au démarrage.
 *
 * Deux propriétés que seule la coque peut montrer :
 *
 *   - les catalogues partent PENDANT la relecture de la saisie. `useCatalogues` est appelé
 *     au-dessus de l'attente, donc son effet est planifié par le premier rendu, celui qui
 *     affiche « Lecture des données enregistrées… », et non par le rendu d'après.
 *   - en mode Ciel profond, l'index de l'aperçu Panorama n'est pas construit. Il l'était au
 *     démarrage, pour un aperçu que personne n'avait ouvert. T-0398 : il ne l'est plus du tout
 *     dans un rendu React — il se construit là où la passe de filé peint (`file-index.ts`).
 *
 * `fake-indexeddb` sert à tenir la relecture en suspens : sans base, la saisie n'a rien à
 * restaurer et la coque passerait directement à l'écran complet.
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

/** Un catalogue minimal : ce qui compte ici est qu'on l'indexe ou qu'on ne l'indexe pas. */
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
    // Le catalogue réel, puis le semis : deux constructions, et aucune à l'image suivante.
    expect(construitIndex).toHaveBeenCalledTimes(2)
  })

  it('le mode Ciel profond de la séance n’indexe rien du tout', () => {
    expect(etatSeance().mode).toBe('CIEL_PROFOND')
    vi.mocked(construitIndex).mockClear()
    expect(renderToStaticMarkup(<SondeParametres />)).toContain('aucun')
    expect(construitIndex).not.toHaveBeenCalled()
  })
})
