/**
 * T-0296 — ce que le fil principal ne fait plus au démarrage.
 *
 * Deux propriétés que seule la coque peut montrer :
 *
 *   - les catalogues partent PENDANT la relecture de la saisie. `useCatalogues` est appelé
 *     au-dessus de l'attente, donc son effet est planifié par le premier rendu, celui qui
 *     affiche « Lecture des données enregistrées… », et non par le rendu d'après.
 *   - en mode Ciel profond, l'index de l'aperçu Panorama n'est pas construit. Il l'était au
 *     démarrage, pour un aperçu que personne n'avait ouvert.
 *
 * `fake-indexeddb` sert à tenir la relecture en suspens : sans base, la saisie n'a rien à
 * restaurer et la coque passerait directement à l'écran complet.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { App } from '../src/App.tsx'
import type { Etoile } from '../src/data/catalog.ts'
import { useIndexReel, useParametresFile } from '../src/ui/planetarium-panorama.ts'
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
  /** Une sonde : elle ne fait qu'appeler le crochet et publier ce qu'il rend. */
  function Sonde({ actif }: { readonly actif: boolean }) {
    return <p>{useIndexReel(ETOILES, actif).nombreEtoiles}</p>
  }

  function SondeParametres({ etoiles }: { readonly etoiles: readonly Etoile[] }) {
    const parametres = useParametresFile({
      etoiles,
      mode: etatSeance().mode,
      file: etatSeance().file,
      materiel: undefined,
    })
    return <p>{parametres.current === null ? 'aucun' : 'des paramètres'}</p>
  }

  it('hors Panorama, aucune indexation et un index vide', () => {
    vi.mocked(construitIndex).mockClear()
    expect(renderToStaticMarkup(<Sonde actif={false} />)).toContain('0')
    expect(construitIndex).not.toHaveBeenCalled()
  })

  it('en Panorama, le catalogue est bien indexé', () => {
    vi.mocked(construitIndex).mockClear()
    expect(renderToStaticMarkup(<Sonde actif />)).toContain(String(ETOILES.length))
    expect(construitIndex).toHaveBeenCalledOnce()
  })

  it('le mode Ciel profond de la séance n’indexe rien du tout', () => {
    expect(etatSeance().mode).toBe('CIEL_PROFOND')
    vi.mocked(construitIndex).mockClear()
    expect(renderToStaticMarkup(<SondeParametres etoiles={ETOILES} />)).toContain('aucun')
    expect(construitIndex).not.toHaveBeenCalled()
  })
})
