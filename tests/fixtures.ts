/**
 * Ce que plusieurs tests construisent à l'identique : le site de l'annexe A, la lecture d'un
 * paquet de `public/data/`, deux gabarits d'objet du ciel profond.
 *
 * Vingt-six copies du même site finissaient par ne plus dire s'il s'agissait du même lieu.
 * Pas de rendu d'`App` ici : l'importer chargerait l'application dans chaque test qui ne
 * veut qu'un site.
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

/** Un paquet binaire réel, découpé à ses propres octets : `Buffer` partage un tampon plus grand. */
export function paquet(nom: string): ArrayBuffer {
  const octets = readFileSync(join(import.meta.dirname, '..', 'public', 'data', nom))
  return octets.buffer.slice(
    octets.byteOffset,
    octets.byteOffset + octets.byteLength,
  ) as ArrayBuffer
}

/** Une petite galaxie à l'origine des coordonnées : le gabarit des tests de liste et de recherche. */
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

/** Une grande nébuleuse d'émission dans le Cygne : le gabarit des tests de plan et de scoring. */
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
