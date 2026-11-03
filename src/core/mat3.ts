/**
 * Sky rotations — backs §3.1, §3.3.
 * §3.1 promise: one matrix per frame applied to whole catalogue. All rotations (precession,
 * Earth rotation, site latitude, view orientation) compose into one matrix product per frame;
 * star count never enters cost.
 * 3×3 row-major, equatorial unit vectors. Pure rotations: inverse = transpose, no numeric
 * inversion.
 */

import { DEG_PAR_HEURE, TOUR_DEG, encadre, ramene } from './unites.ts'

/** Nine coefficients, row by row: m[0..2] = first row. */
export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
]

export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * Degree → radian, sole one in `src/`; divide by `DEG` for reverse. Here not in `src/registry/`:
 * math identity has no source/tolerance, and every angle consumer already imports this module.
 */
export const DEG = Math.PI / 180

export const IDENTITE: Mat3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1])

/**
 * Product a · b: result applies b then a.
 * Unrolled, not indexed loop: §2.1 forbids numeric literals in engines.
 */
export function multiplie(a: Mat3, b: Mat3): Mat3 {
  const [a11, a12, a13, a21, a22, a23, a31, a32, a33] = a
  const [b11, b12, b13, b21, b22, b23, b31, b32, b33] = b
  return [
    a11 * b11 + a12 * b21 + a13 * b31,
    a11 * b12 + a12 * b22 + a13 * b32,
    a11 * b13 + a12 * b23 + a13 * b33,
    a21 * b11 + a22 * b21 + a23 * b31,
    a21 * b12 + a22 * b22 + a23 * b32,
    a21 * b13 + a22 * b23 + a23 * b33,
    a31 * b11 + a32 * b21 + a33 * b31,
    a31 * b12 + a32 * b22 + a33 * b32,
    a31 * b13 + a32 * b23 + a33 * b33,
  ]
}

export function applique(m: Mat3, v: Vec3): Vec3 {
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = m
  return {
    x: m11 * v.x + m12 * v.y + m13 * v.z,
    y: m21 * v.x + m22 * v.y + m23 * v.z,
    z: m31 * v.x + m32 * v.y + m33 * v.z,
  }
}

/** Rotation inverse = transpose; no numeric inversion. */
export function transpose(m: Mat3): Mat3 {
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = m
  return [m11, m21, m31, m12, m22, m32, m13, m23, m33]
}

export function rotationX(angleDeg: number): Mat3 {
  const c = Math.cos(angleDeg * DEG)
  const s = Math.sin(angleDeg * DEG)
  return [1, 0, 0, 0, c, s, 0, -s, c]
}

export function rotationY(angleDeg: number): Mat3 {
  const c = Math.cos(angleDeg * DEG)
  const s = Math.sin(angleDeg * DEG)
  return [c, 0, -s, 0, 1, 0, s, 0, c]
}

export function rotationZ(angleDeg: number): Mat3 {
  const c = Math.cos(angleDeg * DEG)
  const s = Math.sin(angleDeg * DEG)
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}

/**
 * Rotation about arbitrary axis (Rodrigues). §9.3 filé turns about celestial pole OF DATE, not
 * J2000 z: without it arcs centred 0.5° off true centre in 2026.
 */
export function rotationAutourDe(axe: Vec3, angleDeg: number): Mat3 {
  const norme = Math.hypot(axe.x, axe.y, axe.z)
  const x = axe.x / norme
  const y = axe.y / norme
  const z = axe.z / norme
  const c = Math.cos(angleDeg * DEG)
  const s = Math.sin(angleDeg * DEG)
  const u = 1 - c
  return [
    c + x * x * u,
    x * y * u - z * s,
    x * z * u + y * s,
    y * x * u + z * s,
    c + y * y * u,
    y * z * u - x * s,
    z * x * u - y * s,
    z * y * u + x * s,
    c + z * z * u,
  ]
}

/** Unit direction of a spherical position, degrees. */
export function versVecteur(longitudeDeg: number, latitudeDeg: number): Vec3 {
  const lon = longitudeDeg * DEG
  const lat = latitudeDeg * DEG
  const cosLat = Math.cos(lat)
  return { x: cosLat * Math.cos(lon), y: cosLat * Math.sin(lon), z: Math.sin(lat) }
}

/**
 * T-0336 — angle of a cosine or sine, degrees. Clamped first: dot of two unit vectors can leave
 * [−1 ; 1] by 1 ulp → `acos` NaN.
 */
export function angleDeCosDeg(cos: number): number {
  return Math.acos(encadre(cos, -1, 1)) / DEG
}

export function angleDeSinDeg(sin: number): number {
  return Math.asin(encadre(sin, -1, 1)) / DEG
}

/** Spherical position of a direction, longitude wrapped to [0 ; 360[. */
export function versSpherique(v: Vec3): { longitudeDeg: number; latitudeDeg: number } {
  return {
    longitudeDeg: ramene(Math.atan2(v.y, v.x) / DEG, TOUR_DEG),
    latitudeDeg: angleDeSinDeg(v.z),
  }
}

/** Angular separation of two unit directions, degrees. */
export function separationDeg(a: Vec3, b: Vec3): number {
  return angleDeCosDeg(a.x * b.x + a.y * b.y + a.z * b.z)
}

/** Separation of two equatorial positions, RA in HOURS. */
export function separationEquatorialeDeg(
  adAH: number,
  decADeg: number,
  adBH: number,
  decBDeg: number,
): number {
  return separationDeg(
    versVecteur(adAH * DEG_PAR_HEURE, decADeg),
    versVecteur(adBH * DEG_PAR_HEURE, decBDeg),
  )
}
