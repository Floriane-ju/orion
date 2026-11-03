/**
 * §9.2, couche 2 — generative background beyond the catalogued threshold.
 * DETERMINISTIC SEED: same frame, same render; per-frame redraw would flicker, useless for
 * deciding a cadrage.
 * NON-UNIFORM DENSITY, modulated by galactic latitude: makes the Voie lactée band appear;
 * without it preview misses wide-field's main use case.
 * Seeded once for the whole sphere, indexed like a catalogue (§3.3): selection, magnitude sort,
 * drawing = real-star ones, no dedicated render line.
 * ponytail: total star count capped by C-33; relative density modulation kept, absolute count
 * not (full sky to magnitude 12 = millions of stars). Cap declared on screen, never silent.
 */

import { K } from '../registry/constants.ts'
import { densite, latitudeGalactiqueDeg, magnitudeSemis } from '../core/galactique.ts'
import { DEG, versVecteur } from '../core/mat3.ts'
import type { Etoile } from './catalog.ts'

/** Fixed seed: reproducible render across sessions. */
const GRAINE = 0x9e3779b9

/** mulberry32: short, dependency-free, strictly deterministic. */
function generateur(graine: number): () => number {
  let etat = graine >>> 0
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0
    let t = etat
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Plausible colour indices of faint stars: mostly yellow to red. */
const BV_MIN = K('SEMIS_BV_MIN')
const BV_ETENDUE = K('SEMIS_BV_ETENDUE')

/**
 * Generative seeding of the whole sphere. No cache: deterministic, and caller holds the INDEX,
 * not the object list (100k retained objects = tens of MB on a phone).
 */
export function semisGeneratif(): readonly Etoile[] {
  const alea = generateur(GRAINE)
  const total = Math.round(K('SEMIS_ETOILES_TOTAL'))
  const echelle = K('ECHELLE_LATITUDE_GALACTIQUE_DEG')
  const etoiles: Etoile[] = []

  while (etoiles.length < total) {
    const adDeg = alea() * 360
    // Uniform draw in sin(δ): uniform δ would pile up at the poles.
    const decDeg = Math.asin(2 * alea() - 1) / DEG
    const b = latitudeGalactiqueDeg(versVecteur(adDeg, decDeg))
    // Rejection by §9.2 density, normalised to 1 in the galactic plane.
    if (alea() > densite(b, echelle)) continue
    etoiles.push({
      adDeg,
      decDeg,
      magV: magnitudeSemis(alea()),
      bv: BV_MIN + alea() * BV_ETENDUE,
    })
  }

  return etoiles
}

