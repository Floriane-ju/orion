/**
 * §10.2 — verdict explanation.
 *
 * Verdict without computation chain = oracle: teaches nothing, can't be contested. 3 levels:
 * result, dominant factor priced with its lever, full chain (formula per step, source per
 * constant). Dominant factor COMPUTED, not written: variable of highest logarithmic derivative
 * of the output → explanation can't diverge from computation, which a hand-written guide
 * can't guarantee.
 */

import type { ConstantRef } from '../registry/constants.ts'
import {
  CATALOGUE_LEVIERS,
  TOLERANCE_EGALITE_SENSIBILITE,
  type CodeLevier,
  type LevierCatalogue,
} from '../registry/verdicts.ts'
import type { TypeObjet } from '../data/deepsky.ts'
import type { VerdictDetectabilite } from './detectability.ts'
import type { Traced } from './traced.ts'
import { libelleEntree } from '../registry/libelles.ts'

/** Relative step of numerical derivative: small enough for slope, large enough for noise. */
const PAS_RELATIF = 1 / 1000

// ---------------------------------------------------------------------------
// N3 — computation chain
// ---------------------------------------------------------------------------

export interface EtapeChaine {
  readonly libelle: string
  readonly expression: string
  readonly section: string
  readonly valeur: number | null
  readonly unite: string
  readonly entrees: Readonly<Record<string, number | null>>
  readonly constantes: readonly ConstantRef[]
  readonly note?: string
}

export interface EtapeSource {
  readonly libelle: string
  readonly trace: Traced<number | null>
}

/** Full chain derived from the traced results themselves: no hand-rewritten step, none can lie. */
export function chaineCalcul(etapes: readonly EtapeSource[]): readonly EtapeChaine[] {
  return etapes.map(({ libelle, trace }) => ({
    libelle,
    expression: trace.formula.expression,
    section: trace.formula.section,
    valeur: trace.value,
    unite: trace.formula.unite,
    entrees: trace.inputs,
    constantes: trace.constants,
    ...(trace.note === undefined ? {} : { note: trace.note }),
  }))
}

// ---------------------------------------------------------------------------
// N2 — dominant factor
// ---------------------------------------------------------------------------

/**
 * Generic over point shape `P`: each caller describes inputs with a named interface (T-0078),
 * not an untyped `Record`. `sensibilites` perturbs inputs one by one without knowing names in
 * advance — the only capability `P extends Record<string, number>` must keep.
 */
export type Sortie<P extends Readonly<Record<string, number>> = Readonly<Record<string, number>>> = (
  variables: P,
) => number

/**
 * Logarithmic sensitivity | ∂ln(output) / ∂ln(variable) | of each input, centred difference.
 * Absolute value of the ratio stays valid for variables like magnitudes, where direct logarithm
 * is meaningless.
 */
export function sensibilites<P extends Readonly<Record<string, number>>>(
  sortie: Sortie<P>,
  point: P,
): Readonly<Record<string, number>> {
  const base = sortie(point)
  const resultat: Record<string, number> = {}
  for (const [nom, valeur] of Object.entries(point)) {
    const pas = Math.abs(valeur) * PAS_RELATIF
    if (pas === 0 || base === 0 || !Number.isFinite(base)) {
      resultat[nom] = 0
      continue
    }
    // Perturbation touches only a key already in `point`: shape stays `P`, value changes.
    // `as P` stays in the generic engine core, not at the caller (T-0078 removes it).
    const haut = sortie({ ...point, [nom]: valeur + pas } as P)
    const bas = sortie({ ...point, [nom]: valeur - pas } as P)
    const derivee = (haut - bas) / (2 * pas)
    const sensibilite = Math.abs((derivee * valeur) / base)
    resultat[nom] = Number.isFinite(sensibilite) ? sensibilite : 0
  }
  return resultat
}

/**
 * Deciding variables. 2 close sensitivities presented jointly: naming one = arbitrary, hence
 * false.
 */
export function facteursDominants(
  sensibilite: Readonly<Record<string, number>>,
): readonly string[] {
  const entrees = Object.entries(sensibilite)
  if (entrees.length === 0) return []
  const max = Math.max(...entrees.map(([, v]) => v))
  if (max === 0) return []
  return entrees
    .filter(([, v]) => (max - v) / max <= TOLERANCE_EGALITE_SENSIBILITE)
    .sort((a, b) => b[1] - a[1])
    .map(([nom]) => nom)
}

// ---------------------------------------------------------------------------
// Levers
// ---------------------------------------------------------------------------

export interface ContexteLeviers {
  readonly verdict?: VerdictDetectabilite | null
  readonly typeObjet?: TypeObjet
  /**
   * True when user opened a specific cible's fiche: changing cible isn't a lever on THIS
   * verdict.
   */
  readonly cibleImposee?: boolean
  readonly cadrageRefuse?: boolean
  readonly luneLevee?: boolean
  readonly hauteurFaible?: boolean
  /** Dominant variable names, as rendered by `facteursDominants`. */
  readonly facteurs?: readonly string[]
}

const TYPES_EN_EMISSION: readonly TypeObjet[] = ['EMISSION', 'RESTE_SUPERNOVA', 'NEB_PLANETAIRE']

function applicable(code: CodeLevier, c: ContexteLeviers): boolean {
  const facteurs = c.facteurs ?? []
  const contrasteEnJeu =
    c.verdict === 'PHOTO_SEULE' || facteurs.some((f) => f === 'sb_ciel' || f === 'sb_obj')

  switch (code) {
    case 'CHANGER_CIBLE':
      return c.cibleImposee !== true
    case 'CRENEAU':
      return c.luneLevee === true || c.hauteurFaible === true
    case 'SITE_PLUS_SOMBRE':
      return contrasteEnJeu
    case 'PLUS_DE_TEMPS':
      return c.verdict === 'PHOTO_SEULE'
    case 'FILTRE_DUAL_BAND':
      return c.typeObjet !== undefined && TYPES_EN_EMISSION.includes(c.typeObjet)
    case 'FOCALE_DIFFERENTE':
      return c.cadrageRefuse === true
  }
}

/** Applicable levers, cheapest first. Purchase never comes first. */
export function leviers(contexte: ContexteLeviers): readonly LevierCatalogue[] {
  return CATALOGUE_LEVIERS.filter((l) => applicable(l.code, contexte))
}

// ---------------------------------------------------------------------------
// Full explanation
// ---------------------------------------------------------------------------

export interface Explication {
  /** N1 — one line, the result. */
  readonly n1: string
  /** N2 — the deciding variable, priced, plus lever. */
  readonly n2: string
  /** N3 — full chain, formula and constant per step. */
  readonly n3: readonly EtapeChaine[]
  readonly facteurs: readonly string[]
  readonly sensibilites: Readonly<Record<string, number>>
  readonly leviers: readonly LevierCatalogue[]
}

export interface EntreeExplication<P extends Readonly<Record<string, number>> = Readonly<Record<string, number>>> {
  readonly verdictN1: string
  readonly phraseFacteur: string
  readonly etapes: readonly EtapeSource[]
  readonly sortie: Sortie<P>
  readonly point: P
  readonly contexte: ContexteLeviers
}

/** An explanation for EVERY verdict, favourable or not: a "yes" chain unfolds like a "no". */
export function explication<P extends Readonly<Record<string, number>>>(entree: EntreeExplication<P>): Explication {
  const sens = sensibilites(entree.sortie, entree.point)
  const facteurs = facteursDominants(sens)
  const applicables = leviers({ ...entree.contexte, facteurs })
  const premier = applicables[0]

  return {
    n1: entree.verdictN1,
    n2:
      `${entree.phraseFacteur} Facteur${facteurs.length > 1 ? 's' : ''} dominant` +
      `${facteurs.length > 1 ? 's' : ''} : ` +
      `${facteurs.map(libelleEntree).join(' et ')}.` +
      (premier === undefined
        ? ''
        : ` Premier levier : ${premier.libelle.toLowerCase()} — gain ${premier.gain}, coût ${premier.cout}.`),
    n3: chaineCalcul(entree.etapes),
    facteurs,
    sensibilites: sens,
    leviers: applicables,
  }
}
