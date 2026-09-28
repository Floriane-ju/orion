/**
 * Rotations du ciel — support de §3.1 et §3.3.
 *
 * Le pipeline de rendu tient dans une promesse de §3.1 : « une seule matrice par image,
 * appliquée à l'ensemble du catalogue ». Tout ce qui tourne — précession, rotation
 * terrestre, latitude du site, orientation de la vue — se compose ici en un seul produit
 * de matrices, calculé une fois par image. Le nombre d'étoiles n'entre jamais dans ce coût.
 *
 * Matrices 3×3 en ligne d'abord, vecteurs unitaires équatoriaux. Ce sont des rotations
 * pures : leur inverse est leur transposée, ce qui évite toute inversion numérique.
 */

import { DEG_PAR_HEURE, TOUR_DEG, encadre, ramene } from './unites.ts'

/** Neuf coefficients, ligne par ligne : m[0..2] est la première ligne. */
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
 * Conversion degré → radian, unique dans `src/` : diviser par `DEG` fait le chemin inverse.
 * Domiciliée ici plutôt que dans `src/registry/` — une identité mathématique n'a ni source
 * ni tolérance, et c'est le module que consomme déjà tout ce qui tourne un angle.
 */
export const DEG = Math.PI / 180

export const IDENTITE: Mat3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1])

/**
 * Produit a · b : appliquer le résultat revient à appliquer b puis a.
 *
 * Écrit coefficient par coefficient plutôt qu'en double boucle indexée : le §2.1 interdit
 * les littéraux numériques dans les moteurs, et un produit 3×3 déplié se lit aussi bien.
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

/** Inverse d'une rotation : sa transposée. Aucune inversion numérique n'est nécessaire. */
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
 * Rotation d'un angle autour d'un axe quelconque (formule de Rodrigues). Le filé de §9.3
 * tourne autour du pôle céleste DE L'ÉPOQUE, qui n'est pas l'axe z du repère J2000 : sans
 * cette rotation générale, les arcs seraient centrés à un demi-degré du vrai centre en 2026.
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

/** Direction unitaire d'une position sphérique, angles en degrés. */
export function versVecteur(longitudeDeg: number, latitudeDeg: number): Vec3 {
  const lon = longitudeDeg * DEG
  const lat = latitudeDeg * DEG
  const cosLat = Math.cos(lat)
  return { x: cosLat * Math.cos(lon), y: cosLat * Math.sin(lon), z: Math.sin(lat) }
}

/**
 * T-0336 — l'angle d'un cosinus ou d'un sinus, en degrés. Borné d'abord : un produit scalaire
 * de deux vecteurs unitaires sort de [−1 ; 1] d'un ulp, et `acos` en fait un NaN.
 */
export function angleDeCosDeg(cos: number): number {
  return Math.acos(encadre(cos, -1, 1)) / DEG
}

export function angleDeSinDeg(sin: number): number {
  return Math.asin(encadre(sin, -1, 1)) / DEG
}

/** Position sphérique d'une direction, longitude ramenée dans [0 ; 360[. */
export function versSpherique(v: Vec3): { longitudeDeg: number; latitudeDeg: number } {
  return {
    longitudeDeg: ramene(Math.atan2(v.y, v.x) / DEG, TOUR_DEG),
    latitudeDeg: angleDeSinDeg(v.z),
  }
}

/** Séparation angulaire entre deux directions unitaires, en degrés. */
export function separationDeg(a: Vec3, b: Vec3): number {
  return angleDeCosDeg(a.x * b.x + a.y * b.y + a.z * b.z)
}

/** Séparation entre deux positions équatoriales, ascensions droites en HEURES. */
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
