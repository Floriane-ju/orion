/**
 * Traced result — §1.5 critère 2, §10.2.
 * Engine never returns a bare number: value + formula + inputs + consumed registry constants,
 * so each displayed number expands to its source without a separate explanation layer.
 */

import type { ConstantId, ConstantRef } from '../registry/constants.ts'
import { ref } from '../registry/constants.ts'
import type { FormulaEntry, FormulaId } from '../registry/formulas.ts'
import { formule } from '../registry/formulas.ts'

/**
 * `ESTIME` — generic fallback value (e.g. ZP_sys C-14, §2.3).
 * `HYP` — default hypothesis, data lacking (e.g. flat horizon mask, §4.1).
 * `DONNEE_MANQUANTE` — source data absent, no estimate (§6.3).
 * `HORS_DOMAINE` — outside validity domain (§3.1, §12.4).
 */
export type Flag = 'ESTIME' | 'HYP' | 'DONNEE_MANQUANTE' | 'HORS_DOMAINE'

export interface Traced<T> {
  readonly value: T
  readonly formula: FormulaEntry & { readonly id: FormulaId }
  /** `null` = « grandeur absente » (like `Traced<number | null>` output): no invented number. */
  readonly inputs: Readonly<Record<string, number | null>>
  readonly constants: readonly ConstantRef[]
  /** Range when a consumed constant is an order of magnitude: shown as range, not exact (§2.1). */
  readonly range?: readonly [number, number]
  readonly flags?: readonly Flag[]
  /** User-facing sentence when value alone misleads. */
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
 * Bracket for order-of-magnitude outputs (§2.1). Factor 2 per PRD: C-12 120 s → « 1 à 4 min ».
 */
export function plageOrdreDeGrandeur(valeur: number): readonly [number, number] {
  const FACTEUR = 2
  return [valeur / FACTEUR, valeur * FACTEUR]
}

/** True if any consumed constant is « ordre de grandeur » (§2.1). */
export function dependDUnOrdreDeGrandeur(t: Traced<unknown>): boolean {
  return t.constants.some((c) => c.ordreDeGrandeur)
}
