/**
 * Lot 1 deliverable: a lieu + matériel entered yield, ON SCREEN, the site's champ, pose
 * maximale, declination thresholds. Static render suffices (nothing to click); variants
 * needing interaction (APS-C reframing, suivi active) covered on their engines.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { GLOSSAIRE } from '../src/registry/glossaire.ts'
import { TABLE_FORMATS_CAPTEUR } from '../src/registry/capteur-formats.ts'
import { LIBELLE_ZP_SOURCE } from '../src/registry/libelles.ts'

// T-0437 — site and matériel menus mount content closed: the screen carries it.
const ecran = renderToStaticMarkup(<App />)

// T-0404 — champ, pose maximale sans suivi left Optique card (user request; card = parc +
// réglage only). Values checked on engines (optics.test.ts, suivi.test.ts).
describe('contrat d’entrée — écran par défaut, setup de l’Annexe A', () => {
  it('affiche les seuils de déclinaison du site', () => {
    expect(ecran).toContain('-13,6')
    expect(ecran).toContain('-23,6')
    expect(ecran).toContain('43,6')
  })

  it('n’affiche aucun avertissement pour un grand champ assumé', () => {
    expect(ecran).not.toContain('Sur-échantillonné')
    expect(ecran).not.toContain('Grand champ assumé')
  })

  it('signale, en informatif, que la pose sans suivi reste courte', () => {
    expect(ecran).toMatch(/Sans suivi, les poses restent courtes\./)
    expect(ecran).toMatch(/<p class="etat">Sans suivi/)
  })

  it('offre le choix du type de capteur, sans sélection de boîtier (§5.1)', () => {
    for (const format of TABLE_FORMATS_CAPTEUR) {
      expect(ecran).toContain(`value="${format.format}"`)
    }
  })

  // T-0275 — VALUE of zp_source is what §7.1 wants on screen, in clear.
  it('affiche la source du point zéro et l’ISO retenu là où une pose est affichée (§7.1, §7.2)', () => {
    expect(ecran).toContain(LIBELLE_ZP_SOURCE.GENERIQUE)
    expect(ecran).toContain(GLOSSAIRE.iso_recommande.libelle)
    expect(ecran).toMatch(/ISO \d+/)
  })

})
