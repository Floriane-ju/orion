/**
 * T-0187 — what changes without a gesture is announced (WCAG 2.2, 4.1.3). Catalogue result count
 * + empty-list message live in ONE aria-live="polite" region (two = same change announced
 * twice). On search change the live region must change too, and be unique.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App.tsx'
import { majCatalogue, reinitialiseCatalogue } from '../src/ui/catalogue-etat.ts'
import { RIEN_SOUS_CE_NOM } from '../src/ui/PanneauCibles.tsx'
import { reinitialiseScene } from '../src/ui/scene-etat.ts'
import { reinitialiseSeance } from '../src/ui/seance-etat.ts'

// T-0297 — tests a catalogue that ARRIVED (empty under SSR): without flag, list would only say
// catalogue is on its way.
vi.mock('../src/ui/app-donnees.ts', async (importeReel) => {
  const reel = await importeReel<typeof import('../src/ui/app-donnees.ts')>()
  return { ...reel, useCatalogues: () => ({ ...reel.useCatalogues(), enCharge: false }) }
})

function ecran(): string {
  return renderToStaticMarkup(<App />)
}

afterEach(() => {
  reinitialiseCatalogue()
  reinitialiseScene()
  reinitialiseSeance()
})

describe('T-0187 — Le catalogue annonce ses changements sans geste', () => {
  it('porte une région vive polite unique pour le compte et la liste vide', () => {
    const html = ecran()
    const debut = html.indexOf('class="cibles"')
    expect(debut).toBeGreaterThan(-1)
    const panneau = html.slice(debut, html.indexOf('</section>', debut))

    const compteLive = (panneau.match(/aria-live="polite"/g) || []).length
    expect(compteLive, 'Une seule région polite pour le catalogue').toBe(1)

    expect(panneau).toContain('aria-live="polite" aria-atomic="true"')
  })

  it('met à jour la région vive quand la recherche change', () => {
    const sansRecherche = ecran()
    const debutPanneau = sansRecherche.indexOf('class="cibles"')
    const panneau = sansRecherche.slice(debutPanneau)

    const debutLive = panneau.indexOf('aria-live="polite"')
    expect(debutLive).toBeGreaterThan(-1)
    const avantRecherche = panneau.slice(debutLive, panneau.indexOf('</div>', debutLive))

    majCatalogue({ recherche: 'andro', photographiablesSeules: false })
    const avecRecherche = ecran()

    const debutPanneauApres = avecRecherche.indexOf('class="cibles"')
    const panneauApres = avecRecherche.slice(debutPanneauApres)

    const debutLiveApres = panneauApres.indexOf('aria-live="polite"')
    const apresRecherche = panneauApres.slice(
      debutLiveApres,
      panneauApres.indexOf('</div>', debutLiveApres),
    )

    expect(apresRecherche).not.toBe(avantRecherche)
    expect(avantRecherche).toMatch(/\d+ objet/)
    expect(apresRecherche).toMatch(/\d+ objet/)
  })

  it('affiche le message de liste vide dans la région vive', () => {
    majCatalogue({ recherche: 'ZZZZZZZ', photographiablesSeules: false })
    const html = ecran()

    const debutPanneau = html.indexOf('class="cibles"')
    const panneau = html.slice(debutPanneau)

    const debutLive = panneau.indexOf('aria-live="polite"')
    expect(debutLive).toBeGreaterThan(-1)
    const contenuLive = panneau.slice(debutLive, panneau.indexOf('</div>', debutLive))

    expect(contenuLive).toContain(RIEN_SOUS_CE_NOM)
  })

  it("n'affiche que le message de liste vide si la recherche ne trouve rien", () => {
    majCatalogue({ recherche: 'ZZZZZZZ', photographiablesSeules: false })
    const html = ecran()

    const debutPanneau = html.indexOf('class="cibles"')
    const panneau = html.slice(debutPanneau)

    const debutLive = panneau.indexOf('aria-live="polite"')
    const finDiv = panneau.indexOf('</div>', debutLive)
    const contenuLive = panneau.slice(debutLive, finDiv > -1 ? finDiv : panneau.length)

    expect(contenuLive).toContain(RIEN_SOUS_CE_NOM)
    expect(contenuLive).toContain('aria-live="polite"')
  })
})

describe('T-0187 — la persistance annonce ses erreurs', () => {
  /**
   * Persistence message region mounted PERMANENTLY, empty when nothing to say: screen readers
   * watch present live regions, not appearances. Mounted with its text = announces nothing —
   * the detail deciding whether the ticket works.
   */
  const verification = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'Verification.tsx'), 'utf8')

  it('monte la région du message avant d’avoir un message à y mettre', () => {
    expect(verification).not.toContain('props.messagePersistance !== null &&')
    expect(verification).toContain('{props.messagePersistance}')
  })

  it('donne l’urgence à l’échec, la politesse au succès', () => {
    expect(verification).toContain("role={props.echecPersistance ? 'alert' : 'status'}")
    expect(verification).toContain("aria-live={props.echecPersistance ? 'assertive' : 'polite'}")
  })
})

describe('T-0187 — la ligne de visée n’est pas vive', () => {
  /**
   * §11.3 — changes 2×/s, already canvas accessible description. Live = continuous announcement
   * flow. Rule: live answers an action, doesn't follow the clock.
   */
  it('la phrase de visée ne porte aucune région vive', () => {
    const racine = join(import.meta.dirname, '..', 'src', 'ui')
    for (const fichier of ['Visee.tsx', 'scene-lecture.ts']) {
      const source = readFileSync(join(racine, fichier), 'utf8')
      expect(source, fichier).not.toContain('aria-live')
      expect(source, fichier).not.toContain('role="status"')
    }
  })
})
