/**
 * §8.2 — Créneau d'observation par cible.
 *
 * Les valeurs de hauteur viennent de l'Annexe A, site 46,391° N. La règle produit vérifiée
 * en priorité : une cible écartée nomme toujours sa cause, et le relief est nommé comme
 * relief — jamais confondu avec un simple manque de hauteur.
 */

import { describe, expect, it } from 'vitest'
import { creneauCible } from '../src/core/creneaux.ts'
import { fenetreNocturne } from '../src/core/nuit.ts'
import {
  masqueDepuisPoints,
  masqueDepuisRelief,
  masquePlat,
  NB_AZIMUTS,
  obstructionDeg,
} from '../src/core/site.ts'
import { SITE_REFERENCE } from './fixtures.ts'

const NUIT = fenetreNocturne(SITE_REFERENCE, new Date('2026-08-14T12:00:00Z'))
const FENETRE = { debut: NUIT.debutNuitAstronomique!, fin: NUIT.finNuitAstronomique! }

/** Dentelles du Cygne : δ = +31°, culmination annoncée à 74,6° depuis ce site. */
const DENTELLES = { adH: 20.75, decDeg: 31 }

describe('hauteur et créneau §8.2', () => {
  it('retrouve la hauteur de culmination de 74,6° à δ = +31°', () => {
    const creneau = creneauCible({
      site: SITE_REFERENCE,
      ...DENTELLES,
      fenetre: FENETRE,
      masque: masquePlat(),
      typeMonture: 'TRACKER',
    })
    expect(creneau.altCulminationDeg.value).toBeCloseTo(74.6, 1)
    expect(creneau.causeExclusion).toBeUndefined()
    // Une nuit d'août dure 5 h 49 : la cible passe au-dessus de 30° sur une large part.
    expect(creneau.dureeTotaleMin.value).toBeGreaterThan(180)
  })

  it('exclut δ = −24° avec la cause HAUTEUR et la latitude qui la rendrait accessible', () => {
    const creneau = creneauCible({
      site: SITE_REFERENCE,
      adH: 16.5,
      decDeg: -24,
      fenetre: FENETRE,
      masque: masquePlat(),
      typeMonture: 'TRACKER',
    })
    expect(creneau.altCulminationDeg.value).toBeCloseTo(19.6, 1)
    expect(creneau.causeExclusion).toBe('HAUTEUR')
    expect(creneau.latitudeAccessibleDeg).toBeCloseTo(36, 1)
    expect(creneau.message).toMatch(/trop basse/)
  })

  it('nomme le relief, et non la hauteur, quand c’est le masque qui bloque', () => {
    // Masque à 22° entre les azimuts 150 et 210 : la cible culmine à 19,6°, au sud.
    const altitudes = Array.from({ length: NB_AZIMUTS }, (_, azimut) =>
      azimut >= 150 && azimut <= 210 ? 22 : 0,
    )
    const creneau = creneauCible({
      site: SITE_REFERENCE,
      // Ascension droite choisie pour que la cible passe au méridien pendant la nuit.
      adH: 22,
      decDeg: -24,
      fenetre: FENETRE,
      masque: masqueDepuisRelief(altitudes),
      // Seuil abaissé : sans cela, la hauteur exclurait la cible avant le relief.
      seuilHauteurDeg: 15,
      typeMonture: 'TRACKER',
    })
    expect(creneau.causeExclusion).toBe('RELIEF')
    expect(creneau.message).toMatch(/relief/)
    expect(creneau.message).toMatch(/Cachée par le relief/)
  })

  it('§8.1 — un relief saisi à 22° dans l’azimut 165 écarte une cible culminant à 19°', () => {
    // La déclinaison se déduit de la latitude pour que la culmination tombe à 19° pile :
    // recopier une déclinaison ferait dépendre le test d'un site qu'il ne déclare pas.
    const culminationVoulueDeg = 19
    const decDeg = SITE_REFERENCE.latitudeDeg - (90 - culminationVoulueDeg)
    // Le relief relevé à la main : une crête à 22° du sud-sud-est au sud-sud-ouest.
    const masque = masqueDepuisPoints([
      { azimutDeg: 149, altitudeDeg: 0 },
      { azimutDeg: 150, altitudeDeg: 22 },
      { azimutDeg: 210, altitudeDeg: 22 },
      { azimutDeg: 211, altitudeDeg: 0 },
    ])
    expect(obstructionDeg(masque, 165)).toBe(22)

    const creneau = creneauCible({
      site: SITE_REFERENCE,
      adH: 22,
      decDeg,
      fenetre: FENETRE,
      masque,
      // Seuil abaissé sous la culmination : sans cela, la hauteur trancherait avant le relief.
      seuilHauteurDeg: 15,
      typeMonture: 'TRACKER',
    })

    expect(creneau.altCulminationDeg.value).toBeCloseTo(culminationVoulueDeg, 6)
    expect(creneau.causeExclusion).toBe('RELIEF')
    expect(creneau.causeExclusion).not.toBe('HAUTEUR')
    expect(creneau.dureeTotaleMin.value).toBe(0)
    // §10.2 — l'explication nomme l'azimut bloquant et son altitude d'obstruction.
    expect(creneau.message).toMatch(/22° de haut vers l’azimut \d+°/)
  })

  it('déclare une cible qui ne se lève jamais depuis ce site', () => {
    const creneau = creneauCible({
      site: SITE_REFERENCE,
      adH: 12,
      decDeg: -70,
      fenetre: FENETRE,
      masque: masquePlat(),
      typeMonture: 'TRACKER',
    })
    expect(creneau.causeExclusion).toBe('JAMAIS_LEVE')
    expect(creneau.message).toMatch(/ne se lève jamais/)
  })

  it('reconnaît une cible circumpolaire, bornée par la nuit et non par un coucher', () => {
    const creneau = creneauCible({
      site: SITE_REFERENCE,
      adH: 2.5,
      decDeg: 60,
      fenetre: FENETRE,
      masque: masquePlat(),
      typeMonture: 'TRACKER',
    })
    expect(creneau.circumpolaire).toBe(true)
    expect(creneau.altCulminationDeg.value).toBeCloseTo(76.4, 1)
    expect(creneau.causeExclusion).toBeUndefined()
  })
})

describe('retournement au méridien §8.2', () => {
  it('scinde le créneau en deux sur une équatoriale allemande', () => {
    const gem = creneauCible({
      site: SITE_REFERENCE,
      ...DENTELLES,
      fenetre: FENETRE,
      masque: masquePlat(),
      typeMonture: 'GEM',
    })
    expect(gem.heureCulmination).not.toBeNull()
    expect(gem.creneaux.length).toBe(2)
    expect(gem.creneaux[1]?.apresRetournement).toBe(true)
    expect(gem.retournementMeridien).toBe(true)
    expect(gem.message).toMatch(/Retournement au méridien/)
  })

  it('ne scinde rien sur une monture sans retournement', () => {
    const tracker = creneauCible({
      site: SITE_REFERENCE,
      ...DENTELLES,
      fenetre: FENETRE,
      masque: masquePlat(),
      typeMonture: 'TRACKER',
    })
    expect(tracker.creneaux.length).toBe(1)
    expect(tracker.retournementMeridien).toBe(false)
  })
})
