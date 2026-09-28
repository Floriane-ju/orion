/**
 * Résultat tracé — §1.5 critère 2, §10.2.
 *
 * Un moteur ne retourne jamais un nombre nu : il retourne la valeur, la formule qui l'a
 * produite, ses entrées et les constantes du registre qu'elle a consommées. C'est ce qui
 * rend tout nombre affiché dépliable jusqu'à sa source sans dupliquer la logique de
 * calcul dans une couche d'explication séparée.
 */

import type { ConstantId, ConstantRef } from '../registry/constants.ts'
import { ref } from '../registry/constants.ts'
import type { FormulaEntry, FormulaId } from '../registry/formulas.ts'
import { formule } from '../registry/formulas.ts'

/**
 * `ESTIME` — valeur issue d'un repli générique (ex. ZP_sys C-14, §2.3).
 * `HYP` — hypothèse par défaut faute de donnée (ex. masque d'horizon plat, §4.1).
 * `DONNEE_MANQUANTE` — la donnée source est absente ; aucune estimation n'est produite (§6.3).
 * `HORS_DOMAINE` — la demande sort du domaine de validité déclaré (§3.1, §12.4).
 */
export type Flag = 'ESTIME' | 'HYP' | 'DONNEE_MANQUANTE' | 'HORS_DOMAINE'

export interface Traced<T> {
  readonly value: T
  readonly formula: FormulaEntry & { readonly id: FormulaId }
  /**
   * `null` dit « grandeur absente », comme `Traced<number | null>` le dit pour la sortie :
   * un appelant qui n'a pas l'entrée n'a pas à inventer un nombre pour la déclarer.
   */
  readonly inputs: Readonly<Record<string, number | null>>
  readonly constants: readonly ConstantRef[]
  /**
   * Plage utile, remplie dès qu'une constante consommée est un ordre de grandeur : la
   * sortie s'affiche alors comme une plage, jamais comme une valeur exacte (§2.1).
   */
  readonly range?: readonly [number, number]
  readonly flags?: readonly Flag[]
  /** Une phrase adressée à l'utilisateur, quand la valeur seule induirait en erreur. */
  readonly note?: string
}

export interface TraceOptions<T> {
  readonly value: T
  readonly formula: FormulaId
  readonly inputs?: Readonly<Record<string, number | null>>
  readonly constants?: readonly ConstantId[]
  readonly range?: readonly [number, number]
  readonly flags?: readonly Flag[]
  readonly note?: string
}

export function trace<T>(options: TraceOptions<T>): Traced<T> {
  const constants = (options.constants ?? []).map(ref)
  const result: {
    value: T
    formula: FormulaEntry & { id: FormulaId }
    inputs: Readonly<Record<string, number | null>>
    constants: readonly ConstantRef[]
    range?: readonly [number, number]
    flags?: readonly Flag[]
    note?: string
  } = {
    value: options.value,
    formula: formule(options.formula),
    inputs: options.inputs ?? {},
    constants,
  }
  if (options.range !== undefined) result.range = options.range
  if (options.flags !== undefined && options.flags.length > 0) result.flags = options.flags
  if (options.note !== undefined) result.note = options.note
  return Object.freeze(result)
}

/**
 * Encadrement d'une sortie qui dépend d'un ordre de grandeur (§2.1). Le facteur 2 est celui
 * du PRD : C-12 retient 120 s en annonçant « 1 à 4 min ».
 */
export function plageOrdreDeGrandeur(valeur: number): readonly [number, number] {
  const FACTEUR = 2
  return [valeur / FACTEUR, valeur * FACTEUR]
}

/** Vrai si au moins une constante consommée est marquée « ordre de grandeur » (§2.1). */
export function dependDUnOrdreDeGrandeur(t: Traced<unknown>): boolean {
  return t.constants.some((c) => c.ordreDeGrandeur)
}
