/**
 * §8.3 — ordered plan de session.
 * INPUT IS THE USER'S SELECTION, never the catalogue. §6.4 gives them choice; this module orders
 * it. Output = A CHRONOLOGY, NOT A RANKING (ranking not executable in the field). Four rules:
 *   1. HARD-CONSTRAINT PRE-FILTER, each exclusion naming its cause. No longer reduces a
 *      catalogue: says why a CHOSEN target doesn't fit. Exclusions never mixed into chronology.
 *   2. EXPLICIT, EXPOSED SCORING (C-15): each target carries its score breakdown.
 *   3. CONFLICT ARBITRATION BY SCORE. Créneaux overlap: nuit = resource to allocate. Allocation
 *      by decreasing score (§8.3 arbitration), plan rendered in time order.
 *   4. NEVER SILENT TRUNCATION, NEVER REMOVING A CHOICE. Exceeded budget is ANNOUNCED, not
 *      resolved by dropping a target: selection is the user's, and a target the list calls
 *      photographiable ends up in plan. Integration not fitting the nuit announces its night
 *      count, as the list does.
 * This file assembles; stages beside: vocabulary `session-types.ts`, scoring `session-score.ts`,
 * candidates `session-candidates.ts`, night allocation `session-nuit.ts`.
 */

import { K } from '../registry/constants.ts'
import { dureeLisible, dureeMinLisible, nombreLibre } from '../registry/ecriture.ts'
import { LIBELLE_CAUSE_ECART } from '../registry/libelles.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { Intervalle } from './creneaux.ts'
import { planCalibration } from './calibration.ts'
import { rappelBatterie } from './rappel-batterie.ts'
import { evaluation } from './cibles-liste.ts'
import { preFiltre } from './session-candidates.ts'
import {
  alloueCreneau,
  calculeBudget,
  creneauxSeChevauchent,
  minutesLibres,
} from './session-nuit.ts'
import {
  AVERTISSEMENT_METEO,
  normalisePoids,
  poidsParDefaut,
  type Candidate,
  type CauseEcart,
  type CibleEcartee,
  type ContexteDe,
  type ContexteSession,
  type EtapePlan,
  type PlanSession,
  type PoidsScoring,
} from './session-types.ts'

export {
  AVERTISSEMENT_METEO,
  normalisePoids,
  poidsParDefaut,
  type BudgetNuit,
  type CauseEcart,
  type CibleEcartee,
  type ContexteSession,
  type DetailScore,
  type EtapePlan,
  type PlanSession,
  type PoidsScoring,
} from './session-types.ts'
export {
  scoreCadrage,
  scoreFenetre,
  scoreHauteur,
  scoreLune,
  scoreSignal,
} from './session-score.ts'
import { MIN_PAR_H, MS_PAR_MINUTE, S_PAR_MIN } from './unites.ts'


/**
 * §8.3 — plan's initial state, names the missing gesture ("Aucune cible adaptée" would blame the
 * sky for a plan not yet composed). Exported: screen and test cite it, not copy.
 */
export const AUCUNE_CIBLE_CHOISIE =
  'Aucune cible choisie : ouvrez la fiche d’une cible photographiable et ajoutez-la au plan.'

export function planSession(
  contexte: ContexteSession,
  /** Targets the user retained (§6.4), and only those. */
  choisies: readonly ObjetCielProfond[],
  /**
   * T-0407 — same resolver as the list: under a zoom, target evaluated at the focal its card
   * announces, else plan excludes what list calls photographiable. Nuit, calibration, budget stay
   * the base context's: focal doesn't enter them.
   */
  contexteDe?: ContexteDe,
): PlanSession {
  // Plan always works on normalized weights: input is raw.
  const poids = normalisePoids(contexte.poids ?? poidsParDefaut())
  const debut = contexte.nuit.debutReference
  const fin = contexte.nuit.finReference

  if (debut === null || fin === null) {
    return planVide(
      contexte,
      poids,
      [],
      new Map(),
      contexte.nuit.cause ??
        'Pas de nuit exploitable à cette date : aucun plan.',
    )
  }

  // §5.2 — ciel profond domain locked: plan isn't empty "for lack of target", it's closed, says so
  // with grand champ as alternative. `preFiltre` would already exclude all, but screen title must
  // name the suivi, not an anonymous dominant constraint.
  if (contexte.domaineCpFerme !== null) {
    return planVide(contexte, poids, [], new Map(), null, contexte.domaineCpFerme)
  }

  // Nothing chosen ≠ nothing compatible: grand champ doesn't replace a missing gesture, and an
  // alternative offered to someone who asked nothing hides the next step. AFTER nuit/domain checks:
  // they close the plan, not the user.
  if (choisies.length === 0) {
    return planVide(contexte, poids, [], new Map(), null, null, AUCUNE_CIBLE_CHOISIE)
  }

  // No cap: C-20 bounded catalogue-sweep cost. On a selection it would SILENTLY drop a requested
  // target — rule 4 forbids.
  const prefiltre = preFiltre(contexte, choisies, choisies.length, choisies.length, contexteDe)
  const ecartees: CibleEcartee[] = [...prefiltre.ecartees]
  const comptes = new Map(prefiltre.comptes)
  const contexteDeCible = contexteDe ?? (() => contexte)
  const retenues = evalueCandidates(contexteDeCible, prefiltre.candidates, ecartees, comptes)

  if (retenues.length === 0) {
    return planVide(contexte, poids, ecartees, comptes, null)
  }

  // First pass: no calibration reserved, quantifiable only once plan is laid out.
  const essai = alloueLaNuit(contexte, retenues, [], plafondCapture(contexte, retenues.length, 0))
  const calibrationEssai = calibrationDeSession(contexte, essai)
  // Second pass, the one that counts: measured calibration reserved like fixed costs.
  const allouees = alloueLaNuit(
    contexte,
    retenues,
    ecartees,
    plafondCapture(
      contexte,
      retenues.length,
      calibrationEssai === null ? 0 : calibrationEssai.surcoutTempsMin.value,
    ),
  )
  const etapes =
    contexteDe === undefined
      ? allouees
      : allouees.map((e) => optiqueDEtape(e, contexteDe(e.objet)))
  const calibration = calibrationDeSession(contexte, etapes)
  const budget = calculeBudget(contexte, etapes, calibration)

  const rappelCapture = rappelBatterie(budget.captureMin)

  return {
    etapes,
    ciblesEcartees: ecartees,
    comptesEcartees: Object.fromEntries(comptes),
    budget,
    poids,
    calibration,
    message:
      `${etapes.length} cible${etapes.length > 1 ? 's' : ''} dans l’ordre de ` +
      `la nuit : ${dureeLisible(budget.totalMin.value * S_PAR_MIN)} sur ` +
      `${dureeLisible(budget.disponibleMin * S_PAR_MIN)} disponibles.`,
    ...(noteCouverture(comptes) === undefined
      ? {}
      : { noteCouvertureCatalogue: noteCouverture(comptes)! }),
    avertissementMeteo: AVERTISSEMENT_METEO,
    ...(rappelCapture === null ? {} : { avertissementBatterie: rappelCapture }),
  }
}

function optiqueDEtape(
  etape: EtapePlan,
  { focaleMm, objectifNom }: Pick<ContexteSession, 'focaleMm' | 'objectifNom'>,
): EtapePlan {
  return {
    ...etape,
    ...(focaleMm === undefined ? {} : { focaleMm }),
    ...(objectifNom === undefined ? {} : { objectifNom }),
  }
}

/**
 * Pre-filter candidates passed to engines, split kept/excluded.
 * Domain refusal absorbed by `evalueCandidate` itself (§12.5): every caller needs it. T-0294 —
 * evaluation reuses the one the list already made on same context: a target is quantified once.
 */
function evalueCandidates(
  contexteDe: ContexteDe,
  candidates: readonly ObjetCielProfond[],
  ecartees: CibleEcartee[],
  comptes: Map<CauseEcart, number>,
): readonly Candidate[] {
  const retenues: Candidate[] = []
  for (const objet of candidates) {
    const resultat = evaluation(contexteDe(objet), objet)
    // Caller already checked the nuit is quantifiable: `null` can't come out here.
    if (resultat === null) continue
    if ('code' in resultat) {
      ecartees.push(resultat)
      comptes.set(resultat.code, (comptes.get(resultat.code) ?? 0) + 1)
    } else {
      retenues.push(resultat)
    }
  }
  return retenues
}

/**
 * §8.3 — THE NUIT IS SHARED, NOT TAKEN. Two rules:
 * 1. SMALLEST DEMAND FIRST. Demand = what target will REALLY consume tonight: `min(T_requis,
 *    créneau duration)`. A target above threshold for 1 h only demands 1 h, even if it needs 16.
 * 2. NOBODY TAKES MORE THAN THEIR SHARE while others wait. Share = free time WITHIN ITS CRÉNEAU /
 *    number of still-to-serve targets contesting that same night piece.
 * Max-min fair share; rules hold each other: served by increasing demand, small-demand targets
 * free their surplus for later ones, so share binds only those wanting more anyway. No night
 * minute lost, no target starved.
 * T-0322 — without them `alloueCreneau` bounded at what target CLAIMS; a 16 h target claims more
 * than the whole nuit: served first by score, IC 1805 took the 5 h and M 42 (9 min to shoot) came
 * out "non retenue" while list announced it photographiable.
 * SCORE REMAINS: breaks ties between equal demands, the only time §8.3 asks for it.
 * Plan then rendered in time order — a chronology.
 */
function alloueLaNuit(
  contexte: ContexteSession,
  retenues: readonly Candidate[],
  ecartees: CibleEcartee[],
  /** Capture minutes the nuit leaves once fixed costs are reserved. */
  plafondCaptureMin: number,
): readonly EtapePlan[] {
  const demandeMin = (c: Candidate): number =>
    Math.min(c.integration.tRequisS.value / S_PAR_MIN, c.creneau.dureeTotaleMin.value)
  const ordre = retenues
    .slice()
    .sort((a, b) => demandeMin(a) - demandeMin(b) || b.score.value - a.score.value)

  const occupes: Intervalle[] = []
  const etapes: EtapePlan[] = []
  let resteCaptureMin = plafondCaptureMin

  for (const [rang, candidate] of ordre.entries()) {
    // Still-to-serve targets aiming at same night piece, this one included: free time divides into
    // that many shares. Disjoint créneaux don't hinder; counting them would reserve time nobody
    // could take.
    const concurrentes =
      1 +
      ordre
        .slice(rang + 1)
        .filter((autre) => creneauxSeChevauchent(autre.creneau, candidate.creneau)).length
    const part = minutesLibres(candidate.creneau, occupes) / concurrentes
    // Cap stops biting once spent: makes an ordinary plan FIT, not yield zero-minute étapes on an
    // unreasonable selection. Past that, each keeps its share; budget announces overrun.
    const plafond =
      resteCaptureMin > 0 ? Math.min(demandeMin(candidate), part, resteCaptureMin) : Math.min(demandeMin(candidate), part)
    const alloue = alloueCreneau(candidate.creneau, occupes, plafond)
    if (alloue === null) {
      ecartees.push({
        designation: candidate.objet.designation,
        code: 'CONFLIT_CRENEAU',
        cause:
          'Son créneau ne laisse pas une minute libre cette nuit. À reporter à une autre nuit.',
      })
      continue
    }
    occupes.push(alloue)
    const etape = construitEtape(candidate, alloue, contexte)
    resteCaptureMin -= etape.dureeAlloueeMin
    etapes.push(etape)
  }

  return etapes.sort(
    (a, b) => a.creneauAlloue.debut.getTime() - b.creneauAlloue.debut.getTime(),
  )
}

/**
 * §8.3 — minutes the nuit REALLY leaves for capture.
 * Mise en station, pointages, calibration reserved first, not discovered at the end, else
 * allocation promises capture the nuit can't hold and plan closes on a few-minute overrun that
 * wasn't to be distributed. Calibration depends on the plan it quantifies → two passes in
 * `planSession`: first measures, second reserves.
 */
function plafondCapture(
  contexte: ContexteSession,
  nCibles: number,
  calibrationMin: number,
): number {
  const disponibleMin = contexte.nuit.dureeReferenceH * MIN_PAR_H
  const fixes =
    K('TEMPS_MISE_EN_STATION_MIN') + K('TEMPS_POINTAGE_PAR_CIBLE_MIN') * nCibles + calibrationMin
  return Math.max(0, disponibleMin - fixes)
}

/**
 * Calibration taken once per session: same ISO, same optics, one darks lot per plan pose duration
 * (§7.4).
 */
function calibrationDeSession(contexte: ContexteSession, etapes: readonly EtapePlan[]) {
  if (etapes.length === 0) return null
  return planCalibration({
    tPosesS: etapes.map((e) => e.tPoseS),
    iso: contexte.isoSession,
    nPoses: etapes.reduce((somme, e) => somme + e.nPoses, 0),
    autoguidage: false,
  })
}

function construitEtape(
  candidate: Candidate,
  alloue: Intervalle,
  contexte: ContexteSession,
): EtapePlan {
  const dureeAlloueeMin =
    (alloue.fin.getTime() - alloue.debut.getTime()) / MS_PAR_MINUTE
  const tRequisMin = candidate.integration.tRequisS.value / S_PAR_MIN
  const complete = dureeAlloueeMin >= tRequisMin
  const nPoses = complete
    ? candidate.integration.nPoses.value
    : Math.floor((dureeAlloueeMin * S_PAR_MIN) / candidate.pose.tAfficheeS)
  // T-0322 — night count from `planIntegration`, as for catalogue list: derived from target's
  // CRÉNEAU, not tonight's allocation (allocated duration said 4 nights where fiche said 2).
  const nNuits = candidate.integration.nNuits?.value ?? 1

  return {
    objet: candidate.objet,
    creneauAlloue: alloue,
    dureeAlloueeMin,
    tPoseS: candidate.pose.tAfficheeS,
    nPoses,
    volumeGo: (nPoses * contexte.tailleRawMo) / K('MO_PAR_GO'),
    verdict: candidate.detect.verdict,
    verdictCadrage: candidate.cadrage.verdict,
    score: candidate.score,
    detailScore: candidate.detailScore,
    deltaSbLuneMag: candidate.deltaSbLuneMag,
    sbCielEffectif: candidate.sbCielEffectif,
    integrationComplete: complete,
    nNuits,
    consigne: consigneTerrain(candidate, complete, nNuits, dureeAlloueeMin),
    creneau: candidate.creneau,
    pose: candidate.pose,
    integration: candidate.integration,
    extinction: candidate.extinction,
    cadrage: candidate.cadrage,
    detect: candidate.detect,
  }
}

function consigneTerrain(
  candidate: Candidate,
  complete: boolean,
  nNuits: number,
  dureeAlloueeMin: number,
): string {
  const base =
    `Poses de ${nombreLibre(candidate.pose.tAfficheeS)} s, ` +
    `${dureeMinLisible(dureeAlloueeMin)} sur cette cible. ${candidate.cadrage.noteOrientation}`
  if (complete) return base
  // Tonight isn't all: target stays in plan, consigne says what's taken away. Two shortfalls, two
  // sentences: target exceeds the nuit, or its créneau is shared (one sentence for both gave
  // "Prévoir 1 nuits").
  const total = `Il faut ${dureeLisible(candidate.integration.tRequisS.value)} au total`
  return nNuits > 1
    ? `${base} ${total} : ce soir en est un morceau, prévoir ${nNuits} nuits.`
    : `${base} ${total}, et le créneau est partagé : ce soir n’en couvre qu’une partie.`
}

function planVide(
  contexte: ContexteSession,
  poids: PoidsScoring,
  ecartees: readonly CibleEcartee[],
  comptes: ReadonlyMap<CauseEcart, number>,
  causeFenetre: string | null,
  /** §5.2 — closed domain keeps its alternative: it's the absent nuit that has none. */
  causeDomaine: string | null = null,
  /** §8.3 — nothing chosen: no constraint to name, no alternative to offer. */
  causeSelection: string | null = null,
): PlanSession {
  const dominante = contrainteDominante(comptes)
  return {
    etapes: [],
    ciblesEcartees: ecartees,
    comptesEcartees: Object.fromEntries(comptes),
    budget: calculeBudget(contexte, [], null),
    poids,
    calibration: null,
    message:
      causeSelection ??
      causeFenetre ??
      causeDomaine ??
      'Aucune cible adaptée cette nuit. Voir les cibles écartées et leur cause.',
    ...(causeFenetre === null &&
    causeDomaine === null &&
    causeSelection === null &&
    dominante !== undefined
      ? { contrainteDominante: dominante }
      : {}),
    ...(noteCouverture(comptes) === undefined
      ? {}
      : { noteCouvertureCatalogue: noteCouverture(comptes)! }),
    ...(causeFenetre === null && causeSelection === null
      ? {
          alternative: 'Le grand champ et le filé d’étoiles restent possibles cette nuit.',
        }
      : {}),
    avertissementMeteo: AVERTISSEMENT_METEO,
  }
}

/**
 * Embedded catalogue publishes visual magnitude for a minority of objects (big emission nebulae
 * often lack it). None invented — plan says how many are excluded for this, else user concludes
 * sky empty when data is missing.
 * Sentence no longer concludes on catalogue: plan input = a selection; "dont beaucoup de grandes
 * nébuleuses" described 12 000 objects, not the three ticked.
 */
function noteCouverture(comptes: ReadonlyMap<CauseEcart, number>): string | undefined {
  const manquantes = comptes.get('DONNEE_MANQUANTE') ?? 0
  if (manquantes === 0) return undefined
  return `${manquantes} objets écartés faute de taille ou de magnitude connue.`
}

function contrainteDominante(
  comptes: ReadonlyMap<CauseEcart, number>,
): string | undefined {
  if (comptes.size === 0) return undefined
  const [code, nombre] = [...comptes.entries()].sort((a, b) => b[1] - a[1])[0]!
  return `Cause principale : ${LIBELLE_CAUSE_ECART[code]} (${nombre} cible${nombre > 1 ? 's' : ''}).`
}
