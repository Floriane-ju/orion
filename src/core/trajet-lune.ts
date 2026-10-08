/**
 * §9.3 — la trace de la Lune sur une prise de vue à monture coupée (T-0399).
 *
 * Les étoiles filent par rotation autour du pôle ; la Lune non. Elle ajoute son mouvement
 * propre (≈ 0,5°/h vers l'est) et une parallaxe diurne qui atteint le degré à l'horizon :
 * une rotation sidérale l'aurait placée à côté de sa vraie trace d'un diamètre ou deux. Ses
 * positions viennent donc d'`astronomy-engine`, échantillonnées sur la durée de prise de vue.
 *
 * La grille est ALIGNÉE sur le temps absolu, pas sur le départ : quand l'instant défile, les
 * points intérieurs restent les mêmes et se relisent au cache. Seules les deux extrémités,
 * exactes, se recalculent à chaque instant nouveau — et sous un panoramique, rien du tout.
 */
import { K } from '../registry/constants.ts'
import { Body, dansLeDomaineDesSeries, positionCorps, type PositionCorps, type Site } from './ephem.ts'
import { MS_PAR_MINUTE } from './unites.ts'

/** Positions déjà calculées, par instant en ms, pour un site donné. */
export interface CacheTrajetLune {
  site: Site | null
  readonly positions: Map<number, PositionCorps>
}

export function cacheTrajetLune(): CacheTrajetLune {
  return { site: null, positions: new Map() }
}

/** Début exact, points de grille strictement intérieurs, fin exacte ; durée nulle : le début. */
export function instantsTrajet(debutMs: number, dureeMs: number, pasMs: number): readonly number[] {
  const finMs = debutMs + dureeMs
  const instants = [debutMs]
  for (let t = Math.floor(debutMs / pasMs) * pasMs + pasMs; t < finMs; t += pasMs) instants.push(t)
  if (finMs > debutMs) instants.push(finMs)
  return instants
}

/** Les instants où `trajetLune` échantillonne la Lune, dans le même ordre. */
export function instantsTrajetLune(debutMs: number, dureeMs: number): readonly number[] {
  return instantsTrajet(debutMs, dureeMs, K('PAS_TRAJET_LUNE_MIN') * MS_PAR_MINUTE)
}

/**
 * La Lune aux instants de [début, début + durée]. Hors du domaine des séries, aucune trace :
 * les corps y sont masqués, et la cause est portée par `cielInstantane`.
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
  // ponytail: éviction par balayage de la Map à chaque appel — quelques centaines d'entrées au
  // plus (8 h / 5 min) ; un tampon circulaire si le profil le montre un jour.
  for (const t of cache.positions.keys()) if (!garde.has(t)) cache.positions.delete(t)
  return instants.map((t) => {
    const connue = cache.positions.get(t)
    if (connue !== undefined) return connue
    const position = positionCorps(Body.Moon, new Date(t), site)
    cache.positions.set(t, position)
    return position
  })
}
