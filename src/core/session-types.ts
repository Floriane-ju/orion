/**
 * §8.3 — plan de session vocabulary: inputs and outputs.
 * Shared by the four plan stages (pre-filter, candidate evaluation, night allocation, assembly),
 * owned by none → lives apart so each stage reads it without depending on others.
 */

import { K } from '../registry/constants.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { FamilleFiltre } from '../registry/filters.ts'
import type { VerdictCadrage } from '../registry/verdicts.ts'
import type { CreneauCible, Intervalle } from './creneaux.ts'
import type { Detectabilite, VerdictDetectabilite } from './detectability.ts'
import type { Site } from './ephem.ts'
import type { FicheCadrage } from './cadrage.ts'
import type { FluxObjetReel, PlanIntegration, PoseUnitaire } from './exposure.ts'
import type { PlanCalibration } from './calibration.ts'
import type { FenetreUtile } from './moon.ts'
import type { FenetreNocturne } from './nuit.ts'
import type { MasqueHorizon } from './site.ts'
import type { TypeMonture } from './suivi.ts'
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
  | 'LUNE'

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

/** Default C-15 weights: exposed and tunable, never learned (§8.3). */
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
 * §8.3 — five weights sum to 1 however tuned.
 * Five independent sliders rather than redistributing the other four per gesture: that moves
 * untouched values and makes result depend on gesture order → not reproducible.
 * Zero sum → all scores NaN, créneau arbitration silently random: falls back to C-15.
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
  /** T-0407 — this context's focal; set by the chain, absent from fixtures. */
  readonly focaleMm?: number
  /** T-0436 — park lens of this context, when the target chose it. */
  readonly objectifNom?: string
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
  /** fond de ciel without Moon, before twilight penalty (§2.2). */
  readonly sbCielNoir: number
  readonly mLimOeil: number | null
  readonly tMaxS: number | null
  /**
   * §5.2 — cause of ciel profond domain lock when closed (no suivi, or alt-az mount), `null` when
   * open. PRD names this output `domaine_cp_ouvert`, boolean; carries cause instead: closed domain
   * with no sentence leaves screen empty and mute, the one outcome §5.2 forbids ("presented as
   * closed, with grand champ as alternative"). Sentence comes from `profilSuivi`, not rewritten.
   */
  readonly domaineCpFerme: string | null
  readonly snrCible: number
  readonly typeMonture: TypeMonture
  readonly filtres?: readonly FamilleFiltre[]
  readonly poids?: PoidsScoring
  readonly seuilHauteurDeg?: number
}

/**
 * T-0407 — context under which ONE target is evaluated. Under a zoom each target has its optimal
 * focal → own field, échantillonnage, aperture, pose max; without zoom, the single context.
 * Nuit, site, boîtier never change per target: only what focal fixes differs.
 */
export type ContexteDe = (objet: ObjetCielProfond) => ContexteSession

export interface DetailScore {
  readonly cadrage: number
  readonly hauteur: number
  readonly signal: number
  readonly fenetre: number
  readonly lune: number
}

export interface EtapePlan {
  readonly objet: ObjetCielProfond
  /** T-0407 — étape focal under a zoom; absent when all share one. */
  readonly focaleMm?: number
  /** T-0436 — park lens of the étape, when each target picks its own. */
  readonly objectifNom?: string
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
  /** False when required integration exceeds what the nuit allocates: plan says so. */
  readonly integrationComplete: boolean
  readonly nNuits: number
  readonly consigne: string
  readonly creneau: CreneauCible
  readonly pose: PoseUnitaire
  readonly integration: PlanIntegration
  /** §7.6 — from the candidate: masse d'air that dosed the displayed integration. */
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
   * Full count per cause, incl. unlisted exclusions: thin plan explains itself, else user thinks
   * sky empty when catalogue lacks data.
   */
  // T-0275 — typed by cause, not `string`: label table indexed without cast, a cause lacking a
  // label fails at compile time.
  readonly comptesEcartees: Readonly<Partial<Record<CauseEcart, number>>>
  readonly budget: BudgetNuit
  readonly poids: PoidsScoring
  readonly calibration: PlanCalibration | null
  readonly message: string
  /** Set when no target passes: constraint that dominated pre-filter. */
  readonly contrainteDominante?: string
  readonly alternative?: string
  /** What catalogue lacks, when it bounds the plan more than the sky. */
  readonly noteCouvertureCatalogue?: string
  /** Repeated on every plan: app doesn't claim to know the weather. */
  readonly avertissementMeteo: string
  /**
   * Set when capture exceeds C-16: long night drains a battery. Reminder, not budget (no autonomy
   * modelled, T-0150).
   */
  readonly avertissementBatterie?: string
}

export const AVERTISSEMENT_METEO = 'Météo non prise en compte : vérifiez les nuages avant de partir.'

/** Evaluated candidate: all to know before allocating time. */
export interface Candidate {
  readonly objet: ObjetCielProfond
  readonly creneau: CreneauCible
  readonly cadrage: FicheCadrage
  readonly detect: Detectabilite
  readonly pose: PoseUnitaire
  readonly integration: PlanIntegration
  /** §7.6 — créneau mean masse d'air and the flux attenuation it imposes. */
  readonly extinction: FluxObjetReel
  readonly deltaSbLuneMag: Traced<number>
  readonly sbCielEffectif: number
  readonly detailScore: DetailScore
  readonly score: Traced<number>
}
