/**
 * §8.3 — Le vocabulaire du plan de session : ce qu'on lui donne, ce qu'il rend.
 *
 * Ces déclarations sont partagées par les quatre étages du plan — pré-filtrage, évaluation
 * d'une candidate, allocation de la nuit, assemblage — et n'appartiennent à aucun d'eux.
 * Elles vivent donc à part, pour que chaque étage puisse les lire sans dépendre des autres.
 */

import { K } from '../registry/constants.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { FamilleFiltre } from '../registry/filters.ts'
import type { VerdictCadrage } from '../registry/verdicts.ts'
import type { CreneauCible, Intervalle } from './creneaux.ts'
import type { Detectabilite, VerdictDetectabilite } from './detectability.ts'
import type { Site } from './ephem.ts'
import type { FicheCadrage } from './framing.ts'
import type { FluxObjetReel, PlanIntegration, PoseUnitaire } from './exposure.ts'
import type { PlanCalibration } from './calibration.ts'
import type { FenetreUtile } from './moon.ts'
import type { FenetreNocturne } from './night.ts'
import type { MasqueHorizon } from './site.ts'
import type { TypeMonture } from './tracking.ts'
import type { Traced } from './traced.ts'

export type CauseEcart =
  | 'DONNEE_MANQUANTE'
  | 'CADRAGE'
  | 'HAUTEUR'
  | 'RELIEF'
  | 'FENETRE'
  | 'HORS_PORTEE'
  | 'CONFLIT_CRENEAU'
  | 'SUIVI'

export interface CibleEcartee {
  readonly designation: string
  readonly code: CauseEcart
  readonly cause: string
}

export interface PoidsScoring {
  readonly cadrage: number
  readonly hauteur: number
  readonly signal: number
  readonly fenetre: number
  readonly lune: number
}

/** Poids C-15 par défaut : exposés et réglables, jamais appris (§8.3). */
export function poidsParDefaut(): PoidsScoring {
  return Object.freeze({
    cadrage: K('POIDS_SCORING_CADRAGE'),
    hauteur: K('POIDS_SCORING_HAUTEUR'),
    signal: K('POIDS_SCORING_SNR'),
    fenetre: K('POIDS_SCORING_FENETRE'),
    lune: K('POIDS_SCORING_LUNE'),
  })
}

/**
 * §8.3 — la somme des cinq poids vaut 1, quelle que soit la façon dont ils ont été réglés.
 *
 * Cinq curseurs indépendants plutôt qu'une redistribution des quatre autres à chaque geste :
 * redistribuer ferait bouger des valeurs que l'utilisateur n'a pas touchées, et le résultat
 * dépendrait de l'ordre des gestes — donc ne serait plus reproductible.
 *
 * Une somme nulle rendrait tous les scores NaN et l'arbitrage de créneau silencieusement
 * aléatoire : elle retombe sur C-15, la référence.
 */
export function normalisePoids(brut: PoidsScoring): PoidsScoring {
  const somme = brut.cadrage + brut.hauteur + brut.signal + brut.fenetre + brut.lune
  if (!Number.isFinite(somme) || somme <= 0) return poidsParDefaut()
  return Object.freeze({
    cadrage: brut.cadrage / somme,
    hauteur: brut.hauteur / somme,
    signal: brut.signal / somme,
    fenetre: brut.fenetre / somme,
    lune: brut.lune / somme,
  })
}

export interface ContexteSession {
  readonly site: Site
  readonly nuit: FenetreNocturne
  readonly fenetreUtile: FenetreUtile
  readonly masque: MasqueHorizon
  readonly fovHDeg: number
  readonly echApx: number
  readonly dMm: number
  readonly capteurHMm: number
  readonly pitchUm: number
  readonly ouvertureN: number
  readonly zpSys: number
  readonly zpEstime: boolean
  readonly readNoiseE: number | null
  readonly tailleRawMo: number
  readonly isoSession: number
  /** Fond de ciel sans Lune, avant pénalité de crépuscule (§2.2). */
  readonly sbCielNoir: number
  readonly mLimOeil: number | null
  readonly tMaxS: number | null
  /**
   * §5.2 — la cause du verrou du domaine ciel profond quand il est fermé — pas de suivi,
   * ou monture altazimutale —, `null` quand il est ouvert.
   *
   * Le PRD nomme cette sortie `domaine_cp_ouvert`, un booléen. Elle porte ici sa cause plutôt
   * qu'un drapeau : un domaine fermé sans phrase à afficher laisserait l'écran vide et muet,
   * et c'est le seul résultat que §5.2 interdit — « présenté comme fermé, avec le grand champ
   * en alternative ». La phrase vient de `profilSuivi`, elle n'est pas réécrite ici.
   */
  readonly domaineCpFerme: string | null
  readonly snrCible: number
  readonly typeMonture: TypeMonture
  readonly filtres?: readonly FamilleFiltre[]
  readonly poids?: PoidsScoring
  readonly seuilHauteurDeg?: number
}

export interface DetailScore {
  readonly cadrage: number
  readonly hauteur: number
  readonly signal: number
  readonly fenetre: number
  readonly lune: number
}

export interface EtapePlan {
  readonly objet: ObjetCielProfond
  readonly creneauAlloue: Intervalle
  readonly dureeAlloueeMin: number
  readonly tPoseS: number
  readonly nPoses: number
  readonly volumeGo: number
  readonly verdict: VerdictDetectabilite | null
  readonly verdictCadrage: VerdictCadrage
  readonly score: Traced<number>
  readonly detailScore: DetailScore
  readonly deltaSbLuneMag: Traced<number>
  readonly sbCielEffectif: number
  /** Faux quand l'intégration requise dépasse ce que la nuit alloue : le plan le dit. */
  readonly integrationComplete: boolean
  readonly nNuits: number
  readonly consigne: string
  readonly creneau: CreneauCible
  readonly pose: PoseUnitaire
  readonly integration: PlanIntegration
  /** §7.6 — reprise de la candidate : la masse d'air qui a dosé l'intégration affichée. */
  readonly extinction: FluxObjetReel
  readonly cadrage: FicheCadrage
  readonly detect: Detectabilite
}

export interface BudgetNuit {
  readonly disponibleMin: number
  readonly captureMin: number
  readonly calibrationMin: number
  readonly miseEnStationMin: number
  readonly pointageMin: number
  readonly totalMin: Traced<number>
  readonly tient: boolean
}

export interface PlanSession {
  readonly etapes: readonly EtapePlan[]
  readonly ciblesEcartees: readonly CibleEcartee[]
  /**
   * Décompte complet par cause, y compris les exclusions non listées une par une. Un plan
   * maigre s'explique : sans ce décompte, l'utilisateur croit le ciel vide alors que c'est
   * le catalogue qui ne porte pas la donnée.
   */
  // T-0275 — typé par la cause, pas par `string` : c'est ce qui permet d'indexer la table
  // des libellés sans cast, donc de voir à la compilation une cause qui n'en aurait pas.
  readonly comptesEcartees: Readonly<Partial<Record<CauseEcart, number>>>
  readonly budget: BudgetNuit
  readonly poids: PoidsScoring
  readonly calibration: PlanCalibration | null
  readonly message: string
  /** Renseignée quand aucune cible ne passe : la contrainte qui a dominé le pré-filtrage. */
  readonly contrainteDominante?: string
  readonly alternative?: string
  /** Ce que le catalogue ne porte pas, quand ça borne le plan plus que le ciel. */
  readonly noteCouvertureCatalogue?: string
  /** Rappelé sur chaque plan : l'application ne prétend pas connaître la météo. */
  readonly avertissementMeteo: string
  /**
   * Renseigné quand la capture dépasse C-16 : une longue nuit vide une batterie. Un rappel,
   * pas un budget — aucune autonomie n'est modélisée (T-0150).
   */
  readonly avertissementBatterie?: string
}

export const AVERTISSEMENT_METEO = 'Météo non prise en compte : vérifiez les nuages avant de partir.'

/** Une candidate évaluée : tout ce qu'il faut savoir d'elle avant de lui allouer du temps. */
export interface Candidate {
  readonly objet: ObjetCielProfond
  readonly creneau: CreneauCible
  readonly cadrage: FicheCadrage
  readonly detect: Detectabilite
  readonly pose: PoseUnitaire
  readonly integration: PlanIntegration
  /** §7.6 — masse d'air moyenne du créneau et atténuation qu'elle impose au flux. */
  readonly extinction: FluxObjetReel
  readonly deltaSbLuneMag: Traced<number>
  readonly sbCielEffectif: number
  readonly detailScore: DetailScore
  readonly score: Traced<number>
}
