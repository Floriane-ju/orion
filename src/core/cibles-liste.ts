/**
 * §6.4 — catalogue as a list shows it: what decides, per object.
 *
 * Two étages, cheapest first, like `session-candidates.ts`. This is the cheapest: brillance de
 * surface (§6.3), size projected on sensor (§6.2), hauteur/azimut at displayed instant (§3.1).
 * Only existing engine calls + a matrix multiply → 14 000 entries without éphéméride.
 *
 * POSE REQUISE and NOTE DE FACILITÉ deliberately absent: need the night's créneau → one
 * éphéméride per cible. They come from `evalueCandidate` (§8.3), on candidates only. One
 * extinction convention app-wide (the plan's): list can't announce another pose/note than plan.
 *
 * No object discarded. Below horizon, no magnitude, no dimensions: line exists and says what's
 * missing. `filtreLignes` restricts, on explicit request.
 */

import { ficheCadrage } from './cadrage.ts'
import { detectabilite, type VerdictDetectabilite } from './detectability.ts'
import { applique, versSpherique, versVecteur, type Mat3 } from './mat3.ts'
import { chercheCatalogue } from './recherche-catalogue.ts'
import { evalueCandidate, preFiltre } from './session-candidates.ts'
import { faciliteCible } from './facilite.ts'
import type { Intervalle } from './creneaux.ts'
import {
  normalisePoids,
  poidsParDefaut,
  type Candidate,
  type CauseEcart,
  type CibleEcartee,
  type ContexteDe,
  type ContexteSession,
  type PoidsScoring,
} from './session-types.ts'
import { K } from '../registry/constants.ts'
import { DOMAINES } from '../registry/domains.ts'
import type { VerdictCadrage } from '../registry/verdicts.ts'
import { TYPES_OBJET, type ObjetCielProfond, type TypeObjet } from '../data/deepsky.ts'

/**
 * T-0190 — line without coordinates at the instant; invariant while catalogue and optique
 * don't change. Détectabilité, cadrage, sort depend on it → cache here holds 96,6 % of a
 * recompute's cost: only azimut/hauteur to add per minute.
 */
export interface LigneCibleInvariante {
  readonly objet: ObjetCielProfond
  /** §6.3 — `null` when magnitude or dimensions missing: nothing estimated. */
  readonly sbObj: number | null
  readonly verdict: VerdictDetectabilite | null
  /** §6.2 — major and minor axes projected on sensor. `null` without dimensions. */
  readonly grandAxePx: number | null
  readonly petitAxePx: number | null
  /**
   * §6.2 — cadre fraction occupied by major axis, orientation included. Place on final photo,
   * pitch-invariant: 2 boîtiers of different resolution on same sensor → same fill, different
   * pixel diameters.
   */
  readonly remplissage: number | null
  readonly verdictCadrage: VerdictCadrage | null
  readonly cadrable: boolean
  /** T-0407 — under a zoom, optimal focale the line is read at; `null` otherwise. */
  readonly focaleMm: number | null
}

export interface LigneCible extends LigneCibleInvariante {
  /** §3.1 — instant displayed by scène. Negative below horizon: the line stays. */
  readonly hauteurDeg: number
  readonly azimutDeg: number
}

/** T-0190 — invariant parameters, not instant-dependent. */
export interface EntreeLignesInvariantes {
  readonly catalogue: readonly ObjetCielProfond[]
  readonly sbCiel: number
  readonly mLimOeil: number | null
  readonly dMm: number
  readonly fovHDeg: number
  readonly echApx: number
  readonly capteurHMm: number
  /** T-0407 — under a zoom, champ, échantillonnage and pupil of each cible's focale. */
  readonly contexteDe?: ContexteDe
}

export interface EntreeLignes extends EntreeLignesInvariantes {
  /** `cielInstantane(site, date).matrice` — J2000 equatorial → site horizontal frame. */
  readonly matriceCiel: Mat3
}

/**
 * T-0190 — instant-invariant line, sorted brightest to faintest. Détectabilité, cadrage, sort
 * don't depend on the matrix → cache skips 96,6 % of cost. Missing magnitude goes LAST (§6.4),
 * not as 0: else least documented entries would lead.
 */
export function lignesInvariantes(
  entree: EntreeLignesInvariantes,
): readonly LigneCibleInvariante[] {
  const lignes = entree.catalogue.map((objet) => ligneInvariante(objet, entree))
  return lignes.sort(
    (a, b) =>
      (a.objet.vMag ?? Number.POSITIVE_INFINITY) - (b.objet.vMag ?? Number.POSITIVE_INFINITY),
  )
}

/**
 * T-0190 — adds azimut/hauteur to each invariant line from instant's matrix. ≈1,1 ms over
 * 13 132 objects. Called once per minute → `useMemo` recomputes coordinates only.
 */
export function ajouteCoordonnees(
  lignes: readonly LigneCibleInvariante[],
  matriceCiel: Mat3,
): readonly LigneCible[] {
  return lignes.map((ligne) => ({ ...ligne, ...coordonneesHorizon(ligne.objet, matriceCiel) }))
}

/** T-0221 — list and fiche aim with the same transformation, never two. */
export function coordonneesHorizon(
  objet: Pick<ObjetCielProfond, 'adDeg' | 'decDeg'>,
  matriceCiel: Mat3,
): { readonly hauteurDeg: number; readonly azimutDeg: number } {
  const horizon = versSpherique(applique(matriceCiel, versVecteur(objet.adDeg, objet.decDeg)))
  return { hauteurDeg: horizon.latitudeDeg, azimutDeg: horizon.longitudeDeg }
}

/**
 * One line per catalogue object, brightest to faintest. Missing magnitude goes LAST (§6.4), not
 * as 0: else least documented entries would lead.
 */
export function lignesCatalogue(entree: EntreeLignes): readonly LigneCible[] {
  return ajouteCoordonnees(lignesInvariantes(entree), entree.matriceCiel)
}

function ligneInvariante(
  objet: ObjetCielProfond,
  base: EntreeLignesInvariantes,
): LigneCibleInvariante {
  const optique = base.contexteDe?.(objet)
  const entree = optique === undefined ? base : { ...base, ...optiqueDe(optique) }
  const focaleMm = optique?.focaleMm ?? null
  const detect = detectabilite({
    mInt: objet.vMag,
    aArcmin: objet.majAxArcmin,
    bArcmin: objet.minAxArcmin,
    typeObjet: objet.type,
    sbCiel: entree.sbCiel,
    mLimOeil: entree.mLimOeil,
    dMm: entree.dMm,
  })

  const majAxArcmin = objet.majAxArcmin
  if (majAxArcmin === null || majAxArcmin <= 0) {
    return {
      objet,
      sbObj: detect.sbObj.value,
      verdict: detect.verdict,
      grandAxePx: null,
      petitAxePx: null,
      remplissage: null,
      verdictCadrage: null,
      cadrable: false,
      focaleMm,
    }
  }

  const cadrage = ficheCadrage({
    fovHDeg: entree.fovHDeg,
    echApx: entree.echApx,
    capteurHMm: entree.capteurHMm,
    tailleMajArcmin: majAxArcmin,
    tailleMinArcmin: objet.minAxArcmin,
    posAngDeg: objet.posAngDeg,
  })

  // Minor axis derived from major by ratio, not re-projected: one engine call → one place for
  // the §6.2 formula. No minor axis in catalogue: `ficheCadrage` already assumed circular.
  const grandAxePx = cadrage.diamPx.value
  const minAxArcmin = objet.minAxArcmin

  return {
    objet,
    sbObj: detect.sbObj.value,
    verdict: detect.verdict,
    grandAxePx,
    petitAxePx:
      minAxArcmin === null ? grandAxePx : grandAxePx * (minAxArcmin / majAxArcmin),
    remplissage: cadrage.remplissage.value,
    verdictCadrage: cadrage.verdict,
    cadrable: cadrage.faisable,
    focaleMm,
  }
}

function optiqueDe(c: ContexteSession) {
  return { fovHDeg: c.fovHDeg, echApx: c.echApx, dMm: c.dMm, capteurHMm: c.capteurHMm }
}

/** §6.4 — types ACTUALLY present, never the full §6.3 enumeration. */
export function typesPresents(lignes: readonly LigneCible[]): readonly TypeObjet[] {
  return TYPES_OBJET.filter((type) => lignes.some((l) => l.objet.type === type))
}

export interface FiltreListe {
  /**
   * Checked types. All checked: no restriction; none checked: nothing passes — empty list is the
   * honest answer to "no type", not a filter to ignore.
   */
  readonly types: ReadonlySet<TypeObjet>
  /** Max integrated magnitude kept. At domain max, filter doesn't restrict. */
  readonly magMax: number
  readonly recherche: string
}

/**
 * §6.4 — the 3 restrictions, applied BEFORE any display cap. Missing magnitude passes the
 * magnitude filter only at rest: once "brighter than 8" is asked, claiming an object without
 * magnitude is one = invented estimate. Search keeps `chercheCatalogue` order (prefixes first,
 * then brightest to faintest); scope = received lines, never capped.
 */
export function filtreObjets(
  objets: readonly ObjetCielProfond[],
  filtre: FiltreListe,
): readonly ObjetCielProfond[] {
  const parType = restreintParType(filtre.types)
    ? objets.filter((o) => filtre.types.has(o.type))
    : objets

  const parMag =
    filtre.magMax >= DOMAINES.m_int.max
      ? parType
      : parType.filter((o) => o.vMag !== null && o.vMag <= filtre.magMax)

  if (filtre.recherche.trim() === '') return parMag

  return chercheCatalogue(parMag, filtre.recherche, parMag.length)
}

/**
 * True once a type is retained without all being. None retained restricts nothing: an empty
 * filter emptying the list would say only "nothing", never why.
 */
export function restreintParType(types: ReadonlySet<TypeObjet>): boolean {
  return types.size > 0 && TYPES_OBJET.some((t) => !types.has(t))
}

/**
 * Retained lines, in `filtreObjets` order. Scène applies the SAME 3 restrictions to the markers
 * it fades (`cibles-en-avant.ts`): two sieves would retain two sets for one displayed setting.
 */
export function filtreLignes(
  lignes: readonly LigneCible[],
  filtre: FiltreListe,
): readonly LigneCible[] {
  const parDesignation = new Map(lignes.map((l) => [l.objet.designation, l]))
  return filtreObjets(
    lignes.map((l) => l.objet),
    filtre,
  ).map((o) => parDesignation.get(o.designation)!)
}

// ---------------------------------------------------------------------------
// Second étage — créneau and note, costing one éphéméride per cible
// ---------------------------------------------------------------------------

/** What a cible shootable tonight needs, with the créneau allowing it. */
export interface PoseCible {
  readonly tRequisS: number
  readonly nPoses: number
  readonly tPoseS: number
  /** §8.2 — minutes above imaging threshold during the nocturnal window. */
  readonly dureeCreneauMin: number
  /** §7.3 — more than one when integration doesn't fit the night's créneau. */
  readonly nNuits: number
}

/**
 * §6.4 — engine's answer on a cible: its note and cost. ABSENT map entry ≠ impossible cible:
 * not evaluated (outside the `CIBLES_EVALUEES_MAX` candidates, or no magnitude/dimensions).
 * Display relies on it: "—" isn't 0.
 */
export interface EtatCible {
  /** 0 to `FACILITE_NOTE_MAX`. 0 only from a discard cause, never a score. */
  readonly note: number
  readonly libelle: string
  /** `null` when cible is discarded: no pose to announce. */
  readonly pose: PoseCible | null
  /** Set for note 0 only — cause comes from engine, never from here. */
  readonly cause: string | null
  /**
   * T-0379, T-0380 — cause code: card derives the lever to price (focale, date) without
   * re-reading the sentence. `null` with the cause.
   */
  readonly code: CauseEcart | null
}

/**
 * §6.4, T-0127 — "photographiable" has ONE definition, carried by the POSE. Not the note (a
 * discarded cible has one: zero + cause). Not hauteur at displayed instant: §6.4 forbids it, a
 * cible low now that culminates before dawn stays photographiable. Was written twice in the UI
 * with "keep in sync" comments; now once. `undefined` ≠ `false`: unevaluated cible isn't
 * impossible; either way no pose to offer.
 */
export function photographiable(etat: EtatCible | undefined): boolean {
  return etat?.pose != null
}

/** The three derivations an evaluation needs, in one place. */
export interface EntreeEvaluation {
  readonly fenetre: Intervalle
  readonly sbCielBase: number
  readonly poids: PoidsScoring
}

/**
 * The 3 derivations `planSession` makes of its context, redone identically not passed in: a
 * caller free to supply them could supply them differently → pose and note the plan doesn't
 * recognise. `null` when night isn't computable: no reference window, no créneau.
 */
export function prepareEvaluation(contexte: ContexteSession): EntreeEvaluation | null {
  const debut = contexte.nuit.debutReference
  const fin = contexte.nuit.finReference
  if (debut === null || fin === null) return null
  return {
    fenetre: { debut, fin },
    sbCielBase: contexte.sbCielNoir - contexte.nuit.penaliteSbMag,
    poids: normalisePoids(contexte.poids ?? poidsParDefaut()),
  }
}

/**
 * T-0294 — evaluations already done, per context then per object. Plan and list start from the
 * SAME context (`app-calcul.ts` passes the same object) and each evaluated its candidates: same
 * computation twice per context change. Sharing lives in the engine, not a UI memo: plan and
 * list read the same result, not just the same computation — source of T-0268 disagreement.
 * Keyed by IDENTITY: context and catalogue object immutable. 2 `WeakMap`s drop all with the
 * replaced context, no eviction. Designation = wrong key: 2 distinct objects can carry it
 * (tests do).
 */
const evaluations = new WeakMap<
  ContexteSession,
  {
    readonly entree: EntreeEvaluation
    readonly parObjet: WeakMap<ObjetCielProfond, Candidate | CibleEcartee>
  }
>()

/**
 * §8.3 — full evaluation of a candidate, once per context whatever the caller. `null` when
 * night isn't computable, like `prepareEvaluation`.
 */
export function evaluation(
  contexte: ContexteSession,
  objet: ObjetCielProfond,
): Candidate | CibleEcartee | null {
  let memo = evaluations.get(contexte)
  if (memo === undefined) {
    const entree = prepareEvaluation(contexte)
    if (entree === null) return null
    memo = { entree, parObjet: new WeakMap() }
    evaluations.set(contexte, memo)
  }
  const deja = memo.parObjet.get(objet)
  if (deja !== undefined) return deja
  const { fenetre, sbCielBase, poids } = memo.entree
  const resultat = evalueCandidate(contexte, objet, fenetre, sbCielBase, poids)
  memo.parObjet.set(objet, resultat)
  return resultat
}

function etat(r: Candidate | CibleEcartee): EtatCible | null {
  // A PRE-filter discard arrives here by the same path as a full-evaluation one: both
  // `CibleEcartee`, same code and cause. List can name 4 500 cadrage refusals without paying
  // 4 500 éphémérides.
  const facilite = faciliteCible(r)
  if (facilite === null) return null
  if (!('objet' in r)) {
    return {
      note: facilite.note,
      libelle: facilite.libelle,
      pose: null,
      cause: r.cause,
      code: r.code,
    }
  }
  return {
    note: facilite.note,
    libelle: facilite.libelle,
    pose: {
      tRequisS: r.integration.tRequisS.value,
      nPoses: r.integration.nPoses.value,
      tPoseS: r.pose.tAfficheeS,
      dureeCreneauMin: r.creneau.dureeTotaleMin.value,
      nNuits: r.integration.nNuits?.value ?? 1,
    },
    cause: null,
    code: null,
  }
}

/**
 * §6.4 — cibles the night allows, time each needs, facilité note.
 *
 * Photographiable ≠ "risen now" (PRD): instantaneous-hauteur filter would drop a cible excellent
 * in 2 hours. Criterion = CRÉNEAU: pass above imaging threshold in the nocturnal window, cadrage
 * the sensor holds, integration within reach.
 *
 * Nothing recomputed: `evalueCandidate` (§8.3) already does it for the plan (extinction by mean
 * masse d'air of créneau, Lune at créneau middle). Reuse → list and plan announce the SAME pose
 * for the same cible — T-0089 disagreement fixed once.
 *
 * DISCARDED cibles enter too, note 0 + cause (pre-filter and full-evaluation alike), so card and
 * list agree: on 120 mm plein format ELEVEN objects reach créneau computation, 4 500 are refused
 * at cadrage. Rating only the eleven left the list nearly empty of notes while the card showed
 * one for everything clicked. Silent 0 worse: no cause → user doesn't know which lever to pull.
 */
export function etatsCibles(
  contexte: ContexteSession,
  catalogue: readonly ObjetCielProfond[],
  /** T-0407 — under a zoom, each cible at its optimal focale; plan receives the same. */
  contexteDe?: ContexteDe,
): ReadonlyMap<string, EtatCible> {
  const etats = new Map<string, EtatCible>()
  if (prepareEvaluation(contexte) === null) return etats

  // All causes, not all créneaux: naming a discarded one costs only a string.
  const { candidates, ecartees } = preFiltre(
    contexte,
    catalogue,
    K('CIBLES_EVALUEES_MAX'),
    catalogue.length,
    contexteDe,
  )

  for (const ecartee of ecartees) {
    const e = etat(ecartee)
    if (e !== null) etats.set(ecartee.designation, e)
  }
  for (const objet of candidates) {
    const resultat = evaluation(contexteDe?.(objet) ?? contexte, objet)
    const e = resultat === null ? null : etat(resultat)
    if (e !== null) etats.set(objet.designation, e)
  }
  return etats
}
