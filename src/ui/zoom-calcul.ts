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

import {
  autoParc,
  estZoom,
  focaleOptimale,
  objectifOptimal,
  ouvertureA,
  ouverturePlancher,
  plancherAuPas,
  type Objectif,
} from '../core/objectif.ts'
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

/** T-0436 — l'objectif du parc retenu pour une cible, et la focale où le régler. */
export interface ChoixOptique {
  readonly objectif: Objectif
  readonly focaleMm: number
}

export interface Zoom {
  /** L'objectif monté : la scène peint les bouts de SA bague, et de nulle autre. */
  readonly monte: Objectif | null
  /** T-0436 — les objectifs parmi lesquels chaque cible choisit : les rectilinéaires du parc. */
  readonly parc: readonly Objectif[]
  /** L'objectif et la focale optimaux d'une cible, `null` sans dimensions au catalogue. */
  readonly choixDe: (objet: ObjetCielProfond) => ChoixOptique | null
  readonly contexteDe: ContexteDe
  /** `null` quand le matériel n'est pas chiffrable à cette focale. */
  readonly aFocale: (objectif: Objectif, focaleMm: number) => ZoomAFocale | null
}

export interface EntreeZoom {
  readonly monte: Objectif | null
  /** T-0436 — tout le parc ; les fisheyes en sont écartés ici. */
  readonly parc: readonly Objectif[]
  /** Le contexte du réglage courant : repli des cibles sans dimensions. */
  readonly base: ContexteSession
  readonly focaleMm: number
  readonly ouvertureN: number
  /** Le matériel évalué sous un autre objectif, à une autre focale et une autre ouverture. */
  readonly evalue: (objectif: Objectif, focaleMm: number, ouvertureN: number) => ZoomAFocale | null
}

/**
 * `null` quand il n'y a rien à choisir — objectif libre, ou un fixe seul au parc : le contexte
 * unique suffit. Le monté reste au parc même s'il en a disparu : c'est lui qui est réglé.
 */
export function zoomSur(entree: EntreeZoom): Zoom | null {
  const { monte, base } = entree
  if (!autoParc(entree.parc, monte)) return null
  const rectilineaires = entree.parc.filter((o) => o.typeObjectif === 'RECTILINEAIRE')
  const parc =
    monte !== null && monte.typeObjectif === 'RECTILINEAIRE' && !rectilineaires.some((o) => o.id === monte.id)
      ? [...rectilineaires, monte]
      : rectilineaires
  const parFocale = new Map<string, ZoomAFocale | null>()

  const aFocale = (objectif: Objectif, focaleMm: number): ZoomAFocale | null => {
    const cle = `${objectif.id}@${focaleMm}`
    const deja = parFocale.get(cle)
    if (deja !== undefined) return deja
    // Le monté suit la règle de la saisie (T-0407) ; un objectif qui n'est pas monté n'a pas
    // d'ouverture saisie : il est lu à son plancher, comme la liste lit le monté (T-0433).
    const n =
      objectif.id === monte?.id
        ? ouvertureA(objectif, entree.ouvertureN, entree.focaleMm, focaleMm)
        : plancherAuPas(ouverturePlancher(objectif, focaleMm))
    const calcule = entree.evalue(objectif, focaleMm, n)
    parFocale.set(cle, calcule)
    return calcule
  }

  const choixDe = (objet: ObjetCielProfond): ChoixOptique | null =>
    objet.majAxArcmin === null || objet.majAxArcmin <= 0
      ? null
      : objectifOptimal(parc, objet.majAxArcmin, base.capteurHMm)

  return {
    monte,
    parc,
    choixDe,
    aFocale,
    contexteDe: (objet) => {
      const choix = choixDe(objet)
      if (choix === null) return base
      const contexte = aFocale(choix.objectif, choix.focaleMm)?.contexte
      return contexte === undefined ? base : contexte
    },
  }
}

/** T-0436 — la focale optimale d'une cible sous un objectif donné : le choix d'une fiche. */
export function focaleSous(objectif: Objectif, objet: ObjetCielProfond, capteurHMm: number): number {
  return objet.majAxArcmin === null || objet.majAxArcmin <= 0
    ? objectif.focaleMinMm
    : focaleOptimale(objectif, objet.majAxArcmin, capteurHMm)
}

/**
 * T-0407 — le champ aux deux bouts de la plage : la borne basse de taille se lit au télé, la
 * borne haute au grand-angle. T-0436 : sur tout le parc, le télé le plus long et le grand-angle
 * le plus court. Hors zoom, les deux valent le champ du réglage courant.
 */
export function champsExtremes(
  zoom: Zoom | null,
  fovHDeg: number,
): { readonly teleDeg: number; readonly grandAngleDeg: number } {
  if (zoom === null) return { teleDeg: fovHDeg, grandAngleDeg: fovHDeg }
  const fov = (o: Objectif, f: number) => zoom.aFocale(o, f)?.contexte.fovHDeg ?? fovHDeg
  return {
    teleDeg: Math.min(...zoom.parc.map((o) => fov(o, o.focaleMaxMm))),
    grandAngleDeg: Math.max(...zoom.parc.map((o) => fov(o, o.focaleMinMm))),
  }
}

/**
 * Le cadre de la scène à une focale de la plage. `modele` est le profil du réglage courant :
 * il porte ce que la focale ne change pas — la projection de l'objectif, le libellé du mode.
 * `null` quand le matériel n'est pas chiffrable à cette focale.
 */
export function profilA(
  zoom: Zoom,
  objectif: Objectif,
  focaleMm: number,
  modele: ProfilCadre,
): ProfilCadre | null {
  const fiche = zoom.aFocale(objectif, focaleMm)?.fiche
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
 * pose et le trait plein ; les deux bouts se peignent estompés. Hors zoom MONTÉ, le réglage seul :
 * les autres objectifs du parc ne sont pas sur le boîtier (T-0436).
 */
export function profilsScene(zoom: Zoom | null, profils: readonly ProfilCadre[]): readonly ProfilCadre[] {
  const modele = profils[0]
  const monte = zoom?.monte ?? null
  if (zoom === null || modele === undefined || !estZoom(monte)) return profils
  return [modele, ...[monte.focaleMinMm, monte.focaleMaxMm].flatMap((f) => {
    const profil = profilA(zoom, monte, f, modele)
    return profil === null ? [] : [profil]
  })]
}

/** L'objectif et la focale essayés sur une fiche, retenus pour sa seule cible. */
export interface EssaiZoom {
  readonly designation: string
  readonly objectifId: string
  readonly focaleMm: number
}

/**
 * T-0436 — l'objectif et la focale d'une fiche : l'essai fait sur SA cible, sinon le choix
 * optimal. Un essai dont l'objectif a quitté le parc retombe sur le choix.
 */
export function choixFiche(zoom: Zoom, objet: ObjetCielProfond, essai: EssaiZoom | null): ChoixOptique | null {
  const objectif =
    essai?.designation === objet.designation ? zoom.parc.find((o) => o.id === essai.objectifId) : undefined
  return objectif === undefined || essai === null ? zoom.choixDe(objet) : { objectif, focaleMm: essai.focaleMm }
}

/**
 * Le cadre que la cible obtiendrait : à l'objectif et la focale essayés sur sa fiche, sinon à
 * ses optimaux. `null` hors zoom — le cadre du réglage EST alors celui de la cible — ou sans
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
  const choix = choixFiche(zoom, objet, essai)
  return choix === null ? null : profilA(zoom, choix.objectif, choix.focaleMm, modele)
}
