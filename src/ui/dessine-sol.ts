/**
 * §4.1 — le sol du site, peint.
 *
 * Écarter les sommets sous l'horizon ne suffit pas : la bande de la Voie lactée est un TRAIT
 * ÉPAIS de la largeur d'une tranche de latitude, et sa largeur débordait sous l'horizon là où
 * ses sommets étaient déjà écartés. Un masque qui laisse passer la moitié d'un trait n'est pas
 * un masque. Le sol se peint donc, opaque, avant les repères.
 *
 * La frontière se cherche en espace écran — voir `balayage-ecran.ts`, qui porte la géométrie
 * et la raison de ce choix. Le halo d'horizon (T-0098) balaie exactement de la même façon.
 */

import type { Mat3 } from '../core/mat3.ts'
import type { Projecteur } from '../core/projection.ts'
import type { MasqueHorizon } from '../core/site.ts'
import { sousLeSol } from '../core/sol.ts'
import {
  frontiereEcran,
  remplitRegion,
  traceFrontiere,
  type FrontiereEcran,
} from './balayage-ecran.ts'

/**
 * La clé d'une frontière : la visée et rien d'autre. Le sol est fixe dans le repère du site —
 * `inverse` passe en J2000 par la matrice de ciel, le prédicat en revient par la même — donc
 * l'heure qui tourne ne le déplace pas à l'écran. Le recalcul ne se paie qu'au panoramique.
 */
export function cleVue(projecteur: Projecteur): string {
  const v = projecteur.vue
  return [
    v.mode,
    v.fovDeg,
    v.largeurPx,
    v.hauteurPx,
    v.azimutDeg,
    v.hauteurDeg,
    v.rotationDeg,
    v.decalageCentreXPx ?? 0,
  ].join('|')
}

let dernier: { cle: string; masque: MasqueHorizon; frontiere: FrontiereEcran } | null = null

/**
 * Peint le sol et souligne sa crête.
 *
 * Sans la crête, le sol et le fond de ciel se touchent sans se séparer, et l'horizon n'est
 * plus qu'une absence d'étoiles.
 */
export function dessineSol(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  matriceCiel: Mat3,
  masque: MasqueHorizon,
  couleurSol: string,
  couleurCrete: string,
): void {
  const cle = cleVue(projecteur)
  if (dernier === null || dernier.cle !== cle || dernier.masque !== masque) {
    dernier = { cle, masque, frontiere: frontiereEcran(projecteur, sousLeSol(masque, matriceCiel)) }
  }
  const { frontiere } = dernier
  remplitRegion(ctx, frontiere, couleurSol)
  traceFrontiere(ctx, frontiere, couleurCrete)
}
