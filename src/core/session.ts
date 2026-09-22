/**
 * §8.3 — Plan de session ordonné.
 *
 * L'ENTRÉE EST LA SÉLECTION DE L'UTILISATEUR, jamais le catalogue. §6.4 lui donne de quoi
 * choisir ; ce module ordonne ce qu'il a choisi. Un plan qu'on n'a pas demandé est un palmarès
 * de plus, et la sortie est UNE CHRONOLOGIE, PAS UN PALMARÈS : un palmarès n'est pas exécutable
 * sur le terrain, une chronologie l'est. Quatre règles tiennent ce module :
 *
 *   1. PRÉ-FILTRAGE PAR CONTRAINTE DURE, chaque exclusion nommant sa cause. Il ne réduit plus
 *      un catalogue : il dit pourquoi une cible CHOISIE ne tient pas. La liste des écartées
 *      n'est jamais mélangée à la chronologie.
 *   2. SCORING EXPLICITE ET EXPOSÉ (C-15) : chaque cible porte la décomposition de son score.
 *   3. ARBITRAGE DES CONFLITS PAR SCORE. Les créneaux se chevauchent : la nuit est une
 *      ressource à allouer, pas une liste à trier. L'allocation se fait donc par score
 *      décroissant — c'est l'arbitrage de §8.3 — et le plan est rendu dans l'ordre du temps.
 *   4. JAMAIS DE TRONCATURE SILENCIEUSE, ET JAMAIS DE RETRAIT D'UN CHOIX. Un budget dépassé
 *      est ANNONCÉ, pas résolu en supprimant une cible : la sélection vient de l'utilisateur,
 *      et une cible que la liste annonce photographiable se retrouve au plan. Une intégration
 *      qui ne tient pas dans la nuit annonce son nombre de nuits — le même que la liste.
 *
 * Ce fichier assemble ; les trois étages qu'il assemble vivent à côté : le vocabulaire dans
 * `session-types.ts`, le scoring dans `session-score.ts`, le tri des candidates dans
 * `session-candidates.ts` et l'allocation de la nuit dans `session-nuit.ts`.
 */

import { K } from '../registry/constants.ts'
import { LIBELLE_CAUSE_ECART } from '../registry/libelles.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { Intervalle } from './creneaux.ts'
import { dureeLisible } from './exposure.ts'
import { planCalibration } from './calibration.ts'
import { rappelBatterie } from './rappel-batterie.ts'
import { evalueCandidate, preFiltre } from './session-candidates.ts'
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

const MS_PAR_MINUTE = 60000
const S_PAR_MINUTE = 60
const MINUTES_PAR_HEURE = 60

/**
 * §8.3 — l'état de départ du plan, et il dit le geste qui manque.
 *
 * « Aucune cible adaptée » aurait accusé le ciel d'un plan qu'on n'a pas encore composé.
 * Exporté pour que l'écran et le test le citent plutôt que de le recopier.
 */
export const AUCUNE_CIBLE_CHOISIE =
  'Aucune cible choisie : ouvrez la fiche d’une cible photographiable et ajoutez-la au plan.'

export function planSession(
  contexte: ContexteSession,
  /** Les cibles retenues par l'utilisateur (§6.4), et elles seules. */
  choisies: readonly ObjetCielProfond[],
): PlanSession {
  // Le plan travaille toujours sur des poids normalisés : ce que la saisie livre est brut.
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

  // §5.2 — domaine ciel profond verrouillé : le plan n'est pas vide « faute de cible », il est
  // fermé, et il le dit avec le grand champ en alternative. `preFiltre` écarterait déjà tout,
  // mais le titre de l'écran doit nommer le suivi, pas une contrainte dominante anonyme.
  if (contexte.domaineCpFerme !== null) {
    return planVide(contexte, poids, [], new Map(), null, contexte.domaineCpFerme)
  }

  // Rien de choisi n'est pas « rien de compatible » : le grand champ ne remplace pas un geste
  // qui n'a pas été fait, et proposer une alternative à qui n'a rien demandé masque la marche
  // à suivre. Placé APRÈS la nuit et le domaine — eux ferment le plan, pas l'utilisateur.
  if (choisies.length === 0) {
    return planVide(contexte, poids, [], new Map(), null, null, AUCUNE_CIBLE_CHOISIE)
  }

  const sbCielBase = contexte.sbCielNoir - contexte.nuit.penaliteSbMag
  // Aucun plafond : C-20 bornait le coût d'un balayage de catalogue. Sur une sélection, il
  // écarterait en SILENCE une cible explicitement demandée — la règle 4 l'interdit.
  const prefiltre = preFiltre(contexte, choisies, choisies.length, choisies.length)
  const ecartees: CibleEcartee[] = [...prefiltre.ecartees]
  const comptes = new Map(prefiltre.comptes)
  const retenues = evalueCandidates(contexte, prefiltre.candidates, { debut, fin }, sbCielBase, poids, ecartees, comptes)

  if (retenues.length === 0) {
    return planVide(contexte, poids, ecartees, comptes, null)
  }

  // Première passe : sans calibration réservée, elle n'est chiffrable qu'une fois le plan posé.
  const essai = alloueLaNuit(contexte, retenues, [], plafondCapture(contexte, retenues.length, 0))
  const calibrationEssai = calibrationDeSession(contexte, essai)
  // Seconde passe, celle qui compte : la calibration mesurée est réservée comme les frais fixes.
  const etapes = alloueLaNuit(
    contexte,
    retenues,
    ecartees,
    plafondCapture(
      contexte,
      retenues.length,
      calibrationEssai === null ? 0 : calibrationEssai.surcoutTempsMin.value,
    ),
  )
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
      `la nuit : ${dureeLisible(budget.totalMin.value * S_PAR_MINUTE)} sur ` +
      `${dureeLisible(budget.disponibleMin * S_PAR_MINUTE)} disponibles.`,
    ...(noteCouverture(comptes) === undefined
      ? {}
      : { noteCouvertureCatalogue: noteCouverture(comptes)! }),
    avertissementMeteo: AVERTISSEMENT_METEO,
    ...(rappelCapture === null ? {} : { avertissementBatterie: rappelCapture }),
  }
}

/**
 * Les candidates du pré-filtrage passées aux moteurs, triées en retenues et écartées.
 *
 * Le refus de domaine est absorbé par `evalueCandidate` lui-même (§12.5) : chaque appelant
 * de ce moteur en a besoin, pas seulement le plan.
 */
function evalueCandidates(
  contexte: ContexteSession,
  candidates: readonly ObjetCielProfond[],
  fenetre: Intervalle,
  sbCielBase: number,
  poids: PoidsScoring,
  ecartees: CibleEcartee[],
  comptes: Map<CauseEcart, number>,
): readonly Candidate[] {
  const retenues: Candidate[] = []
  for (const objet of candidates) {
    const resultat = evalueCandidate(contexte, objet, fenetre, sbCielBase, poids)
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
 * §8.3 — LA NUIT SE PARTAGE, ELLE NE SE PREND PAS. Deux règles, et c'est tout.
 *
 * 1. ON SERT LA PLUS PETITE DEMANDE D'ABORD. La demande d'une cible, c'est ce qu'elle
 *    consommera VRAIMENT ce soir : `min(T_requis, durée de son créneau)`. Une cible qui ne
 *    passe qu'une heure au-dessus du seuil demande une heure, même s'il lui en faut seize.
 * 2. PERSONNE NE PREND PLUS QUE SA PART tant que d'autres attendent. La part est ce qui reste
 *    de libre DANS SON CRÉNEAU, divisé par le nombre de cibles encore à servir qui se
 *    disputent ce même morceau de nuit.
 *
 * C'est le partage équitable max-min, et les deux règles se tiennent l'une l'autre : servies
 * par demande croissante, les cibles qui se contentent de peu libèrent leur surplus pour les
 * suivantes, donc la part ne borne que celles qui, de toute façon, en voulaient plus. Aucune
 * minute de nuit n'est perdue, et aucune cible n'est affamée.
 *
 * T-0322 — sans ces deux règles, `alloueCreneau` bornait à ce que la cible RÉCLAME, et une
 * cible de seize heures réclame plus que la nuit entière : servie en premier par son score,
 * IC 1805 prenait les cinq heures et M 42 — neuf minutes à poser — ressortait « non retenue »
 * alors que la liste, elle, l'annonçait photographiable.
 *
 * LE SCORE N'A PAS DISPARU : il départage les demandes égales, ce qui est le seul moment où
 * §8.3 le réclame — deux cibles qui veulent exactement le même morceau de nuit.
 *
 * Le plan est ensuite rendu dans l'ordre du temps — une chronologie.
 */
function alloueLaNuit(
  contexte: ContexteSession,
  retenues: readonly Candidate[],
  ecartees: CibleEcartee[],
  /** Minutes de capture que la nuit laisse une fois ses frais fixes réservés. */
  plafondCaptureMin: number,
): readonly EtapePlan[] {
  const demandeMin = (c: Candidate): number =>
    Math.min(c.integration.tRequisS.value / S_PAR_MINUTE, c.creneau.dureeTotaleMin.value)
  const ordre = retenues
    .slice()
    .sort((a, b) => demandeMin(a) - demandeMin(b) || b.score.value - a.score.value)

  const occupes: Intervalle[] = []
  const etapes: EtapePlan[] = []
  let resteCaptureMin = plafondCaptureMin

  for (const [rang, candidate] of ordre.entries()) {
    // Les cibles encore à servir qui visent le même morceau de nuit, celle-ci comprise : c'est
    // en autant de parts que son temps libre se divise. Des créneaux disjoints ne se gênent
    // pas, et les compter ferait réserver du temps que personne ne pourrait prendre.
    const concurrentes =
      1 +
      ordre
        .slice(rang + 1)
        .filter((autre) => creneauxSeChevauchent(autre.creneau, candidate.creneau)).length
    const part = minutesLibres(candidate.creneau, occupes) / concurrentes
    // Le plafond cesse de mordre une fois épuisé : il sert à faire TENIR un plan ordinaire,
    // pas à rendre des étapes de zéro minute quand la sélection est déraisonnable. Passé ce
    // point, chacune garde sa part et c'est le budget qui annonce le dépassement.
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
 * §8.3 — les minutes que la nuit laisse VRAIMENT à la capture.
 *
 * Mise en station, pointages et calibration ne sont pas des frais qu'on découvre à la fin :
 * ils se réservent d'abord, sinon l'allocation promet une capture que la nuit ne peut pas
 * tenir, et le plan se referme sur un dépassement de quelques minutes qu'il suffisait de ne
 * pas distribuer. La calibration, elle, dépend du plan qu'elle chiffre — d'où les deux passes
 * de `planSession` : la première la mesure, la seconde la réserve.
 */
function plafondCapture(
  contexte: ContexteSession,
  nCibles: number,
  calibrationMin: number,
): number {
  const disponibleMin = contexte.nuit.dureeReferenceH * MINUTES_PAR_HEURE
  const fixes =
    K('TEMPS_MISE_EN_STATION_MIN') + K('TEMPS_POINTAGE_PAR_CIBLE_MIN') * nCibles + calibrationMin
  return Math.max(0, disponibleMin - fixes)
}

/**
 * La calibration est prise une fois pour la session : même ISO, même optique, et des darks à
 * la pose de la première cible du plan (§7.4).
 */
function calibrationDeSession(contexte: ContexteSession, etapes: readonly EtapePlan[]) {
  const premiere = etapes[0]
  if (premiere === undefined) return null
  return planCalibration({
    tPoseS: premiere.tPoseS,
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
  const tRequisMin = candidate.integration.tRequisS.value / S_PAR_MINUTE
  const complete = dureeAlloueeMin >= tRequisMin
  const nPoses = complete
    ? candidate.integration.nPoses.value
    : Math.floor((dureeAlloueeMin * S_PAR_MINUTE) / candidate.pose.tAfficheeS)
  // T-0322 — le nombre de nuits vient de `planIntegration`, comme pour la liste du catalogue :
  // il se déduit du CRÉNEAU de la cible, pas de ce que l'allocation lui laisse ce soir. Calculé
  // ici sur la durée allouée, il annonçait quatre nuits là où la fiche en annonçait deux — deux
  // réponses à la même question, et c'est celle de la cible qui est la bonne.
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
    `Poses de ${candidate.pose.tAfficheeS} s, ` +
    `${dureeAlloueeMin.toFixed(0)} min sur cette cible. ${candidate.cadrage.noteOrientation}`
  if (complete) return base
  // Ce soir n'est pas tout : la cible reste au plan, et la consigne dit ce qu'on en emporte.
  // Deux manques différents, deux phrases : la cible dépasse la nuit, ou son créneau est
  // partagé. « Prévoir 1 nuits » aurait été le prix d'une seule phrase pour les deux.
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
  /** §5.2 — le domaine fermé garde son alternative : c'est la nuit absente qui n'en a pas. */
  causeDomaine: string | null = null,
  /** §8.3 — rien n'a été choisi : ni contrainte à nommer, ni alternative à proposer. */
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
 * Le catalogue embarqué ne publie une magnitude visuelle que pour une minorité d'objets :
 * les grandes nébuleuses en émission n'en ont souvent pas. Aucune n'est inventée — mais le
 * plan dit combien d'objets sont écartés pour cette raison, faute de quoi l'utilisateur
 * conclut que le ciel est vide alors que c'est la donnée qui manque.
 *
 * La phrase ne conclut plus sur le catalogue : l'entrée du plan est une sélection, et « dont
 * beaucoup de grandes nébuleuses » décrivait un ensemble de douze mille objets, pas les trois
 * que l'utilisateur a cochés.
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
