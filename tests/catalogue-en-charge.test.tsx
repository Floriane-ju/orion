/**
 * T-0297 — pendant le chargement, l'interface dit qu'elle charge.
 *
 * Sous le rendu serveur, aucun effet ne part : `useCatalogues` reste dans son état initial,
 * exactement celui de la première seconde d'un vrai démarrage — catalogues pas encore décodés.
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
import { reinitialiseCoque } from '../src/ui/coque-etat.ts'

afterEach(() => {
  reinitialiseCatalogue()
  reinitialiseScene()
  reinitialiseSeance()
  reinitialiseCoque()
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
