/**
 * §5.1, §6.4, §8.3 — T-0407: under zoom, each cible evaluated at its optimal focale.
 * Nuit context stays ONE: site, nuit, boîtier, ciel. Only what focale fixes (champ,
 * échantillonnage, pupille, ouverture au plancher, pose max) varies per cible, from the same
 * `evalueMateriel` as current setting. A 2nd assembly here would announce another pose than fiche.
 * Contexts memoized per focale: cibles bounded at wide or tele (most) share theirs → context-
 * memoized evaluation (`evaluation()`) stays shared between list and plan.
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

/** What chain knows of a plage focale: nuit context + fiche context. */
export interface ZoomAFocale {
  readonly contexte: ContexteSession
  readonly fiche: ContexteFiche
}

/** T-0436 — parc objectif retained for a cible, and focale to set it at. */
export interface ChoixOptique {
  readonly objectif: Objectif
  readonly focaleMm: number
}

export interface Zoom {
  /** Mounted objectif: scène paints THE ENDS OF ITS ring, no other. */
  readonly monte: Objectif | null
  /** T-0436 — objectifs each cible chooses among: parc rectilinéaires. */
  readonly parc: readonly Objectif[]
  /** Optimal objectif + focale of a cible, `null` without dimensions in catalogue. */
  readonly choixDe: (objet: ObjetCielProfond) => ChoixOptique | null
  readonly contexteDe: ContexteDe
  /** `null` when matériel isn't chiffrable at this focale. */
  readonly aFocale: (objectif: Objectif, focaleMm: number) => ZoomAFocale | null
}

export interface EntreeZoom {
  readonly monte: Objectif | null
  /** T-0436 — whole parc; fisheyes dropped here. */
  readonly parc: readonly Objectif[]
  /** Current setting's context: fallback for cibles without dimensions. */
  readonly base: ContexteSession
  readonly focaleMm: number
  readonly ouvertureN: number
  /** Matériel evaluated under another objectif, focale and ouverture. */
  readonly evalue: (objectif: Objectif, focaleMm: number, ouvertureN: number) => ZoomAFocale | null
}

/**
 * `null` when nothing to choose (free objectif, or single fixe in parc): the one context
 * suffices. Mounted stays in parc even if gone from it: it's the one set.
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
    // Mounted follows saisie rule (T-0407); non-mounted objectif has no saisie ouverture: read at
    // its plancher, as list reads the mounted (T-0433).
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

/** T-0436 — optimal focale of a cible under a given objectif: a fiche's choice. */
export function focaleSous(objectif: Objectif, objet: ObjetCielProfond, capteurHMm: number): number {
  return objet.majAxArcmin === null || objet.majAxArcmin <= 0
    ? objectif.focaleMinMm
    : focaleOptimale(objectif, objet.majAxArcmin, capteurHMm)
}

/**
 * T-0407 — champ at both plage ends: low size bound read at tele, high at wide. T-0436: over
 * whole parc, longest tele + shortest wide. Out of zoom, both = current setting's champ.
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
 * Scène cadre at a plage focale. `modele` = current profil: carries what focale doesn't change
 * (objectif projection, mode label). `null` when matériel not chiffrable at this focale.
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
 * Under zoom, scène shows setting's cadre, THEN what the ring can give: wide + tele cadres.
 * Setting first (carries pose map + solid line); both ends painted faded. Out of MOUNTED zoom,
 * setting alone: other parc objectifs aren't on the boîtier (T-0436).
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

/** Objectif + focale tried on a fiche, kept for its cible only. */
export interface EssaiZoom {
  readonly designation: string
  readonly objectifId: string
  readonly focaleMm: number
}

/**
 * T-0436 — a fiche's objectif + focale: the trial made on ITS cible, else optimal choice. Trial
 * whose objectif left parc → choice.
 */
export function choixFiche(zoom: Zoom, objet: ObjetCielProfond, essai: EssaiZoom | null): ChoixOptique | null {
  const objectif =
    essai?.designation === objet.designation ? zoom.parc.find((o) => o.id === essai.objectifId) : undefined
  return objectif === undefined || essai === null ? zoom.choixDe(objet) : { objectif, focaleMm: essai.focaleMm }
}

/**
 * Cadre the cible would get: at objectif + focale tried on its fiche, else at optimals. `null`
 * out of zoom (setting's cadre IS the cible's) or without dimensions in catalogue.
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
