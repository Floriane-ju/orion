/**
 * §6.4, T-0283 — opened cible located in scène.
 * « Bring cible to centre » = §6.4's central gesture; without repère nothing confirmed what was
 * aimed (dark nebula like B144 has no readable marker nor name at wide field). Repère = open
 * RÉTICULE (4 branches, free centre: doesn't hide object) plus designation, painted outside label
 * arbitration: neither marker magnitude cap nor zoom name budget extinguishes it.
 * Teinte = cadre's: what matériel aims and what was opened speak the same language; at night form
 * alone distinguishes them.
 */

import { versVecteur } from '../core/mat3.ts'
import { pointEcran, type Projecteur } from '../core/projection.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { horsCanevas } from './champ-visible.ts'
import type { BoiteLabel } from '../core/labels.ts'
import { boiteLabel, MARQUEUR_OBJET_PX } from './libelles-cibles.ts'
import { geometrieMarqueur } from './marqueur-objet.ts'

/** Gap marker edge ↔ branch foot: reticle surrounds, doesn't touch. */
const ECART_RETICULE_PX = 4
/** Branch length: readable head-on without hiding neighbour stars. */
const BRANCHE_RETICULE_PX = 8
/** Reticle stroked thicker than object outlines (thin stroke). */
const TRAIT_RETICULE_PX = 2

export interface EntreeRepere {
  readonly ctx: CanvasRenderingContext2D
  readonly projecteur: Projecteur
  readonly objet: ObjetCielProfond
  readonly teinte: string
  readonly largeur: number
  readonly hauteur: number
}

/** Painted repère, or `null` when cible is off-screen. */
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
