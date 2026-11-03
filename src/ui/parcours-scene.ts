/**
 * T-0324, T-0338 — "Voir le parcours": scène shows the path and frames itself on it.
 * Extracted from `PlanSession.tsx`: scène calc (cadrage, visée, champ), not rendering.
 */

import { cadrageParcours, type EtapeParcours } from '../core/pointage.ts'
import type { Site } from '../core/ephem.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { K } from '../registry/constants.ts'
import { bornesZoom, fovPourRayonDeg } from '../core/projection.ts'
import { cielInstantane } from '../core/horloges.ts'
import { DEG_PAR_HEURE } from '../core/unites.ts'
import { fovBorne } from './planetarium-gestes.ts'
import { viseeVersVue } from './scene-lecture.ts'
import {
  etatScene,
  majVue,
  montreParcours,
  vuePlanetarium,
  type ParcoursScene,
} from './scene-etat.ts'

export interface EntreeParcours {
  readonly objet: ObjetCielProfond
  readonly date: Date
  readonly site: Site
  /** §3.3 — bounds of the champ "Voir le parcours" asks of the scène. */
  readonly gaiaCharge: boolean
}

/**
 * T-0324 — scène takes the path then settles on it: goes to the pointage time, centres, opens
 * champ just enough to contain it.
 * CLOCK JUMPS, unlike T-0046 "Voir" (moves only the visée). Different question: "Voir" = where
 * is this target now; parcours = path walked at the étape's time. The rest of the pointage aid
 * (table, schema, §8.4 parallactic angle) is computed for that time; a scène at its own time
 * would show another moment's sky under unrelated figures, and auto-framing would miss the
 * path by the gap between the two times.
 * Path radius → champ via `fovPourRayonDeg` (fits nearest edge): `fovDeg` is horizontal, a
 * mostly vertical path would overflow a champ sized on a canvas wider than tall.
 * Champ then goes through `bornesZoom` while `majVue` only sets the projection cap. Without
 * this floor a short path leaves the scène below the embedded catalogue depth — and still
 * there after the parcours closes.
 */
export function poseParcours(props: EntreeParcours, etapes: readonly EtapeParcours[]): void {
  const adCibleH = props.objet.adDeg / DEG_PAR_HEURE
  const parcours: ParcoursScene = {
    designation: props.objet.designation,
    etapes,
    adCibleH,
    decCibleDeg: props.objet.decDeg,
  }
  montreParcours(parcours, props.date.getTime())

  const cadrage = cadrageParcours(etapes, adCibleH, props.objet.decDeg)
  const { matrice } = cielInstantane(props.site, props.date)
  const { azimutDeg, hauteurDeg } = viseeVersVue(cadrage.adDeg, cadrage.decDeg, matrice)
  const vue = etatScene().vue
  const fovDeg = fovPourRayonDeg(
    vuePlanetarium(vue),
    cadrage.rayonDeg * K('MARGE_CADRAGE_PARCOURS'),
  )
  majVue({
    azimutDeg,
    hauteurDeg,
    fovDeg: fovBorne(fovDeg, bornesZoom(props.gaiaCharge, vue.mode)),
  })
}
