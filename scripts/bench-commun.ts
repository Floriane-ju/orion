/**
 * Shared by 5 benches: repo root, annexe A site, `public/data/` pack reader, median.
 * One median only: incrustation took upper value on even counts, frappe the mean of the 2
 * central ones → not comparable.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Site } from '../src/core/ephem.ts'

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')

export const SITE: Site = { latitudeDeg: 46.391, longitudeDeg: 6.697, altitudeM: 500 }

/** Real binary pack, sliced to its own bytes (`Buffer` shares a larger pool). */
export function lit(nom: string): ArrayBuffer {
  const octets = readFileSync(join(RACINE, 'public/data', nom))
  return octets.buffer.slice(
    octets.byteOffset,
    octets.byteOffset + octets.byteLength,
  ) as ArrayBuffer
}

/** Median, not mean: a mean follows the first warm-up run. */
export function mediane(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(triees.length / 2)
  return triees.length % 2 === 0
    ? ((triees[milieu - 1] ?? 0) + (triees[milieu] ?? 0)) / 2
    : (triees[milieu] ?? 0)
}
