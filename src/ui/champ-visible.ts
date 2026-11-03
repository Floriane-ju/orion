/**
 * §3.3, T-0110 — celestial cap the canvas shows. ONE definition: star selection and Voie lactée
 * band segments both cull with it; two would drift half a degree, a layer stops one step early at
 * the edge.
 */

import { angleDeCosDeg, type Vec3 } from '../core/mat3.ts'
import { type PointEcran, type Projecteur, rayonChampDeg } from '../core/projection.ts'

export interface ChampVisible {
  readonly centre: Vec3
  readonly rayonDeg: number
}

/**
 * Celestial cap shown by canvas: central direction + radius, diagonal included. Shared by §3.3
 * star selection and band segment gap.
 */
export function champVisible(projecteur: Projecteur): ChampVisible {
  return {
    centre: projecteur.inverse(projecteur.centreXPx, projecteur.centreYPx),
    rayonDeg: rayonChampDeg(projecteur.vue),
  }
}

/** True when cap of radius `demiExtensionDeg` around `centre` does not touch the field. */
export function horsDuChamp(champ: ChampVisible, centre: Vec3, demiExtensionDeg: number): boolean {
  const cos =
    champ.centre.x * centre.x + champ.centre.y * centre.y + champ.centre.z * centre.z
  const separationDeg = angleDeCosDeg(cos)
  return separationDeg > champ.rayonDeg + demiExtensionDeg
}

/** True when a projected point falls outside the canvas: not painted. */
export function horsCanevas(p: PointEcran, largeur: number, hauteur: number): boolean {
  return p.xPx < 0 || p.yPx < 0 || p.xPx > largeur || p.yPx > hauteur
}
