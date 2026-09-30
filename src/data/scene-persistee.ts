/**
 * §3 / T-0355 — la scène survit au rechargement : pointage, champ, projection, instant,
 * couches et vue réaliste se relisent tels qu'on les a laissés.
 *
 * `localStorage` et non IndexedDB, pour la même raison que le mode nuit : le magasin de scène
 * s'initialise au chargement du module, avant le premier rendu — une lecture asynchrone
 * ouvrirait d'abord la scène par défaut, puis la ferait sauter.
 *
 * Le stockage est hors du périmètre de confiance : ce module ne rend que des champs de la
 * bonne forme, et le magasin ne reprend que ceux qu'il connaît. Les bornes métier (plafond du
 * champ selon la projection) restent appliquées par `majVue`, seul passage obligé.
 */

import type { ModeProjection } from '../core/projection.ts'
import type { ModeTemps } from '../core/curseur-temps.ts'
import { QUART_TOUR_DEG as ZENITH_DEG } from '../core/unites.ts'

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
type Brut = Record<string, unknown>
type Test = (v: unknown) => boolean

function objet(v: unknown): Brut | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Brut) : null
}

/** Ne garde que les clés dont la valeur passe son test : un champ abîmé retombe sur le défaut. */
function garde<T>(source: Brut, tests: Readonly<Record<string, Test>>): T {
  return Object.fromEntries(
    Object.entries(tests).flatMap(([cle, test]) => (test(source[cle]) ? [[cle, source[cle]]] : [])),
  ) as T
}

const fini: Test = (v) => typeof v === 'number' && Number.isFinite(v)
const booleen: Test = (v) => typeof v === 'boolean'
const parmi =
  (valeurs: readonly string[]): Test =>
  (v) =>
    typeof v === 'string' && valeurs.includes(v)

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
  if (typeof localStorage === 'undefined') return {}
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE)
    if (brut === null) return {}
    const lu = objet(JSON.parse(brut))
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
  } catch {
    return {}
  }
}

export function ecritScenePersistee(scene: ScenePersistee): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(scene))
  } catch {
    // Stockage refusé : la scène reste utilisable, elle ne survit simplement pas au rechargement.
  }
}
