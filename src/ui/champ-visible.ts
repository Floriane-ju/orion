/**
 * §3.3, T-0110 — la calotte céleste que le canevas montre.
 *
 * Ce module existe pour qu'il n'y en ait qu'UNE définition. Deux couches s'en servent pour
 * écarter ce qui ne se voit pas — la sélection d'étoiles du planétarium et les segments de la
 * bande de la Voie lactée — et deux définitions du même champ, c'est à terme deux domaines qui
 * divergent d'un demi-degré et une couche qui s'interrompt un pas trop tôt au bord.
 */

import { angleDeCosDeg, type Vec3 } from '../core/mat3.ts'
import { rayonChampDeg, type Projecteur } from '../core/projection.ts'

export interface ChampVisible {
  readonly centre: Vec3
  readonly rayonDeg: number
}

/**
 * La calotte céleste que le canevas montre : sa direction centrale et son rayon, diagonale
 * comprise. C'est le domaine que partagent la sélection d'étoiles de §3.3 et l'écart des
 * segments de la bande — un seul calcul, sinon deux définitions du même champ.
 */
export function champVisible(projecteur: Projecteur): ChampVisible {
  return {
    centre: projecteur.inverse(projecteur.centreXPx, projecteur.centreYPx),
    rayonDeg: rayonChampDeg(projecteur.vue),
  }
}

/** Vrai quand la calotte de rayon `demiExtensionDeg` autour de `centre` ne touche pas le champ. */
export function horsDuChamp(champ: ChampVisible, centre: Vec3, demiExtensionDeg: number): boolean {
  const cos =
    champ.centre.x * centre.x + champ.centre.y * centre.y + champ.centre.z * centre.z
  const separationDeg = angleDeCosDeg(cos)
  return separationDeg > champ.rayonDeg + demiExtensionDeg
}
