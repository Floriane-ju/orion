/**
 * §6.4 — le catalogue tel qu'une liste le montre : ce qui décide, par objet.
 *
 * Deux étages, du moins cher au plus cher, comme `session-candidates.ts`. Celui-ci est le
 * moins cher : brillance de surface (§6.3), taille projetée sur le capteur (§6.2), hauteur
 * et azimut à l'instant affiché (§3.1). Ce ne sont que des appels aux moteurs existants et
 * une multiplication de matrice — donc il passe sur les 14 000 entrées sans éphéméride.
 *
 * La POSE REQUISE et la NOTE DE FACILITÉ ne sont pas ici, et c'est délibéré : elles demandent
 * le créneau de la nuit, donc une éphéméride par cible. Elles viennent de `evalueCandidate`
 * (§8.3), appelée sur les seules candidates. Une seule convention d'extinction traverse ainsi
 * l'application — celle du plan de séance — et la liste ne peut pas annoncer une autre pose,
 * ni une autre note, que lui.
 *
 * Aucun objet n'est écarté. Sous l'horizon, sans magnitude, sans dimensions : la ligne
 * existe et dit ce qui manque. C'est `filtreLignes` qui restreint, sur demande explicite.
 */

import { ficheCadrage } from './framing.ts'
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
  type CibleEcartee,
  type ContexteSession,
  type PoidsScoring,
} from './session-types.ts'
import { K } from '../registry/constants.ts'
import { DOMAINES } from '../registry/domains.ts'
import type { VerdictCadrage } from '../registry/verdicts.ts'
import { TYPES_OBJET, type ObjetCielProfond, type TypeObjet } from '../data/deepsky.ts'

/**
 * T-0190 — une ligne sans coordonnées à l'instant, invariante tant que catalogue et optique ne
 * changent pas. La détectabilité, le cadrage et le tri en dépendent, le tri est fait, donc le
 * cache de ce niveau tient 96,6 % du coût d'une recalculée : il suffit d'ajouter azimut et
 * hauteur par minute.
 */
export interface LigneCibleInvariante {
  readonly objet: ObjetCielProfond
  /** §6.3 — `null` quand magnitude ou dimensions manquent : rien n'est estimé. */
  readonly sbObj: number | null
  readonly verdict: VerdictDetectabilite | null
  /** §6.2 — grand et petit axes projetés sur le capteur. `null` sans dimensions. */
  readonly grandAxePx: number | null
  readonly petitAxePx: number | null
  /**
   * §6.2 — fraction du cadre occupée par le grand axe, orientation comprise. C'est la place
   * sur la photo finale, invariante au pitch : deux boîtiers de résolutions différentes au
   * même capteur donnent le même remplissage et des diamètres en pixels différents.
   */
  readonly remplissage: number | null
  readonly verdictCadrage: VerdictCadrage | null
  readonly cadrable: boolean
}

export interface LigneCible extends LigneCibleInvariante {
  /** §3.1 — l'instant affiché par la scène. Négative sous l'horizon : la ligne reste. */
  readonly hauteurDeg: number
  readonly azimutDeg: number
}

/** T-0190 — paramètres invariants, pas dépendants de l'instant. */
export interface EntreeLignesInvariantes {
  readonly catalogue: readonly ObjetCielProfond[]
  readonly sbCiel: number
  readonly mLimOeil: number | null
  readonly dMm: number
  readonly fovHDeg: number
  readonly echApx: number
  readonly capteurHMm: number
}

export interface EntreeLignes extends EntreeLignesInvariantes {
  /** `cielInstantane(site, date).matrice` — J2000 équatorial → repère horizontal du site. */
  readonly matriceCiel: Mat3
}

/**
 * T-0190 — une ligne invariante par l'instant, triée du plus brillant au plus faible.
 * Détectabilité, cadrage et tri ne dépendent pas de la matrice, donc ce cache évite 96,6 %
 * du coût : il suffit d'ajouter azimut/hauteur par minute.
 *
 * Une magnitude absente part en FIN de tri plutôt que de valoir zéro (§6.4) : la traiter
 * comme un objet de magnitude 0 mettrait les entrées les moins documentées en tête.
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
 * T-0190 — ajoute azimut et hauteur à chaque ligne invariante selon la matrice de l'instant.
 * Coût : ≈1,1 ms sur 13 132 objets. Appelée une fois par minute pour laisser `useMemo`
 * recalculer les coordonnées seules, pas les invariants.
 */
export function ajouteCoordonnees(
  lignes: readonly LigneCibleInvariante[],
  matriceCiel: Mat3,
): readonly LigneCible[] {
  return lignes.map((ligne) => ({ ...ligne, ...coordonneesHorizon(ligne.objet, matriceCiel) }))
}

/** T-0221 — la liste et la fiche visent avec la même transformation, jamais deux. */
export function coordonneesHorizon(
  objet: ObjetCielProfond,
  matriceCiel: Mat3,
): { readonly hauteurDeg: number; readonly azimutDeg: number } {
  const horizon = versSpherique(applique(matriceCiel, versVecteur(objet.adDeg, objet.decDeg)))
  return { hauteurDeg: horizon.latitudeDeg, azimutDeg: horizon.longitudeDeg }
}

/**
 * Une ligne par objet du catalogue, du plus brillant au plus faible.
 *
 * Une magnitude absente part en FIN de tri plutôt que de valoir zéro (§6.4) : la traiter
 * comme un objet de magnitude 0 mettrait les entrées les moins documentées en tête.
 */
export function lignesCatalogue(entree: EntreeLignes): readonly LigneCible[] {
  return ajouteCoordonnees(lignesInvariantes(entree), entree.matriceCiel)
}

function ligneInvariante(
  objet: ObjetCielProfond,
  entree: EntreeLignesInvariantes,
): LigneCibleInvariante {
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

  // Le petit axe se déduit du grand par leur rapport, plutôt que de recalculer la
  // projection : un seul appel de moteur, donc un seul endroit où la formule §6.2 vit.
  // Sans petit axe au catalogue, `ficheCadrage` a déjà supposé l'objet circulaire.
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
  }
}

/** §6.4 — les types RÉELLEMENT présents, jamais l'énumération complète de §6.3. */
export function typesPresents(lignes: readonly LigneCible[]): readonly TypeObjet[] {
  return TYPES_OBJET.filter((type) => lignes.some((l) => l.objet.type === type))
}

export interface FiltreListe {
  /**
   * Les types cochés. Tous cochés, le filtre ne restreint pas ; aucun coché, il ne laisse rien
   * passer — une liste vide est la réponse honnête à « aucun type », pas un filtre à ignorer.
   */
  readonly types: ReadonlySet<TypeObjet>
  /** Magnitude intégrée maximale retenue. Au maximum du domaine, le filtre ne restreint pas. */
  readonly magMax: number
  readonly recherche: string
}

/**
 * §6.4 — les trois restrictions, appliquées AVANT tout plafond d'affichage.
 *
 * Une magnitude absente ne passe le filtre de magnitude que tant qu'il est au repos : dès
 * qu'on demande « plus brillant que 8 », affirmer qu'un objet sans magnitude l'est serait
 * une estimation inventée.
 *
 * La recherche garde l'ordre de `chercheCatalogue` — préfixes d'abord, puis du plus
 * brillant au plus faible — et sa portée est celle des lignes reçues, jamais plafonnée.
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

/** Vrai dès qu'un type au moins est décoché : la scène n'estompe rien tant que tout l'est. */
export function restreintParType(types: ReadonlySet<TypeObjet>): boolean {
  return TYPES_OBJET.some((t) => !types.has(t))
}

/**
 * Les lignes retenues, dans l'ordre que `filtreObjets` impose. La scène applique les MÊMES
 * trois restrictions aux marqueurs qu'elle estompe (`cibles-en-avant.ts`) : deux tamis
 * séparés auraient fini par retenir deux ensembles différents pour un seul réglage affiché.
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
// Second étage — le créneau et la note, qui coûtent une éphéméride par cible
// ---------------------------------------------------------------------------

/** Ce qu'une cible photographiable ce soir demande, avec le créneau qui le permet. */
export interface PoseCible {
  readonly tRequisS: number
  readonly nPoses: number
  readonly tPoseS: number
  /** §8.2 — minutes au-dessus du seuil d'imagerie pendant la fenêtre nocturne. */
  readonly dureeCreneauMin: number
  /** §7.3 — plus d'une quand l'intégration ne tient pas dans le créneau de la nuit. */
  readonly nNuits: number
}

/**
 * §6.4 — ce que le moteur a répondu sur une cible : sa note, et ce qu'elle coûte.
 *
 * Une entrée ABSENTE de la map n'est pas une cible impossible : c'est une cible que le moteur
 * n'a pas évaluée — hors des `CIBLES_EVALUEES_MAX` candidates, ou sans magnitude ni dimensions
 * au catalogue. La distinction porte tout le sens de l'affichage : « — » n'est pas 0.
 */
export interface EtatCible {
  /** 0 à `FACILITE_NOTE_MAX`. 0 ne vient jamais d'un score, seulement d'une cause d'écart. */
  readonly note: number
  readonly libelle: string
  /** `null` quand la cible est écartée : il n'y a alors pas de pose à annoncer. */
  readonly pose: PoseCible | null
  /** Renseignée pour la note 0 seulement — la cause vient du moteur, jamais d'ici. */
  readonly cause: string | null
}

/**
 * §6.4, T-0127 — « photographiable » a UNE définition, et c'est la POSE qui la porte.
 *
 * Pas la note : une cible écartée en a une (zéro) et sa cause avec. Pas la hauteur à l'instant
 * affiché : §6.4 l'interdit nommément, une cible basse maintenant qui culmine avant l'aube
 * reste photographiable. Le critère était écrit deux fois dans l'interface, chaque fois avec un
 * commentaire demandant de le garder d'accord avec l'autre — il l'est maintenant une seule.
 *
 * `undefined` n'est pas `false` par hasard : une cible que le moteur n'a pas évaluée n'est pas
 * une cible impossible, et dans les deux cas il n'y a pas de pose à proposer.
 */
export function photographiable(etat: EtatCible | undefined): boolean {
  return etat?.pose != null
}

/** Les trois dérivations qu'une évaluation demande, faites en un seul endroit. */
export interface EntreeEvaluation {
  readonly fenetre: Intervalle
  readonly sbCielBase: number
  readonly poids: PoidsScoring
}

/**
 * Les trois dérivations que `planSession` fait de son contexte, refaites à l'identique plutôt
 * que reçues en paramètre : un appelant libre de les fournir est un appelant libre de les
 * fournir autrement, donc d'annoncer une pose — et une note — que le plan ne reconnaît pas.
 *
 * `null` quand la nuit n'est pas chiffrable : sans fenêtre de référence, aucun créneau n'existe.
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

function etat(r: Candidate | CibleEcartee): EtatCible | null {
  // Une écartée du PRÉ-filtrage arrive ici par le même chemin qu'une écartée de l'évaluation
  // complète : les deux sont des `CibleEcartee`, portent le même code et la même cause. C'est
  // ce qui permet à la liste de nommer 4 500 refus de cadrage sans payer 4 500 éphémérides.
  const facilite = faciliteCible(r)
  if (facilite === null) return null
  if (!('objet' in r)) {
    return { note: facilite.note, libelle: facilite.libelle, pose: null, cause: r.cause }
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
  }
}

/**
 * §6.4 — les cibles que la nuit permet, le temps que chacune demande, et sa note de facilité.
 *
 * Photographiable ne veut pas dire « levée maintenant ». Le PRD l'interdit explicitement :
 * filtrer sur la hauteur instantanée ferait disparaître une cible qui sera excellente dans
 * deux heures. Le critère est le CRÉNEAU — un passage au-dessus du seuil d'imagerie pendant
 * la fenêtre nocturne, un cadrage que le capteur tient, une intégration à portée.
 *
 * Rien de tout cela n'est recalculé ici : `evalueCandidate` (§8.3) le fait déjà pour le plan
 * de séance, extinction par masse d'air moyenne du créneau et Lune au milieu du créneau
 * comprises. Réemployer ce moteur est ce qui garantit que la liste et le plan annoncent la
 * MÊME pose pour la même cible — le désaccord que T-0089 a corrigé une fois.
 *
 * Les cibles ÉCARTÉES entrent aussi, avec la note 0 et leur cause — celles du pré-filtrage
 * comme celles de l'évaluation complète. C'est ce qui rend la carte et la liste capables de
 * dire la même chose : sur un 120 mm plein format, ONZE objets du catalogue passent jusqu'au
 * calcul de créneau et quatre mille cinq cents sont refusés au cadrage. Ne noter que les onze
 * laissait la liste presque vide de notes pendant que la carte en affichait une pour tout ce
 * qu'on clique — deux réponses à la même question.
 *
 * Un 0 muet serait le pire des deux : sans cause affichée, l'utilisateur ne sait pas quel
 * levier tirer.
 */
export function etatsCibles(
  contexte: ContexteSession,
  catalogue: readonly ObjetCielProfond[],
): ReadonlyMap<string, EtatCible> {
  const etats = new Map<string, EtatCible>()
  const entree = prepareEvaluation(contexte)
  if (entree === null) return etats

  // Toutes les causes, mais pas tous les créneaux : nommer une écartée ne coûte qu'une chaîne.
  const { candidates, ecartees } = preFiltre(
    contexte,
    catalogue,
    K('CIBLES_EVALUEES_MAX'),
    catalogue.length,
  )

  for (const ecartee of ecartees) {
    const e = etat(ecartee)
    if (e !== null) etats.set(ecartee.designation, e)
  }
  for (const objet of candidates) {
    const e = etat(evalueCandidate(contexte, objet, entree.fenetre, entree.sbCielBase, entree.poids))
    if (e !== null) etats.set(objet.designation, e)
  }
  return etats
}
