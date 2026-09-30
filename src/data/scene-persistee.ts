/**
 * §3 / T-0355 — la scène survit au rechargement : pointage, champ, projection, instant,
 * couches et vue réaliste se relisent tels qu'on les a laissés.
 *
 * État d'interface, donc `stockage-local.ts` : lu avant le premier rendu, jamais exporté. Ce
 * module ne rend que des champs de la bonne forme, et le magasin ne reprend que ceux qu'il
 * connaît. Les bornes métier (plafond du champ selon la projection) restent appliquées par
 * `majVue`, seul passage obligé.
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
  /** L'instant affiché au moment de quitter. */
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
const MODES_TEMPS: readonly string[] = Object.freeze(['MAINTENANT', 'FIGE', 'DEFILEMENT'])

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

/** La scène s'écrit au départ de la page : elle change deux fois par seconde. */
export function gardeSceneAuDepart(instantane: () => ScenePersistee): void {
  gardeAuDepart(CLE_STOCKAGE, instantane)
}
