/**
 * T-0089 — fiche cible counts the Moon like plan de séance (§8.1, §6.3, §7.5).
 * Guards: 2 screens on same target same nuit must not announce 2 poses. Fiche called
 * `detectabilite()` without Moon on site's black fond de ciel (dosed as Moonless nuit).
 * Compares both paths on same input. No ephemeris: Moon nuit SEARCHED at runtime, expected =
 * plan engine output.
 */

import { describe, expect, it } from 'vitest'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { etatLune, fenetreUtile } from '../src/core/moon.ts'
import { masquePlat, masseAir } from '../src/core/site.ts'
import { PRESET_SNR_DEFAUT } from '../src/registry/verdicts.ts'
import { etatsCibles, prepareEvaluation } from '../src/core/cibles-liste.ts'
import { instantLune } from '../src/core/session-candidates.ts'
import { planSession, type ContexteSession, type EtapePlan } from '../src/core/session.ts'
import { profilOptique } from '../src/core/optics.ts'
import {
  BOITIER_REFERENCE,
  capteurEffectif,
  isoRecommande,
  pointZeroSysteme,
} from '../src/data/equipment.ts'
import type { ObjetCielProfond, TypeObjet } from '../src/data/deepsky.ts'
import {
  conseilsCible,
  evalue,
  type CaptureNuit,
  type ContexteFiche,
  type LuneFiche,
} from '../src/ui/fiche-cible-calcul.ts'
import { nuitFiche } from '../src/ui/fiche-cible-creneau.ts'
import { lunePourCible } from '../src/ui/fiche-cible-lune.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

/**
 * No computable nuit: fiche has no créneau/masse d'air; `fluxObjetReel` announces a minimum,
 * no assumed zenith (§7.6, §12.5).
 */
const SANS_CRENEAU: CaptureNuit = {
  masseAir: masseAir(null),
  dureeCreneauS: null,
  plusHaut: null,
  exclusion: null,
}

/** Annexe A: reference site + wide-field 120 mm f/2,8, plein format. */
const CAPTEUR = capteurEffectif(BOITIER_REFERENCE, 'FULL_FRAME')
const OPTIQUE = profilOptique({ focaleMm: 120, ouvertureN: 2.8, ...CAPTEUR })
const ZERO = pointZeroSysteme(BOITIER_REFERENCE)
const ISO = isoRecommande(BOITIER_REFERENCE)
const SB_CIEL_NOIR = 20.95
const M_LIM_OEIL = 6.05
const T_MAX_S = 200
/** Nuit plan quality objective: fiche must be queried on the same. */
const SNR_PLAN = PRESET_SNR_DEFAUT

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

const CATALOGUE: readonly ObjetCielProfond[] = [NGC7000]

function contexteSession(dateIso: string): ContexteSession {
  const nuit = fenetreNocturne(SITE, new Date(`${dateIso}T12:00:00Z`))
  return {
    site: SITE,
    nuit,
    fenetreUtile: fenetreUtile(SITE, nuit),
    masque: masquePlat(),
    fovHDeg: OPTIQUE.fovHDeg.value,
    echApx: OPTIQUE.echApx.value,
    dMm: OPTIQUE.dMm.value,
    capteurHMm: CAPTEUR.capteurHMm,
    pitchUm: CAPTEUR.pitchUm,
    ouvertureN: 2.8,
    zpSys: ZERO.valeur,
    zpEstime: ZERO.estime,
    readNoiseE: ISO.readNoiseE,
    tailleRawMo: BOITIER_REFERENCE.tailleRawMo,
    isoSession: ISO.iso,
    sbCielNoir: SB_CIEL_NOIR,
    mLimOeil: M_LIM_OEIL,
    tMaxS: T_MAX_S,
    domaineCpFerme: null,
    snrCible: SNR_PLAN,
    typeMonture: 'TRACKER',
  }
}

/**
 * Fond de ciel the plan uses before the Moon: site black sky − nuit's crépuscule penalty
 * (§2.2). Fiche queried on it → only the Moon differs.
 */
function sbCielBase(contexte: ContexteSession): number {
  return contexte.sbCielNoir - contexte.nuit.penaliteSbMag
}

function contexteFiche(sbCiel: number): ContexteFiche {
  return {
    optique: OPTIQUE,
    capteurHMm: CAPTEUR.capteurHMm,
    pitchUm: CAPTEUR.pitchUm,
    ouvertureN: 2.8,
    boitier: BOITIER_REFERENCE,
    zeroSysteme: ZERO,
    iso: ISO,
    sbCiel,
    mLimOeil: M_LIM_OEIL,
    tMaxS: T_MAX_S,
    // Bortle 4: under C-22 filter advice threshold; only the Moon can trigger advice here.
    bortle: 4,
    suiviActif: true,
    focaleMm: 120,
  }
}

/**
 * First nuit from 1 Aug 2026 where plan keeps target under a Moon really degrading fond de
 * ciel. Searched, not written: a copied date = hardcoded ephemeris.
 */
function nuitAvecLune(): { readonly contexte: ContexteSession; readonly etape: EtapePlan } {
  for (let jour = 1; jour <= 30; jour += 1) {
    const contexte = contexteSession(`2026-08-${String(jour).padStart(2, '0')}`)
    const etape = planSession(contexte, CATALOGUE).etapes[0]
    if (etape !== undefined && etape.deltaSbLuneMag.value > 0) return { contexte, etape }
  }
  throw new Error('Aucune nuit de Lune trouvée sur le mois : le moteur lunaire ne répond plus.')
}

/**
 * T-0268 — THREE paths on same input: plan de séance, catalogue list, fiche. Redo of T-0089
 * (compared 2, tolerated a masse d'air gap → regression came back through it).
 * Forbidden: fiche announcing other integration, pose count or Moon gêne than plan for same
 * target + nuit.
 */
describe('T-0268 — la liste, la fiche et le plan annoncent le même dosage', () => {
  const { contexte, etape } = nuitAvecLune()
  const sbBase = sbCielBase(contexte)
  const nuit = nuitFiche(contexte, etape.objet)
  const fiche = evalue(
    contexteFiche(sbBase),
    etape.objet,
    SNR_PLAN,
    ISO,
    nuit.lune,
    nuit.capture,
  )
  const liste = etatsCibles(contexte, CATALOGUE).get(etape.objet.designation)

  it('la fiche annonce l’intégration et le nombre de poses du plan', () => {
    expect(fiche.integration?.tRequisS.value).toBe(etape.integration.tRequisS.value)
    expect(fiche.integration?.nPoses.value).toBe(etape.integration.nPoses.value)
  })

  it('la liste annonce les mêmes : un seul moteur pour les trois écrans', () => {
    expect(liste?.pose?.tRequisS).toBe(etape.integration.tRequisS.value)
    expect(liste?.pose?.nPoses).toBe(etape.integration.nPoses.value)
    expect(liste?.pose?.tPoseS).toBe(fiche.pose?.tAfficheeS)
  })

  it('éteint la cible à la MÊME masse d’air : celle du créneau, pas la culmination', () => {
    expect(fiche.extinction?.masseAir.value).toBe(etape.extinction.masseAir.value)
    expect(fiche.extinction?.masseAir.value).toBe(etape.creneau.masseAirMoyenne.value)
  })

  it('dégrade le même ciel sous la même Lune, au même instant', () => {
    const attendu = instantLune(etape.creneau, prepareEvaluation(contexte)!.fenetre.debut)
    expect(nuit.lune.evaluee && nuit.lune.instant.getTime()).toBe(attendu.getTime())
    expect(nuit.lune.evaluee && nuit.lune.ciel.delta.value).toBeCloseTo(
      etape.deltaSbLuneMag.value,
      12,
    )
    expect(fiche.sbCielEffectif).toBeCloseTo(etape.sbCielEffectif, 12)
    expect(fiche.pose?.tRecommandeS.value).toBeCloseTo(etape.pose.tRecommandeS.value, 12)
  })

  /**
   * Fiche Moon instant drawn from the CRÉNEAU, so from nuit alone; no clock: prepare at noon,
   * consult at 23:30 → same instant, same gêne. Violated by dating Moon at displayed instant.
   */
  it('date sa Lune d’un instant du créneau, jamais de l’heure de consultation', () => {
    const creneaux = nuit.creneau.chiffre ? nuit.creneau.creneau.creneaux : []
    expect(creneaux.length).toBeGreaterThan(0)
    const instant = (nuit.lune.evaluee ? nuit.lune.instant : new Date(0)).getTime()
    expect(instant).toBeGreaterThanOrEqual(creneaux[0]!.debut.getTime())
    expect(instant).toBeLessThanOrEqual(creneaux[creneaux.length - 1]!.fin.getTime())
  })

  /**
   * §7.6 — floor = named variant: same target at best instant only. Shorter than forecast by
   * design: gap prices posing the whole window vs culmination hour.
   */
  it('affiche un plancher plus court que la prévision, jamais à sa place', () => {
    expect(fiche.plancher).not.toBeNull()
    expect(fiche.plancher!.integration.tRequisS.value).toBeLessThanOrEqual(
      fiche.integration!.tRequisS.value,
    )
    expect(fiche.plancher!.extinction.masseAir.value).toBe(etape.creneau.masseAirMin.value)
  })

  /**
   * Violated by "Lune à 12:47, cible à son point le plus haut": elevation and named instant
   * must describe the SAME event. Same créneau sample → cannot diverge.
   */
  it('nomme un instant auquel la cible est effectivement à la hauteur annoncée', () => {
    const plusHaut = fiche.plancher!.plusHaut
    expect(plusHaut.instant).not.toBeNull()
    expect(plusHaut.altitudeDeg).toBe(etape.creneau.plusHaut.altitudeDeg)
    expect(plusHaut.instant!.getTime()).toBe(etape.creneau.plusHaut.instant!.getTime())
  })

  it('divergerait si la fiche ignorait la Lune — c’est le défaut que ce test garde fermé', () => {
    const ignoree: LuneFiche = { evaluee: false, cause: 'Lune ignorée, comme avant T-0089.' }
    const sansLune = evalue(
      contexteFiche(sbBase),
      etape.objet,
      SNR_PLAN,
      ISO,
      ignoree,
      nuit.capture,
    )
    expect(sansLune.integration?.tRequisS.value).not.toBeCloseTo(
      etape.integration.tRequisS.value,
      6,
    )
  })
})

describe('§6.3 — une Lune sous l’horizon ne dégrade rien, et la fiche le dit', () => {
  /** First nuit instant with Moon set, searched hour by hour. */
  function instantSansLune(): Date {
    const nuit = fenetreNocturne(SITE, new Date('2026-08-01T12:00:00Z'))
    const depart = nuit.debutReference ?? new Date('2026-08-01T22:00:00Z')
    for (let heures = 0; heures < 24; heures += 1) {
      const essai = new Date(depart.getTime() + heures * 3600_000)
      if (etatLune(SITE, essai).sousHorizon) return essai
    }
    throw new Error('Lune levée 24 h d’affilée : impossible à cette latitude.')
  }

  const instant = instantSansLune()
  const lune = lunePourCible({
    site: SITE,
    instant,
    objet: NGC7000,
    sbCielNoirMag: SB_CIEL_NOIR,
  })
  const fiche = evalue(contexteFiche(SB_CIEL_NOIR), NGC7000, SNR_PLAN, ISO, lune, SANS_CRENEAU)

  it('laisse le fond de ciel intact, quelle que soit la phase', () => {
    expect(lune.evaluee && lune.ciel.delta.value).toBe(0)
    expect(fiche.sbCielEffectif).toBe(SB_CIEL_NOIR)
  })

  it('l’annonce explicitement plutôt que de pénaliser la cible', () => {
    expect(fiche.detect.noteLune).toMatch(/Lune couchée : aucune gêne/)
  })
})

describe('§6.3 et §7.5 — la même Lune ne pénalise pas tous les types de la même façon', () => {
  const { contexte, etape } = nuitAvecLune()
  const sbBase = sbCielBase(contexte)
  const lune = lunePourCible({
    site: SITE,
    instant: instantLune(etape.creneau, etape.creneauAlloue.debut),
    objet: etape.objet,
    sbCielNoirMag: sbBase,
  })

  function conseilPour(typeObjet: TypeObjet) {
    const ctx = contexteFiche(sbBase)
    // Object type decides advice: imposed, target unchanged.
    const r = evalue(ctx, { ...etape.objet, type: typeObjet }, SNR_PLAN, ISO, lune, SANS_CRENEAU)
    return {
      r,
      conseils: conseilsCible(ctx, r, {
        typeObjet,
        snrCible: SNR_PLAN,
        explicationDepliee: true,
      }),
    }
  }

  const emission = conseilPour('EMISSION')
  const galaxie = conseilPour('GALAXIE')

  it('porte la tolérance lunaire du type d’objet dans la fiche', () => {
    expect(emission.r.detect.toleranceLune).toBe('FORTE')
    expect(galaxie.r.detect.toleranceLune).toBe('FAIBLE')
    expect(emission.r.detect.conseilType).toMatch(/bi-bande/)
    expect(galaxie.r.detect.conseilType).toMatch(/Lune couchée/)
  })

  it('déclenche le conseil bi-bande sur la nébuleuse en émission, par la Lune et non par le Bortle', () => {
    expect(lune.evaluee && lune.ciel.delta.value).toBeGreaterThan(0)
    expect(emission.conseils?.filtre.declenche).toBe(true)
    expect(emission.conseils?.filtre.message).toMatch(/reste planifiable sans filtre/)
  })

  it('n’émet aucun conseil filtre sur la galaxie : aucun filtre n’aide un spectre continu', () => {
    expect(galaxie.conseils?.filtre.declenche).toBe(false)
    expect(galaxie.conseils?.filtre.message).toMatch(/Aucun filtre n’aide/)
  })
})

describe('T-0089 — une Lune non évaluée ne se voit pas inventer un fond de ciel', () => {
  /**
   * §12.5 — instant outside series domain = only refusal left since T-0156 (a target always
   * has coordinates). Cause from engine.
   */
  const lune: LuneFiche = {
    evaluee: false,
    cause: 'Instant hors du domaine des séries : la Lune n’est pas chiffrée.',
  }
  const fiche = evalue(contexteFiche(SB_CIEL_NOIR), NGC7000, SNR_PLAN, ISO, lune, SANS_CRENEAU)

  it('garde le fond de ciel du site plutôt que de deviner la dégradation', () => {
    expect(fiche.sbCielEffectif).toBe(SB_CIEL_NOIR)
    // No créneau: no elevation assumed, no floor, no masse d'air shown.
    expect(fiche.plusHaut).toBeNull()
    expect(fiche.plancher).toBeNull()
    expect(fiche.extinction?.masseAir.value).toBeNull()
  })

  it('ne produit alors aucune note lunaire : rien n’a été évalué', () => {
    expect(fiche.detect.noteLune).toBeUndefined()
  })
})
