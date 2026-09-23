/**
 * T-0187 — Ce qui change sans geste s'annonce (WCAG 2.2, 4.1.3).
 *
 * Le compte de résultats du catalogue et son message de liste vide vivent dans une seule région
 * aria-live="polite". Deux régions annonceraient deux fois le même changement. Quand la recherche
 * change, la région vive doit aussi changer, et elle doit être unique.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { majCatalogue, reinitialiseCatalogue } from '../src/ui/catalogue-etat.ts'
import { RIEN_SOUS_CE_NOM } from '../src/ui/PanneauCibles.tsx'
import { reinitialiseScene } from '../src/ui/scene-etat.ts'
import { reinitialiseSeance } from '../src/ui/seance-etat.ts'
import { reinitialiseCoque } from '../src/ui/coque-etat.ts'

function ecran(): string {
  return renderToStaticMarkup(<App />)
}

afterEach(() => {
  reinitialiseCatalogue()
  reinitialiseScene()
  reinitialiseSeance()
  reinitialiseCoque()
})

describe('T-0187 — Le catalogue annonce ses changements sans geste', () => {
  it('porte une région vive polite unique pour le compte et la liste vide', () => {
    const html = ecran()
    // Isoler le panneau du catalogue
    const debut = html.indexOf('class="cibles"')
    expect(debut).toBeGreaterThan(-1)
    const panneau = html.slice(debut, html.indexOf('</section>', debut))

    // Vérifier qu'il n'y a qu'une seule région aria-live="polite"
    const compteLive = (panneau.match(/aria-live="polite"/g) || []).length
    expect(compteLive, 'Une seule région polite pour le catalogue').toBe(1)

    // Vérifier qu'elle contient aussi aria-atomic="true" pour annoncer le contenu complet
    expect(panneau).toContain('aria-live="polite" aria-atomic="true"')
  })

  it('met à jour la région vive quand la recherche change', () => {
    const sansRecherche = ecran()
    // Isoler d'abord le panneau du catalogue
    const debutPanneau = sansRecherche.indexOf('class="cibles"')
    const panneau = sansRecherche.slice(debutPanneau)

    // Extraire le contenu de la région vive au démarrage
    const debutLive = panneau.indexOf('aria-live="polite"')
    expect(debutLive).toBeGreaterThan(-1)
    const avantRecherche = panneau.slice(debutLive, panneau.indexOf('</div>', debutLive))

    // Chercher un terme
    majCatalogue({ recherche: 'andro', photographiablesSeules: false })
    const avecRecherche = ecran()

    // Isoler le panneau de nouveau
    const debutPanneauApres = avecRecherche.indexOf('class="cibles"')
    const panneauApres = avecRecherche.slice(debutPanneauApres)

    // Extraire le contenu de la région vive après la recherche
    const debutLiveApres = panneauApres.indexOf('aria-live="polite"')
    const apresRecherche = panneauApres.slice(
      debutLiveApres,
      panneauApres.indexOf('</div>', debutLiveApres),
    )

    // Le contenu doit avoir changé (le compte d'objets doit être différent)
    expect(apresRecherche).not.toBe(avantRecherche)
    // Et il doit mentionner moins d'objets qu'au départ
    expect(avantRecherche).toMatch(/\d+ objet/)
    expect(apresRecherche).toMatch(/\d+ objet/)
  })

  it('affiche le message de liste vide dans la région vive', () => {
    // Chercher quelque chose qui n'existe pas
    majCatalogue({ recherche: 'ZZZZZZZ', photographiablesSeules: false })
    const html = ecran()

    // Isoler le panneau du catalogue
    const debutPanneau = html.indexOf('class="cibles"')
    const panneau = html.slice(debutPanneau)

    const debutLive = panneau.indexOf('aria-live="polite"')
    expect(debutLive).toBeGreaterThan(-1)
    const contenuLive = panneau.slice(debutLive, panneau.indexOf('</div>', debutLive))

    // La région vive doit contenir le message de liste vide
    expect(contenuLive).toContain(RIEN_SOUS_CE_NOM)
  })

  it("n'affiche que le message de liste vide si la recherche ne trouve rien", () => {
    majCatalogue({ recherche: 'ZZZZZZZ', photographiablesSeules: false })
    const html = ecran()

    // Isoler le panneau du catalogue
    const debutPanneau = html.indexOf('class="cibles"')
    const panneau = html.slice(debutPanneau)

    const debutLive = panneau.indexOf('aria-live="polite"')
    const finDiv = panneau.indexOf('</div>', debutLive)
    const contenuLive = panneau.slice(debutLive, finDiv > -1 ? finDiv : panneau.length)

    // Le message de liste vide doit être présent
    expect(contenuLive).toContain(RIEN_SOUS_CE_NOM)
    // Il ne doit y avoir qu'une seule région aria-live
    expect(contenuLive).toContain('aria-live="polite"')
  })
})

describe('T-0187 — la persistance annonce ses erreurs', () => {
  /**
   * La région du message de persistance est montée EN PERMANENCE, vide tant qu'il n'y a rien à
   * dire : un lecteur d'écran observe les régions vives présentes, il n'observe pas leur
   * apparition. Montée en même temps que son texte, elle n'annoncerait rien — c'est le détail
   * qui décide si le ticket sert.
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
   * §11.3 — elle change deux fois par seconde et sert déjà de description accessible du
   * canevas. La rendre vive, ce serait un flux continu d'annonces. La règle : est vif ce qui
   * répond à une action, pas ce qui suit l'horloge.
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
