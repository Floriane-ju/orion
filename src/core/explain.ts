/**
 * §10.2 — Explication de verdict.
 *
 * Un verdict sans chaîne de calcul est un oracle, et un oracle n'enseigne rien et ne se
 * conteste pas. Trois niveaux : le résultat, le facteur dominant chiffré avec son levier,
 * puis la chaîne complète — chaque étape avec sa formule et chaque constante avec sa source.
 *
 * Le facteur dominant est CALCULÉ, pas rédigé : c'est la variable de plus forte dérivée
 * logarithmique de la sortie. L'explication ne peut donc pas diverger du calcul, ce qu'un
 * guide rédigé à la main ne peut pas garantir.
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

/** Pas relatif de la dérivée numérique : assez petit pour la pente, assez grand pour le bruit. */
const PAS_RELATIF = 1 / 1000

// ---------------------------------------------------------------------------
// N3 — chaîne de calcul
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

/**
 * La chaîne complète, dérivée des résultats tracés eux-mêmes : aucune étape n'est réécrite
 * à la main, donc aucune ne peut mentir sur ce qui a été calculé.
 */
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
// N2 — facteur dominant
// ---------------------------------------------------------------------------

/**
 * Générique sur la forme du point `P` : chaque appelant décrit ses propres entrées avec une
 * interface nommée (T-0078) plutôt que de les recevoir en `Record` non typé. `sensibilites`
 * perturbe ces entrées une à une sans connaître leurs noms à l'avance — c'est ce qui reste
 * générique, et c'est la seule capacité que `P extends Record<string, number>` doit garder.
 */
export type Sortie<P extends Readonly<Record<string, number>> = Readonly<Record<string, number>>> = (
  variables: P,
) => number

/**
 * Sensibilité logarithmique | ∂ln(sortie) / ∂ln(variable) | de chaque entrée, par différence
 * centrée. La valeur absolue du rapport garde le calcul valide pour les variables comme les
 * magnitudes, où le logarithme direct n'aurait pas de sens.
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
    // La perturbation ne touche qu'une clé déjà présente dans `point` : la forme reste celle
    // de `P`, seule sa valeur change. `as P` reste ici, au cœur du moteur générique — pas
    // chez l'appelant, où c'est justement ce que T-0078 retire.
    const haut = sortie({ ...point, [nom]: valeur + pas } as P)
    const bas = sortie({ ...point, [nom]: valeur - pas } as P)
    const derivee = (haut - bas) / (2 * pas)
    const sensibilite = Math.abs((derivee * valeur) / base)
    resultat[nom] = Number.isFinite(sensibilite) ? sensibilite : 0
  }
  return resultat
}

/**
 * Les variables qui décident. Deux sensibilités trop proches sont présentées conjointement :
 * désigner l'une des deux serait arbitraire, donc faux.
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
// Leviers
// ---------------------------------------------------------------------------

export interface ContexteLeviers {
  readonly verdict?: VerdictDetectabilite | null
  readonly typeObjet?: TypeObjet
  /**
   * Vrai quand l'utilisateur a ouvert la fiche d'une cible précise : changer de cible n'est
   * alors pas un levier sur CE verdict.
   */
  readonly cibleImposee?: boolean
  readonly cadrageRefuse?: boolean
  readonly luneLevee?: boolean
  readonly hauteurFaible?: boolean
  /** Noms des variables dominantes, tels que rendus par `facteursDominants`. */
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

/** Leviers applicables, du moins cher au plus cher. L'achat n'arrive jamais en premier. */
export function leviers(contexte: ContexteLeviers): readonly LevierCatalogue[] {
  return CATALOGUE_LEVIERS.filter((l) => applicable(l.code, contexte))
}

// ---------------------------------------------------------------------------
// Explication complète
// ---------------------------------------------------------------------------

export interface Explication {
  /** N1 — une ligne, le résultat. */
  readonly n1: string
  /** N2 — la variable qui décide, chiffrée, plus le levier. */
  readonly n2: string
  /** N3 — la chaîne complète, formule et constante par étape. */
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

/**
 * Une explication est produite pour TOUT verdict, favorable ou non : la chaîne de calcul
 * d'un « oui » se déplie exactement comme celle d'un « non ».
 */
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
