/**
 * §6.4, T-0283 — la cible ouverte se repère dans la scène.
 *
 * « Amener la cible au centre » est le geste central de §6.4 ; sans repère, rien ne confirmait
 * ce qui était pointé — une nébuleuse obscure comme B144 n'a ni marqueur lisible ni nom à
 * grand champ. Le repère est un RÉTICULE ouvert (quatre branches, centre libre : il ne cache
 * pas l'objet qu'il désigne) et la désignation, peints hors de l'arbitrage des libellés :
 * ni le plafond de magnitude des marqueurs ni le budget de noms du zoom ne l'éteignent.
 *
 * La teinte est celle du cadre : ce que le matériel vise et ce qu'on a ouvert parlent la même
 * langue, et la nuit la forme suffit à les distinguer.
 */

import { versVecteur } from '../core/mat3.ts'
import { pointEcran, type Projecteur } from '../core/projection.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { horsCanevas } from './champ-visible.ts'
import type { BoiteLabel } from '../core/labels.ts'
import { boiteLabel, MARQUEUR_OBJET_PX } from './libelles-cibles.ts'
import { geometrieMarqueur } from './marqueur-objet.ts'

/** Écart entre le bord du marqueur et le pied des branches : le réticule entoure, il ne touche pas. */
const ECART_RETICULE_PX = 4
/** Longueur d'une branche : lisible à la frontale sans masquer les étoiles voisines. */
const BRANCHE_RETICULE_PX = 8
/** Le réticule se trace plus épais que les contours d'objets, qui sont au trait fin. */
const TRAIT_RETICULE_PX = 2

export interface EntreeRepere {
  readonly ctx: CanvasRenderingContext2D
  readonly projecteur: Projecteur
  readonly objet: ObjetCielProfond
  readonly teinte: string
  readonly largeur: number
  readonly hauteur: number
}

/** Le repère peint, ou `null` quand la cible n'est pas à l'écran. */
export function dessineRepereCible(entree: EntreeRepere): BoiteLabel | null {
  const { ctx, projecteur, objet, largeur, hauteur } = entree
  const p = pointEcran()
  const v = versVecteur(objet.adDeg, objet.decDeg)
  if (!projecteur.projetteEn(v.x, v.y, v.z, p) || horsCanevas(p, largeur, hauteur)) return null

  const geo = geometrieMarqueur(projecteur, objet, p.xPx, p.yPx)
  const rayonPx = Math.max(geo?.demiGrandPx ?? 0, MARQUEUR_OBJET_PX)
  const pied = rayonPx + ECART_RETICULE_PX
  const bout = pied + BRANCHE_RETICULE_PX

  ctx.strokeStyle = entree.teinte
  ctx.lineWidth = TRAIT_RETICULE_PX
  ctx.beginPath()
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    ctx.moveTo(p.xPx + dx * pied, p.yPx + dy * pied)
    ctx.lineTo(p.xPx + dx * bout, p.yPx + dy * bout)
  }
  ctx.stroke()
  ctx.lineWidth = 1

  const boite = boiteLabel(
    { type: 'OBJET', xPx: p.xPx, yPx: p.yPx, nom: objet.designation, objet, rayonPx: bout },
    objet.designation,
  )
  ctx.fillStyle = entree.teinte
  ctx.fillText(boite.texte, boite.xPx, boite.yPx)
  return boite
}
