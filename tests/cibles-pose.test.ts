/**
 * §6.4 — pose announced by catalogue list = pose of plan de séance.
 * Regression: two screens, two extinction conventions → two poses for same night (T-0089
 * fixed it; reusing `evalueCandidate` keeps it fixed). No hard-coded time: compares 2 engine
 * outputs. T-0161: `etatsCibles` also carries facilité note (§6.4); discarded targets enter
 * map with note 0. "No pose" = `pose === null`, never `has() === false` (absent = not evaluated).
 */

import { describe, expect, it, vi } from 'vitest'
import { etatsCibles } from '../src/core/cibles-liste.ts'
import { evalueCandidate, preFiltre } from '../src/core/session-candidates.ts'
import { detectabilite } from '../src/core/detectability.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masquePlat } from '../src/core/site.ts'
import { planSession, type ContexteSession } from '../src/core/session.ts'
import { profilSuivi } from '../src/core/suivi.ts'
import { K } from '../src/registry/constants.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

// T-0294 — pass-through spy: real engine, calls counted only.
vi.mock('../src/core/session-candidates.ts', async (importeReel) => {
  const reel = await importeReel<typeof import('../src/core/session-candidates.ts')>()
  return { ...reel, evalueCandidate: vi.fn(reel.evalueCandidate) }
})

const NUIT = fenetreNocturne(SITE, new Date('2026-08-14T12:00:00Z'))

/** Annexe A deep-sky setup: 120 mm f/2,8 full frame. */
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
  typeMonture: 'TRACKER',
}

function objet(surcharge: Partial<ObjetCielProfond>): ObjetCielProfond {
  return {
    designation: 'TEST',
    nomsCommuns: '',
    adDeg: 314.75,
    decDeg: 44.52,
    type: 'EMISSION',
    majAxArcmin: 120,
    minAxArcmin: 100,
    posAngDeg: null,
    vMag: 4,
    bMag: null,
    surfBr: null,
    ...surcharge,
  }
}

const CATALOGUE: readonly ObjetCielProfond[] = [
  objet({ designation: 'NGC7000', nomsCommuns: 'Amérique du Nord' }),
  objet({ designation: 'M31', adDeg: 10.68, decDeg: 41.27, type: 'GALAXIE', majAxArcmin: 190, minAxArcmin: 60, vMag: 3.4 }),
  objet({ designation: 'M27', adDeg: 299.9, decDeg: 22.72, type: 'NEB_PLANETAIRE', majAxArcmin: 8, minAxArcmin: 6, vMag: 7.4 }),
  // Extreme south declination: never rises at 46° N.
  objet({ designation: 'INVISIBLE', adDeg: 100, decDeg: -80, vMag: 5 }),
]

/**
 * §12.5 — engine refusing out-of-domain input must not crash the screen.
 * Case: 300 mm narrows cadrage window → extended faint objects whose surface brightness
 * exceeds §7.1's 26 mag/as² domain; `fluxObjet` refuses; list must discard target with its
 * cause, like plan de séance.
 */
describe('etatsCibles — un refus de domaine écarte la cible, il ne casse pas l’écran', () => {
  // 300 mm, same full frame: smaller cadrage window; objects grand champ dropped on size
  // reach flux engines.
  const LONGUE_FOCALE: ContexteSession = { ...CONTEXTE, fovHDeg: 4.56, echApx: 3.5 }

  /** Extended, very faint: surface brightness out of domain by construction. */
  const DIFFUSE = objet({
    designation: 'DIFFUSE_HORS_DOMAINE',
    adDeg: 314.75,
    decDeg: 44.52,
    type: 'NEB_OBSCURE',
    majAxArcmin: 100,
    minAxArcmin: 100,
    vMag: 14,
  })

  it('forge bien une cible hors du domaine de brillance de surface', () => {
    // Premise computed, not copied: else test still passes once target leaves the domain.
    const sbObj = detectabilite({
      mInt: DIFFUSE.vMag,
      aArcmin: DIFFUSE.majAxArcmin,
      bArcmin: DIFFUSE.minAxArcmin,
      typeObjet: DIFFUSE.type,
      sbCiel: LONGUE_FOCALE.sbCielNoir,
      mLimOeil: LONGUE_FOCALE.mLimOeil,
      dMm: LONGUE_FOCALE.dMm,
    }).sbObj.value

    expect(sbObj).not.toBeNull()
    expect(sbObj!).toBeGreaterThan(DOMAINES.sb_obj.max)
  })

  it('n’annonce aucune pose pour elle, sans lever d’erreur', () => {
    expect(() => etatsCibles(LONGUE_FOCALE, [...CATALOGUE, DIFFUSE])).not.toThrow()
    expect(etatsCibles(LONGUE_FOCALE, [...CATALOGUE, DIFFUSE]).get(DIFFUSE.designation)?.pose)
      .toBeNull()
  })

  it('lui donne la note 0 et sa cause, pas un tiret muet', () => {
    const etat = etatsCibles(LONGUE_FOCALE, [...CATALOGUE, DIFFUSE]).get(DIFFUSE.designation)
    expect(etat).toBeDefined()
    expect(etat!.note).toBe(0)
    expect(etat!.cause).not.toBeNull()
  })

  it('ne prive pas les autres cibles de leur pose : le refus est individuel', () => {
    const etats = etatsCibles(LONGUE_FOCALE, [...CATALOGUE, DIFFUSE])
    expect([...etats.values()].filter((e) => e.pose !== null).length).toBeGreaterThan(0)
  })

  it('la range parmi les écartées du plan, avec sa cause', () => {
    const plan = planSession(LONGUE_FOCALE, [...CATALOGUE, DIFFUSE])
    const ecartee = plan.ciblesEcartees.find((c) => c.designation === DIFFUSE.designation)
    expect(ecartee).toBeDefined()
    expect(ecartee!.cause).toMatch(/brillance de surface/)
  })
})

describe('etatsCibles — la liste et le plan annoncent la même pose', () => {
  const POSES = etatsCibles(CONTEXTE, CATALOGUE)
  const PLAN = planSession(CONTEXTE, CATALOGUE)

  it('rend une pose pour chaque cible que le plan a retenue', () => {
    expect(PLAN.etapes.length).toBeGreaterThan(0)
    for (const etape of PLAN.etapes) {
      expect(POSES.has(etape.objet.designation), etape.objet.designation).toBe(true)
    }
  })

  it('annonce exactement l’intégration requise de l’étape du plan', () => {
    for (const etape of PLAN.etapes) {
      const pose = POSES.get(etape.objet.designation)!.pose!
      expect(pose.tRequisS, etape.objet.designation).toBeCloseTo(
        etape.integration.tRequisS.value,
        9,
      )
      expect(pose.nPoses).toBe(etape.integration.nPoses.value)
      expect(pose.dureeCreneauMin).toBeCloseTo(etape.creneau.dureeTotaleMin.value, 9)
    }
  })

  it('n’annonce aucune pose pour une cible qui ne se lève jamais depuis ce site', () => {
    // In map (discarded, note 0), no pose: pré-filtrage refused on culmination = verdict,
    // not absence.
    expect(POSES.get('INVISIBLE')?.pose ?? null).toBeNull()
  })

  it('n’évalue jamais plus de cibles que son propre plafond, celui de §6.4', () => {
    expect(POSES.size).toBeLessThanOrEqual(K('CIBLES_EVALUEES_MAX'))
  })

  it('ne rend rien quand la nuit n’a pas de fenêtre de référence', () => {
    const sansNuit: ContexteSession = {
      ...CONTEXTE,
      nuit: { ...NUIT, debutReference: null, finReference: null },
    }
    expect(etatsCibles(sansNuit, CATALOGUE).size).toBe(0)
  })
})

/**
 * §6.4 — facilité note and its COVERAGE.
 * No copied note: checks scale invariants + every target refused at pré-filtrage still gets
 * one. Past gap: at 120 mm full frame only 11 objects reach créneau calc; noting only those
 * left list nearly noteless while Cible card showed one for any click.
 */
describe('etatsCibles — la note de facilité', () => {
  const ETATS = etatsCibles(CONTEXTE, CATALOGUE)

  it('reste dans l’échelle du registre', () => {
    expect(ETATS.size).toBeGreaterThan(0)
    for (const [designation, etat] of ETATS) {
      expect(etat.note, designation).toBeGreaterThanOrEqual(0)
      expect(etat.note, designation).toBeLessThanOrEqual(K('FACILITE_NOTE_MAX'))
      expect(Number.isInteger(etat.note), designation).toBe(true)
      expect(etat.libelle, designation).not.toBe('')
    }
  })

  it('lie la note à la pose : une cible évaluée n’est jamais 0, une écartée n’est jamais notée', () => {
    for (const [designation, etat] of ETATS) {
      if (etat.pose === null) {
        expect(etat.note, designation).toBe(0)
        expect(etat.cause, designation).not.toBeNull()
      } else {
        expect(etat.note, designation).toBeGreaterThanOrEqual(1)
        expect(etat.cause, designation).toBeNull()
      }
    }
  })

  it('note TOUTE cible refusée au pré-filtrage, et pas seulement les candidates', () => {
    // Pré-filtrage discard bound = whole catalogue: naming a refusal costs a string, keeping a
    // candidate costs an ephemeris.
    const { candidates, ecartees } = preFiltre(CONTEXTE, CATALOGUE, CATALOGUE.length, CATALOGUE.length)
    expect(ecartees.length).toBeGreaterThan(0)

    for (const ecartee of ecartees) {
      if (ecartee.code === 'DONNEE_MANQUANTE') continue
      const etat = ETATS.get(ecartee.designation)
      expect(etat, ecartee.designation).toBeDefined()
      expect(etat!.note, ecartee.designation).toBe(0)
      expect(etat!.cause, ecartee.designation).toBe(ecartee.cause)
    }

    // Coverage > candidates: that is the fix.
    expect(ETATS.size).toBeGreaterThan(candidates.length)
  })

  it('ne note aucune cible dont le catalogue ne donne ni magnitude ni dimensions', () => {
    // Undocumented ≠ hard: no note here or on card.
    for (const objet of CATALOGUE) {
      if (objet.majAxArcmin !== null && objet.vMag !== null) continue
      expect(ETATS.has(objet.designation), objet.designation).toBe(false)
    }
  })

  it('ne note rien quand la nuit n’a pas de fenêtre de référence', () => {
    const sansNuit: ContexteSession = {
      ...CONTEXTE,
      nuit: { ...NUIT, debutReference: null, finReference: null },
    }
    expect(etatsCibles(sansNuit, CATALOGUE).size).toBe(0)
  })
})

/**
 * §5.2 — without suivi deep-sky domain is LOCKED, not just capped.
 * Old behaviour closed nothing: `tMaxS` fell back to NPF, pose unitaire = seconds, bright
 * targets stayed under §7.3 integration cap, listed "photographable" as thousands of 2 s
 * poses on fixed tripod. Lock = `pose === null` everywhere; cause from `profilSuivi`, phrase
 * not rewritten here (else two screens say two things).
 */
describe('§5.2 — sans suivi, aucune cible ciel profond n’est photographiable', () => {
  const sansSuivi = profilSuivi({ suiviActif: false, typeMonture: 'TRACKER', focaleMm: 120 })
  const etats = etatsCibles({ ...CONTEXTE, domaineCpFerme: sansSuivi.cause }, CATALOGUE)

  it('ferme bien le domaine dans le profil de suivi', () => {
    expect(sansSuivi.domaineCpOuvert).toBe(false)
    expect(sansSuivi.cause).not.toBeNull()
  })

  it('n’annonce aucune pose, et donne au suivi la cause de chaque refus', () => {
    // Premise: SAME catalogue yields poses once suivi on.
    const avecSuivi = etatsCibles(CONTEXTE, CATALOGUE)
    expect([...avecSuivi.values()].some((e) => e.pose !== null)).toBe(true)

    for (const objet of CATALOGUE) {
      const etat = etats.get(objet.designation)
      expect(etat?.pose ?? null).toBeNull()
      expect(etat?.cause).toBe(sansSuivi.cause)
    }
  })

  it('verrouille aussi la monture altazimutale, dont la rotation de champ n’est pas traitée', () => {
    const altaz = profilSuivi({ suiviActif: true, typeMonture: 'ALTAZ', focaleMm: 120 })
    const fermes = etatsCibles({ ...CONTEXTE, domaineCpFerme: altaz.cause }, CATALOGUE)
    expect(altaz.domaineCpOuvert).toBe(false)
    expect([...fermes.values()].every((e) => e.pose === null)).toBe(true)
  })
})

/**
 * T-0294 — plan and list start from same context: target priced once (before, `planSession`
 * and `etatsCibles` each evaluated candidates → same ephemeris paid twice per context change).
 */
describe('etatsCibles et planSession — une seule évaluation par candidate et par contexte', () => {
  it('n’appelle evalueCandidate qu’une fois par cible pour les deux surfaces réunies', () => {
    // Fresh context: what an input change delivers to the chain.
    const contexte: ContexteSession = { ...CONTEXTE }
    const espion = vi.mocked(evalueCandidate)
    espion.mockClear()

    etatsCibles(contexte, CATALOGUE)
    planSession(contexte, CATALOGUE)

    const evaluees = espion.mock.calls.map(([, objet]) => objet)
    expect(evaluees.length).toBeGreaterThan(0)
    expect(new Set(evaluees).size).toBe(evaluees.length)
  })

  it('réévalue sous un contexte nouveau : le partage ne survit pas au contexte', () => {
    const espion = vi.mocked(evalueCandidate)
    etatsCibles({ ...CONTEXTE }, CATALOGUE)
    espion.mockClear()
    etatsCibles({ ...CONTEXTE }, CATALOGUE)
    expect(espion).toHaveBeenCalled()
  })
})
