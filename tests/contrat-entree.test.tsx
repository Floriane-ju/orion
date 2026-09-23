/**
 * Livrable vérifiable du Lot 1 : un lieu et un matériel saisis produisent, À L'ÉCRAN, le
 * champ, la pose maximale et les seuils de déclinaison du site.
 *
 * Le rendu statique suffit : il n'y a rien à cliquer pour que le contrat d'entrée produise
 * ses sorties, et c'est précisément ce qu'on vérifie. Les variantes qui demandent une
 * interaction — recadrage APS-C, suivi actif — sont couvertes sur leurs moteurs.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { GLOSSAIRE } from '../src/registry/glossaire.ts'
import { TABLE_FORMATS_CAPTEUR } from '../src/registry/capteur-formats.ts'
import { LIBELLE_ZP_SOURCE } from '../src/registry/libelles.ts'
import { libelleFlag } from '../src/registry/libelles.ts'
import { ouvreCarte } from '../src/ui/coque-etat.ts'

// Les cartes du site et du matériel démarrent repliées : le contrat d'entrée porte sur ce qu'elles
// affichent, pas sur leur repli — on les déplie avant de lire l'écran.
ouvreCarte('SITE')
ouvreCarte('BOITIER')
ouvreCarte('OPTIQUE')

const ecran = renderToStaticMarkup(<App />)

describe('contrat d’entrée — écran par défaut, setup de l’Annexe A', () => {
  it('affiche le champ du profil de référence', () => {
    // 17,01° × 11,37° : l'Annexe A annonce 17,02 × 11,38, arrondis d'un intermédiaire.
    expect(ecran).toContain('17.01')
    expect(ecran).toContain('11.37')
  })

  it('affiche la pose maximale sans suivi', () => {
    expect(ecran).toContain('2.09')
  })

  it('affiche les seuils de déclinaison du site', () => {
    expect(ecran).toContain('-13.6')
    expect(ecran).toContain('-23.6')
    expect(ecran).toContain('43.6')
  })

  it('n’affiche aucun avertissement pour un grand champ assumé', () => {
    expect(ecran).not.toContain('Sur-échantillonné')
    expect(ecran).not.toContain('Grand champ assumé')
  })

  it('affiche le masque plat comme une hypothèse, pas comme une mesure', () => {
    expect(ecran).toContain(libelleFlag('HYP'))
    expect(ecran).toContain('horizon plat')
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

  // T-0275 — c'est la VALEUR de zp_source que §7.1 veut à l'écran, et elle s'y lit en clair.
  it('affiche la source du point zéro et l’ISO retenu là où une pose est affichée (§7.1, §7.2)', () => {
    expect(ecran).toContain(LIBELLE_ZP_SOURCE.GENERIQUE)
    expect(ecran).toContain(GLOSSAIRE.iso_recommande.libelle)
    expect(ecran).toMatch(/ISO \d+/)
  })

  it('glose chaque terme technique au contact', () => {
    // "champ" n'en fait plus partie : sa bulle a été retirée (T-0225), le libellé seul suffit.
    for (const cle of ['npf', 'masque_horizon'] as const) {
      expect(ecran, cle).toContain(GLOSSAIRE[cle].glose)
    }
  })
})
