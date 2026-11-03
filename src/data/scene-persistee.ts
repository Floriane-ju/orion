/**
 * §3 / T-0355 — scene survives reload: pointage, champ, projection, instant, layers, réaliste
 * view reread as left.
 * UI state → `stockage-local.ts`: read before first render, never exported. Returns only
 * well-shaped fields; store takes only known ones. Business bounds (field cap per projection)
 * still applied by `majVue`, the mandatory gateway.
 */

import type { ModeProjection } from '../core/projection.ts'
import type { ModeTemps } from '../core/curseur-temps.ts'
import { QUART_TOUR_DEG as ZENITH_DEG } from '../core/unites.ts'
import {
  booleen,
  ecritLocal,
  fini,
  garde,
  gardeAuDepart,
  litLocal,
  objet,
  parmi,
  type Brut,
} from './stockage-local.ts'

export interface ScenePersistee {
  readonly vue?: {
    readonly azimutDeg?: number
    readonly hauteurDeg?: number
    readonly rotationCadreDeg?: number
    readonly fovDeg?: number
    readonly mode?: ModeProjection
  }
  readonly temps?: {
    readonly modeTemps?: ModeTemps
    readonly facteur?: number
    readonly decalageMs?: number
  }
  /** Instant displayed on leaving. */
  readonly ms?: number
  readonly rendu?: {
    readonly couches?: Readonly<Record<string, boolean>>
    readonly vueRealiste?: boolean
  }
}

const CLE_STOCKAGE = 'orion.scene'
const MODES_PROJECTION: readonly string[] = Object.freeze([
  'MODE_PLANETARIUM',
  'MODE_CADRE',
  'MODE_FISHEYE',
])
// T-0411 — scrolling lost its command: restored, it would run the sky with no stop. Dropped on
// reread; scene restarts at default.
const MODES_TEMPS: readonly string[] = Object.freeze(['MAINTENANT', 'FIGE'])

function litVue(vue: Brut): NonNullable<ScenePersistee['vue']> {
  return garde(vue, {
    azimutDeg: fini,
    hauteurDeg: (v) => fini(v) && Math.abs(v as number) <= ZENITH_DEG,
    rotationCadreDeg: fini,
    fovDeg: (v) => fini(v) && (v as number) > 0,
    mode: parmi(MODES_PROJECTION),
  })
}

function litRendu(rendu: Brut): NonNullable<ScenePersistee['rendu']> {
  const couches = objet(rendu.couches)
  return {
    ...(booleen(rendu.vueRealiste) && { vueRealiste: rendu.vueRealiste as boolean }),
    ...(couches && {
      couches: garde(couches, Object.fromEntries(Object.keys(couches).map((c) => [c, booleen]))),
    }),
  }
}

export function litScenePersistee(): ScenePersistee {
  const lu = litLocal(CLE_STOCKAGE)
  if (lu === null) return {}
  const vue = objet(lu.vue)
  const temps = objet(lu.temps)
  const rendu = objet(lu.rendu)
  return {
    ...(vue && { vue: litVue(vue) }),
    ...(temps && {
      temps: garde(temps, { modeTemps: parmi(MODES_TEMPS), facteur: fini, decalageMs: fini }),
    }),
    ...(fini(lu.ms) && { ms: lu.ms as number }),
    ...(rendu && { rendu: litRendu(rendu) }),
  }
}

export function ecritScenePersistee(scene: ScenePersistee): void {
  ecritLocal(CLE_STOCKAGE, scene)
}

/** Written at page exit: scene changes 2/s. */
export function gardeSceneAuDepart(instantane: () => ScenePersistee): void {
  gardeAuDepart(CLE_STOCKAGE, instantane)
}
