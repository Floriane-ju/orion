/**
 * T-0195 — §5.2 : sans suivi, la liste par défaut ne se contente pas d'être vide.
 *
 * Une liste vide muette envoie chercher le levier dans les filtres — type, magnitude — alors
 * que le levier est le toggle de suivi. Le panneau doit donc porter la phrase du moteur.
 *
 * T-0280 — dire la cause ne suffisait pas : la phrase ne nomme pas le champ qui la lève, et
 * ce champ était le dernier d'un corps de carte qui défile. §1.5.1 veut un plan en moins de
 * deux minutes ; on vérifie donc les deux issues offertes, et que la monture s'atteigne sans
 * défiler dès que la carte s'ouvre.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App.tsx'
import { majCatalogue, reinitialiseCatalogue } from '../src/ui/catalogue-etat.ts'
import { reinitialiseScene } from '../src/ui/scene-etat.ts'
import { reinitialiseSeance } from '../src/ui/seance-etat.ts'
import { ouvreCarte, reinitialiseCoque } from '../src/ui/coque-etat.ts'
import { GLOSSAIRE } from '../src/registry/glossaire.ts'

// T-0297 — ce fichier teste la liste d'un catalogue ARRIVÉ (vide sous le rendu serveur) : sans
// ce drapeau, la liste dirait seulement que le catalogue est en route.
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

/** Le corps de la carte Boîtier dépliée, dans l'ordre où il se lit. */
function corpsBoitier(): string {
  ouvreCarte('BOITIER')
  const html = renderToStaticMarkup(<App />)
  const debut = html.indexOf('class="carte-corps"')
  expect(debut).toBeGreaterThan(-1)
  return html.slice(debut)
}

afterEach(() => {
  reinitialiseCatalogue()
  reinitialiseScene()
  reinitialiseSeance()
  reinitialiseCoque()
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
