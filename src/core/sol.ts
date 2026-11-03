/**
 * §3.3 / §4.1 — site ground, applied in the projector, not the drawing.
 * No polygon: great-circle boundary changes with aim = second projection, forbidden by §3.3.
 * Sky is black; direction below ground → NON PROJETABLE, which every `projetteEn` pass already
 * handles (polyline breaks, star loop skips, click target not pushed): one place.
 * Ground follows relief surveyed in panneau Lieu (§4.1). No survey → flat 0° mask: test = sign
 * of vertical component, no transcendental function.
 */

import { DEG, type Mat3, type Vec3 } from './mat3.ts'
import { obstructionDessinDeg, type MasqueHorizon } from './site.ts'
import { pointEcran, type PointEcran, type Projecteur } from './projection.ts'

/** Per-frame predicate: J2000 direction below ground? */
export type TestSol = (x: number, y: number, z: number) => boolean

/**
 * Predicate for a sky matrix. Allocation-free: star loop calls it thousands of times per frame
 * (T-0065); horizontal components stay local scalars.
 */
export function sousLeSol(masque: MasqueHorizon, matriceCiel: Mat3): TestSol {
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = matriceCiel

  if (masque.estHypothese) {
    // Flat horizon: below ground ⟺ negative vertical.
    return (x, y, z) => m31 * x + m32 * y + m33 * z < 0
  }

  return (x, y, z) => {
    const haut = m31 * x + m32 * y + m33 * z
    const nord = m11 * x + m12 * y + m13 * z
    const est = m21 * x + m22 * y + m23 * z
    const obstruction = obstructionDessinDeg(masque, Math.atan2(est, nord) / DEG)
    if (obstruction === 0) return haut < 0
    // Compare sines, not angles: no arcsin, any input norm (rotation matrix → norm read off
    // input).
    return haut < Math.sin(obstruction * DEG) * Math.sqrt(x * x + y * y + z * z)
  }
}

/**
 * T-0098 — J2000 direction BELOW this horizon height? Like `sousLeSol` but boundary = height
 * parallel, not relief (horizon halo, tier by tier); tier and ridge close the same way.
 */
export function sousLaHauteur(hauteurDeg: number, matriceCiel: Mat3): TestSol {
  const [, , , , , , m31, m32, m33] = matriceCiel
  const sin = Math.sin(hauteurDeg * DEG)
  return (x, y, z) =>
    m31 * x + m32 * y + m33 * z < sin * Math.sqrt(x * x + y * y + z * z)
}

/** Same projector, blind to below-ground; `inverse` unfiltered (answers what cursor designates). */
export function projecteurSansSol(
  base: Projecteur,
  masque: MasqueHorizon,
  matriceCiel: Mat3,
): Projecteur {
  const enterre = sousLeSol(masque, matriceCiel)
  return {
    ...base,
    projetteEn(x, y, z, out) {
      if (enterre(x, y, z)) return false
      return base.projetteEn(x, y, z, out)
    },
    projette(v: Vec3): PointEcran | null {
      if (enterre(v.x, v.y, v.z)) return null
      const out = pointEcran()
      return base.projetteEn(v.x, v.y, v.z, out) ? out : null
    },
  }
}
