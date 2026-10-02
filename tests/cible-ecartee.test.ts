/**
 * T-0379, T-0380 — les leviers d'une cible écartée.
 *
 * Aucune focale ni date attendue n'est écrite : chaque levier est vérifié en le RÉINJECTANT
 * dans le moteur qui avait écarté la cible. Une focale juste remet la cible dans les bornes ;
 * une nuit juste a un créneau, et celle d'avant n'en a pas.
 */

import { Body, Equator } from 'astronomy-engine'
import { describe, expect, it } from 'vitest'
import { exclusionCreneau, focaleRequise, prochainCreneau } from '../src/core/cible-ecartee.ts'
import { creneauCible } from '../src/core/creneaux.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { fovDeg } from '../src/core/optics.ts'
import { bornesTailleCadre, entreeCreneau } from '../src/core/session-candidates.ts'
import type { ContexteSession } from '../src/core/session.ts'
import { masquePlat } from '../src/core/site.ts'
import { observateur } from '../src/core/ephem.ts'
import { DEG_PAR_HEURE } from '../src/core/unites.ts'
import { MS_PAR_JOUR } from '../src/core/horloges.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import type { EtatCible } from '../src/core/cibles-liste.ts'
import { causesCarte, HORS_SAISON, NON_PHOTOGRAPHIABLE_ICI } from '../src/ui/CibleImpossible.tsx'
import { objetNebuleuse as objet, SITE_REFERENCE as SITE } from './fixtures.ts'

const NUIT = fenetreNocturne(SITE, new Date('2026-08-14T12:00:00Z'))

/** Setup ciel profond de l'Annexe A : 120 mm f/2,8 sur plein format. */
const CONTEXTE: ContexteSession = {
  site: SITE,
  nuit: NUIT,
  fenetreUtile: fenetreUtile(SITE, NUIT),
  masque: masquePlat(),
  fovHDeg: fovDeg(23.9, 120).value,
  echApx: 8.8,
  dMm: 42.9,
  capteurHMm: 23.9,
  pitchUm: 5.12,
  ouvertureN: 2.8,
  zpSys: 20.2,
  zpEstime: true,
  readNoiseE: 1.5,
  tailleRawMo: 33,
  isoSession: 640,
  sbCielNoir: 20.95,
  mLimOeil: 6.05,
  tMaxS: 200,
  domaineCpFerme: null,
  snrCible: 10,
  typeMonture: 'TRACKER',
}

const BORNES = bornesTailleCadre(CONTEXTE.fovHDeg)

/** Les bornes que donnerait une autre focale sur le même capteur. */
function bornesA(focaleMm: number) {
  return bornesTailleCadre(fovDeg(CONTEXTE.capteurHMm, focaleMm).value)
}

describe('T-0379 — la focale qu’il faudrait', () => {
  it('ne propose rien à une cible déjà dans les bornes', () => {
    const taille = (BORNES.minArcmin + BORNES.maxArcmin) / 2
    expect(focaleRequise(CONTEXTE, objet({ majAxArcmin: taille }))).toBeNull()
  })

  it('trop petite : la focale annoncée place la cible sur la borne basse', () => {
    const taille = BORNES.minArcmin / 3
    const r = focaleRequise(CONTEXTE, objet({ majAxArcmin: taille }))
    expect(r?.sens).toBe('AU_MOINS')
    if (r?.sens !== 'AU_MOINS') return
    expect(bornesA(r.focaleMm).minArcmin).toBeCloseTo(taille, 6)
  })

  it('trop grande : la focale annoncée fait tenir la cible dans le petit côté', () => {
    const taille = BORNES.maxArcmin * 2
    const r = focaleRequise(CONTEXTE, objet({ majAxArcmin: taille }))
    expect(r?.sens).toBe('AU_PLUS')
    if (r?.sens !== 'AU_PLUS') return
    expect(bornesA(r.focaleMm).maxArcmin).toBeCloseTo(taille, 6)
  })

  it('dit « trop petite » plutôt qu’une focale hors du domaine de saisie', () => {
    const plusLongue = bornesA(DOMAINES.focale_mm.max).minArcmin
    const r = focaleRequise(CONTEXTE, objet({ majAxArcmin: plusLongue / 2 }))
    expect(r).toEqual({ sens: 'TROP_PETITE' })
  })

  it('dit « mosaïque » quand même la plus courte focale ne la tient pas', () => {
    const plusCourte = bornesA(DOMAINES.focale_mm.min).maxArcmin
    const r = focaleRequise(CONTEXTE, objet({ majAxArcmin: plusCourte * 1.5 }))
    expect(r).toEqual({ sens: 'MOSAIQUE' })
  })
})

/** Créneau de la nuit qui suit `depart`, avec le moteur qui écarte. */
function aUnCreneau(cible: ReturnType<typeof objet>, depart: Date): boolean {
  const nuit = fenetreNocturne(SITE, depart)
  if (nuit.debutReference === null || nuit.finReference === null) return false
  const c = creneauCible(
    entreeCreneau(CONTEXTE, cible, { debut: nuit.debutReference, fin: nuit.finReference }),
  )
  return c.causeExclusion === undefined && c.dureeTotaleMin.value > 0
}

describe('T-0380 — le prochain créneau d’une cible hors saison', () => {
  // Une cible en conjonction avec le Soleil cette nuit-là : ses coordonnées sont les siennes.
  const soleil = Equator(Body.Sun, NUIT.milieuNuitVrai!, observateur(SITE), true, true)
  const HORS_SAISON = objet({
    designation: 'HS',
    adDeg: soleil.ra * DEG_PAR_HEURE,
    decDeg: soleil.dec,
  })

  it('la prémisse tient : la cible est hors saison cette nuit-là', () => {
    expect(exclusionCreneau(CONTEXTE, HORS_SAISON)?.cause).toBe('HORS_FENETRE')
  })

  it('trouve une nuit qui a un créneau, et la veille n’en a pas', () => {
    const instant = prochainCreneau(CONTEXTE, HORS_SAISON)
    expect(instant).not.toBeNull()
    if (instant === null) return
    // Le départ d'une recherche de nuit est un instant de jour : un jour et demi avant
    // l'instant trouvé tombe le jour de la veille, quelle que soit l'heure de la nuit.
    const veille = new Date(instant.getTime() - 1.5 * MS_PAR_JOUR)
    const jourMeme = new Date(instant.getTime() - 0.5 * MS_PAR_JOUR)
    expect(aUnCreneau(HORS_SAISON, jourMeme)).toBe(true)
    expect(aUnCreneau(HORS_SAISON, veille)).toBe(false)
    expect(instant.getTime()).toBeGreaterThan(NUIT.finReference!.getTime())
  })

  it('ne trouve rien pour une cible qui ne se lève jamais d’ici', () => {
    const jamais = objet({ designation: 'SUD', decDeg: -(90 - SITE.latitudeDeg) - 10 })
    expect(prochainCreneau(CONTEXTE, jamais)).toBeNull()
  })
})

describe('T-0379, T-0380 — ce que la carte écrit', () => {
  const ecartee = (code: EtatCible['code'], cause: string): EtatCible => ({
    note: 0,
    libelle: '',
    pose: null,
    cause,
    code,
  })

  it('remplace la phrase de cadrage par la focale', () => {
    const petite = objet({ majAxArcmin: BORNES.minArcmin / 3 })
    const { phrases } = causesCarte(CONTEXTE, petite, ecartee('CADRAGE', 'moteur'))
    expect(phrases).toHaveLength(1)
    expect(phrases[0]).toMatch(/^Focale min .* mm$/)
  })

  it('dit hors saison, et offre la date, quand la date est le levier', () => {
    const soleil = Equator(Body.Sun, NUIT.milieuNuitVrai!, observateur(SITE), true, true)
    const cible = objet({ adDeg: soleil.ra * DEG_PAR_HEURE, decDeg: soleil.dec })
    const r = causesCarte(CONTEXTE, cible, ecartee('FENETRE', 'moteur'))
    expect(r).toEqual({ phrases: [HORS_SAISON], horsSaison: true })
  })

  it('montre TOUTES les causes : trop petite ET hors saison', () => {
    // Le moteur s'arrête à la taille ; la carte doit aussi dire que la date ne va pas.
    const soleil = Equator(Body.Sun, NUIT.milieuNuitVrai!, observateur(SITE), true, true)
    const cible = objet({
      adDeg: soleil.ra * DEG_PAR_HEURE,
      decDeg: soleil.dec,
      majAxArcmin: BORNES.minArcmin / 3,
    })
    const r = causesCarte(CONTEXTE, cible, ecartee('CADRAGE', 'moteur'))
    expect(r.phrases).toHaveLength(2)
    expect(r.phrases[0]).toMatch(/^Focale min .* mm$/)
    expect(r.phrases[1]).toBe(HORS_SAISON)
    expect(r.horsSaison).toBe(true)
  })

  it('montre la taille ET la hauteur quand la cible ne monte pas assez', () => {
    const basse = objet({
      decDeg: -(90 - SITE.latitudeDeg) + 1,
      majAxArcmin: BORNES.maxArcmin * 2,
    })
    const attendu = exclusionCreneau(CONTEXTE, basse)
    expect(attendu).not.toBeNull()
    const r = causesCarte(CONTEXTE, basse, ecartee('CADRAGE', 'moteur'))
    expect(r.phrases).toEqual([expect.stringMatching(/^Focale max .* mm$/), NON_PHOTOGRAPHIABLE_ICI])
  })

  it('garde la phrase du moteur quand ni la taille ni le créneau ne l’expliquent', () => {
    const r = causesCarte(CONTEXTE, objet({}), ecartee('SUIVI', 'Pas de suivi.'))
    expect(r).toEqual({ phrases: ['Pas de suivi.'], horsSaison: false })
  })
})
