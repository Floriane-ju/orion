/**
 * §9.3 — Moon trail on a stopped-mount shot (T-0399).
 * Stars trail by rotation about the pole; Moon adds own motion (~0.5°/h east) + diurnal parallax
 * up to 1° at horizon: sidereal rotation misses its trail by a diameter or two. Positions from
 * `astronomy-engine`, sampled over the exposure.
 * Grid ALIGNED on absolute time, not start: while instant scrolls, interior points stay identical
 * (cache hits); only the 2 exact ends recompute, none under pan.
 */
import { K } from '../registry/constants.ts'
import { Body, dansLeDomaineDesSeries, positionCorps, type PositionCorps, type Site } from './ephem.ts'
import { MS_PAR_MINUTE } from './unites.ts'

/** Cached positions by instant (ms), for a given site. */
export interface CacheTrajetLune {
  site: Site | null
  readonly positions: Map<number, PositionCorps>
}

export function cacheTrajetLune(): CacheTrajetLune {
  return { site: null, positions: new Map() }
}

/** Exact start, strictly interior grid points, exact end; zero duration: start only. */
export function instantsTrajet(debutMs: number, dureeMs: number, pasMs: number): readonly number[] {
  const finMs = debutMs + dureeMs
  const instants = [debutMs]
  for (let t = Math.floor(debutMs / pasMs) * pasMs + pasMs; t < finMs; t += pasMs) instants.push(t)
  if (finMs > debutMs) instants.push(finMs)
  return instants
}

/** Sample instants of `trajetLune`, same order. */
export function instantsTrajetLune(debutMs: number, dureeMs: number): readonly number[] {
  return instantsTrajet(debutMs, dureeMs, K('PAS_TRAJET_LUNE_MIN') * MS_PAR_MINUTE)
}

/**
 * Moon at instants of [début, début + durée]. Outside series domain: no trail (bodies masked,
 * cause carried by `cielInstantane`).
 */
export function trajetLune(
  site: Site,
  debutMs: number,
  dureeMs: number,
  cache: CacheTrajetLune,
): readonly PositionCorps[] {
  if (!dansLeDomaineDesSeries(new Date(debutMs)) || !dansLeDomaineDesSeries(new Date(debutMs + dureeMs))) {
    return []
  }
  if (cache.site !== site) {
    cache.site = site
    cache.positions.clear()
  }
  const instants = instantsTrajetLune(debutMs, dureeMs)
  const garde = new Set(instants)
  // ponytail: Map-sweep eviction per call, ≤ a few hundred entries (8 h / 5 min);
  // upgrade to ring buffer if profiling shows it.
  for (const t of cache.positions.keys()) if (!garde.has(t)) cache.positions.delete(t)
  return instants.map((t) => {
    const connue = cache.positions.get(t)
    if (connue !== undefined) return connue
    const position = positionCorps(Body.Moon, new Date(t), site)
    cache.positions.set(t, position)
    return position
  })
}
