/**
 * §5.1, §6.4, §8.3 — T-0407 : sous un zoom, chaque cible s'évalue à sa focale optimale.
 *
 * Le contexte de la nuit reste UN : site, nuit, boîtier, ciel. Seul ce que la focale fixe —
 * champ, échantillonnage, pupille, ouverture au plancher, pose max — change d'une cible à
 * l'autre, et ces champs-là viennent du même `evalueMateriel` que le réglage courant. Un
 * second assemblage écrit ici aurait fini par annoncer une autre pose que la fiche.
 *
 * Les contextes se mémoïsent par focale : les cibles bornées au grand-angle ou au télé — la
 * plupart — partagent le leur, donc l'évaluation mémoïsée par contexte (`evaluation()`) reste
 * partagée entre la liste et le plan.
 */

import { estZoom, focaleOptimale, ouvertureA, type Objectif } from '../core/objectif.ts'
import type { ContexteDe, ContexteSession } from '../core/session-types.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { ContexteFiche } from './fiche-cible-calcul.ts'
import type { ProfilCadre } from '../core/cadre.ts'
import { nombreLibre } from '../registry/ecriture.ts'

/** Ce que la chaîne sait d'une focale de la plage : le contexte de nuit et celui de la fiche. */
export interface ZoomAFocale {
  readonly contexte: ContexteSession
  readonly fiche: ContexteFiche
}

export interface Zoom {
  readonly objectif: Objectif
  /** La focale optimale d'une cible, `null` sans dimensions au catalogue. */
  readonly focaleDe: (objet: ObjetCielProfond) => number | null
  readonly contexteDe: ContexteDe
  /** `null` quand le matériel n'est pas chiffrable à cette focale. */
  readonly aFocale: (focaleMm: number) => ZoomAFocale | null
}

export interface EntreeZoom {
  readonly objectif: Objectif | null
  /** Le contexte du réglage courant : repli des cibles sans dimensions. */
  readonly base: ContexteSession
  readonly focaleMm: number
  readonly ouvertureN: number
  /** Le matériel évalué à une autre focale et une autre ouverture, par la chaîne. */
  readonly evalue: (focaleMm: number, ouvertureN: number) => ZoomAFocale | null
}

/** `null` hors zoom — objectif libre ou focale fixe : le contexte unique suffit. */
export function zoomSur(entree: EntreeZoom): Zoom | null {
  const { objectif, base } = entree
  if (!estZoom(objectif)) return null
  const parFocale = new Map<number, ZoomAFocale | null>()

  const aFocale = (focaleMm: number): ZoomAFocale | null => {
    const deja = parFocale.get(focaleMm)
    if (deja !== undefined) return deja
    const n = ouvertureA(objectif, entree.ouvertureN, entree.focaleMm, focaleMm)
    const calcule = entree.evalue(focaleMm, n)
    parFocale.set(focaleMm, calcule)
    return calcule
  }

  const focaleDe = (objet: ObjetCielProfond): number | null =>
    objet.majAxArcmin === null || objet.majAxArcmin <= 0
      ? null
      : focaleOptimale(objectif, objet.majAxArcmin, base.capteurHMm)

  return {
    objectif,
    focaleDe,
    aFocale,
    contexteDe: (objet) => {
      const f = focaleDe(objet)
      return f === null ? base : (aFocale(f)?.contexte ?? base)
    },
  }
}

/**
 * T-0407 — le champ aux deux bouts de la plage : la borne basse de taille se lit au télé, la
 * borne haute au grand-angle. Hors zoom, les deux valent le champ du réglage courant.
 */
export function champsExtremes(
  zoom: Zoom | null,
  fovHDeg: number,
): { readonly teleDeg: number; readonly grandAngleDeg: number } {
  if (zoom === null) return { teleDeg: fovHDeg, grandAngleDeg: fovHDeg }
  const fov = (f: number) => zoom.aFocale(f)?.contexte.fovHDeg ?? fovHDeg
  return {
    teleDeg: fov(zoom.objectif.focaleMaxMm),
    grandAngleDeg: fov(zoom.objectif.focaleMinMm),
  }
}

/**
 * Le cadre de la scène à une focale de la plage. `modele` est le profil du réglage courant :
 * il porte ce que la focale ne change pas — la projection de l'objectif, le libellé du mode.
 * `null` quand le matériel n'est pas chiffrable à cette focale.
 */
export function profilA(zoom: Zoom, focaleMm: number, modele: ProfilCadre): ProfilCadre | null {
  const fiche = zoom.aFocale(focaleMm)?.fiche
  if (fiche === undefined) return null
  return {
    ...modele,
    libelle: `${nombreLibre(focaleMm)} mm f/${nombreLibre(fiche.ouvertureN)}`,
    fovLDeg: fiche.optique.fovLDeg.value,
    fovHDeg: fiche.optique.fovHDeg.value,
    echApx: fiche.optique.echApx.value,
    capteurHMm: fiche.capteurHMm,
    tPoseS: fiche.tMaxS,
  }
}

/**
 * Sous un zoom, la scène montre le cadre du réglage, PUIS ce que la bague peut donner : le cadre
 * du grand-angle et celui du télé. Le réglage reste premier — c'est lui qui porte la carte de
 * pose et le trait plein ; les deux bouts se peignent estompés. Hors zoom, le réglage seul.
 */
export function profilsScene(zoom: Zoom | null, profils: readonly ProfilCadre[]): readonly ProfilCadre[] {
  const modele = profils[0]
  if (zoom === null || modele === undefined) return profils
  return [modele, ...[zoom.objectif.focaleMinMm, zoom.objectif.focaleMaxMm].flatMap((f) => {
    const profil = profilA(zoom, f, modele)
    return profil === null ? [] : [profil]
  })]
}

/** La focale essayée sur la bague d'une fiche, retenue pour sa seule cible. */
export interface EssaiZoom {
  readonly designation: string
  readonly focaleMm: number
}

/**
 * Le cadre que la cible obtiendrait : à la focale essayée sur sa fiche, sinon à sa focale
 * optimale. `null` hors zoom — le cadre du réglage EST alors celui de la cible — ou sans
 * dimensions au catalogue.
 */
export function profilCible(
  zoom: Zoom | null,
  objet: ObjetCielProfond,
  essai: EssaiZoom | null,
  profils: readonly ProfilCadre[],
): ProfilCadre | null {
  const modele = profils[0]
  if (zoom === null || modele === undefined) return null
  const focaleMm =
    essai?.designation === objet.designation ? essai.focaleMm : zoom.focaleDe(objet)
  return focaleMm === null ? null : profilA(zoom, focaleMm, modele)
}
