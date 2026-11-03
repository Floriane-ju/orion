/**
 * §3.2, §12.1, T-0296 — long sweep rendered in slices.
 * Decoding 80k stars / indexing the sphere holds main thread ~200 ms on tablet: sky stops
 * rotating, typing not shown, gesture jumps. Work can't be removed, only sliced.
 * ENGINE KNOWS NO BUDGET: only says WHERE it may be interrupted (`yield` at natural cuts).
 * Driver decides: `dUnBloc` ignores them (benches, tests, `node`), `parTranches` yields once a
 * slice used its budget. One engine serves both.
 * BUDGET = WALL-CLOCK, not element count: throttling slows work per slice, not slice length →
 * right on workstation and throttled phone, no factor to tune.
 */

import { B } from '../registry/budgets.ts'

/** Computation naming cut points: `yield` where interruption is accepted. */
export type Decoupable<T> = Generator<void, T, void>

/** True at indices where a sweep may yield. Test cost = slicing cost: negligible vs 1 element. */
export function pointDeCoupe(i: number): boolean {
  return i % B('PAS_TRANCHE') === 0
}

/** One block, never yields: outside browser nothing to yield to. */
export function dUnBloc<T>(pas: Decoupable<T>): T {
  let etape = pas.next()
  while (!etape.done) etape = pas.next()
  return etape.value
}

/**
 * `scheduler.yield()` resumes at queue head, ahead of tasks arrived meanwhile: decoding stays
 * ahead of not-yet-requested work. `setTimeout` fallback: 4 ms nesting clamp = price of working
 * everywhere.
 */
interface Ordonnanceur {
  readonly yield?: () => Promise<void>
}

function rendLaMain(): Promise<void> {
  const ordonnanceur = (globalThis as { scheduler?: Ordonnanceur }).scheduler
  return ordonnanceur?.yield?.() ?? new Promise<void>((reprend) => setTimeout(reprend, 0))
}

/** What a sliced run held, for bench measurement. */
export interface Tranchage {
  readonly tranches: number
  /** Work summed over slices, yielded time excluded. */
  readonly travailMs: number
  /** Longest slice, ms: decides, not the mean. */
  readonly plusLongueMs: number
  /** Largest budget overrun, ms: tracks machine speed, only one growing under throttling. */
  readonly depassementMs: number
}

/**
 * Runs, yielding once a slice held the thread past its budget. `surTranchage` gets what the run
 * held at the end: unused by app, used by startup bench (non-replayable measure proves nothing).
 */
export async function parTranches<T>(
  pas: Decoupable<T>,
  surTranchage?: (mesure: Tranchage) => void,
): Promise<T> {
  const budget = B('TRANCHE_MS')
  let debut = performance.now()
  let tranches = 1
  let travailMs = 0
  let plusLongueMs = 0
  let depassementMs = 0

  for (;;) {
    const etape = pas.next()
    const tenue = performance.now() - debut
    if (etape.done || tenue >= budget) {
      travailMs += tenue
      if (tenue > plusLongueMs) plusLongueMs = tenue
      if (tenue - budget > depassementMs) depassementMs = tenue - budget
    }
    if (etape.done) {
      surTranchage?.({ tranches, travailMs, plusLongueMs, depassementMs })
      return etape.value
    }
    if (tenue < budget) continue
    await rendLaMain()
    tranches++
    debut = performance.now()
  }
}
