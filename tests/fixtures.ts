/**
 * Shared test builders: Annexe A site, `public/data/` packet read, 2 deep-sky templates.
 * Why: 26 copies of the same site lost track of being one place.
 * No `App` render: importing it loads the app in every test that needs only a site.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Site } from '../src/core/ephem.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'

export const SITE_REFERENCE: Site = Object.freeze({
  latitudeDeg: 46.391,
  longitudeDeg: 6.697,
  altitudeM: 500,
})

/** Real packet sliced to its own bytes: `Buffer` shares a larger pool. */
export function paquet(nom: string): ArrayBuffer {
  const octets = readFileSync(join(import.meta.dirname, '..', 'public', 'data', nom))
  return octets.buffer.slice(
    octets.byteOffset,
    octets.byteOffset + octets.byteLength,
  ) as ArrayBuffer
}

/** Small galaxy at coordinate origin: list/search template. */
export function objetGalaxie(
  partiel: Partial<ObjetCielProfond> & { designation: string },
): ObjetCielProfond {
  return {
    nomsCommuns: '',
    adDeg: 0,
    decDeg: 0,
    type: 'GALAXIE',
    majAxArcmin: 10,
    minAxArcmin: 6,
    posAngDeg: null,
    vMag: 8,
    bMag: null,
    surfBr: null,
    ...partiel,
  }
}

/** Large emission nebula in Cygnus: plan/scoring template. */
export function objetNebuleuse(surcharge: Partial<ObjetCielProfond>): ObjetCielProfond {
  return {
    designation: 'TEST',
    nomsCommuns: '',
    adDeg: 315,
    decDeg: 40,
    type: 'EMISSION',
    majAxArcmin: 280,
    minAxArcmin: 220,
    posAngDeg: null,
    vMag: 5,
    bMag: null,
    surfBr: null,
    ...surcharge,
  }
}
