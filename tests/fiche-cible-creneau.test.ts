/**
 * T-0222 — fiche créneau photo = plan de séance créneau (§8.2).
 * No hour written: fiche vs `planSession` on same context. GEM monture so the méridien
 * split (easy to lose when rebuilding input) is compared too.
 */

import { describe, expect, it } from 'vitest'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masqueDepuisPoints, masquePlat, type PointMasque } from '../src/core/site.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import { planSession, type ContexteSession } from '../src/core/session.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { CAUSE_NUIT_NON_CHIFFREE, nuitFiche } from '../src/ui/fiche-cible-creneau.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const NUIT = fenetreNocturne(SITE, new Date('2026-08-14T12:00:00Z'))

const CONTEXTE: ContexteSession = {
  site: SITE,
  nuit: NUIT,
  fenetreUtile: fenetreUtile(SITE, NUIT),
  masque: masquePlat(),
  fovHDeg: 11.38,
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
  typeMonture: 'GEM',
}

/** Relief at domain max all around: hides any target. Forces RELIEF exclusion, no ephemeris. */
const MASQUE_INTEGRAL: readonly PointMasque[] = Array.from({ length: 360 }, (_, azimutDeg) => ({
  azimutDeg,
  altitudeDeg: DOMAINES.masque_horizon_deg.max,
}))

const NGC7000: ObjetCielProfond = {
  designation: 'NGC7000',
  nomsCommuns: 'Amérique du Nord',
  adDeg: 314.75,
  decDeg: 44.52,
  type: 'EMISSION',
  majAxArcmin: 120,
  minAxArcmin: 100,
  posAngDeg: null,
  vMag: 4,
  bMag: null,
  surfBr: null,
}

describe('nuitFiche — le créneau', () => {
  it('annonce le créneau que le plan de séance retient pour la même cible', () => {
    const etape = planSession(CONTEXTE, [NGC7000]).etapes[0]
    expect(etape).toBeDefined()

    const fiche = nuitFiche(CONTEXTE, NGC7000).creneau
    if (!fiche.chiffre) throw new Error(fiche.cause)
    expect(fiche.creneau.creneaux).toEqual(etape!.creneau.creneaux)
    expect(fiche.creneau.heureCulmination).toEqual(etape!.creneau.heureCulmination)
  })

  it('nomme la cause du moteur quand la cible ne se lève pas', () => {
    const fiche = nuitFiche(CONTEXTE, { ...NGC7000, designation: 'AUSTRALE', decDeg: -80 }).creneau
    if (!fiche.chiffre) throw new Error(fiche.cause)
    expect(fiche.creneau.causeExclusion).toBe('JAMAIS_LEVE')
    expect(fiche.creneau.creneaux).toHaveLength(0)
  })

  /**
   * T-0268 — outside créneau, fiche carries engine cause, no computing. Was falling back on
   * culmination: target high at méridien but relief-hidden all night kept valid masse d'air
   * + full integration under "cachée par le relief".
   */
  it('porte la cause du moteur au lieu de replier sur la culmination', () => {
    const nuit = nuitFiche(CONTEXTE, { ...NGC7000, designation: 'AUSTRALE', decDeg: -80 })
    expect(nuit.capture.exclusion).not.toBeNull()
    expect(nuit.capture.masseAir.value).toBeNull()
    expect(nuit.capture.plusHaut).toBeNull()
    expect(nuit.capture.dureeCreneauS).toBeNull()
  })

  /**
   * Culmination masked: relief excludes target despite high culmination. `masseAirMin` stayed
   * valid → fiche computed integration while list/plan dropped target. Full mask forces it.
   */
  it('n’en chiffre pas davantage quand le relief cache une cible qui culmine haut', () => {
    const contexte: ContexteSession = { ...CONTEXTE, masque: masqueDepuisPoints(MASQUE_INTEGRAL) }
    const circumpolaire: ObjetCielProfond = { ...NGC7000, designation: 'HAUTE', decDeg: 85 }

    expect(planSession(contexte, [circumpolaire]).etapes).toHaveLength(0)

    const nuit = nuitFiche(contexte, circumpolaire)
    const creneau = nuit.creneau.chiffre ? nuit.creneau.creneau : null
    expect(creneau?.causeExclusion).toBe('RELIEF')
    // Culmination still computable: what hid the fallback.
    expect(creneau?.altCulminationDeg.value).toBeGreaterThan(0)
    expect(nuit.capture.exclusion).toBe(creneau?.message)
    expect(nuit.capture.masseAir.value).toBeNull()
  })

  it('ne chiffre rien sans contexte de nuit', () => {
    expect(nuitFiche(null, NGC7000).creneau).toEqual({
      chiffre: false,
      cause: CAUSE_NUIT_NON_CHIFFREE,
    })
  })
})
