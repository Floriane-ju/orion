/**
 * Ce que les cinq bancs recopiaient à l'identique : la racine du dépôt, le site de l'annexe A,
 * la lecture d'un paquet de `public/data/`, la médiane.
 *
 * Deux médianes divergeaient : celle du banc d'incrustation prenait la valeur haute sur un
 * nombre pair de passes, celle du banc de frappe la moyenne des deux centrales. Un même mot
 * qui mesure deux choses rend deux bancs incomparables.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Site } from '../src/core/ephem.ts'

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')

export const SITE: Site = { latitudeDeg: 46.391, longitudeDeg: 6.697, altitudeM: 500 }

/** Un paquet binaire réel, découpé à ses propres octets : `Buffer` partage un tampon plus grand. */
export function lit(nom: string): ArrayBuffer {
  const octets = readFileSync(join(RACINE, 'public/data', nom))
  return octets.buffer.slice(
    octets.byteOffset,
    octets.byteOffset + octets.byteLength,
  ) as ArrayBuffer
}

/** La médiane plutôt que la moyenne : une moyenne suit le premier échauffement. */
export function mediane(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(triees.length / 2)
  return triees.length % 2 === 0
    ? ((triees[milieu - 1] ?? 0) + (triees[milieu] ?? 0)) / 2
    : (triees[milieu] ?? 0)
}
