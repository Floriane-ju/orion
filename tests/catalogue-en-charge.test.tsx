/**
 * T-0297 — while loading, UI says it loads. Under SSR no effect runs: `useCatalogues` stays in
 * initial state = a real start's first second (catalogues not yet decoded).
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { INDEX_VIDE } from '../src/core/index-ciel.ts'
import { etatProfondeur } from '../src/core/projection.ts'
import { CATALOGUE_EN_CHARGE } from '../src/ui/PanneauCibles.tsx'
import { ETOILES_EN_CHARGE } from '../src/ui/Planetarium.tsx'
import { reinitialiseCatalogue } from '../src/ui/catalogue-etat.ts'
import { etatScene, reinitialiseScene } from '../src/ui/scene-etat.ts'
import { reinitialiseSeance } from '../src/ui/seance-etat.ts'

afterEach(() => {
  reinitialiseCatalogue()
  reinitialiseScene()
  reinitialiseSeance()
})

describe('T-0297 — catalogue en cours', () => {
  it('la liste dit que le catalogue arrive, sans compte ni « aucun objet »', () => {
    const html = renderToStaticMarkup(<App />)
    const debut = html.indexOf('class="cibles"')
    expect(debut).toBeGreaterThan(-1)
    const vive = html.indexOf('aria-live="polite"', debut)
    const liste = html.slice(vive, html.indexOf('</section>', vive))
    expect(liste).toContain(CATALOGUE_EN_CHARGE)
    expect(liste).not.toMatch(/\b0 objet/)
    expect(liste).not.toContain('Aucun objet ne passe ces filtres')
  })

  it('la scène dit que les étoiles arrivent', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain(ETOILES_EN_CHARGE)
  })

  it('un index vide ne déclare pas de catalogue épuisé', () => {
    const profondeur = etatProfondeur(etatScene().vue.fovDeg, INDEX_VIDE.profondeurMag, null, true)
    expect(profondeur.catalogueEpuise).toBe(false)
    expect(profondeur.cause).toBeUndefined()
  })
})
