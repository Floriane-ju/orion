/**
 * T-0195 — §5.2: without suivi, default list does more than sit empty. Mute empty list sends one
 * hunting the lever in filters (type, magnitude) while the lever is the suivi toggle. Panel
 * must carry the engine's sentence.
 * T-0280 — stating the cause wasn't enough: sentence doesn't name the field that lifts it, last
 * in a scrolling card body. §1.5.1 wants a plan in <2 min → check both offered exits, and mount
 * reachable without scrolling once card opens.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App.tsx'
import { majCatalogue, reinitialiseCatalogue } from '../src/ui/catalogue-etat.ts'
import { reinitialiseScene } from '../src/ui/scene-etat.ts'
import { reinitialiseSeance } from '../src/ui/seance-etat.ts'
import { GLOSSAIRE } from '../src/registry/glossaire.ts'

// T-0297 — tests a catalogue that ARRIVED (empty under SSR): without flag, list would only say
// catalogue is on its way.
vi.mock('../src/ui/app-donnees.ts', async (importeReel) => {
  const reel = await importeReel<typeof import('../src/ui/app-donnees.ts')>()
  return { ...reel, useCatalogues: () => ({ ...reel.useCatalogues(), enCharge: false }) }
})

function panneauCibles(): string {
  const html = renderToStaticMarkup(<App />)
  const debut = html.indexOf('class="cibles"')
  expect(debut).toBeGreaterThan(-1)
  return html.slice(debut, html.indexOf('</section>', debut))
}

/** Boîtier menu, in reading order. */
function corpsBoitier(): string {
  const html = renderToStaticMarkup(<App />)
  const debut = html.indexOf('tiroir-boitier')
  expect(debut).toBeGreaterThan(-1)
  return html.slice(debut)
}

afterEach(() => {
  reinitialiseCatalogue()
  reinitialiseScene()
  reinitialiseSeance()
})

describe('T-0195 — la liste par défaut dit pourquoi elle est vide', () => {
  it('nomme le suivi, pas les filtres, quand le domaine est verrouillé', () => {
    const panneau = panneauCibles()
    expect(panneau).toContain('trop courtes pour le ciel profond')
    expect(panneau).not.toContain('Aucun objet ne passe ces filtres')
  })
})

describe('T-0280 — la liste vide propose une action', () => {
  it('offre la monture et le grand champ sur un profil neuf', () => {
    const panneau = panneauCibles()
    expect(panneau).toContain('Choisir une monture')
    expect(panneau).toContain('Passer en Panorama')
  })

  it('garde les issues hors de la région vive du compte', () => {
    const panneau = panneauCibles()
    const vive = panneau.indexOf('aria-live')
    const issues = panneau.indexOf('cibles-issues')
    expect(vive).toBeGreaterThan(-1)
    expect(issues).toBeGreaterThan(-1)
    expect(panneau.slice(vive, issues)).toContain('</div>')
  })

  it('les retire dès que la liste porte des objets', () => {
    majCatalogue({ photographiablesSeules: false })
    const panneau = panneauCibles()
    expect(panneau).not.toContain('cibles-issues')
  })

  it('met la monture en tête de la carte Boîtier, avant le boîtier lui-même', () => {
    const corps = corpsBoitier()
    const monture = corps.indexOf(GLOSSAIRE.type_monture.libelle)
    const boitier = corps.indexOf(GLOSSAIRE.mon_boitier.libelle)
    expect(monture).toBeGreaterThan(-1)
    expect(boitier).toBeGreaterThan(-1)
    expect(monture).toBeLessThan(boitier)
  })
})
